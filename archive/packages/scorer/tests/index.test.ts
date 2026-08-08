import { computeVoiceMetrics } from '../src';

describe('computeVoiceMetrics', () => {
  test('returns zeroed metrics for an empty transcript', () => {
    const metrics = computeVoiceMetrics('');
    expect(metrics.talkTimeSeconds).toBe(0);
    expect(metrics.silenceGaps).toBe(0);
  });
});
