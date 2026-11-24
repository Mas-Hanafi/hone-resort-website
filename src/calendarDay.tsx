// Shared DayPicker day cell: holiday colour (Minggu/libur nasional merah, cuti bersama oranye)
// and the nightly price in "K" under the date. Data comes through context so the component
// passed to DayPicker stays stable between renders.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { DayButtonProps } from 'react-day-picker';
import { id as idLocale, enGB } from 'react-day-picker/locale';
import { currentLang, trNow, type Lang } from './lang';
import { LOW_STOCK } from './stay';

export type Libur = { nama: string; jenis: 'nasional' | 'cuti_bersama' };
type DayData = { priceOf?: (ymd: string) => number | null | undefined; libur: Map<string, Libur> };

export const DayDataContext = createContext<DayData>({ libur: new Map() });

/** 1250000 -> "1.250K" (ID) / "1,250K" (EN) */
export const formatK = (n: number) => `${Math.round(n / 1000).toLocaleString(trNow('id-ID', 'en-GB'))}K`;

/** react-day-picker locale for the chosen website language. */
export const dpLocale = (lang: Lang = currentLang()) => (lang === 'en' ? enGB : idLocale);

/** Scarcity line for calendar cells / summaries (same rules as stay.scarcity), in the chosen language. */
export const scarcityText = (tr: (id: string, en: string) => string, sisa: number | undefined, long = false): string | null => {
  if (sisa === undefined || sisa <= 0 || sisa > LOW_STOCK) return null;
  if (sisa === 1) return long ? tr('Kamar terakhir! Segera amankan sebelum dipesan orang lain', 'Last room! Secure it before someone else does') : tr('Kamar terakhir', 'Last room');
  return long ? tr(`Tinggal ${sisa} kamar lagi untuk tanggal ini`, `Only ${sisa} rooms left for these dates`) : tr(`Sisa ${sisa} kamar`, `${sisa} rooms left`);
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let liburRequest: Promise<Map<string, Libur>> | null = null;

/** hari_libur via public-read REST; empty map when the table/env is missing (site still works). */
export function useHariLibur(): Map<string, Libur> {
  const [libur, setLibur] = useState<Map<string, Libur>>(new Map());
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    liburRequest ??= fetch(`${url}/rest/v1/hari_libur?select=tanggal,nama,jenis`, { headers: { apikey: key } })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { tanggal: string; nama: string; jenis: Libur['jenis'] }[]) =>
        new Map(rows.map(r => [r.tanggal, { nama: r.nama, jenis: r.jenis }])))
      .catch(() => new Map());
    liburRequest.then(setLibur);
  }, []);
  return libur;
}

export function PriceDayButton({ day, modifiers, children, className, ...rest }: DayButtonProps) {
  const { priceOf, libur } = useContext(DayDataContext);
  const ds = ymd(day.date);
  const l = libur.get(ds);
  const tone = l?.jenis === 'cuti_bersama' ? 'rdp-cuti' : l?.jenis === 'nasional' || day.date.getDay() === 0 ? 'rdp-libur' : '';
  const price = modifiers.disabled || modifiers.outside ? null : priceOf?.(ds);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (modifiers.focused) ref.current?.focus(); }, [modifiers.focused]);
  return (
    <button ref={ref} {...rest} className={`${className ?? ''} ${tone}`} title={l?.nama}>
      <span className="rdp-daynum">{children}</span>
      {price ? <span className="rdp-price">{formatK(price)}</span> : null}
    </button>
  );
}
