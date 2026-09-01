import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, decodeShowtimeId, purchaseUrlFor } from '../src/parsebot.js';
import { isCandidate, isBuyable } from '../src/match.js';
import { fingerprint, diffShowtimes } from '../src/state.js';

// Verbatim shape from the live Parse.bot response.
const payload = {
  status: 'success',
  data: {
    theatre: 'AMC Lincoln Square 13',
    theatre_slug: 'amc-lincoln-square-13',
    date: '2026-09-03',
    movies: [
      {
        title: 'Coyote vs. Acme',
        slug: 'coyote-vs-acme-65798',
        showtime_groups: [{
          format: 'Laser at AMC',
          language: 'Closed Caption, Audio Description',
          amenities: ['AMC Club Rockers', 'Reserved Seating'],
          showtimes: [{ time: '10:00 AM', showtime_id: 'U2hvd3RpbWU6MTQ2NjUxMjg0', availability: 'Available', date: 'September 3, 2026' }],
        }],
      },
      {
        title: 'The Odyssey',
        slug: 'the-odyssey-76238',
        showtime_groups: [
          {
            format: 'IMAX 70MM at AMC',
            amenities: ['Reserved Seating'],
            showtimes: [
              { time: '7:00 PM', showtime_id: 'U2hvd3RpbWU6MTQ2NjUxMzYx', availability: 'Available', date: 'September 3, 2026' },
              { time: '11:00 PM', showtime_id: 'U2hvd3RpbWU6MTQ2NjUxMzYw', availability: 'Sold Out', date: 'September 3, 2026' },
            ],
          },
          {
            format: 'IMAX at AMC',
            amenities: ['Reserved Seating'],
            showtimes: [{ time: '3:00 PM', showtime_id: 'U2hvd3RpbWU6MTQ2NjUxMzUy', availability: 'Available', date: 'September 3, 2026' }],
          },
        ],
      },
    ],
  },
};

test('decodes AMC showtime ids into real buy links', () => {
  assert.equal(decodeShowtimeId('U2hvd3RpbWU6MTQ2NjUxMjg0'), '146651284');
  assert.equal(purchaseUrlFor('U2hvd3RpbWU6MTQ2NjUxMjg0'), 'https://www.amctheatres.com/showtimes/146651284');
  assert.equal(purchaseUrlFor('not-base64-at-all'), null);
});

test('flattens the nested payload into individual showtimes', () => {
  const all = normalize(payload, '2026-09-03');
  assert.equal(all.length, 4);
  assert.equal(all[0].movieName, 'Coyote vs. Acme');
  assert.equal(all[0].premiumFormat, 'Laser at AMC');
});

test('maps availability onto the sold-out flag', () => {
  const all = normalize(payload, '2026-09-03');
  const seven = all.find((s) => s.showDateTimeLocal.endsWith('19:00:00'));
  const eleven = all.find((s) => s.showDateTimeLocal.endsWith('23:00:00'));
  assert.equal(seven.isSoldOut, false);
  assert.equal(eleven.isSoldOut, true, '"Sold Out" must mark the showtime sold out');
  assert.ok(isBuyable(seven));
  assert.ok(!isBuyable(eleven));
});

test('converts 12-hour times to 24-hour correctly', () => {
  const all = normalize(payload, '2026-09-03');
  assert.ok(all.some((s) => s.showDateTimeLocal === '2026-09-03T10:00:00'), '10:00 AM');
  assert.ok(all.some((s) => s.showDateTimeLocal === '2026-09-03T15:00:00'), '3:00 PM');
  assert.ok(all.some((s) => s.showDateTimeLocal === '2026-09-03T23:00:00'), '11:00 PM');
});

test('selects only Odyssey IMAX 70mm, not IMAX or Laser', () => {
  const picked = normalize(payload, '2026-09-03').filter((s) => isCandidate(s, 'odyssey'));
  assert.equal(picked.length, 2, 'both 70mm showtimes, neither IMAX-plain nor Laser');
  assert.ok(picked.every((s) => s.premiumFormat === 'IMAX 70MM at AMC'));
});

test('a sold-out 70mm showtime becoming available raises BACK_IN_STOCK', () => {
  const before = normalize(payload, '2026-09-03').filter((s) => isCandidate(s, 'odyssey'));
  const prev = Object.fromEntries(before.map((s) => [s.id, fingerprint(s)]));

  const reopened = structuredClone(payload);
  reopened.data.movies[1].showtime_groups[0].showtimes[1].availability = 'Available';
  const after = normalize(reopened, '2026-09-03').filter((s) => isCandidate(s, 'odyssey'));
  const curr = Object.fromEntries(after.map((s) => [s.id, fingerprint(s)]));

  assert.deepEqual(diffShowtimes(prev, curr).map((e) => e.kind), ['BACK_IN_STOCK']);
  assert.deepEqual(diffShowtimes(prev, prev), [], 'no change must stay silent');
});

test('an empty or malformed payload yields nothing rather than throwing', () => {
  assert.deepEqual(normalize({}, '2026-09-03'), []);
  assert.deepEqual(normalize({ data: { movies: [] } }, '2026-09-03'), []);
  assert.deepEqual(normalize({ data: { movies: [{ title: 'X' }] } }, '2026-09-03'), []);
});
