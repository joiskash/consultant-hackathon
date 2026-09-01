import test from 'node:test';
import assert from 'node:assert/strict';
import { pollOnce } from '../src/poll.js';
import { renderEvent, URGENT } from '../src/telegram.js';

const cfg = { movieQuery: 'odyssey', watchStart: '2026-09-03', watchEnd: '2026-09-03' };

/** Stand-in for AmcClient, driven by canned payloads. */
class FakeAmc {
  constructor(live, embargoed = null) { this.live = live; this.embargoed = embargoed; }
  async showtimes() { return this.live; }
  async embargoedShowtimes() { return this.embargoed; }
}

const imax70 = {
  id: 100, movieName: 'The Odyssey', premiumFormat: 'IMAX 70mm',
  auditorium: 'Auditorium 1', showDateTimeLocal: '2026-09-03T19:00:00',
  purchaseUrl: 'https://amctheatres.com/buy/100', isSoldOut: false,
};
const imaxLaser = { ...imax70, id: 101, premiumFormat: 'IMAX Laser' };
const otherMovie = { ...imax70, id: 102, movieName: 'Dune: Part Three' };

test('filters a mixed feed down to Odyssey IMAX 70mm only', async () => {
  const amc = new FakeAmc([imax70, imaxLaser, otherMovie]);
  const { events, showtimes } = await pollOnce(amc, cfg, { theatreId: '1', showtimes: {} });
  assert.deepEqual(Object.keys(showtimes), ['100']);
  assert.deepEqual(events.map((e) => e.kind), ['NEW_ONSALE']);
});

test('a second identical poll produces no events', async () => {
  const amc = new FakeAmc([imax70]);
  const state = { theatreId: '1', showtimes: {} };
  const first = await pollOnce(amc, cfg, state);
  state.showtimes = first.showtimes;
  const second = await pollOnce(amc, cfg, state);
  assert.deepEqual(second.events, [], 'steady state must stay silent');
});

test('embargoed then on sale produces exactly one urgent alert', async () => {
  const state = { theatreId: '1', showtimes: {} };
  const embargoedOnly = { ...imax70, purchaseUrl: null };

  const before = await pollOnce(new FakeAmc([], [embargoedOnly]), cfg, state);
  assert.deepEqual(before.events.map((e) => e.kind), ['NEW_EMBARGOED']);
  assert.ok(!URGENT.has(before.events[0].kind), 'embargo notice should not buzz');
  state.showtimes = before.showtimes;

  const after = await pollOnce(new FakeAmc([imax70], []), cfg, state);
  assert.deepEqual(after.events.map((e) => e.kind), ['EMBARGO_LIFTED']);
  assert.ok(URGENT.has(after.events[0].kind), 'the drop must buzz');
});

test('the live feed wins over a stale embargoed entry for the same showtime', async () => {
  const amc = new FakeAmc([imax70], [{ ...imax70, purchaseUrl: null }]);
  const { showtimes } = await pollOnce(amc, cfg, { theatreId: '1', showtimes: {} });
  assert.equal(showtimes['100'].buyable, true);
  assert.equal(showtimes['100'].embargoed, false);
});

test('a missing embargo feed degrades instead of throwing', async () => {
  const amc = new FakeAmc([imax70], null);
  const { events, embargoFeedSeen } = await pollOnce(amc, cfg, { theatreId: '1', showtimes: {} });
  assert.equal(embargoFeedSeen, false);
  assert.deepEqual(events.map((e) => e.kind), ['NEW_ONSALE']);
});

test('the alert message carries a working buy link and escapes markup', async () => {
  const amc = new FakeAmc([{ ...imax70, movieName: 'Odyssey <IMAX>' }]);
  const { events } = await pollOnce(amc, cfg, { theatreId: '1', showtimes: {} });
  const msg = renderEvent(events[0], 'AMC Lincoln Square 13');
  assert.match(msg, /https:\/\/amctheatres\.com\/buy\/100/);
  assert.match(msg, /2026-09-03 19:00/);
  assert.match(msg, /Odyssey &lt;IMAX&gt;/, 'HTML must be escaped, not injected');
});
