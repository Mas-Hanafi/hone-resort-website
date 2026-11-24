// Self-check for payment providers (money path). Run: node api/_lib/payment.check.ts
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { register } from 'node:module';

// api/_lib imports use ".js" (what Vercel expects); map them to the .ts sources for plain Node.
register('data:text/javascript,' + encodeURIComponent(`
  import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
  export async function resolve(s, c, next) {
    if (s.startsWith('.') && s.endsWith('.js') && !existsSync(fileURLToPath(new URL(s, c.parentURL))))
      return next(s.slice(0, -3) + '.ts', c);
    return next(s, c);
  }`));
const { provider } = await import('./payment.ts');
const doku = await import('./doku.ts');

const withStubFetch = async (impl: (url: string, init: any) => Promise<any>, run: () => Promise<void>) => {
  const real = globalThis.fetch;
  (globalThis as any).fetch = impl;
  try { await run(); } finally { (globalThis as any).fetch = real; }
};

// =====================================================================================
// DOKU: stringToSign layout — 5 lines with Digest for POST, 4 lines without for GET, no
// trailing newline. Verified indirectly by recomputing the expected HMAC ourselves.
// =====================================================================================
{
  const clientId = 'doku-client-test', secretKey = 'doku-secret-test';
  const requestId = 'req-1', timestamp = '2026-09-24T08:45:42Z', target = '/checkout/v1/payment';
  const body = JSON.stringify({ a: 1 });
  const digest = createHash('sha256').update(body, 'utf8').digest('base64');

  const postString = [
    `Client-Id:${clientId}`, `Request-Id:${requestId}`, `Request-Timestamp:${timestamp}`,
    `Request-Target:${target}`, `Digest:${digest}`,
  ].join('\n');
  const expectedPostSig = 'HMACSHA256=' + createHmac('sha256', secretKey).update(postString, 'utf8').digest('base64');
  const gotPost = doku.signRequest({ clientId, secretKey, requestId, timestamp, target, body });
  assert.equal(gotPost.Signature, expectedPostSig, 'POST stringToSign = 5 lines with Digest, no trailing newline');
  assert.ok(gotPost.Signature.startsWith('HMACSHA256='), 'signature starts with HMACSHA256=');

  const getString = [
    `Client-Id:${clientId}`, `Request-Id:${requestId}`, `Request-Timestamp:${timestamp}`, `Request-Target:${target}`,
  ].join('\n');
  const expectedGetSig = 'HMACSHA256=' + createHmac('sha256', secretKey).update(getString, 'utf8').digest('base64');
  const gotGet = doku.signRequest({ clientId, secretKey, requestId, timestamp, target });
  assert.equal(gotGet.Signature, expectedGetSig, 'GET stringToSign = 4 lines, no Digest, no trailing newline');
  assert.notEqual(gotPost.Signature, gotGet.Signature, 'Digest line changes the signature');
}

// =====================================================================================
// DOKU: verifyNotification — accepts a self-signed notification, rejects a tampered body,
// a wrong secret, and a missing header.
// =====================================================================================
{
  const clientId = 'doku-client-test', secretKey = 'doku-secret-test';
  process.env.DOKU_CLIENT_ID = clientId;
  process.env.DOKU_SECRET_KEY = secretKey;
  const target = '/api/payment/webhook';
  const rawBody = JSON.stringify({ order: { invoice_number: 'HON0123456789P01', amount: 500000 }, transaction: { status: 'SUCCESS' } });
  const requestId = 'notif-1', timestamp = '2026-09-24T09:00:00Z';

  const signed = doku.signRequest({ clientId, secretKey, requestId, timestamp, target, body: rawBody });
  const headersOk = { 'client-id': clientId, 'request-id': requestId, 'request-timestamp': timestamp, signature: signed.Signature };
  assert.equal(doku.verifyNotification(rawBody, headersOk, target), true, 'valid self-signed notification accepted');
  assert.equal(doku.verifyNotification(rawBody + 'x', headersOk, target), false, 'tampered body rejected');

  const wrongSecretSig = doku.signRequest({ clientId, secretKey: 'a-different-secret', requestId, timestamp, target, body: rawBody }).Signature;
  assert.equal(doku.verifyNotification(rawBody, { ...headersOk, signature: wrongSecretSig }, target), false, 'wrong secret rejected');

  const { signature: _drop, ...noSignatureHeader } = headersOk;
  assert.equal(doku.verifyNotification(rawBody, noSignatureHeader, target), false, 'missing header rejected');
}

