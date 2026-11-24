// DOKU Checkout v1 REST client: request signing, create-payment, status check, notification
// verification. Pure helpers + network calls only — no Supabase, no booking-domain logic here.
// Docs reference: DOKU Checkout API (Client-Id / Request-Id / Request-Timestamp / Signature scheme).
// The secret key is NEVER logged; only HTTP status + response body are logged on failure.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { RpcError } from './db.js';

export type DokuEnv = 'sandbox' | 'production';

export function dokuBase(): string {
  const env = (process.env.DOKU_ENV || 'sandbox') as DokuEnv;
  return env === 'production' ? 'https://api.doku.com' : 'https://api-sandbox.doku.com';
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new RpcError('CONFIG', 500, `${name} belum di-set`);
  return v;
}

// UTC ISO8601 without milliseconds, e.g. 2026-09-24T08:45:42Z
export function dokuTimestamp(d: Date = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function digestOf(bodyString: string): string {
  return createHash('sha256').update(bodyString, 'utf8').digest('base64');
}

function safeEqualStr(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(new Uint8Array(x), new Uint8Array(y));
}

const headerStr = (h: string | string[] | undefined): string => (Array.isArray(h) ? h[0] ?? '' : h ?? '');

export interface SignInput {
  clientId: string;
  secretKey: string;
  requestId: string;
  timestamp: string;
  target: string;   // e.g. /checkout/v1/payment or /orders/v1/status/{invoice}
  body?: string;    // exact JSON string sent (POST only); omit entirely for GET
}

export interface SignedHeaders {
  'Client-Id': string;
  'Request-Id': string;
  'Request-Timestamp': string;
  Signature: string;
}

// stringToSign is the header lines joined with "\n", no trailing newline:
//   Client-Id:<id>
//   Request-Id:<id>
//   Request-Timestamp:<ts>
//   Request-Target:<path>
//   Digest:<base64 sha256 of the exact body string>   <- only when `body` is given (POST)
// Signature = "HMACSHA256=" + base64(HMAC_SHA256(secretKey, stringToSign)).
export function signRequest(input: SignInput): SignedHeaders {
  const lines = [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.timestamp}`,
    `Request-Target:${input.target}`,
  ];
  if (input.body !== undefined) lines.push(`Digest:${digestOf(input.body)}`);
  const stringToSign = lines.join('\n');
  const mac = createHmac('sha256', input.secretKey).update(stringToSign, 'utf8').digest('base64');
  return {
    'Client-Id': input.clientId,
    'Request-Id': input.requestId,
    'Request-Timestamp': input.timestamp,
    Signature: `HMACSHA256=${mac}`,
  };
}

const TARGET_PAYMENT = '/checkout/v1/payment';

export interface CreateCheckoutInput {
  invoice: string;
  amount: number;              // integer IDR
  paymentDueMinutes: number;   // >= 1
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  callbackUrl: string;
  callbackUrlResult: string;
  overrideNotificationUrl: string;
  paymentMethodTypes?: string[];
}

export interface CreateCheckoutResult {
  invoice: string;
  requestId: string;
  tokenId: string;
  payUrl: string;
  expiresAt: string; // ISO, UTC
}

// DOKU wants customer.phone as {calling_code}{number}, max 16 digits: 0812… / +62 812… -> 62812…
export function dokuPhone(wa: string | null | undefined): string | undefined {
  const d = String(wa ?? '').replace(/\D/g, '');
  if (d.length < 8) return undefined;
  const intl = d.startsWith('0') ? '62' + d.slice(1) : d.startsWith('8') ? '62' + d : d;
  return intl.slice(0, 16);
}

// DOKU wants customer.name alphabetic (max 255): drop digits/punctuation, keep letters and spaces.
export function dokuName(nama: string): string {
  const n = nama.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 255);
  return n || 'Tamu';
}

// DOKU's expired_date is "yyyyMMddHHmmss" in Asia/Jakarta (UTC+7). Convert to a UTC ISO string.
function parseDokuExpiry(s: unknown): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(s ?? ''));
  if (!m) {
    console.error('[doku] unexpected expired_date format', s);
    return new Date(Date.now() + 60 * 60_000).toISOString(); // defensive 1h fallback, never used to gate stock
  }
  const [, y, mo, d, h, mi, se] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 7, Number(mi), Number(se));
  return new Date(utcMs).toISOString();
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const clientId = need('DOKU_CLIENT_ID');
  const secretKey = need('DOKU_SECRET_KEY');
  const requestId = randomUUID();
  const timestamp = dokuTimestamp();

  const body = {
    order: {
      amount: Math.round(input.amount),
      invoice_number: input.invoice,
      currency: 'IDR',
      callback_url: input.callbackUrl,
      callback_url_result: input.callbackUrlResult,
      auto_redirect: true,
    },
    payment: {
      payment_due_date: Math.max(1, Math.floor(input.paymentDueMinutes)),
      ...(input.paymentMethodTypes?.length ? { payment_method_types: input.paymentMethodTypes } : {}),
    },
    customer: {
      id: input.customerId,
      name: dokuName(input.customerName),
      ...(input.customerEmail ? { email: input.customerEmail.slice(0, 128) } : {}),
      ...(dokuPhone(input.customerPhone) ? { phone: dokuPhone(input.customerPhone) } : {}),
    },
    additional_info: { override_notification_url: input.overrideNotificationUrl },
  };
  const bodyString = JSON.stringify(body);
  const headers = signRequest({ clientId, secretKey, requestId, timestamp, target: TARGET_PAYMENT, body: bodyString });

  // DOKU's load balancer drops requests for seconds at a time (sandbox, 4 Oct 2026: HTML 503).
  // A 502/503/504 never reached DOKU's app, so resending the same signed request is safe.
  let res!: Response;
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise(r => setTimeout(r, 1500));
    res = await fetch(`${dokuBase()}${TARGET_PAYMENT}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: bodyString,
    });
    if (![502, 503, 504].includes(res.status)) break;
  }
  const text = await res.text();
  const data: any = parseJson(text);
  if (!res.ok || !data?.response?.payment?.url) {
    console.error('[doku] create payment failed', res.status, text.slice(0, 500));
    throw new RpcError('GATEWAY_ERROR', 502);
  }
  return {
    invoice: input.invoice,
    requestId,
    tokenId: data.response.payment.token_id,
    payUrl: data.response.payment.url,
    expiresAt: parseDokuExpiry(data.response.payment.expired_date),
  };
}

