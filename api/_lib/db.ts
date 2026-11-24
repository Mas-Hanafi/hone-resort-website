// Supabase RPC helper for the booking engine. Files under api/_lib are not deployed as functions.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export class RpcError extends Error {
  code: string;
  status: number;
  detail?: string;
  constructor(code: string, status: number, detail?: string) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RpcError('CONFIG', 500, 'SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY belum di-set');

  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // raise exception 'STOK_HABIS' in SQL arrives as { message: 'STOK_HABIS', details: ... }
    const code = String(data?.message ?? 'DB_ERROR');
    const known = /^[A-Z_]+$/.test(code);
    if (!known) console.error(`[rpc:${fn}]`, res.status, text);
    throw new RpcError(known ? code : 'DB_ERROR', known ? 409 : 502, data?.details ?? undefined);
  }
  return data as T;
}

export function secret(): string {
  const s = process.env.BOOKING_SECRET;
  if (!s) throw new RpcError('CONFIG', 500, 'BOOKING_SECRET belum di-set');
  return s;
}

export function baseUrl(req: VercelRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = String(req.headers.host || '');
  const proto = (req.headers['x-forwarded-proto'] as string) || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

// The booking engine stays dark on production until BOOKING_ENGINE=on is set there.
export function engineEnabled(): boolean {
  return process.env.BOOKING_ENGINE === 'on';
}

export function sendError(res: VercelResponse, err: unknown) {
  if (err instanceof RpcError) {
    if (err.code === 'CONFIG') console.error('[booking] config:', err.detail);
    return res.status(err.status).json({ error: err.code, detail: err.code === 'CONFIG' ? undefined : err.detail });
  }
  console.error('[booking]', err);
  return res.status(500).json({ error: 'SERVER_ERROR' });
}

// Room types live in the room_type table (admin "Kamar"); the DB rejects unknown or hidden codes.
export const isRoomCode = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_]{2,30}$/.test(v);

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
