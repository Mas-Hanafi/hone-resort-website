// Self-check for the shared stay rules. Run: node src/stay.check.ts
import assert from 'node:assert/strict';
import { alternatives, blockingNight, canCheckIn, canCheckOut, roomsLeft, scarcity, type Night } from './stay.ts';

const today = '2026-10-01';
// Thu 1 .. Sun 4 Oct; Saturday 3 closed (sisa 0), Friday 2 has 2 rooms left
const nights: Record<string, Night> = {
  '2026-10-01': { harga: 1_000_000, sisa: 5 },
  '2026-10-02': { harga: 1_200_000, sisa: 2 },
  '2026-10-03': { harga: 1_200_000, sisa: 0 },
  '2026-10-04': { harga: 1_000_000, sisa: 5, tutupCheckout: true },
  '2026-10-05': { harga: 1_000_000, sisa: 5, minMalam: 2 },
  '2026-10-06': { harga: 1_000_000, sisa: 5 },
  '2026-10-07': { harga: null, sisa: 5 },
};
const night = (d: string) => nights[d];

// owner case: Saturday closed, Friday check-in must be able to check out on Saturday
assert.equal(canCheckIn('2026-10-02', night, today), true);
assert.equal(canCheckOut('2026-10-02', '2026-10-03', night), true);
assert.equal(canCheckIn('2026-10-03', night, today), false);          // no check-in on the closed night
assert.equal(canCheckOut('2026-10-02', '2026-10-04', night), false);  // staying through Saturday is not allowed

// rooms: 3 rooms don't fit Friday (2 left)
assert.equal(canCheckOut('2026-10-01', '2026-10-03', night, 2), true);
assert.equal(canCheckOut('2026-10-01', '2026-10-03', night, 3), false);
assert.equal(roomsLeft('2026-10-01', '2026-10-03', night), 2);

// closed check-out day, min nights from the check-in night, unpriced nights
assert.equal(canCheckOut('2026-10-05', '2026-10-06', night), false);  // min 2 nights
assert.equal(canCheckOut('2026-10-05', '2026-10-07', night), true);   // unpriced check-out day is fine
assert.equal(canCheckOut('2026-10-06', '2026-10-08', night), false);  // unpriced night inside the stay
assert.equal(canCheckIn('2026-09-30', night, today), false);          // past

// engine off: no sisa -> only prices matter
const off = (d: string): Night | undefined => (nights[d] ? { harga: nights[d].harga } : undefined);
assert.equal(canCheckOut('2026-10-02', '2026-10-04', off, 9), true);
assert.equal(roomsLeft('2026-10-01', '2026-10-03', off), undefined);

assert.equal(scarcity(1), 'Kamar terakhir');
assert.equal(scarcity(3), 'Sisa 3 kamar');
assert.equal(scarcity(4), null);
assert.equal(scarcity(0), null);
assert.equal(scarcity(undefined), null);

// alternatives when the chosen room is full: other rooms that can take the stay, cheapest first
const other: Record<string, Night> = {
  '2026-10-02': { harga: 2_300_000, sisa: 1 },
  '2026-10-03': { harga: 2_300_000, sisa: 1 },
};
const garden: Record<string, Night> = {
  '2026-10-02': { harga: 1_100_000, sisa: 4 },
  '2026-10-03': { harga: 1_100_000, sisa: 0 },
};
const nightFor = (code: string) => (d: string) => (code === 'suite' ? other[d] : code === 'garden' ? garden[d] : nights[d]);
const rooms = [{ code: 'sea', name: 'Sea' }, { code: 'garden', name: 'Garden' }, { code: 'suite', name: 'Suite' }];
// Fri->Sun: Sea is closed Saturday, Garden full Saturday, only Suite can take it
assert.deepEqual(alternatives(rooms, nightFor, '2026-10-02', '2026-10-04', 1, today, 'sea').map(a => a.code), ['suite']);
// Friday check-in only: Garden (cheaper) then Suite
assert.deepEqual(alternatives(rooms, nightFor, '2026-10-02', null, 1, today, 'sea').map(a => [a.code, a.left]), [['garden', 4], ['suite', 1]]);
// 2 rooms: Suite has only 1
assert.deepEqual(alternatives(rooms, nightFor, '2026-10-02', null, 2, today, 'sea').map(a => a.code), ['garden']);
assert.equal(blockingNight('2026-10-02', '2026-10-04', night), '2026-10-03');
assert.equal(blockingNight('2026-10-01', '2026-10-03', night, 3), '2026-10-02');

console.log('stay.check: all passed');
