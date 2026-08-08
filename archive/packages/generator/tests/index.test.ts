import { scoreCaseability } from '../src';

describe('scoreCaseability', () => {
  test('returns a positive score for a valid story', () => {
    const result = scoreCaseability({ headline: 'Retailer profits collapse', sourceUrl: 'http://example.com' });
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons).toContain('headline present');
  });
});
