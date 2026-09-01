import test from 'node:test';
import assert from 'node:assert/strict';
import { diffShowtimes, fingerprint } from '../src/state.js';

const show = (o = {}) => ({
  id: '1', movieName: 'The Odyssey', purchaseUrl: 'https://amc/buy',
  showDateTimeLocal: '2026-09-03T19:00:00', auditorium: 'IMAX', isSoldOut: false, ...o,
});
const kinds = (evts) => evts.map((e) => e.kind);

test('a brand new on-sale showtime alerts', () => {
  const curr = { 1: fingerprint(show()) };
  assert.deepEqual(kinds(diffShowtimes({}, curr)), ['NEW_ONSALE']);
});

test('a brand new embargoed showtime is informational, not urgent', () => {
  const curr = { 1: fingerprint(show({ purchaseUrl: null }), { embargoed: true }) };
  assert.deepEqual(kinds(diffShowtimes({}, curr)), ['NEW_EMBARGOED']);
});

test('embargo lifting is the headline event', () => {
  const prev = { 1: fingerprint(show({ purchaseUrl: null }), { embargoed: true }) };
  const curr = { 1: fingerprint(show()) };
  assert.deepEqual(kinds(diffShowtimes(prev, curr)), ['EMBARGO_LIFTED']);
});

test('sold out flipping back to available alerts', () => {
  const prev = { 1: fingerprint(show({ isSoldOut: true })) };
  const curr = { 1: fingerprint(show({ isSoldOut: false })) };
  assert.deepEqual(kinds(diffShowtimes(prev, curr)), ['BACK_IN_STOCK']);
});

test('an unchanged buyable showtime does NOT re-alert', () => {
  const prev = { 1: fingerprint(show()) };
  const curr = { 1: fingerprint(show()) };
  assert.deepEqual(diffShowtimes(prev, curr), [], 'must not spam on every poll');
});

test('an unchanged sold-out showtime stays quiet', () => {
  const prev = { 1: fingerprint(show({ isSoldOut: true })) };
  const curr = { 1: fingerprint(show({ isSoldOut: true })) };
  assert.deepEqual(diffShowtimes(prev, curr), []);
});

test('selling out is not an alert, but re-opening afterwards is', () => {
  const available = { 1: fingerprint(show()) };
  const gone = { 1: fingerprint(show({ isSoldOut: true })) };
  assert.deepEqual(diffShowtimes(available, gone), [], 'selling out is not good news');
  assert.deepEqual(kinds(diffShowtimes(gone, available)), ['BACK_IN_STOCK']);
});

test('a purchase url appearing on a tracked showtime alerts', () => {
  const prev = { 1: fingerprint(show({ purchaseUrl: null })) };
  const curr = { 1: fingerprint(show()) };
  assert.deepEqual(kinds(diffShowtimes(prev, curr)), ['NOW_BUYABLE']);
});

test('multiple showtimes each produce their own event', () => {
  const prev = { 1: fingerprint(show({ isSoldOut: true })) };
  const curr = { 1: fingerprint(show()), 2: fingerprint(show({ id: '2' })) };
  assert.deepEqual(kinds(diffShowtimes(prev, curr)).sort(), ['BACK_IN_STOCK', 'NEW_ONSALE']);
});

test('a disappearing showtime does not throw', () => {
  const prev = { 1: fingerprint(show()) };
  assert.deepEqual(diffShowtimes(prev, {}), []);
});
