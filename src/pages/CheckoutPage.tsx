// Booking engine pages: /checkout (guest books), /checkout/:kode (sales link), /booking/:kode (status),
// /booking (look up a code).
// Only mounted when VITE_BOOKING_ENGINE=on (see src/main.tsx).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DayPicker, type DateRange } from 'react-day-picker';
import { DayDataContext, PriceDayButton, useHariLibur, dpLocale, scarcityText } from '../calendarDay';
import { useLang, LangSwitch, trNow } from '../lang';

const DAY_COMPONENTS = { DayButton: PriceDayButton };
import 'react-day-picker/style.css';
import { ArrowLeft, Check, Clock, Loader2, MessageCircle, Minus, Plus, ShieldCheck, AlertTriangle, Flame, Download, RefreshCw } from 'lucide-react';
import { alternatives, type NightOf } from '../stay';
import RoomAlternatives from '../components/RoomAlternatives';
import { lacak, sesi } from '../lacak';

const WA_NUMBER = '6280000000000';
// same rule as private.wa_valid (DB): Indonesian mobile 08/62/+62, or + country code abroad
const waValid = (v: string) => { const s = v.replace(/[\s().-]/g, ''); return /^(\+?62|0)8\d{8,12}$/.test(s) || (/^\+[1-9]\d{7,14}$/.test(s) && !s.startsWith('+62')); };
// Room types come from admin "Kamar" (booking setting `kamar`); this list is only the first-paint fallback.
// ponytail: module-level list replaced in place once the setting loads, so every helper below stays a plain function.
const ROOMS: { code: string; name: string; unit?: number }[] = [
  { code: 'sup_sv', name: 'Superior Sea View', unit: 7 },
  { code: 'sup_gv', name: 'Superior Garden View', unit: 9 },
  { code: 'dlx_sv', name: 'Deluxe Sea View', unit: 8 },
  { code: 'dlx_gv', name: 'Deluxe Garden View', unit: 5 },
  { code: 'suite_sv', name: 'Suite Sea View', unit: 1 },
];
const NAMES: Record<string, string> = {}; // names of booked types that are not offered on the web (sales links)
const roomName = (code: string) => NAMES[code] ?? ROOMS.find(r => r.code === code)?.name ?? code;
const maxRooms = (code: string) => Math.min(10, ROOMS.find(r => r.code === code)?.unit ?? 10);

// [Indonesian, English]; picked at call time by errText so an error shown in a helper follows the chosen language
const ERRORS: Record<string, [string, string]> = {
  STOK_HABIS: ['Maaf, kamar untuk tanggal itu baru saja habis. Pilih tanggal lain atau hubungi tim kami.', 'We are sorry, the room for those dates has just been fully booked. Please choose other dates or contact our team.'],
  HARGA_BELUM_ADA: ['Harga untuk sebagian tanggal belum dibuka. Hubungi tim kami untuk tanggal ini.', 'Rates for some of these dates have not yet been released. Please contact our team for these dates.'],
  TANGGAL_LEWAT: ['Tanggal check-in sudah lewat.', 'The check-in date has already passed.'],
  TANGGAL_TIDAK_VALID: ['Periksa lagi tanggal check-in dan check-out (maksimal 30 malam).', 'Please review your check-in and check-out dates (maximum 30 nights).'],
  DATA_TAMU_TIDAK_LENGKAP: ['Isi nama dan nomor WhatsApp yang valid.', 'Please enter your name and a valid WhatsApp number.'],
  EMAIL_TIDAK_VALID: ['Format email belum benar.', 'The email format is not valid.'],
  WA_TIDAK_VALID: ['Nomor WhatsApp belum benar. Gunakan nomor HP aktif, contoh 0812 3456 7890 (nomor luar negeri diawali + dan kode negara).', 'Please enter a valid WhatsApp number, e.g. 0812 3456 7890 (international numbers start with + and the country code).'],
  EMAIL_WAJIB: ['Email wajib diisi. Bukti booking dan pembayaran dikirim ke email ini.', 'An email address is required. Your booking confirmation and payment receipt will be sent to it.'],
  BELUM_SETUJU_SK: ['Centang persetujuan syarat & ketentuan dulu.', 'Please tick the box to accept the terms & conditions.'],
  JUMLAH_KAMAR_TIDAK_VALID: ['Jumlah kamar tidak valid. Suite Sea View maksimal 1 kamar per pesanan.', 'The number of rooms is not valid. The Suite Sea View is limited to 1 room per booking.'],
  BOOKING_KEDALUWARSA: ['Batas waktu pembayaran sudah habis. Silakan buat pesanan baru atau hubungi tim kami.', 'The payment deadline has passed. Please make a new booking or contact our team.'],
  SUDAH_LUNAS: ['Pesanan ini sudah lunas.', 'This booking has already been paid in full.'],
  PEMBAYARAN_BELUM_AKTIF: ['Pembayaran online belum aktif. Silakan pesan lewat WhatsApp.', 'Online payment is not yet available. Please book via WhatsApp.'],
  BOOKING_ENGINE_OFF: ['Pembayaran online belum aktif. Silakan pesan lewat WhatsApp.', 'Online payment is not yet available. Please book via WhatsApp.'],
  GATEWAY_ERROR: ['Halaman pembayaran sedang bermasalah. Coba lagi sebentar lagi atau hubungi tim kami.', 'The payment page is experiencing a problem. Please try again shortly or contact our team.'],
  MIN_MALAM: ['Minimal {n} malam untuk tanggal check-in ini.', 'A minimum stay of {n} nights applies to this check-in date.'],
  MAKS_MALAM: ['Maksimal {n} malam untuk tanggal check-in ini.', 'A maximum stay of {n} nights applies to this check-in date.'],
  CHECKIN_DILARANG: ['Tanggal ini tidak bisa dipilih sebagai check-in.', 'This date cannot be selected for check-in.'],
  CHECKOUT_DILARANG: ['Tanggal ini tidak bisa dipilih sebagai check-out.', 'This date cannot be selected for check-out.'],
  TERLALU_DEKAT: ['Pemesanan online untuk tanggal ini harus dilakukan lebih awal. Hubungi tim kami untuk booking mendadak.', 'Online bookings for these dates must be made earlier. Please contact our team for last-minute reservations.'],
  DI_LUAR_JENDELA: ['Booking online hanya untuk beberapa bulan ke depan. Untuk tanggal ini, hubungi tim sales kami lewat WhatsApp.', 'Online booking is available only for the coming few months. For these dates, please contact our sales team via WhatsApp.'],
  KAPASITAS_LEBIH: ['Maksimal 4 orang per kamar (2 orang + 2 extra bed). Tambah jumlah kamar untuk rombongan ini.', 'A maximum of 4 guests per room (2 guests + 2 extra beds). Please add more rooms for this group.'],
  EXTRA_BED_MAKS: ['Maksimal 2 extra bed per kamar.', 'A maximum of 2 extra beds per room.'],
  ADDON_TIDAK_VALID: ['Salah satu add-on sudah tidak tersedia. Muat ulang halaman lalu coba lagi.', 'One of the add-ons is no longer available. Please reload the page and try again.'],
  JUMLAH_TAMU_TIDAK_VALID: ['Jumlah tamu tidak valid.', 'The number of guests is not valid.'],
  TERLALU_BANYAK_HOLD: ['Anda sudah punya 2 pesanan yang menunggu pembayaran. Selesaikan salah satunya dulu, atau hubungi tim kami.', 'You already have 2 bookings awaiting payment. Please complete one of them first, or contact our team.'],
  TURNSTILE_GAGAL: ['Verifikasi keamanan gagal. Coba lagi.', 'Security verification failed. Please try again.'],
  BELUM_LUNAS: ['Pesanan ini belum lunas.', 'This booking has not been paid yet.'],
  VOUCHER_TIDAK_ADA: ['Kode voucher tidak ditemukan atau sudah tidak aktif.', 'The voucher code was not found or is no longer active.'],
  VOUCHER_TIDAK_BERLAKU: ['Kode voucher ini tidak berlaku untuk tanggal menginap yang dipilih.', 'This voucher code is not valid for the selected stay dates.'],
  VOUCHER_KAMAR: ['Kode voucher ini tidak berlaku untuk tipe kamar yang dipilih.', 'This voucher code is not valid for the selected room type.'],
  VOUCHER_MIN_MALAM: ['Kode voucher ini minimal {n} malam.', 'This voucher code requires a minimum of {n} nights.'],
  VOUCHER_HABIS: ['Kuota kode voucher ini sudah habis.', 'This voucher code has reached its usage limit.'],
  VOUCHER_BELUM_MULAI: ['Kode voucher ini baru bisa dipakai mulai {n} WIB.', 'This voucher code can be used from {n} WIB.'],
  VOUCHER_BERAKHIR: ['Masa pemakaian kode voucher ini sudah berakhir.', 'The validity period of this voucher code has ended.'],
  VOUCHER_BATAS_TAMU: ['Kode voucher ini sudah dipakai dengan nomor WhatsApp Anda (maksimal {n}× per tamu).', 'This voucher code has already been used with your WhatsApp number (maximum {n}× per guest).'],
  TOTAL_TIDAK_VALID: ['Total pesanan tidak valid. Hubungi tim kami lewat WhatsApp untuk kode voucher ini.', 'The booking total is not valid. Please contact our team via WhatsApp for this voucher code.'],
  ADDON_H2: ['Romantic Dinner dan Romantic Towel hanya dapat dipesan paling lambat H-2 sebelum check-in.', 'Romantic Dinner and Romantic Towel can only be booked no later than 2 days (H-2) before check-in.'],
  ADDON_HABIS: ['{n} sudah penuh untuk tanggal check-in yang dipilih. Silakan pilih tanggal atau add-on lain.', '{n} is fully booked for the selected check-in date. Please choose another date or add-on.'],
};
// `detail` (from the API error JSON) fills the {n} placeholder, e.g. MIN_MALAM's required night count.
const errText = (code?: string, detail?: unknown) => {
  const tpl = ERRORS[code ?? ''];
  if (!tpl) return trNow('Terjadi kendala. Coba lagi atau hubungi tim kami lewat WhatsApp.', 'Something went wrong. Please try again or contact our team via WhatsApp.');
  const d = detail ?? (code === 'ADDON_HABIS' ? trNow('Add-on ini', 'This add-on') : null);
  const text = trNow(tpl[0], tpl[1]);
  return d != null ? text.replace('{n}', String(d)) : text;
};
const en = () => trNow('id-ID', 'en-GB');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ---------- helpers ----------
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => new Date(s + 'T00:00:00');
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const nights = (from: string, to: string) => { const out: string[] = []; for (let d = from; d < to; d = addDays(d, 1)) out.push(d); return out; };
// Romantic Dinner / Romantic Towel need 2 days of preparation: check-in must be at least today (WIB) + 2 days.
const H2_ADDONS = ['romantic_dinner', 'romantic_towel'];
const h2Message = () => trNow('Romantic Dinner / Romantic Towel tidak tersedia untuk check-in kurang dari H-2. Kurangi add-on tersebut menjadi 0 atau pilih add-on lain.', 'Romantic Dinner / Romantic Towel are not available for check-in less than 2 days (H-2) away. Please reduce these add-ons to 0 or choose another add-on.');
const wibToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const h2Blocked = (kodes: string[], checkIn?: string) => !!checkIn && kodes.some(k => H2_ADDONS.includes(k)) && checkIn < addDays(wibToday(), 2);

