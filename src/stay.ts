// Stay rules shared by the guest calendar, the pricelist booking form and checkout, so every
// screen agrees with the booking engine (private.check_stay / booking_insert):
// - a stay uses the NIGHTS from check-in up to, not including, check-out;
// - so the check-out date itself may be closed, full or unpriced (closing Saturday must still
//   allow Friday -> Saturday);
// - every night needs a price and at least `rooms` rooms left; check-in / check-out closures and
//   the check-in night's minimum stay apply.
// When the engine is off (production today) `sisa` is undefined and only prices gate the dates.

export type Night = {
  harga?: number | null;
  sisa?: number;          // rooms left for sale; undefined = engine off / unknown
  tutupCheckin?: boolean;
  tutupCheckout?: boolean;
  minMalam?: number | null;
  hargaNormal?: number | null; // before the date's direct discount (engine only)
  diskon?: number | null;      // direct discount %, shown as a struck-through price
};
export type NightOf = (ymd: string) => Night | undefined;

const parse = (s: string) => new Date(s + 'T00:00:00');
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const nightsBetween = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = a; d < b; d = addDays(d, 1)) out.push(d);
  return out;
};

const sellable = (n: Night | undefined, rooms: number) =>
  !!n && !!n.harga && (n.sisa === undefined || n.sisa >= rooms);

export const canCheckIn = (d: string, night: NightOf, today: string, rooms = 1) => {
  const n = night(d);
  return d >= today && sellable(n, rooms) && !n!.tutupCheckin;
};

export const canCheckOut = (checkIn: string, d: string, night: NightOf, rooms = 1) => {
  if (d <= checkIn) return false;
  const stay = nightsBetween(checkIn, d);
  if (stay.length < (night(checkIn)?.minMalam ?? 1)) return false;
  if (night(d)?.tutupCheckout) return false;
  return stay.every(n => sellable(night(n), rooms));
};

// rooms that can be sold for the whole stay (the tightest night); undefined when not tracked
export const roomsLeft = (checkIn: string, checkOut: string, night: NightOf): number | undefined => {
  const left = nightsBetween(checkIn, checkOut).map(n => night(n)?.sisa);
  return left.some(s => s === undefined) || !left.length ? undefined : Math.min(...(left as number[]));
};

export const LOW_STOCK = 3;
// short scarcity line for calendar cells / summaries; null when there's plenty (or unknown)
export const scarcity = (sisa: number | undefined, long = false): string | null => {
  if (sisa === undefined || sisa <= 0 || sisa > LOW_STOCK) return null;
  if (sisa === 1) return long ? 'Kamar terakhir! Segera amankan sebelum dipesan orang lain' : 'Kamar terakhir';
  return long ? `Tinggal ${sisa} kamar lagi untuk tanggal ini` : `Sisa ${sisa} kamar`;
};

// Room types that can still take this stay (or this check-in night when checkOut is null) for
// `need` rooms: what we offer when the chosen room is full. Cheapest first; perNight is the
// average nightly price so the UI can mark pricier rooms as an upgrade.
export type RoomOpt = { code: string; name: string };
export type Alternative = RoomOpt & { left?: number; perNight: number };
export const alternatives = (
  rooms: RoomOpt[], nightFor: (code: string) => NightOf, checkIn: string, checkOut: string | null,
  need: number, today: string, exclude?: string,
): Alternative[] =>
  rooms
    .filter(r => r.code !== exclude)
    .flatMap(r => {
      const night = nightFor(r.code);
      const ok = canCheckIn(checkIn, night, today, need) && (!checkOut || canCheckOut(checkIn, checkOut, night, need));
      if (!ok) return [];
      const stay = checkOut ? nightsBetween(checkIn, checkOut) : [checkIn];
      const perNight = Math.round(stay.reduce((t, d) => t + (night(d)?.harga ?? 0), 0) / stay.length);
      return [{ ...r, perNight, left: checkOut ? roomsLeft(checkIn, checkOut, night) : night(checkIn)?.sisa }];
    })
    .sort((a, b) => a.perNight - b.perNight);

// first night of a stay that this room can't sell (full / closed / unpriced), for the message
export const blockingNight = (checkIn: string, checkOut: string, night: NightOf, rooms = 1) =>
  nightsBetween(checkIn, checkOut).find(d => !sellable(night(d), rooms));