// DOKU (esp. sandbox) sometimes answers with an HTML error page; treat it as a gateway error, not a crash.
function parseJson(text: string): any {
  try { return text ? JSON.parse(text) : {}; } catch { return null; }
}

export interface StatusResult {
  status: string;   // DOKU vocabulary: SUCCESS | FAILED | PENDING | EXPIRED | REFUNDED | TIMEOUT | REDIRECT
  amount: number | null;
  raw: unknown;
}

export async function checkStatus(invoice: string): Promise<StatusResult> {
  const clientId = need('DOKU_CLIENT_ID');
  const secretKey = need('DOKU_SECRET_KEY');
  const requestId = randomUUID();
  const timestamp = dokuTimestamp();
  const target = `/orders/v1/status/${invoice}`;
  const headers = signRequest({ clientId, secretKey, requestId, timestamp, target }); // GET: no body, no Digest line

  const res = await fetch(`${dokuBase()}${target}`, { method: 'GET', headers: { ...headers } });
  const text = await res.text();
  // guest opened the checkout page but has not picked a channel yet: DOKU may answer 404 -> still pending
  if (res.status === 404) return { status: 'PENDING', amount: null, raw: { not_found: true } };
  const data: any = parseJson(text);
  if (!res.ok || data === null) {
    console.error('[doku] status check failed', res.status, text.slice(0, 500));
    throw new RpcError('GATEWAY_ERROR', 502);
  }
  return { ...statusFromCheck(data), raw: data };
}

// transaction.status is the payment truth; order.status ORDER_EXPIRED closes a checkout whose
// transaction never left PENDING (or never existed because no channel was chosen).
export function statusFromCheck(data: any): { status: string; amount: number | null } {
  const tx = String(data?.transaction?.status || 'PENDING').toUpperCase();
  const order = String(data?.order?.status || '').toUpperCase();
  const status = tx === 'PENDING' && order === 'ORDER_EXPIRED' ? 'EXPIRED' : tx;
  const amount = data?.order?.amount != null ? Math.round(Number(data.order.amount)) : null;
  return { status, amount };
}

export interface NotificationHeaders {
  [key: string]: string | string[] | undefined;
}

// Recomputes the signature DOKU would have sent for this exact raw body + target, and compares it
// timing-safely to what arrived. `target` must be the path of OUR endpoint (/api/payment/webhook),
// not DOKU's own path. Returns false (never throws) on any mismatch or missing header, so the caller
// can uniformly treat it as "reject with 401" — except when OUR OWN config is missing, which is a
// deploy misconfiguration and surfaces as a 500 CONFIG instead of masquerading as a bad signature.
export function verifyNotification(rawBody: string, headers: NotificationHeaders, target: string): boolean {
  const secretKey = need('DOKU_SECRET_KEY');

  const gotClientId = headerStr(headers['client-id']);
  const requestId = headerStr(headers['request-id']);
  const timestamp = headerStr(headers['request-timestamp']);
  const signature = headerStr(headers['signature']);
  if (!gotClientId || !requestId || !timestamp || !signature) return false;
  // notifications must be for our merchant account, not merely signed by someone holding a key
  const ourClientId = process.env.DOKU_CLIENT_ID;
  if (ourClientId && gotClientId !== ourClientId) return false;

  const expected = signRequest({ clientId: gotClientId, secretKey, requestId, timestamp, target, body: rawBody }).Signature;
  return safeEqualStr(expected, signature);
}