// One-time pop-up shown when a guest adds one of the H-2 add-ons (closes on backdrop click or Escape).
function AddonH2Modal({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 px-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="addon-h2-title" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-white border border-[#D4AF37]/60 rounded-[10px] p-7 text-center shadow-2xl">
        <h3 id="addon-h2-title" className="font-serif text-[15px] tracking-[0.3em] text-[#8A6D00]">{tr('Informasi Add-on', 'Add-on Information')}</h3>
        <div className="mx-auto mt-3 mb-4 h-px w-12 bg-[#D4AF37]" />
        <p className="font-sans text-[13px] leading-relaxed text-neutral-700">
          {tr('Romantic Dinner dan Romantic Towel membutuhkan persiapan khusus, sehingga hanya dapat dipesan paling lambat H-2 sebelum tanggal check-in.', 'Romantic Dinner and Romantic Towel require special preparation, so they can only be booked no later than 2 days (H-2) before your check-in date.')}
        </p>
        <button type="button" autoFocus onClick={onClose}
          className="mt-6 w-full bg-[#1c1c1c] text-[#D4AF37] font-bold uppercase tracking-[0.3em] text-[11px] py-3.5 rounded-[8px] hover:bg-[#D4AF37] hover:text-black transition-colors duration-300">
          {tr('Saya mengerti', 'I understand')}
        </button>
      </div>
    </div>,
    document.body
  );
}
const fmt = (s: string, withYear = true, loc = en()) => parse(s).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
const rupiah = (n: number) => 'Rp' + Number(n).toLocaleString(en());
// the resort number is edited in admin Pengaturan; the constant is the fallback
let resortWa = WA_NUMBER;
{
  const sb = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (sb && key) fetch(`${sb}/rest/v1/pengaturan?select=value&key=eq.whatsapp`, { headers: { apikey: key } })
    .then(r => (r.ok ? r.json() : null))
    .then((rows: { value: unknown }[] | null) => { const v = String(rows?.[0]?.value ?? '').replace(/\D/g, ''); if (v.length >= 10) resortWa = v; })
    .catch(() => {});
}
const waLink = (text: string) => `https://wa.me/${resortWa}?text=${encodeURIComponent(text)}`;
const track = (name: string, params: Record<string, unknown>) => (window as any).gtag?.('event', name, params);

async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/booking/${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'ERROR'), { code: data.error, detail: data.detail });
  return data;
}

type Avail = Map<string, { sisa: number; harga: number | null; harga_normal?: number | null; min_malam: number | null; tutup_checkin: boolean; tutup_checkout: boolean }>;

type Addon = { kode: string; nama: string; harga: number; satuan: string; per_malam: boolean; maks: number; kuota_harian?: number | null; min_hari?: number | null };
type AddonLine = { kode: string; nama: string; satuan: string; qty: number; subtotal: number };
type BookingSetting = {
  pajak_persen: number; pajak_termasuk: boolean; jam_checkin?: string; jam_checkout?: string;
  jendela_bulan?: number; kapasitas_kamar?: number; extra_bed_maks?: number;
  kebijakan_pembatalan?: string | null; addons?: Addon[];
  kamar?: { kode: string; nama: string; unit: number }[];
} & Record<string, unknown>;

// "15:00:00" -> "15.00"; fallback while the setting is still loading.
const jam = (t: string | undefined, fallback: string) => (t ? t.slice(0, 5).replace(':', '.') : fallback);

// Fetched once per page (not polled) — used for the tax line in Summary.
function useBookingSetting() {
  const [setting, setSetting] = useState<BookingSetting | null>(null);
  useEffect(() => {
    api<BookingSetting>('setting').then(s => {
      if (s.kamar?.length) ROOMS.splice(0, ROOMS.length, ...s.kamar.map(k => ({ code: k.kode, name: k.nama, unit: k.unit })));
      setSetting(s);
    }).catch(() => {});
  }, []);
  return setting;
}

// ---------- Cloudflare Turnstile (only rendered when a site key is configured) ----------
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
let turnstileScriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile script failed to load'));
    document.head.appendChild(s);
  });
  return turnstileScriptPromise;
}

