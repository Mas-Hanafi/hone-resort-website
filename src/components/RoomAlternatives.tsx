// Upsell bubble shown when the chosen room is full / short for the dates: says why, then lists the
// room types that are still available (cheapest first), with an "Upgrade" tag on pricier ones.
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { formatK, scarcityText } from '../calendarDay';
import { type Alternative } from '../stay';
import { useLang } from '../lang';
import { useEffect } from 'react';
import { lacak } from '../lacak';

type Props = {
  title: string;
  note?: string;
  options: Alternative[];
  basePerNight?: number;     // price of the room the guest wanted, to mark upgrades
  onPick: (code: string) => void;
  onClose: () => void;
  waHref?: string;           // shown when nothing else is available
  inline?: boolean;          // render in the page flow instead of as a floating bubble
  // what the guest wanted, for admin Laporan (unmet demand + upsell); tempat = kalender | form | checkout
  konteks?: { kamar?: string; checkin?: string; checkout?: string | null; tempat: string; alasan?: string };
};

export default function RoomAlternatives({ title, note, options, basePerNight, onPick: pick, onClose, waHref, inline, konteks }: Props) {
  const { tr } = useLang();
  const k = konteks;
  useEffect(() => {
    if (k?.kamar) lacak('kamar_penuh', undefined, { ...k, tersedia: options.length }, `penuh|${k.tempat}|${k.kamar}|${k.checkin}|${k.checkout}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k?.kamar, k?.checkin, k?.checkout, k?.tempat]);
  const onPick = (code: string) => { if (k?.kamar) lacak('upsell_klik', undefined, { dari: k.kamar, ke: code, checkin: k.checkin, tempat: k.tempat }); pick(code); };
  const card = (
    <div role="dialog" aria-live="polite" onClick={e => e.stopPropagation()} className="pointer-events-auto w-full max-w-md rounded-[16px] bg-white shadow-2xl ring-1 ring-[#D4AF37]/40 p-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-neutral-900 leading-snug">{title}</p>
          {note && <p className="text-[12px] text-neutral-500 mt-0.5">{note}</p>}
        </div>
        {!inline && (
          <button type="button" aria-label={tr('Tutup', 'Close')} onClick={onClose} className="shrink-0 -mr-1 -mt-1 p-1.5 text-neutral-400 hover:text-neutral-800"><X size={16} /></button>
        )}
      </div>

      {options.length > 0 ? (
        <>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#8A6D00]">{tr('Kamar yang masih tersedia', 'Rooms still available')}</p>
          <ul className="mt-2 space-y-1.5">
            {options.map(o => {
              const upgrade = basePerNight != null && o.perNight > basePerNight;
              const low = scarcityText(tr, o.left);
              return (
                <li key={o.code}>
                  <button type="button" onClick={() => onPick(o.code)}
                    className="group w-full flex items-center gap-3 rounded-[10px] border border-neutral-200 px-3 py-2.5 text-left hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-neutral-900 truncate">{o.name}</span>
                        {upgrade && <span className="shrink-0 rounded-full bg-[#1c1c1c] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-[#D4AF37]">Upgrade</span>}
                      </span>
                      <span className="block text-[12px] text-neutral-500">
                        {formatK(o.perNight)} {tr('/ malam', '/ night')}{low && <span className="ml-1.5 font-semibold text-red-600">· {low}</span>}
                      </span>
                    </span>
                    <ArrowRight size={15} className="shrink-0 text-neutral-400 group-hover:text-[#8A6D00]" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-neutral-600">
          {tr('Semua tipe kamar sudah penuh untuk tanggal ini.', 'All room types are fully booked for these dates.')}{' '}
          {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#8A6D00] underline">{tr('Tanya tim kami lewat WhatsApp', 'Ask our team on WhatsApp')}</a>}
        </p>
      )}
    </div>
  );
  if (inline) return card;
  return (
    <div className="fixed inset-x-0 bottom-[96px] md:bottom-[104px] z-[300] flex justify-center px-4 pointer-events-none">
      {card}
    </div>
  );
}