// =====================================================================================
// Provider selection: unset PAYMENT_PROVIDER -> doku when both DOKU keys are present, else mock.
// (env DOKU_CLIENT_ID / DOKU_SECRET_KEY already set by the block above.)
// =====================================================================================
{
  delete process.env.PAYMENT_PROVIDER;
  assert.equal(provider().name, 'doku', 'unset PAYMENT_PROVIDER + both DOKU keys -> doku');

  const savedClientId = process.env.DOKU_CLIENT_ID, savedSecretKey = process.env.DOKU_SECRET_KEY;
  delete process.env.DOKU_CLIENT_ID;
  delete process.env.DOKU_SECRET_KEY;
  assert.equal(provider().name, 'mock', 'unset PAYMENT_PROVIDER + no DOKU keys -> mock');
  process.env.DOKU_CLIENT_ID = savedClientId!;
  process.env.DOKU_SECRET_KEY = savedSecretKey!;
}

// =====================================================================================
// DOKU: createCheckout — request shape/headers + response mapping (fetch stubbed).
// =====================================================================================
{
  let captured: { url: string; init: any } | undefined;
  await withStubFetch(
    async (url: string, init: any) => {
      captured = { url, init };
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          message: ['SUCCESS'],
          response: {
            order: { invoice_number: 'HON0123456789P01', amount: 500000 },
            payment: { url: 'https://sandbox.doku.com/pay/abc', token_id: 'tok_abc', expired_date: '20260924153000' },
          },
        }),
      };
    },
    async () => {
      const result = await doku.createCheckout({
        invoice: 'HON0123456789P01',
        amount: 500000,
        paymentDueMinutes: 30,
        customerId: 'HON-0123456789',
        customerName: 'Tamu Uji',
        customerEmail: 'tamu@example.com',
        customerPhone: '081234567890',
        callbackUrl: 'https://example.test/booking/HON-0123456789',
        callbackUrlResult: 'https://example.test/booking/HON-0123456789',
        overrideNotificationUrl: 'https://example.test/api/payment/webhook',
      });
      assert.ok(captured, 'fetch was called');
      assert.equal(captured!.url, 'https://api-sandbox.doku.com/checkout/v1/payment', 'POSTs to the checkout/v1/payment path');
      assert.equal(captured!.init.method, 'POST');
      assert.ok(captured!.init.headers['Client-Id'], 'Client-Id header present');
      assert.ok(captured!.init.headers['Request-Id'], 'Request-Id header present');
      assert.ok(captured!.init.headers['Request-Timestamp'], 'Request-Timestamp header present');
      assert.ok(String(captured!.init.headers['Signature']).startsWith('HMACSHA256='), 'Signature header present');
      const sentBody = JSON.parse(captured!.init.body);
      assert.equal(sentBody.order.invoice_number, 'HON0123456789P01');
      assert.equal(sentBody.order.amount, 500000);
      assert.ok(sentBody.payment.payment_due_date >= 1, 'payment_due_date >= 1');
      assert.equal(sentBody.additional_info.override_notification_url, 'https://example.test/api/payment/webhook');
      assert.equal(result.invoice, 'HON0123456789P01');
      assert.equal(result.tokenId, 'tok_abc');
      assert.equal(result.payUrl, 'https://sandbox.doku.com/pay/abc');
      assert.ok(result.expiresAt.endsWith('Z'), 'expiresAt is an ISO UTC string');
    },
  );
}

// =====================================================================================
// DOKU: checkStatus — GET request shape + status pass-through mapping (fetch stubbed).
// =====================================================================================
for (const wireStatus of ['SUCCESS', 'EXPIRED']) {
  let captured: { url: string; init: any } | undefined;
  await withStubFetch(
    async (url: string, init: any) => {
      captured = { url, init };
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          order: { invoice_number: 'HON0123456789P01', amount: 500000 },
          transaction: { status: wireStatus },
        }),
      };
    },
    async () => {
      const r = await doku.checkStatus('HON0123456789P01');
      assert.ok(captured, 'fetch was called');
      assert.equal(captured!.url, 'https://api-sandbox.doku.com/orders/v1/status/HON0123456789P01');
      assert.equal(captured!.init.method, 'GET');
      assert.ok(String(captured!.init.headers['Signature']).startsWith('HMACSHA256='));
      assert.equal(r.status, wireStatus, `checkStatus passes ${wireStatus} through unchanged (DOKU vocabulary)`);
      assert.equal(r.amount, 500000);
    },
  );
}

