// Booking emails via Resend. Without RESEND_API_KEY this only logs, so the flow works before an email account exists.
// hone.example has no mailboxes (no MX), so replies go to BOOKING_EMAIL_REPLY_TO, a real inbox.
import { rpc } from './db.js';

const rupiah = (n: number) => 'Rp' + Number(n).toLocaleString('id-ID');
const tgl = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const waktu = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';

// where the guest's status / receipt page lives for this deployment
export function siteUrl(): string {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://www.hone.example';
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  return 'http://localhost:5173';
}

// same label as private.metode_bayar() in the DB (receipt page + admin)
const SERVICE: Record<string, string> = {
  VIRTUAL_ACCOUNT: 'Virtual Account', EMONEY: 'E-Wallet', QRIS: 'QRIS', CREDIT_CARD: 'Kartu kredit/debit',
  ONLINE_TO_OFFLINE: 'Gerai', PEER_TO_PEER: 'Paylater', DIRECT_DEBIT: 'Direct debit',
};
export function metodeBayar(p: any): string | null {
  if (!p || typeof p !== 'object') return null;
  if (p.mock) return 'Simulasi (staging)';
  const svc = p.service?.id;
  const bank = p.acquirer?.name ?? p.acquirer?.id ?? (svc && typeof p.channel?.id === 'string' && p.channel.id.startsWith(`${svc}_`) ? p.channel.id.slice(svc.length + 1).replace(/^BANK_/, '').replace(/_/g, ' ') : null);
  return [svc ? SERVICE[svc] ?? svc : null, svc === 'QRIS' ? null : bank].filter(Boolean).join(' ') || null;
}

async function send(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM || 'H One Resort <reservasi@hone.example>';
  const replyTo = process.env.BOOKING_EMAIL_REPLY_TO;
  if (!key) { console.log(`[notify] (email off) to=${to} subject="${subject}"`); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) console.error('[notify] resend failed', res.status, await res.text());
  else console.log(`[notify] sent to=${to} id=${((await res.json().catch(() => ({}))) as { id?: string }).id ?? '-'}`);
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:8px 0;color:#737373;font-size:13px;vertical-align:top">${label}</td>` +
  `<td style="padding:8px 0;color:#1c1c1c;font-size:13px;text-align:right">${value}</td></tr>`;

// b = booking row returned by payment_settle()
export async function notifyPaid(b: any) {
  // payment_settle returns the raw row; booking_get adds the room type's current name
  const room = (await rpc<{ room_nama?: string }>('booking_get', { p_kode: b.kode }).catch(() => null))?.room_nama ?? b.room_code;
  const s = await rpc<{ jam_checkin?: string; jam_checkout?: string; whatsapp?: string }>('booking_public_setting', {}).catch(() => null);
  const jam = (t: string | undefined, fallback: string) => (t ? t.slice(0, 5).replace(':', '.') : fallback);
  const malam = Math.round((new Date(b.checkout).getTime() - new Date(b.checkin).getTime()) / 864e5);
  const metode = metodeBayar(b.pg_payload);
  const link = `${siteUrl()}/booking/${encodeURIComponent(b.kode)}`;
  const wa = String(s?.whatsapp || '6280000000000').replace(/\D/g, '');

  const detail = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #eee">
      ${row('Kode booking', `<b style="font-family:monospace;letter-spacing:1px">${esc(b.kode)}</b>`)}
      ${row('Kamar', `${esc(room)} × ${b.jumlah_kamar}`)}
      ${row('Check-in', `${tgl(b.checkin)}<br><span style="color:#737373">mulai pukul ${jam(s?.jam_checkin, '15.00')}</span>`)}
      ${row('Check-out', `${tgl(b.checkout)}<br><span style="color:#737373">paling lambat ${jam(s?.jam_checkout, '12.00')}</span>`)}
      ${row('Lama menginap', `${malam} malam`)}
      ${row('Tamu', `${b.dewasa} dewasa${b.anak ? `, ${b.anak} anak` : ''}`)}
      ${metode ? row('Metode pembayaran', esc(metode)) : ''}
      ${b.pg_ref ? row('No. invoice', `<span style="font-family:monospace">${esc(b.pg_ref)}</span>`) : ''}
      ${b.paid_at ? row('Dibayar pada', waktu(b.paid_at)) : ''}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:2px solid #1c1c1c;margin-top:4px">
      <tr><td style="padding:12px 0;font-size:14px;font-weight:bold;color:#1c1c1c">Total dibayar</td>
          <td style="padding:12px 0;font-size:18px;font-weight:bold;color:#1c1c1c;text-align:right">${rupiah(b.total)}</td></tr>
    </table>`;

  const jobs: Promise<void>[] = [];
  if (b.email) {
    jobs.push(send(b.email, `Pembayaran diterima · Booking ${b.kode} · H One Resort`, `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f6f2;font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
        <tr><td style="background:#1c1c1c;padding:20px 28px;text-align:center">
          <img src="${siteUrl()}/email-logo.png" width="150" alt="H One Resort" style="display:inline-block;width:150px;height:auto;border:0;color:#D4AF37;font-family:Georgia,serif;letter-spacing:3px;font-size:15px">
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#15803d;font-weight:bold">PEMBAYARAN BERHASIL</p>
          <h1 style="margin:0 0 12px;font-size:22px;color:#1c1c1c">Yth. ${esc(b.nama)},</h1>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#404040">Terima kasih telah memilih H One Resort. Dengan senang hati kami informasikan bahwa pembayaran Anda telah kami terima dan reservasi Anda telah terkonfirmasi. Berikut detail reservasi Anda.</p>
          ${detail}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:#1c1c1c;border-radius:10px">
            <a href="${link}" style="display:inline-block;padding:13px 22px;color:#D4AF37;font-size:13px;font-weight:bold;letter-spacing:1px;text-decoration:none">LIHAT &amp; SIMPAN BUKTI PEMBAYARAN</a>
          </td></tr></table>
          <p style="margin:0 0 20px;font-size:12px;color:#737373">Mohon tunjukkan kode booking kepada Front Office saat check-in.</p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#404040">Ada pertanyaan atau permintaan khusus? Hubungi kami lewat
            <a href="https://wa.me/${wa}" style="color:#8A6D00">WhatsApp +${wa}</a>.</p>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#404040">Kami menantikan kedatangan Anda.<br>Hormat kami,<br><b>Tim Reservasi H One Resort</b></p>
        </td></tr>
        <tr><td style="background:#fafafa;padding:16px 28px;font-size:11px;line-height:1.6;color:#8a8a8a;text-align:center">
          H One Resort · Pantai Contoh, Desa Contoh, Kecamatan Contoh, Kabupaten Contoh, Provinsi Contoh<br>
          Email ini dikirim otomatis setelah pembayaran booking ${esc(b.kode)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`));
  }
  const staff = process.env.BOOKING_NOTIFY_EMAIL;
  if (staff) {
    jobs.push(send(staff, `[Booking ${b.sumber}] ${b.kode} lunas · ${room} ${tgl(b.checkin)}`,
      `${detail}<p><b>Nama:</b> ${esc(b.nama)}<br><b>WA:</b> ${esc(b.wa)}<br><b>Email:</b> ${esc(b.email || '-')}</p>
       <p><b>Catatan tamu:</b> ${esc(b.catatan || '-')}</p>
       ${b.catatan_admin ? `<p style="color:#a33a2a"><b>${esc(b.catatan_admin)}</b></p>` : ''}
       <p>Tutup kamar yang sama di channel manager.</p>`));
  }
  await Promise.all(jobs);
}
