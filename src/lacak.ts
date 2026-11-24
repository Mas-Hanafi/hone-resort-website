// Guest behaviour events for admin Laporan (booking engine only). One anonymous id per browser tab,
// no personal data; POST /api/booking/track drops unknown event names.
const ON = import.meta.env.VITE_BOOKING_ENGINE === 'on';

export const sesi = (() => {
  try {
    let s = sessionStorage.getItem('hone_sesi');
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem('hone_sesi', s); }
    return s;
  } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
})();

const sent = new Set<string>();

// `once` = a key to send the event only once per page load (e.g. the same full room shown twice)
export function lacak(jenis: string, kode?: string, data?: Record<string, unknown>, once?: string) {
  if (!ON) return;
  if (once) { if (sent.has(once)) return; sent.add(once); }
  const body = JSON.stringify({ sesi, jenis, kode, data });
  try {
    if (navigator.sendBeacon?.('/api/booking/track', new Blob([body], { type: 'application/json' }))) return;
  } catch { /* fall back to fetch */ }
  fetch('/api/booking/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
