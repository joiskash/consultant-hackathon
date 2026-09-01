import test from 'node:test';
import assert from 'node:assert/strict';
import { isImax70, isCandidate, isBuyable } from '../src/match.js';

const st = (o) => ({ movieName: 'The Odyssey', isCanceled: false, ...o });

test('matches IMAX 70mm from premiumFormat', () => {
  assert.ok(isImax70(st({ premiumFormat: 'IMAX 70mm' })));
  assert.ok(isImax70(st({ premiumFormat: 'IMAX 70MM Film' })));
});

test('matches from the attributes list', () => {
  assert.ok(isImax70(st({ attributes: [{ code: 'IMAX70MM', name: 'IMAX 70mm Film' }] })));
});

test('matches from the auditorium name', () => {
  assert.ok(isImax70(st({ auditorium: 'IMAX 70mm - Auditorium 1' })));
});

test('rejects plain IMAX and plain 70mm', () => {
  assert.ok(!isImax70(st({ premiumFormat: 'IMAX Laser' })), 'IMAX Laser must not match');
  assert.ok(!isImax70(st({ premiumFormat: 'IMAX with Laser at AMC' })), 'IMAX Laser variant');
  assert.ok(!isImax70(st({ premiumFormat: '70mm Film' })), 'non-IMAX 70mm must not match');
  assert.ok(!isImax70(st({ premiumFormat: 'Dolby Cinema' })));
});

test('FORMAT_PATTERN overrides the default matcher', () => {
  process.env.FORMAT_PATTERN = 'giant screen';
  assert.ok(isImax70(st({ premiumFormat: 'Giant Screen' })));
  assert.ok(!isImax70(st({ premiumFormat: 'IMAX 70mm' })));
  delete process.env.FORMAT_PATTERN;
});

test('candidate requires the right movie, format, and not canceled', () => {
  assert.ok(isCandidate(st({ premiumFormat: 'IMAX 70mm' }), 'odyssey'));
  assert.ok(!isCandidate(st({ movieName: 'Dune', premiumFormat: 'IMAX 70mm' }), 'odyssey'));
  assert.ok(!isCandidate(st({ premiumFormat: 'IMAX 70mm', isCanceled: true }), 'odyssey'));
});

test('buyable requires a purchase url and not sold out', () => {
  assert.ok(isBuyable(st({ purchaseUrl: 'https://x' })));
  assert.ok(!isBuyable(st({ purchaseUrl: 'https://x', isSoldOut: true })));
  assert.ok(!isBuyable(st({})), 'no purchaseUrl means not buyable');
});