// --- Midtrans
process.env.PAYMENT_PROVIDER = 'midtrans';
process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-TEST';
const mt = provider();
const mtNotif = { order_id: 'HON0123456789P01', status_code: '200', gross_amount: '2300000.00', transaction_status: 'settlement' };
const mtSig = createHash('sha512').update(mtNotif.order_id + mtNotif.status_code + mtNotif.gross_amount + process.env.MIDTRANS_SERVER_KEY).digest('hex');
assert.deepEqual(
  { ...mt.parseWebhook(JSON.stringify({ ...mtNotif, signature_key: mtSig }), {}, '')!, raw: undefined },
  { invoice: 'HON0123456789P01', status: 'SUCCESS', amount: 2300000, raw: undefined });
assert.equal(mt.parseWebhook(JSON.stringify({ ...mtNotif, signature_key: 'x'.repeat(128) }), {}, ''), null, 'forged signature rejected');
assert.equal(mt.parseWebhook(JSON.stringify({ ...mtNotif, gross_amount: '1.00', signature_key: mtSig }), {}, ''), null, 'tampered amount rejected');
const mtFraud = { ...mtNotif, transaction_status: 'capture', fraud_status: 'challenge' };
const mtSig2 = createHash('sha512').update(mtFraud.order_id + mtFraud.status_code + mtFraud.gross_amount + process.env.MIDTRANS_SERVER_KEY).digest('hex');
assert.equal(mt.parseWebhook(JSON.stringify({ ...mtFraud, signature_key: mtSig2 }), {}, '')!.status, 'PENDING', 'fraud challenge is not paid');

// --- Xendit
process.env.PAYMENT_PROVIDER = 'xendit';
process.env.XENDIT_CALLBACK_TOKEN = 'tok_test';
const xd = provider();
const xdNotif = { external_id: 'HON0123456789P02', status: 'PAID', paid_amount: 2300000 };
assert.equal(xd.parseWebhook(JSON.stringify(xdNotif), { 'x-callback-token': 'tok_test' }, '')!.status, 'SUCCESS');
assert.equal(xd.parseWebhook(JSON.stringify(xdNotif), { 'x-callback-token': 'wrong' }, ''), null, 'wrong callback token rejected');
assert.equal(xd.parseWebhook(JSON.stringify({ ...xdNotif, status: 'EXPIRED' }), { 'x-callback-token': 'tok_test' }, '')!.status, 'EXPIRED');

// --- mock refuses production
process.env.PAYMENT_PROVIDER = 'mock';
process.env.VERCEL_ENV = 'production';
await assert.rejects(provider().create({ kode: 'HON-ABCDEF1234', invoice: 'HON-ABCDEF1234P01' } as any), /PEMBAYARAN_BELUM_AKTIF/);

// --- DOKU customer fields follow the docs: phone {calling_code}{number} max 16, name alphabetic
assert.equal(doku.dokuPhone('0812-3456-7890'), '6281234567890');
assert.equal(doku.dokuPhone('+62 812 3456 7890'), '6281234567890');
assert.equal(doku.dokuPhone('81234567890'), '6281234567890');
assert.equal(doku.dokuPhone('123'), undefined);
assert.equal(doku.dokuPhone('0812345678901234567'), '6281234567890123');
assert.equal(doku.dokuName('Budi S. 2'), 'Budi S');
assert.equal(doku.dokuName('Élise  O\'Neil'), 'Elise O Neil');
assert.equal(doku.dokuName('123'), 'Tamu');

// --- DOKU check status: ORDER_EXPIRED closes a still-pending checkout, SUCCESS always wins
assert.deepEqual(doku.statusFromCheck({ order: { status: 'ORDER_EXPIRED', amount: 120000 }, transaction: { status: 'PENDING' } }), { status: 'EXPIRED', amount: 120000 });
assert.deepEqual(doku.statusFromCheck({ order: { status: 'ORDER_GENERATED', amount: 120000.0 }, transaction: { status: 'SUCCESS' } }), { status: 'SUCCESS', amount: 120000 });
assert.equal(doku.statusFromCheck({ order: { status: 'ORDER_GENERATED' }, transaction: { status: 'PENDING' } }).status, 'PENDING');
process.env.DOKU_CLIENT_ID = 'doku-client-test'; process.env.DOKU_SECRET_KEY = 'doku-secret-test';
await withStubFetch(async () => ({ status: 404, ok: false, text: async () => '{"error":"not found"}' }), async () => {
  assert.equal((await doku.checkStatus('HON-ABCDEF1234P01')).status, 'PENDING');
});

console.log('payment.check: all passed');
