import { computeMetrics } from '../src/metrics';
import { strongHandoff, weakHandoff } from './fixtures/goldens';

describe('deterministic voice metrics (Stage 1)', () => {
  test('strong run: exact expected metrics', () => {
    const m = computeMetrics(strongHandoff());
    // prompt ended at t=45, structure presented at t=160
    expect(m.time_to_framework_seconds).toBe(115);
    // announced thinking time reported separately, never as silence
    expect(m.announced_thinking_time_seconds).toBe(90);
    expect(m.unannounced_silence).toEqual({});
    // quant started t=195, correct verdict t=295
    expect(m.calc_elapsed_seconds).toBe(100);
    expect(m.hints_consumed).toEqual({ count: 0, max_level: 0 });
    // data drop AND kicker delivered -> both layers
    expect(m.insight_layers_reached).toBe(2);
    expect(m.math_record).toEqual([{ verdict: 'correct' }]);
    expect(m.talk_time_ratio).toBeGreaterThan(0.4);
  });

  test('weak run: exact expected metrics', () => {
    const m = computeMetrics(weakHandoff());
    expect(m.time_to_framework_seconds).toBe(110); // t=25 -> t=135
    expect(m.announced_thinking_time_seconds).toBe(0);
    expect(m.unannounced_silence).toEqual({
      structure: { count: 2, total_duration_seconds: 75 },
      quant: { count: 2, total_duration_seconds: 95 },
    });
    expect(m.calc_elapsed_seconds).toBe(0); // never reached a correct verdict
    expect(m.hints_consumed).toEqual({ count: 1, max_level: 1 });
    expect(m.insight_layers_reached).toBe(0);
    expect(m.math_record).toEqual([{ verdict: 'probe' }, { verdict: 'reveal' }]);
  });

  test('probe then self-corrected is marked recovered (positive signal)', () => {
    const handoff = strongHandoff();
    const t = handoff.events[0].timestamp;
    handoff.events.push(
      { type: 'math_verdict', verdict: 'probe', timestamp: t + 1 },
      { type: 'math_verdict', verdict: 'correct', timestamp: t + 2 },
    );
    const m = computeMetrics(handoff);
    expect(m.math_record).toEqual([
      { verdict: 'correct' },
      { verdict: 'probe' },
      { verdict: 'correct', recovered: true },
    ]);
  });
});
