// Guest-facing price calendar, laid out like the admin Kalender "Bulan" view but read-only:
// room tabs, a month grid with the nightly price in "K", holiday colours, full / low-stock markers,
// a side panel, and a floating "continue booking" bar once a stay is picked. Which dates can be
// check-in / check-out comes from src/stay.ts, the same rules the booking engine enforces.
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MousePointerClick, Flame, ArrowRight, X } from 'lucide-react';
import { formatK, scarcityText, type Libur } from '../calendarDay';
import { alternatives, blockingNight, canCheckIn, canCheckOut, nightsBetween, roomsLeft, ymd, type Alternative, type NightOf } from '../stay';
import { useLang } from '../lang';
import RoomAlternatives from '../components/RoomAlternatives';
import { lacak } from '../lacak';

type Room = { name: string; code: string };
type Props = {
  rooms: Room[];
  nightOf: (roomCode: string) => NightOf;
  libur: Map<string, Libur>;
  taxPercent: number;
  onMonthShown?: (firstDay: string) => void; // lets the page load prices for months it hasn't fetched yet
  onBook: (room: Room, checkIn: string, checkOut: string, firstNightPrice: number) => void;
};

const parse = (s: string) => new Date(s + 'T00:00:00');

export default function PricelistCalendar({ rooms, nightOf, libur, taxPercent, onMonthShown, onBook }: Props) {
  const { tr, locale } = useLang();
  // Sunday-first week header and month names follow the chosen language (2000-01-02 was a Sunday)
  const DOW = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2000, 0, 2 + i).toLocaleDateString(locale, { weekday: 'short' })), [locale]);
  const MONTHS = useMemo(() => Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(locale, { month: 'long' })), [locale]);
  const fmtShort = (s: string) => parse(s).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const now = new Date();
  const today = ymd(now);
  const minYear = now.getFullYear();
  const maxYear = minYear + 1; // guests plan ahead; prices usually exist 3-6 months out
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [room, setRoom] = useState(rooms[0].code);
  const [sel, setSel] = useState<{ a: string; b: string | null } | null>(null);
  // upsell bubble: the room is full for the date / stay the guest tapped, here's what's still open
  const [bubble, setBubble] = useState<{ title: string; options: Alternative[]; base?: number; a: string; b: string | null } | null>(null);
  useEffect(() => { lacak('pricelist_dibuka', undefined, undefined, 'pricelist_dibuka'); }, []);
  useEffect(() => {
    if (sel?.b) lacak('tanggal_dipilih', undefined, { kamar: room, checkin: sel.a, checkout: sel.b }, `tgl|${room}|${sel.a}|${sel.b}`);
  }, [sel?.a, sel?.b, room]);

  // the grid runs 6 weeks, so it also shows the start of next month: load both
  useEffect(() => {
    onMonthShown?.(ymd(month));
    onMonthShown?.(ymd(new Date(month.getFullYear(), month.getMonth() + 1, 1)));
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const goto = (y: number, m: number) => {
    const d = new Date(y, m, 1);
    if (d < new Date(now.getFullYear(), now.getMonth(), 1) || d.getFullYear() > maxYear) return;
    setMonth(d);
  };
  const isFirstMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const isLastMonth = month.getFullYear() === maxYear && month.getMonth() === 11;

  const night = nightOf(room);
  const pickingOut = !!sel && !sel.b;
  const validOut = (d: string) => pickingOut && canCheckOut(sel!.a, d, night);
  const validIn = (d: string) => canCheckIn(d, night, today);

  const roomName = (code: string) => rooms.find(r => r.code === code)!.name;
  const pick = (d: string) => {
    setBubble(null);
    if (validOut(d)) return setSel({ a: sel!.a, b: d });
    // a stay that runs through a full night -> offer other rooms for that stay
    const through = pickingOut && d > sel!.a ? blockingNight(sel!.a, d, night) : undefined;
    if (!through && validIn(d)) return setSel({ a: d, b: null });
    // ...or the tapped check-in night itself is full
    const full = through ?? (night(d)?.sisa === 0 ? d : undefined);
    if (!full) return;
    const [a, b] = through ? [sel!.a, d] : [d, null];
    setBubble({
      title: tr(`${roomName(room)} ${night(full)?.harga ? 'penuh' : 'belum tersedia'} pada ${fmtShort(full)}.`, `${roomName(room)} is ${night(full)?.harga ? 'fully booked' : 'not yet available'} on ${fmtShort(full)}.`),
      options: alternatives(rooms, nightOf, a, b, 1, today, room),
      base: night(full)?.harga ?? undefined,
      a, b,
    });
  };
  const takeAlternative = (code: string) => {
    if (!bubble) return;
    setRoom(code);
    setSel({ a: bubble.a, b: bubble.b });
    setBubble(null);
  };

  const tone = (d: string) => {
    const l = libur.get(d);
    if (l?.jenis === 'cuti_bersama') return 'text-orange-500';
    if (l?.jenis === 'nasional' || parse(d).getDay() === 0) return 'text-red-600';
    return 'text-neutral-900';
  };

  // Sunday-first, 6 continuous weeks from the week of the 1st: the month runs on into the next
  // one, so a stay starting on the 30th can pick its check-out without flipping pages
  const cells = useMemo(() => {
    const d = new Date(month);
    d.setDate(1 - month.getDay());
    return Array.from({ length: 42 }, () => { const s = ymd(d); d.setDate(d.getDate() + 1); return s; });
  }, [month]);
  const inMonth = (d: string) => parse(d).getMonth() === month.getMonth();

  const monthPrices = cells.flatMap(d => (inMonth(d) && d >= today ? [night(d)?.harga] : [])).filter((p): p is number => !!p);
  const range = monthPrices.length
    ? (Math.min(...monthPrices) === Math.max(...monthPrices) ? formatK(monthPrices[0]) : `${formatK(Math.min(...monthPrices))} – ${formatK(Math.max(...monthPrices))}`)
    : null;
  const roomObj = rooms.find(r => r.code === room)!;
  const stay = sel?.b ? nightsBetween(sel.a, sel.b) : [];
  const total = stay.reduce((t, d) => t + (night(d)?.harga ?? 0), 0);
  const hemat = stay.reduce((t, d) => t + Math.max(0, (night(d)?.hargaNormal ?? 0) - (night(d)?.harga ?? 0)), 0);
  const left = sel?.b ? roomsLeft(sel.a, sel.b, night) : sel ? night(sel.a)?.sisa : undefined;
  const urgency = scarcityText(tr, left, true);
  const book = () => {
    if (!sel?.b) return;
    lacak('lanjut_pesan', undefined, { kamar: room, checkin: sel.a, checkout: sel.b, malam: stay.length });
    onBook(roomObj, sel.a, sel.b, night(sel.a)?.harga ?? 0);
  };
  const navBtn = 'w-9 h-9 rounded-[8px] border border-neutral-200 bg-white flex items-center justify-center hover:border-[#D4AF37] disabled:opacity-30';
  const selectCls = 'rounded-[8px] border border-neutral-200 bg-white px-3 py-2 text-[14px] font-semibold text-neutral-900 hover:border-[#D4AF37]';

  const cell = (d: string) => {
    const n = night(d);
    const price = n?.harga;
    const sisa = n?.sisa;
    const past = d < today;
    const asIn = validIn(d);
    const asOut = validOut(d);
    const full = sisa === 0 && !past;
    const tellFull = !past && !!price && (full || (pickingOut && d > sel!.a));
    const clickable = asIn || asOut;
    const edge = sel && (d === sel.a || d === sel.b);
    const mid = sel?.b && d > sel.a && d < sel.b;
    const short = asIn && !edge ? scarcityText(tr, sisa) : null;
    const cls = [
      'w-full h-full min-h-[64px] md:min-h-[84px] rounded-[10px] border p-1.5 md:p-2.5 text-left tabular-nums transition-colors duration-150',
      edge ? 'bg-[#D4AF37] border-[#D4AF37] text-[#1c1c1c]'
        : mid ? 'bg-[#D4AF37]/20 border-[#D4AF37]/40'
        : asOut && !asIn ? 'cursor-pointer border-dashed border-[#D4AF37] bg-white hover:bg-[#D4AF37]/10'
        : full ? 'cursor-pointer border-neutral-100 text-neutral-400 bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(120,113,108,.10)_4px_8px)] hover:border-neutral-300'
        : !clickable ? 'cursor-default border-neutral-100 bg-neutral-50/60 opacity-50'
        : 'cursor-pointer border-neutral-200 bg-white hover:border-[#D4AF37]',
      d === today && !edge ? 'ring-1 ring-[#D4AF37]' : '',
    ].join(' ');
    const sub = d === sel?.b || (asOut && !asIn) ? 'Check-out' : full ? tr('Penuh', 'Full') : price ? formatK(price) : '–';
    const promo = sub === (price ? formatK(price) : null) && n?.diskon && n.hargaNormal ? n : null;
    return (
      <button type="button" disabled={!clickable && !tellFull} onClick={() => pick(d)} className={cls} title={libur.get(d)?.nama}
        aria-label={`${fmtShort(d)}${price ? `, ${formatK(price)}` : ''}${full ? tr(', penuh', ', fully booked') : ''}${short ? `, ${short}` : ''}`}>
        <span className={`block text-[13px] md:text-[15px] font-semibold ${edge ? '' : tone(d)}`}>
          {parse(d).getDate()}
          {parse(d).getDate() === 1 && <span className="ml-1 text-[9px] md:text-[11px] font-bold uppercase tracking-wide text-[#8A6D00]">{MONTHS[parse(d).getMonth()].slice(0, 3)}</span>}
        </span>
        {promo && <span className={`block text-[9px] md:text-[10px] leading-tight line-through ${edge ? 'opacity-70' : 'text-neutral-400'}`}>{formatK(promo.hargaNormal!)}</span>}
        <span className={`block text-[10px] md:text-[12px] mt-0.5 leading-tight ${asOut && !asIn && !edge ? 'text-[#8A6D00] font-semibold' : ''} ${promo && !edge ? 'text-red-600 font-semibold' : ''}`}>
          {sub}{promo && <span className="ml-0.5 text-[8px] md:text-[10px] font-bold">-{promo.diskon}%</span>}
        </span>
        {short && <span className="block text-[9px] md:text-[11px] font-semibold text-red-600 leading-tight">{short}</span>}
      </button>
    );
  };

  return (
    <div className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      <div className="bg-white border border-neutral-200 rounded-[16px] p-3 md:p-5">
        {/* toolbar: month / year / arrows */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select aria-label={tr('Bulan', 'Month')} className={selectCls} value={month.getMonth()} onChange={e => goto(month.getFullYear(), Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i} disabled={month.getFullYear() === now.getFullYear() && i < now.getMonth()}>{m}</option>
            ))}
          </select>
          <select aria-label={tr('Tahun', 'Year')} className={selectCls} value={month.getFullYear()} onChange={e => goto(Number(e.target.value), Number(e.target.value) === minYear ? Math.max(month.getMonth(), now.getMonth()) : month.getMonth())}>
            {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" aria-label={tr('Bulan sebelumnya', 'Previous month')} className={navBtn} disabled={isFirstMonth} onClick={() => goto(month.getFullYear(), month.getMonth() - 1)}><ChevronLeft size={16} /></button>
          <button type="button" aria-label={tr('Bulan berikutnya', 'Next month')} className={navBtn} disabled={isLastMonth} onClick={() => goto(month.getFullYear(), month.getMonth() + 1)}><ChevronRight size={16} /></button>
        </div>

        {/* room tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rooms.map(r => (
            <button key={r.code} type="button" onClick={() => { setRoom(r.code); setSel(null); setBubble(null); }}
              className={`shrink-0 rounded-[8px] px-3.5 py-2 text-[12px] md:text-[13px] font-medium border transition-colors ${room === r.code ? 'bg-[#1c1c1c] text-[#D4AF37] border-[#1c1c1c]' : 'border-neutral-200 text-neutral-600 bg-white hover:border-[#D4AF37]'}`}>
              {r.name}
            </button>
          ))}
        </div>

        {/* legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500 my-2">
          <span><b className="text-red-600">12</b> {tr('Minggu / libur nasional', 'Sunday / public holiday')}</span>
          <span><b className="text-orange-500">12</b> {tr('Cuti bersama', 'Joint leave day')}</span>
          <span><b className="text-red-600">{tr('Sisa 2 kamar', '2 rooms left')}</b> {tr('= hampir penuh', '= almost full')}</span>
          <span>{tr('Penuh = tidak tersedia', 'Full = unavailable')}</span>
          <span>{tr('– = harga belum dibuka', '– = rates not yet released')}</span>
        </div>

        {/* month grid */}
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {DOW.map((d, i) => (
            <div key={d} className={`text-center text-[11px] md:text-[12px] py-1 ${i === 0 ? 'text-red-600 font-semibold' : 'text-neutral-400'}`}>{d}</div>
          ))}
          {cells.map(d => <div key={d} className={inMonth(d) ? '' : 'opacity-80'}>{cell(d)}</div>)}
        </div>
      </div>

      {/* side panel */}
      <div className="space-y-3 lg:sticky lg:top-28">
        <div className="bg-white border border-neutral-200 rounded-[16px] px-4 py-3.5">
          <p className="text-[11px] text-neutral-500">{roomObj.name} · {MONTHS[month.getMonth()]} {month.getFullYear()}</p>
          <p className="text-[15px] font-semibold text-neutral-900 mt-0.5">{range ? `${range} ${tr('per malam', 'per night')}` : tr('Harga belum dibuka', 'Rates not yet released')}</p>
          <p className="text-[11px] text-neutral-400 mt-1">{range ? tr(`Belum termasuk pajak & service ${taxPercent}%`, `Excludes ${taxPercent}% tax & service charge`) : tr('Hubungi tim kami lewat WhatsApp untuk tanggal ini.', 'Please contact our team on WhatsApp for these dates.')}</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-[16px] px-4 py-3.5">
          {!sel ? (
            <p className="flex gap-2 text-[13px] text-neutral-500"><MousePointerClick size={16} className="text-[#8A6D00] shrink-0 mt-0.5" /> {tr('Pilih tanggal check-in, lalu tanggal check-out.', 'Select your check-in date, then your check-out date.')}</p>
          ) : !sel.b ? (
            <p className="text-[13px] text-neutral-600">Check-in <b className="text-neutral-900">{fmtShort(sel.a)}</b>. {tr('Sekarang pilih tanggal check-out.', 'Now select your check-out date.')}</p>
          ) : (
            <>
              <p className="text-[11px] text-neutral-500">{tr('Pilihan Anda', 'Your selection')}</p>
              <p className="text-[14px] font-semibold text-neutral-900">{roomObj.name}</p>
              <p className="text-[13px] text-neutral-600 mt-1">{fmtShort(sel.a)} → {fmtShort(sel.b)} · {stay.length} {tr('malam', stay.length === 1 ? 'night' : 'nights')}</p>
              <p className="text-[20px] font-semibold text-neutral-900 mt-2 tabular-nums">Rp{total.toLocaleString(locale)}</p>
              {hemat > 0 && <p className="text-[12px] font-semibold text-red-600">{tr('Promo: hemat', 'Promo: save')} Rp{hemat.toLocaleString(locale)}</p>}
              <p className="text-[11px] text-neutral-400">{tr(`Belum termasuk pajak & service ${taxPercent}%`, `Excludes ${taxPercent}% tax & service charge`)}</p>
              <button type="button" onClick={book}
                className="mt-3 w-full bg-[#1c1c1c] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black transition-colors py-3 rounded-[8px] text-[11px] font-bold uppercase tracking-[0.2em]">
                {tr('Pesan sekarang', 'Book now')}
              </button>
            </>
          )}
          {urgency && (
            <p className="mt-3 flex gap-2 items-start rounded-[8px] bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
              <Flame size={15} className="shrink-0 mt-0.5" /> {urgency}
            </p>
          )}
        </div>
      </div>

      {bubble && (
        <RoomAlternatives title={bubble.title}
          note={bubble.b ? `${tr('Untuk', 'For')} ${fmtShort(bubble.a)} → ${fmtShort(bubble.b)}` : `Check-in ${fmtShort(bubble.a)}`}
          options={bubble.options} basePerNight={bubble.base} onPick={takeAlternative} onClose={() => setBubble(null)}
          konteks={{ kamar: room, checkin: bubble.a, checkout: bubble.b, tempat: 'kalender' }} />
      )}

      {/* floating "continue booking" once check-in and check-out are picked */}
      {sel?.b && !bubble && (
        <div className="fixed inset-x-0 bottom-[96px] md:bottom-[104px] z-[150] flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="pointer-events-auto w-full max-w-xl flex items-center gap-2 rounded-full bg-[#1c1c1c] pl-5 pr-1.5 py-1.5 shadow-2xl ring-1 ring-[#D4AF37]/40">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{roomObj.name} · {stay.length} {tr('malam', stay.length === 1 ? 'night' : 'nights')}</p>
              <p className="truncate text-[11px] text-[#D4AF37]">
                {fmtShort(sel.a)} → {fmtShort(sel.b)}{urgency ? ` · ${scarcityText(tr, left)}` : ''}
              </p>
            </div>
            <button type="button" aria-label={tr('Batalkan pilihan tanggal', 'Clear selected dates')} onClick={() => setSel(null)}
              className="shrink-0 rounded-full p-2 text-white/60 hover:text-white"><X size={16} /></button>
            <button type="button" onClick={book}
              className="shrink-0 flex items-center gap-2 rounded-full bg-[#D4AF37] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.15em] text-black hover:bg-white transition-colors">
              <span className="sm:hidden">{tr('Pesan', 'Book')}</span><span className="hidden sm:inline">{tr('Lanjutkan pemesanan', 'Continue booking')}</span> <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