function Turnstile({ onToken, onReady }: { onToken: (token: string | null) => void; onReady: (widgetId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadTurnstileScript().then(() => {
      if (cancelled || !ref.current || !(window as any).turnstile) return;
      const id = (window as any).turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
      onReady(id);
    }).catch(e => console.error('[turnstile] failed to load', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- render the widget exactly once
  }, []);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="mb-3" />;
}

// ---------- layout ----------
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { tr } = useLang();
  useEffect(() => {
    document.title = `${title} | H One Resort`;
    const robots = document.querySelector('meta[name="robots"]');
    const prev = robots?.getAttribute('content');
    robots?.setAttribute('content', 'noindex, nofollow');
    return () => { if (robots && prev) robots.setAttribute('content', prev); };
  }, [title]);
  return (
    <div className="min-h-[100dvh] bg-[#f7f6f2] text-neutral-800">
      <header className="bg-[#1c1c1c]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex-1">
            <Link to="/" className="inline-flex items-center gap-2 text-neutral-400 hover:text-[#D4AF37] text-[12px] tracking-wide transition-colors">
              <ArrowLeft size={14} /> {tr('Kembali', 'Back')}
            </Link>
          </div>
          <Link to="/" aria-label="H One Resort"><img src="/email-logo.png" alt="H One Resort" className="h-12 w-auto" /></Link>
          <div className="flex-1 flex justify-end"><LangSwitch className="ring-1 ring-[#D4AF37]/40" /></div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">{children}</main>
      <footer className="max-w-5xl mx-auto px-4 md:px-6 pb-10 text-[12px] text-neutral-500 flex items-center gap-2">
        <ShieldCheck size={14} className="text-[#8A6D00]" /> {tr('Pembayaran diproses oleh payment gateway resmi. Butuh bantuan?', 'Payments are processed by an official payment gateway. Need assistance?')}
        <a className="underline hover:text-[#8A6D00]" href={waLink('Halo, saya butuh bantuan untuk booking di website H One Resort.')} target="_blank" rel="noreferrer">{tr('WhatsApp kami', 'WhatsApp us')}</a>
      </footer>
    </div>
  );
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <section className={`bg-white border border-neutral-200/80 rounded-[14px] p-5 md:p-6 ${className}`}>{children}</section>;
const Label = ({ children }: { children: React.ReactNode }) =>
  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 mb-3">{children}</p>;
const Notice = ({ tone = 'warn', children }: { tone?: 'warn' | 'ok'; children: React.ReactNode }) => (
  <div className={`flex gap-3 rounded-[10px] px-4 py-3 text-[13px] leading-relaxed ${tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
    {tone === 'ok' ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}<div>{children}</div>
  </div>
);
const WaButton = ({ text, label, tempat = 'checkout' }: { text: string; label?: string; tempat?: 'checkout' | 'status' }) => {
  const { tr } = useLang();
  return (
  <a href={waLink(text)} target="_blank" rel="noreferrer"
     onClick={() => { track('whatsapp_click', { click_location: tempat }); lacak('pilih_wa', undefined, { tempat }); }}
     className="inline-flex items-center justify-center gap-2 w-full border border-[#25D366] text-[#128C4B] rounded-[10px] py-3 text-[13px] font-semibold hover:bg-[#25D366]/10 transition-colors">
    <MessageCircle size={16} /> {label ?? tr('Tanya tim kami via WhatsApp', 'Ask our team via WhatsApp')}
  </a>
  );
};

function Summary({ room, from, to, qty, rincian, addons = [], diskon = 0, voucherKode, total, pajak, pajakPersen, pajakTermasuk, dewasa, anak }: {
  room: string; from?: string; to?: string; qty: number; rincian: { tanggal: string; harga: number; normal?: number }[];
  addons?: AddonLine[]; diskon?: number; voucherKode?: string | null;
  total: number; pajak: number; pajakPersen: number | null; pajakTermasuk: boolean | null; dewasa: number; anak: number;
}) {
  const discount = diskon;
  const { tr } = useLang();
  return (
    <Card className="md:sticky md:top-6">
      <Label>{tr('Ringkasan', 'Summary')}</Label>
      <p className="font-serif text-[15px] tracking-wide">{roomName(room)}</p>
      <p className="text-[13px] text-neutral-500 mt-1">{tr(`${qty} kamar · ${dewasa} dewasa${anak ? `, ${anak} anak` : ''}`, `${qty} ${plural(qty, 'room', 'rooms')} · ${dewasa} ${plural(dewasa, 'adult', 'adults')}${anak ? `, ${anak} ${plural(anak, 'child', 'children')}` : ''}`)}</p>
      {from && to ? (
        <p className="text-[13px] mt-3">{fmt(from)} → {fmt(to)} <span className="text-neutral-500">({rincian.length} {tr('malam', plural(rincian.length, 'night', 'nights'))})</span></p>
      ) : <p className="text-[13px] mt-3 text-neutral-400">{tr('Pilih tanggal menginap', 'Select your stay dates')}</p>}
      {rincian.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-[13px] tabular-nums border-t border-neutral-100 pt-4">
          {rincian.map(n => (
            <li key={n.tanggal} className="flex justify-between gap-3">
              <span className="text-neutral-500">{fmt(n.tanggal, false)}{qty > 1 ? ` × ${qty}` : ''}{n.normal && n.normal > n.harga ? <span className="ml-1.5 text-[11px] font-semibold text-red-600">promo</span> : null}</span>
              <span>{n.normal && n.normal > n.harga && <span className="mr-1.5 text-neutral-400 line-through">{rupiah(n.normal * qty)}</span>}{rupiah(n.harga * qty)}</span>
            </li>
          ))}
          {addons.map(a => (
            <li key={a.kode} className="flex justify-between gap-3">
              <span className="text-neutral-500">{a.nama} × {a.qty}</span><span>{rupiah(a.subtotal)}</span>
            </li>
          ))}
          {discount > 0 && (
            <li className="flex justify-between gap-3 text-emerald-700">
              <span>{voucherKode ? `Voucher ${voucherKode}` : tr('Harga khusus dari tim reservasi', 'Special rate from our reservations team')}</span><span>−{rupiah(discount)}</span>
            </li>
          )}
          {!pajakTermasuk && pajak > 0 && (
            <li className="flex justify-between gap-3">
              <span className="text-neutral-500">{tr('Pajak & service', 'Tax & service charge')}{pajakPersen ? ` ${pajakPersen}%` : ''}</span><span>{rupiah(pajak)}</span>
            </li>
          )}
        </ul>
      )}
      <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-neutral-200">
        <span className="text-[12px] uppercase tracking-[0.15em] text-neutral-500">{tr('Total', 'Total')}</span>
        <span className="text-[22px] font-semibold tabular-nums">{total ? rupiah(total) : '-'}</span>
      </div>
      {pajakTermasuk && pajakPersen ? (
        <p className="text-[11px] text-neutral-400 mt-1">{tr(`Termasuk pajak ${pajakPersen}%. Harga per kamar per malam, sesuai Pricelist.`, `Includes ${pajakPersen}% tax. Rates are per room per night, as per the Pricelist.`)}</p>
      ) : (
        <p className="text-[11px] text-neutral-400 mt-1">{tr(`Harga kamar per malam sesuai Pricelist. Total sudah termasuk pajak & service${pajakPersen ? ` ${pajakPersen}%` : ''}.`, `Room rates are per night, as per the Pricelist. The total includes tax & service charge${pajakPersen ? ` (${pajakPersen}%)` : ''}.`)}</p>
      )}
    </Card>
  );
}

// ---------- /checkout ----------
function SelfCheckout() {
  const { tr, lang } = useLang();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const today = ymd(new Date());
  const [avail, setAvail] = useState<Avail | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [room, setRoom] = useState(/^[a-z0-9_]{2,30}$/.test(sp.get('kamar') ?? '') ? sp.get('kamar')! : 'dlx_sv');
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const i = sp.get('in'), o = sp.get('out');
    return i && o && i >= today && o > i ? { from: parse(i), to: parse(o) } : undefined;
  });
  const [qty, setQty] = useState(Math.max(1, Math.min(Number(sp.get('rooms')) || 1, 10)));
  // ?addons=extra_bed,slice_of_cake from the pricelist modal's request picker -> 1 each
  const [addonQty, setAddonQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((sp.get('addons') ?? '').split(',').filter(Boolean).map(k => [k, 1])));
  const [dewasa, setDewasa] = useState(Math.max(1, Number(sp.get('adults')) || 2));
  const [anak, setAnak] = useState(Math.max(0, Number(sp.get('children')) || 0));
  const fromModal = (useLocation().state ?? {}) as { name?: string; wa?: string };
  const [nama, setNama] = useState(fromModal.name ?? sp.get('name') ?? '');
  const [wa, setWa] = useState(fromModal.wa ?? sp.get('wa') ?? '');
  const [email, setEmail] = useState('');
  const [catatan, setCatatan] = useState('');
  const [setuju, setSetuju] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addonNotice, setAddonNotice] = useState(false);
  // remaining daily add-on units for the chosen check-in date (whole resort, first come first served)
  const [addonSisaRaw, setAddonSisaRaw] = useState<{ tanggal: string; sisa: Record<string, number> } | null>(null);
  const [addonNote, setAddonNote] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // voucher / referral code: typed (or passed from the pricelist form), then validated by the quote API
  const [voucherInput, setVoucherInput] = useState((sp.get('voucher') ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, ''));
  const [voucher, setVoucher] = useState<{ kode: string; diskon: number } | null>(null);
  const [voucherErr, setVoucherErr] = useState('');
  const [voucherBusy, setVoucherBusy] = useState(false);
  const turnstileWidgetId = useRef<string | null>(null);
  const setting = useBookingSetting();
  // a link to a type that is hidden or gone falls back to the first type on offer
  useEffect(() => { if (setting && !ROOMS.some(r => r.code === room)) setRoom(ROOMS[0].code); }, [setting]);
  const libur = useHariLibur();
  // funnel for admin Laporan: page opened, then the guest started typing their details
  const typed = useRef(false);
  const isiData = () => { if (!typed.current) { typed.current = true; lacak('isi_data'); } };
  useEffect(() => { lacak('checkout_dibuka', undefined, { kamar: sp.get('kamar'), asal: sp.get('asal') ?? 'langsung' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // personal data must not stay in the address bar (analytics tools record the URL)
  useEffect(() => {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('name') && !u.searchParams.has('wa')) return;
    u.searchParams.delete('name'); u.searchParams.delete('wa');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  }, []);

  const load = () => api<{ tanggal: string; room_code: string; sisa: number; harga: number | null; harga_normal: number | null; min_malam: number | null; tutup_checkin: boolean; tutup_checkout: boolean }[]>(
    `availability?from=${today}&to=${addDays(today, 180)}`)
    .then(rows => setAvail(new Map(rows.map(r => [`${r.tanggal}|${r.room_code}`,
      { sisa: r.sisa, harga: r.harga, harga_normal: r.harga_normal, min_malam: r.min_malam, tutup_checkin: r.tutup_checkin, tutup_checkout: r.tutup_checkout }]))))
    .catch(e => setLoadErr(errText(e.code, e.detail)));
  useEffect(() => { load(); }, []);

  const night = (d: string, r = room) => avail?.get(`${d}|${r}`);
  // same shape as src/stay.ts expects, for offering other rooms when this one is short
  const nightFor = (r: string): NightOf => d => {
    const n = night(d, r);
    return n && { harga: n.harga, sisa: n.sisa, minMalam: n.min_malam, tutupCheckin: n.tutup_checkin, tutupCheckout: n.tutup_checkout };
  };
  const nightOpen = (d: string, need = 1) => { const n = night(d); return !!n && n.harga != null && n.sisa >= need; };
  const from = range?.from ? ymd(range.from) : undefined;
  const to = range?.to ? ymd(range.to) : undefined;
  const stay = from && to ? nights(from, to) : [];
  const stock = stay.length ? Math.min(...stay.map(d => night(d)?.sisa ?? 0)) : 0;
  const priced = stay.every(d => night(d)?.harga != null);
  const rincian = priced ? stay.map(d => ({ tanggal: d, harga: night(d)!.harga!, normal: night(d)!.harga_normal ?? undefined })) : [];
  // capacity: kapasitas_kamar per room + extra beds (max extra_bed_maks per room); needed extra beds are auto-added
  const kap = setting?.kapasitas_kamar ?? 2;
  const ebPerRoom = setting?.extra_bed_maks ?? 2;
  const ebMaks = ebPerRoom * qty;
  const tamu = dewasa + anak;
  const ebNeeded = Math.max(0, tamu - kap * qty);
  const overCap = tamu > kap * qty + ebMaks;
  // daily quota: only trusted for the date it was fetched for
  const addonSisa = addonSisaRaw && addonSisaRaw.tanggal === from ? addonSisaRaw.sisa : null;
  const quotaLeft = (a: Addon): number | null => {
    if (a.kuota_harian == null || !addonSisa) return null;
    const n = addonSisa[a.kode];
    return typeof n === 'number' ? Math.max(0, n) : null;
  };
  const addonMax = (a: Addon) => Math.min(a.maks, quotaLeft(a) ?? a.maks);
  const loadAddonSisa = () => {
    if (!from) return Promise.resolve();
    const tanggal = from;
    return api<Record<string, number>>(`addon-sisa?tanggal=${tanggal}`)
      .then(r => setAddonSisaRaw({ tanggal, sisa: r && typeof r === 'object' ? r : {} }))
      .catch(() => {});
  };
  // fetch when the check-in date changes and whenever the guest comes back to this tab
  useEffect(() => {
    if (!from) return;
    loadAddonSisa();
    const onVis = () => { if (document.visibilityState === 'visible') loadAddonSisa(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, [from]); // eslint-disable-line react-hooks/exhaustive-deps
  // selection above what is left -> reduce it and say so
  useEffect(() => {
    if (!addonSisa) return;
    const cut: string[] = [];
    const next = { ...addonQty };
    for (const a of setting?.addons ?? []) {
      const left = quotaLeft(a);
      if (left != null && (next[a.kode] ?? 0) > left) { next[a.kode] = left; cut.push(a.nama); }
    }
    if (!cut.length) return;
    setAddonQty(next);
    setAddonNote(tr(`Jumlah ${cut.join(', ')} kami sesuaikan dengan sisa kuota pada tanggal check-in Anda.`, `We have adjusted the quantity of ${cut.join(', ')} to the remaining quota on your check-in date.`));
  }, [addonSisaRaw, setting]); // eslint-disable-line react-hooks/exhaustive-deps
  const addonLines: AddonLine[] = (setting?.addons ?? [])
    .map(a => ({ a, q: a.kode === 'extra_bed' ? Math.min(Math.max(addonQty.extra_bed ?? 0, ebNeeded), ebMaks) : Math.min(addonQty[a.kode] ?? 0, addonMax(a)) }))
    .filter(({ q }) => q > 0)
    .map(({ a, q }) => ({ kode: a.kode, nama: a.nama, satuan: a.satuan, qty: q, subtotal: a.harga * q * (a.per_malam ? stay.length : 1) }));
  const h2Block = h2Blocked(addonLines.map(l => l.kode), from);
  const subtotal = rincian.reduce((s, n) => s + n.harga, 0) * qty + addonLines.reduce((s, a) => s + a.subtotal, 0);
  const diskon = voucher ? Math.min(voucher.diskon, subtotal) : 0;
  const pajak = setting && !setting.pajak_termasuk && subtotal > 0 ? Math.round((subtotal - diskon) * (setting.pajak_persen || 0) / 100) : 0;
  const total = rincian.length ? subtotal - diskon + pajak : 0;
  const bulan = setting?.jendela_bulan ?? 4;
  const lastDay = (() => { const d = new Date(); d.setMonth(d.getMonth() + bulan); return ymd(d); })();
  const cap = Math.min(maxRooms(room), stock || maxRooms(room));
  // only once availability has loaded, or every visit with dates is logged as "room full" (harga_belum)
  const shortage = !!avail && stay.length > 0 && (!priced || stock < qty);

  useEffect(() => { if (qty > maxRooms(room)) setQty(maxRooms(room)); }, [room]);

  const disabled = (date: Date) => {
    const d = ymd(date);
    if (d < today) return true;
    if ((!from || to) && d > lastDay) return true;
    if (from && !to && d > from) {
      // picking check-out: every night open, checkout date itself not blocked, and enough nights
      const stayNights = nights(from, d);
      const minMalam = night(from)?.min_malam ?? 1;
      if (stayNights.length < minMalam) return true;
      if (night(d)?.tutup_checkout) return true;
      return !stayNights.every(n => nightOpen(n));
    }
    // picking check-in: must have open stock and not be a closed check-in day
    return !nightOpen(d) || !!night(d)?.tutup_checkin;
  };

  const applyVoucher = async (kode = voucherInput) => {
    setVoucherErr('');
    if (!kode) { setVoucher(null); return; }
    if (!from || !to) { setVoucherErr(tr('Pilih tanggal menginap dulu, lalu pakai kode voucher.', 'Please select your stay dates first, then apply the voucher code.')); return; }
    setVoucherBusy(true);
    try {
      const q = await api<{ voucher: { kode: string; diskon: number } | null }>(
        `quote?room=${room}&checkin=${from}&checkout=${to}&qty=${qty}&voucher=${encodeURIComponent(kode)}`);
      setVoucher(q.voucher ? { kode: q.voucher.kode, diskon: Number(q.voucher.diskon) } : null);
      if (q.voucher) track('select_promotion', { promotion_id: q.voucher.kode, promotion_name: 'voucher' });
    } catch (e: any) {
      setVoucher(null);
      setVoucherErr(errText(e.code, e.detail));
      lacak('voucher_gagal', undefined, { voucher: kode, alasan: e.code ?? 'ERROR_LAIN' });
    } finally {
      setVoucherBusy(false);
    }
  };
  // a code from the pricelist form is applied once dates are known; an applied code is re-checked
  // whenever the stay changes (it may not cover the new dates / room)
  useEffect(() => {
    if (from && to && voucherInput && (voucher || !voucherErr)) applyVoucher(voucher?.kode ?? voucherInput);
  }, [room, from, to, qty]); // eslint-disable-line react-hooks/exhaustive-deps

  const waText = `*Saya sudah berkunjung ke Website H One Resort*\n\nHalo, saya ingin booking:\nKamar: ${roomName(room)} × ${qty}\nCheck-in: ${from ? fmt(from, true, 'id-ID') : '-'}\nCheck-out: ${to ? fmt(to, true, 'id-ID') : '-'}\nTamu: ${dewasa} dewasa, ${anak} anak${nama ? `\nNama: ${nama}` : ''}${voucherInput ? `\nKode voucher: ${voucherInput}` : ''}\n\nMohon info ketersediaannya. Terima kasih!`;

  const gagal = (alasan: string, tahap: 'form' | 'server', pesan = errText(alasan)) => {
    lacak('gagal_pesan', undefined, { alasan, tahap, kamar: room });
    setError(pesan);
  };
  const submit = async () => {
    setError('');
    if (h2Block) return gagal('ADDON_H2', 'form');
    if (!from || !to) return gagal('TANGGAL_KOSONG', 'form', tr('Pilih tanggal check-in dan check-out.', 'Please select your check-in and check-out dates.'));
    if (!nama.trim()) return gagal('NAMA_KOSONG', 'form', errText('DATA_TAMU_TIDAK_LENGKAP'));
    if (!waValid(wa)) return gagal('WA_TIDAK_VALID', 'form', errText('WA_TIDAK_VALID'));
    if (!email.trim()) return gagal('EMAIL_WAJIB', 'form');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return gagal('EMAIL_TIDAK_VALID', 'form');
    if (overCap) return gagal('KAPASITAS_LEBIH', 'form');
    if (!setuju) return gagal('BELUM_SETUJU_SK', 'form');
    if (TURNSTILE_SITE_KEY && !turnstileToken) return gagal('TURNSTILE_BELUM', 'form', errText('TURNSTILE_GAGAL'));
    setBusy(true);
    track('begin_checkout', { currency: 'IDR', value: total, items: [{ item_name: roomName(room), quantity: qty }] });
    try {
      const r = await api<{ kode: string; payUrl: string | null; payError?: string }>('create', {
        room_code: room, checkin: from, checkout: to, jumlah_kamar: qty, dewasa, anak,
        addons: addonLines.map(a => ({ kode: a.kode, qty: a.qty })),
        nama: nama.trim(), wa, email: email.trim(), catatan: catatan.trim() || undefined, setuju,
        voucher: voucher?.kode,
        turnstile: turnstileToken || undefined,
        sesi,
      });
      if (!r.payUrl) { navigate(`/booking/${encodeURIComponent(r.kode)}`, { state: { payError: r.payError ?? 'GATEWAY_ERROR' } }); return; }
      window.location.href = r.payUrl;
    } catch (e: any) {
      gagal(e.code ?? 'ERROR_LAIN', 'server', errText(e.code, e.detail));
      if (e.code === 'STOK_HABIS') load();
      if (e.code === 'ADDON_HABIS') loadAddonSisa();
      if (String(e.code).startsWith('VOUCHER_')) { setVoucher(null); setVoucherErr(errText(e.code, e.detail)); }
      if (TURNSTILE_SITE_KEY && turnstileWidgetId.current && (window as any).turnstile) {
        (window as any).turnstile.reset(turnstileWidgetId.current);
      }
      setTurnstileToken(null);
      setBusy(false);
    }
  };

  const input = 'w-full border border-neutral-200 rounded-[10px] px-3.5 py-3 text-[14px] focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20';

  return (
    <Shell title="Booking">
      <h1 className="font-serif text-[22px] md:text-[28px] tracking-[0.08em] mb-1">{tr('Booking & bayar online', 'Booking & Online Payment')}</h1>
      <p className="text-[14px] text-neutral-500 mb-8">{tr('Pilih kamar dan tanggal, isi data pemesan, lalu bayar. Konfirmasi langsung terkirim setelah pembayaran berhasil.', 'Choose your room and dates, enter your details, then pay. Your confirmation is sent immediately after successful payment.')}</p>

      <div className="grid md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="space-y-5">
          <Card>
            <Label>{tr('1 · Tipe kamar', '1 · Room type')}</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {ROOMS.map(r => (
                <button key={r.code} type="button" onClick={() => setRoom(r.code)}
                  className={`text-left rounded-[10px] border px-4 py-3 text-[14px] transition-colors ${room === r.code ? 'border-[#D4AF37] bg-[#D4AF37]/10 font-semibold' : 'border-neutral-200 hover:border-[#D4AF37]/60'}`}>
                  {r.name}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <Label>{tr('2 · Tanggal menginap', '2 · Stay dates')}</Label>
            {loadErr ? <Notice>{loadErr}</Notice> : !avail ? (
              <p className="flex items-center gap-2 text-[13px] text-neutral-500"><Loader2 size={16} className="animate-spin" /> {tr('Memuat ketersediaan kamar…', 'Loading room availability…')}</p>
            ) : (
              <>
                <div className="overflow-x-auto -mx-2">
                  <DayDataContext.Provider value={{ libur, priceOf: d => night(d)?.harga }}>
                    <DayPicker mode="range" locale={dpLocale(lang)} numberOfMonths={2} className="rdp-hone rdp-priced" components={DAY_COMPONENTS}
                      selected={range} onSelect={setRange} disabled={disabled} excludeDisabled
                      defaultMonth={range?.from ?? new Date()} startMonth={new Date()} endMonth={parse(lastDay)} />
                  </DayDataContext.Provider>
                </div>
                <p className="text-[12px] text-neutral-500 mt-2">{tr(`Tanggal abu-abu sudah penuh atau belum dibuka untuk ${roomName(room)}. Booking online bisa sampai ${bulan} bulan ke depan; untuk tanggal setelahnya, hubungi tim sales lewat WhatsApp.`, `Greyed-out dates are fully booked or not yet open for ${roomName(room)}. Online booking is available up to ${bulan} months ahead; for later dates, please contact our sales team via WhatsApp.`)}</p>
              </>
            )}
          </Card>

          <Card>
            <Label>{tr('3 · Kamar & tamu', '3 · Rooms & guests')}</Label>
            {[
              { label: tr('Jumlah kamar', 'Number of rooms'), v: qty, set: setQty, min: 1, max: cap },
              { label: tr('Dewasa', 'Adults'), v: dewasa, set: setDewasa, min: 1, max: 40 },
              { label: tr('Anak', 'Children'), v: anak, set: setAnak, min: 0, max: 40 },
            ].map(g => (
              <div key={g.label} className="flex items-center justify-between py-2">
                <span className="text-[14px]">{g.label}</span>
                <div className="flex items-center gap-3">
                  <button type="button" aria-label={`${tr('Kurangi', 'Decrease')} ${g.label}`} disabled={g.v <= g.min} onClick={() => g.set(g.v - 1)} className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center disabled:opacity-30 hover:border-[#D4AF37]"><Minus size={14} /></button>
                  <span className="w-6 text-center tabular-nums font-semibold">{g.v}</span>
                  <button type="button" aria-label={`${tr('Tambah', 'Increase')} ${g.label}`} disabled={g.v >= g.max} onClick={() => g.set(g.v + 1)} className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center disabled:opacity-30 hover:border-[#D4AF37]"><Plus size={14} /></button>
                </div>
              </div>
            ))}
            <p className="text-[12px] text-neutral-500 mt-1">{tr(`Kapasitas ${kap} orang per kamar, bisa tambah maksimal ${ebPerRoom} extra bed (${kap + ebPerRoom} orang per kamar).`, `Capacity is ${kap} guests per room, with up to ${ebPerRoom} extra beds available (${kap + ebPerRoom} guests per room).`)}</p>
            {ebNeeded > 0 && !overCap && <p className="text-[12px] text-[#8A6D00] mt-1">{tr(`${tamu} tamu untuk ${qty} kamar: otomatis ${ebNeeded} extra bed.`, `${tamu} guests for ${qty} ${plural(qty, 'room', 'rooms')}: ${ebNeeded} extra ${plural(ebNeeded, 'bed', 'beds')} added automatically.`)}</p>}
            {overCap && <p className="text-[12px] text-red-600 mt-1">{errText('KAPASITAS_LEBIH')}</p>}
            {maxRooms(room) === 1 && <p className="text-[12px] text-neutral-500 mt-1">{tr(`${roomName(room)} maksimal 1 kamar per pesanan.`, `${roomName(room)} is limited to 1 room per booking.`)}</p>}
            {stay.length > 0 && scarcityText(tr, stock, true) ? (
              <p className="mt-2 flex gap-2 items-start rounded-[8px] bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700"><Flame size={14} className="shrink-0 mt-px" /> {scarcityText(tr, stock, true)}</p>
            ) : stay.length > 0 && stock > 0 && stock < maxRooms(room) && <p className="text-[12px] text-neutral-500 mt-1">{tr(`Tersisa ${stock} kamar untuk tanggal ini.`, `${stock} ${plural(stock, 'room', 'rooms')} remaining for these dates.`)}</p>}
          </Card>

          {shortage && from && to && (
            <RoomAlternatives inline konteks={{ kamar: room, checkin: from, checkout: to, tempat: 'checkout', alasan: !priced ? 'harga_belum' : stock === 0 ? 'penuh' : 'kurang' }}
              onClose={() => {}} onPick={code => { setRoom(code); track('select_promotion', { promotion_name: 'room_alternative', item_name: roomName(code) }); }}
              title={!priced ? tr(`Harga ${roomName(room)} untuk sebagian tanggal belum dibuka.`, `Rates for ${roomName(room)} on some of these dates have not yet been released.`)
                : stock === 0 ? tr(`${roomName(room)} sudah penuh untuk tanggal ini.`, `${roomName(room)} is fully booked for these dates.`)
                : tr(`${roomName(room)} hanya tersisa ${stock} kamar untuk tanggal ini.`, `Only ${stock} ${roomName(room)} ${plural(stock, 'room remains', 'rooms remain')} for these dates.`)}
              note={tr(`Anda butuh ${qty} kamar, ${fmt(from, false)} → ${fmt(to, false)}.`, `You need ${qty} ${plural(qty, 'room', 'rooms')}, ${fmt(from, false)} → ${fmt(to, false)}.`)}
              options={alternatives(ROOMS, nightFor, from, to, qty, today, room)}
              basePerNight={rincian.length ? Math.round(rincian.reduce((t, n) => t + n.harga, 0) / rincian.length) : undefined}
              waHref={waLink(waText)} />
          )}

          {(setting?.addons ?? []).length > 0 && (
            <Card>
              <Label>{tr('4 · Add-on (opsional)', '4 · Add-ons (optional)')}</Label>
              {(setting?.addons ?? []).map(a => {
                const isBed = a.kode === 'extra_bed';
                const v = addonLines.find(l => l.kode === a.kode)?.qty ?? 0;
                const min = isBed ? ebNeeded : 0;
                const max = isBed ? ebMaks : addonMax(a);
                const left = quotaLeft(a);
                const set = (n: number) => {
                  setAddonNote('');
                  if (H2_ADDONS.includes(a.kode) && v === 0 && n > 0) setAddonNotice(true);
                  setAddonQty(prev => ({ ...prev, [a.kode]: Math.max(min, Math.min(n, max)) }));
                };
                return (
                  <div key={a.kode} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-[14px]">{a.nama}<span className="block text-[12px] text-neutral-500">{rupiah(a.harga)}{a.satuan ? ` / ${a.satuan}` : ''}</span>
                      {a.kuota_harian != null && (
                        <span className={`block text-[12px] ${left === 0 ? 'text-red-600 font-semibold' : 'text-[#8A6D00]'}`}>
                          {!from ? tr('Kuota terbatas per hari', 'Limited daily quota') : left == null ? tr('Memeriksa ketersediaan…', 'Checking availability…') : left === 0 ? tr('Penuh untuk tanggal ini', 'Fully booked for this date') : tr(`Sisa ${left} hari itu`, `${left} left on that day`)}
                        </span>
                      )}</span>
                    <div className="flex items-center gap-3">
                      <button type="button" aria-label={`${tr('Kurangi', 'Decrease')} ${a.nama}`} disabled={v <= min} onClick={() => set(v - 1)} className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center disabled:opacity-30 hover:border-[#D4AF37]"><Minus size={14} /></button>
                      <span className="w-6 text-center tabular-nums font-semibold">{v}</span>
                      <button type="button" aria-label={`${tr('Tambah', 'Increase')} ${a.nama}`} disabled={v >= max} onClick={() => set(v + 1)} className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center disabled:opacity-30 hover:border-[#D4AF37]"><Plus size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {addonNote && <p role="status" className="mt-2 rounded-[8px] bg-[#D4AF37]/10 px-3 py-2 text-[12px] text-[#8A6D00]">{addonNote}</p>}
            </Card>
          )}

          <Card>
            <Label>{tr('Kode voucher (opsional)', 'Voucher code (optional)')}</Label>
            <div className="flex gap-2">
              <input id="co-voucher" className={`${input} uppercase tracking-wider`} value={voucherInput} maxLength={30}
                onChange={e => { setVoucherInput(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')); setVoucherErr(''); if (voucher) setVoucher(null); }}
                onKeyDown={e => { if (e.key === 'Enter') applyVoucher(); }} placeholder={tr('Masukkan kode dari tim sales', 'Enter the code from our sales team')} autoCapitalize="characters" />
              <button type="button" onClick={() => applyVoucher()} disabled={!voucherInput || voucherBusy}
                className="shrink-0 rounded-[10px] bg-[#1c1c1c] px-5 text-[12px] font-bold uppercase tracking-[0.15em] text-[#D4AF37] disabled:opacity-40 flex items-center gap-2">
                {voucherBusy && <Loader2 size={14} className="animate-spin" />} {tr('Pakai', 'Apply')}
              </button>
            </div>
            {voucher && <p className="text-[13px] text-emerald-700 mt-2 flex items-center gap-1.5"><Check size={14} /> {tr(`Voucher ${voucher.kode} dipakai, hemat ${rupiah(voucher.diskon)}.`, `Voucher ${voucher.kode} applied, you save ${rupiah(voucher.diskon)}.`)}</p>}
            {voucherErr && <p className="text-[13px] text-red-600 mt-2">{voucherErr}</p>}
          </Card>

          <Card>
            <Label>{tr('5 · Data pemesan', '5 · Guest details')}</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[12px] text-neutral-600">{tr('Nama lengkap *', 'Full name *')}</span>
                <input id="co-nama" className={input} value={nama} onChange={e => { setNama(e.target.value); isiData(); }} autoComplete="name" /></label>
              <label className="block"><span className="text-[12px] text-neutral-600">{tr('Nomor WhatsApp *', 'WhatsApp number *')}</span>
                <input id="co-wa" className={input} value={wa} onChange={e => { setWa(e.target.value); isiData(); }} inputMode="tel" autoComplete="tel" placeholder="08xx xxxx xxxx" /></label>
              <label className="block sm:col-span-2"><span className="text-[12px] text-neutral-600">{tr('Email (untuk bukti booking) *', 'Email (for your booking receipt) *')}</span>
                <input id="co-email" className={input} value={email} onChange={e => { setEmail(e.target.value); isiData(); }} type="email" autoComplete="email" required placeholder="nama@email.com" /></label>
              <label className="block sm:col-span-2"><span className="text-[12px] text-neutral-600">{tr('Catatan / special request', 'Notes / special requests')}</span>
                <textarea id="co-catatan" className={`${input} min-h-[80px]`} value={catatan} onChange={e => setCatatan(e.target.value)} placeholder={tr('Misalnya dekorasi, jam kedatangan', 'For example decoration, arrival time')} /></label>
            </div>
          </Card>

          <Card>
            <Label>{tr('Syarat & ketentuan', 'Terms & conditions')}</Label>
            <ul className="text-[13px] text-neutral-600 space-y-1.5 list-disc pl-5">
              <li>{tr(`Check-in mulai ${jam(setting?.jam_checkin, '15.00')}, check-out paling lambat ${jam(setting?.jam_checkout, '12.00')}.`, `Check-in from ${jam(setting?.jam_checkin, '15.00')}, check-out by ${jam(setting?.jam_checkout, '12.00')}.`)}</li>
              <li>{tr('Kamar ditahan selama batas waktu pembayaran. Lewat dari itu, pesanan batal otomatis.', 'Your room is held for the duration of the payment window. Afterwards, the booking is cancelled automatically.')}</li>
              <li>{tr(`Harga belum termasuk pajak & service ${setting?.pajak_persen ?? 16}%; total yang dibayar sudah termasuk.`, `Rates exclude ${setting?.pajak_persen ?? 16}% tax & service charge; the total payable includes them.`)}</li>
              <li>{setting?.kebijakan_pembatalan ?? tr('Pembayaran tidak dapat dikembalikan (non-refundable). Untuk perubahan jadwal, hubungi tim sales via WhatsApp.', 'Payments are non-refundable. For any change of dates, please contact our sales team via WhatsApp.')}</li>
            </ul>
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input id="co-setuju" type="checkbox" checked={setuju} onChange={e => setSetuju(e.target.checked)} className="mt-1 w-4 h-4 accent-[#D4AF37]" />
              <span className="text-[13px]">{tr('Saya sudah membaca dan menyetujui syarat & ketentuan serta kebijakan privasi H One Resort.', 'I have read and agree to the terms & conditions and the privacy policy of H One Resort.')}</span>
            </label>
          </Card>

          {error && <Notice>{error}{error === errText('STOK_HABIS') && <div className="mt-3"><WaButton text={waText} /></div>}</Notice>}

          <Turnstile onToken={setTurnstileToken} onReady={id => { turnstileWidgetId.current = id; }} />

          {h2Block && <p role="alert" className="text-[13px] text-red-600">{h2Message()}</p>}
          {addonNotice && <AddonH2Modal onClose={() => setAddonNotice(false)} />}
          <button type="button" onClick={submit} disabled={busy || h2Block || !total || shortage || overCap || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
            className="w-full bg-[#1c1c1c] text-[#D4AF37] font-bold uppercase tracking-[0.25em] text-[12px] py-4 rounded-[10px] hover:bg-[#D4AF37] hover:text-black transition-colors disabled:opacity-40 disabled:hover:bg-[#1c1c1c] disabled:hover:text-[#D4AF37] flex items-center justify-center gap-2">
            {busy && <Loader2 size={16} className="animate-spin" />} {total ? `${tr('Bayar', 'Pay')} ${rupiah(total)}` : tr('Bayar', 'Pay')}
          </button>
          <div className="md:hidden"><WaButton text={waText} label={tr('Lebih nyaman lewat WhatsApp', 'Prefer to book via WhatsApp')} /></div>
        </div>

        <div className="space-y-4">
          <Summary room={room} from={from} to={to} qty={qty} rincian={rincian} addons={addonLines} diskon={diskon} voucherKode={voucher?.kode} total={total} pajak={pajak}
            pajakPersen={setting?.pajak_persen ?? null} pajakTermasuk={setting?.pajak_termasuk ?? null} dewasa={dewasa} anak={anak} />
          <div className="hidden md:block"><WaButton text={waText} label={tr('Lebih nyaman lewat WhatsApp', 'Prefer to book via WhatsApp')} /></div>
        </div>
      </div>
    </Shell>
  );
}

// ---------- shared booking fetch ----------
// While a payment is open the status is re-checked every 6 s (visible tab only); the API asks DOKU
// directly for open invoices, so a paid guest flips to "lunas" even before DOKU's notification lands.
function useBooking(kode: string, poll: boolean) {
  const [b, setB] = useState<any>(null);
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const hasData = useRef(false);
  const refresh = useCallback(() => {
    setChecking(true);
    return api(`status?kode=${encodeURIComponent(kode)}`)
      .then(data => { if (data?.room_nama) NAMES[data.room_code] = data.room_nama; hasData.current = true; setB(data); setCheckedAt(new Date()); })
      .catch(e => {
        // a network blip after the page loaded keeps the last known state instead of an error screen
        if (!hasData.current) setErr(e.code === 'BOOKING_TIDAK_ADA' || e.code === 'KODE_TIDAK_VALID' ? trNow('Kode booking tidak ditemukan.', 'Booking code not found.') : errText(e.code, e.detail));
      })
      .finally(() => setChecking(false));
  }, [kode]);
  useEffect(() => { refresh(); }, [refresh]);
  const waiting = b?.status === 'menunggu_bayar';
  useEffect(() => {
    if (!poll || !waiting) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 6000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [poll, waiting, refresh]);
  return { b, err, refresh, checking, checkedAt };
}

function useSecondsLeft(iso?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return iso ? Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000)) : null;
}
const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const PAY_WINDOW_S = 15 * 60;

function PayTimer({ left, label }: { left: number; label: string }) {
  const urgent = left <= 180;
  const pct = Math.min(1, left / PAY_WINDOW_S);
  return (
    <div className={`rounded-[12px] px-4 py-4 ${urgent ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}>
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.15em]"><Clock size={14} /> {label}</p>
      <p className="font-mono text-[40px] leading-none mt-2 tabular-nums" role="timer" aria-live="off">{clock(left)}</p>
      {left <= PAY_WINDOW_S && (
        <div className="mt-3 h-1.5 rounded-full bg-black/10 overflow-hidden">
          <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${urgent ? 'bg-red-500' : 'bg-[#D4AF37]'}`} style={{ width: `${pct * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function PayButton({ kode, label, again }: { kode: string; label: string; again?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    if (again) lacak('bayar_ulang', kode);
    try { window.location.href = (await api<{ payUrl: string }>('pay', { kode })).payUrl; }
    catch (e: any) { setErr(errText(e.code, e.detail)); setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={go} disabled={busy}
        className="w-full bg-[#1c1c1c] text-[#D4AF37] font-bold uppercase tracking-[0.25em] text-[12px] py-4 rounded-[10px] hover:bg-[#D4AF37] hover:text-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        {busy && <Loader2 size={16} className="animate-spin" />} {label}
      </button>
      {err && <div className="mt-3"><Notice>{err}</Notice></div>}
    </>
  );
}

const bookingSummary = (b: any) => ({
  room: b.room_code, from: b.checkin, to: b.checkout, qty: b.jumlah_kamar,
  rincian: b.rincian ?? [], total: Number(b.total), pajak: Number(b.pajak ?? 0), dewasa: b.dewasa, anak: b.anak,
  addons: (b.addons ?? []) as AddonLine[], diskon: Number(b.diskon ?? 0), voucherKode: b.voucher_kode ?? null,
});

const waktuWib = (iso: string) =>
  new Date(iso).toLocaleString(en(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';

// ReactNode variant of tr() for copy that embeds markup
const useTr2 = () => { const { lang } = useLang(); return (id: React.ReactNode, en: React.ReactNode) => (lang === 'en' ? en : id); };

// ---------- receipt (bukti pembayaran) from the gateway data stored on the booking ----------
function BuktiIsi({ b }: { b: any }) {
  const { tr } = useLang();
  const tr2 = useTr2();
  const k = b.bukti ?? {};
  const malam = nights(b.checkin, b.checkout).length;
  const rows: [string, React.ReactNode][] = [
    [tr('Kode booking', 'Booking code'), <span className="font-mono">{b.kode}</span>],
    [tr('No. invoice', 'Invoice no.'), <span className="font-mono">{k.invoice ?? '-'}</span>],
    [tr('Dibayar pada', 'Paid on'), k.dibayar_pada ? waktuWib(k.dibayar_pada) : '-'],
    [tr('Metode pembayaran', 'Payment method'), k.metode ?? '-'],
    [tr('Diproses oleh', 'Processed by'), k.penyedia === 'doku' ? 'DOKU' : k.penyedia === 'mock' ? tr('Simulasi staging (bukan pembayaran nyata)', 'Staging simulation (not a real payment)') : (k.penyedia ?? '-')],
    [tr('Nama tamu', 'Guest name'), b.nama],
    [tr('Kamar', 'Room'), `${roomName(b.room_code)} × ${b.jumlah_kamar}`],
    [tr('Menginap', 'Stay'), `${fmt(b.checkin)} → ${fmt(b.checkout)} (${malam} ${tr('malam', plural(malam, 'night', 'nights'))})`],
    [tr('Tamu', 'Guests'), tr(`${b.dewasa} dewasa${b.anak ? `, ${b.anak} anak` : ''}`, `${b.dewasa} ${plural(b.dewasa, 'adult', 'adults')}${b.anak ? `, ${b.anak} ${plural(b.anak, 'child', 'children')}` : ''}`)],
  ];
  return (
    <div className="text-neutral-800">
      <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <img src="/email-logo.png" alt="H One Resort" className="h-16 w-auto" />
          <p className="text-[11px] text-neutral-500 mt-2">Pantai Contoh, Kecamatan Contoh, Kabupaten Contoh, Provinsi Contoh</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold tracking-[0.15em] uppercase px-3 py-1">{tr('Lunas', 'Paid')}</span>
      </div>
      <p className="mt-4 text-[18px] font-semibold">{tr('Bukti Pembayaran', 'Payment Receipt')}</p>
      <dl className="mt-3 divide-y divide-neutral-100 text-[13px]">
        {rows.map(([l, v]) => (
          <div key={l} className="flex justify-between gap-4 py-2">
            <dt className="text-neutral-500 shrink-0">{l}</dt><dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between border-t-2 border-neutral-800 pt-3">
        <span className="text-[13px] font-semibold">{tr('Total dibayar', 'Total paid')}</span>
        <span className="text-[20px] font-bold tabular-nums">{rupiah(Number(b.total))}</span>
      </div>
      {Number(b.pajak) > 0 && <p className="mt-1 text-right text-[11px] text-neutral-500">{tr(`Termasuk pajak & service ${b.pajak_persen}% (${rupiah(Number(b.pajak))})`, `Includes ${b.pajak_persen}% tax & service charge (${rupiah(Number(b.pajak))})`)}</p>}
      <p className="mt-5 text-[11px] leading-relaxed text-neutral-500">
        {tr2(<>Mohon tunjukkan kode booking <span className="font-mono">{b.kode}</span> kepada Front Office saat check-in, mulai pukul {jam(b.jam_checkin, '15.00')} WIB. Sesuai kebijakan yang disetujui saat pemesanan, pembayaran ini bersifat non-refundable.</>,
          <>Please present your booking code <span className="font-mono">{b.kode}</span> to the Front Office upon check-in, from {jam(b.jam_checkin, '15.00')} WIB. In accordance with the policy accepted at the time of booking, this payment is non-refundable.</>)}
      </p>
    </div>
  );
}

// A4 print version of the receipt (Simpan sebagai PDF): the website's black + gold look, full breakdown.
function BuktiCetak({ b }: { b: any }) {
  const { tr } = useLang();
  const tr2 = useTr2();
  const k = b.bukti ?? {};
  const qty = Number(b.jumlah_kamar) || 1;
  const malam = (b.rincian ?? []) as { tanggal: string; harga: number }[];
  const addons = (b.addons ?? []) as AddonLine[];
  const diskon = Number(b.diskon ?? 0), pajak = Number(b.pajak ?? 0);
  const wa = resortWa.replace(/^62(\d{3})(\d{4})(\d+)$/, '+62 $1-$2-$3');
  const label = 'text-[8.5px] uppercase tracking-[0.28em] text-[#8A6D00]';
  const Info = ({ t, rows }: { t: string; rows: [string, React.ReactNode][] }) => (
    <div>
      <p className={label}>{t}</p>
      <dl className="mt-2 text-[11px]">
        {rows.map(([l, v]) => (
          <div key={l} className="flex justify-between gap-4 border-b border-[#ece6d6] py-[5px]">
            <dt className="text-neutral-500">{l}</dt><dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  const Line = ({ l, sub, v, minus }: { l: string; sub?: string; v: number; minus?: boolean }) => (
    <div className="flex justify-between gap-6 border-b border-[#ece6d6] py-[6px] text-[11px]">
      <div><p>{l}</p>{sub && <p className="text-[9.5px] text-neutral-500">{sub}</p>}</div>
      <p className="tabular-nums whitespace-nowrap">{minus ? '−' : ''}{rupiah(v)}</p>
    </div>
  );
  return (
    <div className="w-[210mm] min-h-[296mm] bg-white text-[#1c1c1c] flex flex-col">
      <header className="bg-[#1c1c1c] px-[16mm] pt-[11mm] pb-[9mm] flex items-end justify-between">
        <img src="/email-logo.png" alt="H One Resort" className="h-[24mm] w-auto" />
        <div className="text-right">
          <p className="font-serif text-[#D4AF37] tracking-[0.32em] text-[15px]">{tr('Bukti Pembayaran', 'Payment Receipt')}</p>
          <p className="text-white/50 text-[8px] tracking-[0.4em] uppercase mt-1">{tr('Payment receipt', 'Bukti pembayaran')}</p>
          <p className="mt-4 text-white/50 text-[8px] tracking-[0.3em] uppercase">{tr('Kode booking', 'Booking code')}</p>
          <p className="font-mono text-white text-[13px] tracking-[0.12em]">{b.kode}</p>
        </div>
      </header>
      <div className="h-[2.5px] bg-gradient-to-r from-[#8A6D00] via-[#D4AF37] to-[#8A6D00]" />

      <main className="flex-1 px-[16mm] pt-[9mm]">
        <div className="flex items-start justify-between">
          <div>
            <p className={label}>{tr('Diterbitkan untuk', 'Issued to')}</p>
            <p className="mt-1 text-[19px] font-light tracking-wide">{b.nama}</p>
            <p className="mt-2 max-w-[110mm] text-[11px] leading-relaxed text-neutral-600">
              {tr('Terima kasih telah memilih H One Resort. Dokumen ini merupakan bukti resmi bahwa pembayaran reservasi Anda telah kami terima secara penuh.', 'Thank you for choosing H One Resort. This document is the official confirmation that payment for your reservation has been received in full.')}
            </p>
          </div>
          <div className="border border-[#D4AF37] px-4 py-2 text-center">
            <p className="font-serif text-[#8A6D00] tracking-[0.35em] text-[13px] leading-none">{tr('Lunas', 'Paid')}</p>
            <p className="text-[7.5px] tracking-[0.35em] uppercase text-neutral-500 mt-1">{tr('Paid in full', 'Paid in full')}</p>
          </div>
        </div>

        <div className="mt-[8mm] grid grid-cols-2 gap-[10mm]">
          <Info t={tr('Pembayaran', 'Payment')} rows={[
            [tr('No. invoice', 'Invoice no.'), <span className="font-mono">{k.invoice ?? '-'}</span>],
            [tr('Dibayar pada', 'Paid on'), k.dibayar_pada ? waktuWib(k.dibayar_pada) : '-'],
            [tr('Metode', 'Method'), k.metode ?? '-'],
            [tr('Diproses oleh', 'Processed by'), k.penyedia === 'doku' ? 'DOKU' : k.penyedia === 'mock' ? tr('Simulasi (staging)', 'Simulation (staging)') : (k.penyedia ?? '-')],
          ]} />
          <Info t={tr('Menginap', 'Your stay')} rows={[
            [tr('Kamar', 'Room'), `${roomName(b.room_code)} × ${qty}`],
            ['Check-in', `${fmt(b.checkin)} · ${jam(b.jam_checkin, '15.00')}`],
            ['Check-out', `${fmt(b.checkout)} · ${jam(b.jam_checkout, '12.00')}`],
            [tr('Tamu', 'Guests'), tr(`${b.dewasa} dewasa${b.anak ? `, ${b.anak} anak` : ''} · ${malam.length} malam`, `${b.dewasa} ${plural(b.dewasa, 'adult', 'adults')}${b.anak ? `, ${b.anak} ${plural(b.anak, 'child', 'children')}` : ''} · ${malam.length} ${plural(malam.length, 'night', 'nights')}`)],
          ]} />
        </div>

        <p className={`${label} mt-[9mm]`}>{tr('Rincian', 'Breakdown')}</p>
        <div className="mt-1">
          {malam.map(m => (
            <Line key={m.tanggal} l={`${roomName(b.room_code)}${qty > 1 ? ` × ${qty}` : ''}`}
              sub={tr(`Malam ${fmt(m.tanggal)}${qty > 1 ? ` · ${rupiah(m.harga)} per kamar` : ''}`, `Night of ${fmt(m.tanggal)}${qty > 1 ? ` · ${rupiah(m.harga)} per room` : ''}`)} v={m.harga * qty} />
          ))}
          {addons.map(a => (
            <Line key={a.kode} l={a.nama} sub={`${a.qty}${a.satuan ? ` ${a.satuan}` : ''}`} v={a.subtotal} />
          ))}
          {diskon > 0 && <Line l={b.voucher_kode ? `Voucher ${b.voucher_kode}` : tr('Diskon', 'Discount')} v={diskon} minus />}
          {pajak > 0 && <Line l={`${tr('Pajak & service', 'Tax & service charge')} ${b.pajak_persen}%`} v={pajak} />}
        </div>
        <div className="mt-[5mm] flex items-center justify-between bg-[#1c1c1c] px-[6mm] py-[4.5mm]">
          <p className="font-serif text-[#D4AF37] tracking-[0.3em] text-[11px]">{tr('Total dibayar', 'Total paid')}</p>
          <p className="text-white text-[20px] font-light tabular-nums tracking-wide">{rupiah(Number(b.total))}</p>
        </div>

        <p className="mt-[8mm] text-[10px] leading-relaxed text-neutral-600">
          {tr2(<>Mohon tunjukkan kode booking <span className="font-mono">{b.kode}</span> kepada Front Office saat check-in, mulai pukul {jam(b.jam_checkin, '15.00')} WIB.
          Sesuai kebijakan yang disetujui saat pemesanan, pembayaran ini bersifat non-refundable.</>,
          <>Please present your booking code <span className="font-mono">{b.kode}</span> to the Front Office upon check-in, from {jam(b.jam_checkin, '15.00')} WIB.
          In accordance with the policy accepted at the time of booking, this payment is non-refundable.</>)}
        </p>
      </main>

      <footer className="px-[16mm] pb-[10mm] pt-[6mm]">
        <p className="font-serif text-center text-[#8A6D00] tracking-[0.3em] text-[11px]">The Luxury of Nature</p>
        <div className="mt-[5mm] h-px bg-[#D4AF37]/60" />
        <div className="mt-[3mm] flex justify-between text-[9px] text-neutral-500">
          <span>Pantai Contoh, Kecamatan Contoh, Kabupaten Contoh, Provinsi Contoh</span>
          <span>WhatsApp {wa}</span>
          <span>www.hone.example</span>
        </div>
      </footer>
    </div>
  );
}

function Bukti({ b }: { b: any }) {
  const { tr } = useLang();
  const simpan = () => {
    lacak('bukti_diunduh', b.kode);
    const prev = document.title;
    document.title = `${tr('Bukti-Pembayaran-', 'Payment-Receipt-')}${b.kode}`; // becomes the PDF file name
    window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
    window.print();
  };
  return (
    <>
      <div className="rounded-[12px] border border-neutral-200 p-4 md:p-5"><BuktiIsi b={b} /></div>
      <button type="button" onClick={simpan}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 border border-neutral-300 rounded-[10px] py-3 text-[13px] font-semibold hover:border-[#D4AF37]">
        <Download size={16} /> {tr('Simpan bukti sebagai PDF', 'Save receipt as PDF')}
      </button>
      <p className="mt-2 text-[11px] text-neutral-500">{tr('Pilih "Simpan sebagai PDF" di jendela cetak.', 'Choose "Save as PDF" in the print dialog.')}{b.bukti?.penyedia === 'doku' && b.bukti?.email_ada ? tr(' Bukti resmi dari DOKU juga dikirim ke email Anda.', ' The official DOKU receipt is also sent to your email.') : ''}</p>
      {/* print copy outside #root so only the receipt lands on the PDF */}
      {createPortal(<div id="bukti-cetak" className="hidden"><BuktiCetak b={b} /></div>, document.body)}
      <style>{`@media print {
        @page { size: A4; margin: 0; }
        html, body { background: #fff !important; margin: 0 !important; }
        #root { display: none !important; }
        #bukti-cetak { display: block !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }`}</style>
    </>
  );
}

// ---------- /checkout/:kode (sales link) and /booking/:kode ----------
function BookingView({ kode, fromSalesLink }: { kode: string; fromSalesLink: boolean }) {
  const { tr, locale } = useLang();
  const { b, err, refresh, checking, checkedAt } = useBooking(kode, !fromSalesLink);
  const payError = ((useLocation().state ?? {}) as { payError?: string }).payError;
  const setting = useBookingSetting();
  const deadline = b?.bayar_sampai ?? b?.expires_at;
  const left = useSecondsLeft(deadline);
  const helpText = `Halo, saya butuh bantuan untuk booking ${kode}.`;
  const opened = useRef(false);
  const habis = useRef(false);

  useEffect(() => {
    if (!b || opened.current) return;
    opened.current = true;
    lacak('status_dibuka', kode, { status: b.status, link_sales: fromSalesLink });
  }, [b, kode, fromSalesLink]);
  // GA4 revenue: sent once per booking per browser (gtag only loads on the live domain)
  useEffect(() => {
    if (!b || !['lunas', 'checked_in', 'checked_out'].includes(b.status)) return;
    const key = `hone_ga_purchase_${b.kode}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* private mode: may repeat */ }
    track('purchase', {
      transaction_id: b.kode, currency: 'IDR', value: Number(b.total), tax: Number(b.pajak ?? 0),
      coupon: b.voucher_kode ?? undefined,
      items: [{ item_id: b.room_code, item_name: roomName(b.room_code), quantity: b.jumlah_kamar }],
    });
  }, [b]);
  // timer ran out on screen: record it once and ask the gateway one last time (the guest may have just paid)
  useEffect(() => {
    if (b?.status !== 'menunggu_bayar' || left !== 0 || habis.current) return;
    habis.current = true;
    lacak('timer_habis', kode);
    refresh();
  }, [left, b?.status, kode, refresh]);

  if (err) return <Shell title="Booking"><Notice>{err}</Notice><div className="mt-4 max-w-sm"><WaButton text={helpText} tempat="status" /></div></Shell>;
  if (!b) return <Shell title="Booking"><p className="flex items-center gap-2 text-neutral-500"><Loader2 className="animate-spin" size={18} /> {tr('Memuat pesanan…', 'Loading your booking…')}</p></Shell>;

  const paid = ['lunas', 'checked_in', 'checked_out'].includes(b.status) && b.bukti;
  const waiting = b.status === 'menunggu_bayar';
  const cek = () => { lacak('cek_status', kode); refresh(); };
  return (
    <Shell title={paid ? tr('Pembayaran berhasil', 'Payment successful') : tr('Status pembayaran', 'Payment status')}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <Card>
          <p className="text-[12px] tracking-[0.15em] uppercase text-neutral-500">{tr('Kode booking', 'Booking code')}</p>
          <p className="font-mono text-[20px] tracking-wider mt-1">{b.kode}</p>

          {paid && (
            <div className="mt-6 space-y-4">
              <Notice tone="ok">{tr(`Terima kasih, ${b.nama}. Pembayaran Anda telah kami terima dan reservasi Anda di H One Resort telah terkonfirmasi.`, `Thank you, ${b.nama}. Your payment has been received and your reservation at H One Resort is confirmed.`)}</Notice>
              <Bukti b={b} />
            </div>
          )}

          {waiting && (
            <div className="mt-6 space-y-4">
              {fromSalesLink && <p className="text-[14px] text-neutral-600">{tr(`Halo ${b.nama}, pesanan ini sudah disiapkan tim kami. Periksa detailnya, lalu lanjutkan ke pembayaran.`, `Hello ${b.nama}, this booking has been prepared by our team. Please review the details, then proceed to payment.`)}</p>}
              {left != null && left > 0 && <PayTimer left={left} label={b.bayar_sampai ? tr('Selesaikan pembayaran dalam', 'Complete your payment within') : tr('Kamar ditahan untuk Anda', 'Your room is being held for you')} />}
              {payError && <Notice>{tr('Reservasi Anda sudah kami simpan dan kamar ditahan, tetapi halaman pembayaran belum dapat dibuka. Silakan tekan tombol di bawah untuk mencoba lagi.', 'Your reservation is saved and the room is on hold, but the payment page could not be opened. Please press the button below to try again.')}</Notice>}
              {left === 0 && <Notice>{tr('Waktu pembayaran habis. Kami sedang memastikan status terakhirnya…', 'The payment time has expired. We are confirming the latest status…')}</Notice>}
              <PayButton kode={b.kode} label={b.bayar_sampai ? tr('Lanjutkan pembayaran', 'Continue payment') : fromSalesLink ? `${tr('Bayar', 'Pay')} ${rupiah(b.total)}` : tr('Bayar sekarang', 'Pay now')} again={!fromSalesLink} />
              <button type="button" onClick={cek} disabled={checking}
                className="w-full inline-flex items-center justify-center gap-2 border border-neutral-300 rounded-[10px] py-3 text-[13px] font-semibold hover:border-[#D4AF37] disabled:opacity-60">
                {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {tr('Saya sudah bayar, cek status', 'I have paid, check status')}
              </button>
              <p className="text-[12px] text-neutral-500">
                {b.bayar_sampai ? tr('Halaman ini memeriksa pembayaran Anda otomatis.', 'This page checks your payment automatically.') : tr('Setelah memilih metode pembayaran, Anda punya 15 menit untuk menyelesaikannya.', 'Once you choose a payment method, you have 15 minutes to complete it.')}
                {checkedAt && ` ${tr('Terakhir dicek', 'Last checked')} ${checkedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`}
              </p>
            </div>
          )}

          {!paid && !waiting && (
            <div className="mt-6 space-y-4">
              <Notice>{b.status === 'batal' ? tr('Pesanan ini dibatalkan.', 'This booking has been cancelled.') : tr('Batas waktu pembayaran pesanan ini sudah habis, jadi kamarnya dilepas.', 'The payment deadline for this booking has passed, so the room has been released.')} {tr('Anda bisa membuat pesanan baru atau menghubungi tim kami.', 'You may make a new booking or contact our team.')}</Notice>
              <Link to={`/checkout?kamar=${b.room_code}&in=${b.checkin}&out=${b.checkout}&rooms=${b.jumlah_kamar}`}
                className="block text-center border border-neutral-300 rounded-[10px] py-3 text-[13px] font-semibold hover:border-[#D4AF37]">{tr('Buat pesanan baru', 'Make a new booking')}</Link>
            </div>
          )}
          <div className="mt-4"><WaButton text={helpText} tempat="status" /></div>
        </Card>
        <Summary {...bookingSummary(b)} pajakPersen={setting?.pajak_persen ?? null} pajakTermasuk={setting?.pajak_termasuk ?? null} />
      </div>
    </Shell>
  );
}

// ---------- /booking: look up a booking by code ----------
function Lookup() {
  const { tr } = useLang();
  const navigate = useNavigate();
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kode = 'HON-' + v.trim().toUpperCase().replace(/\s+/g, '').replace(/^HON-?/, '');
    if (!/^HON-[0-9A-F]{10}$/.test(kode)) return setErr(tr('Kode booking diawali HON- lalu 10 huruf/angka. Lihat di halaman pembayaran atau pesan WhatsApp dari kami.', 'Booking codes start with HON- followed by 10 letters or digits. You can find yours on the payment page or in the WhatsApp message from us.'));
    navigate(`/booking/${kode}`);
  };
  return (
    <Shell title={tr('Cek status pembayaran', 'Check payment status')}>
      <Card className="max-w-md mx-auto">
        <p className="text-[18px] font-semibold">{tr('Cek status pembayaran', 'Check payment status')}</p>
        <p className="mt-1 text-[13px] text-neutral-500">{tr('Masukkan kode booking untuk melihat status pembayaran dan mengunduh bukti bayar.', 'Enter your booking code to view the payment status and download your payment receipt.')}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input value={v} onChange={e => { setV(e.target.value); setErr(''); }} placeholder="HON-XXXXXXXXXX" autoCapitalize="characters"
            aria-label={tr('Kode booking', 'Booking code')}
            className="w-full border border-neutral-300 rounded-[10px] px-4 py-3 font-mono tracking-wider uppercase outline-none focus:border-[#D4AF37]" />
          {err && <Notice>{err}</Notice>}
          <button type="submit" className="w-full bg-[#1c1c1c] text-[#D4AF37] font-bold uppercase tracking-[0.25em] text-[12px] py-4 rounded-[10px] hover:bg-[#D4AF37] hover:text-black transition-colors">{tr('Cek status', 'Check status')}</button>
        </form>
      </Card>
    </Shell>
  );
}

export default function CheckoutPage() {
  const { kode } = useParams();
  const { pathname } = useLocation();
  if (pathname.startsWith('/booking/') && kode) return <BookingView kode={kode} fromSalesLink={false} />;
  if (pathname.replace(/\/$/, '') === '/booking') return <Lookup />;
  if (kode) return <BookingView kode={kode} fromSalesLink />;
  return <SelfCheckout />;
}
