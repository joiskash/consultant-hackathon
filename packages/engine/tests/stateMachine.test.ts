import { buildPhaseBrief, isLegalTransition, nextPhase, PHASE_ORDER } from '../src/stateMachine';
import { saverite } from '../src/index';

describe('state machine', () => {
  test('forward transitions are legal in order', () => {
    for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
      expect(isLegalTransition(PHASE_ORDER[i], PHASE_ORDER[i + 1])).toBe(true);
    }
  });

  test('no quant before structure', () => {
    expect(isLegalTransition('clarifying', 'quant')).toBe(false);
    expect(isLegalTransition('prompt', 'quant')).toBe(false);
  });

  test('no skipping backward except clarifying revisits', () => {
    expect(isLegalTransition('quant', 'prompt')).toBe(false);
    expect(isLegalTransition('recommendation', 'structure')).toBe(false);
    expect(isLegalTransition('quant', 'clarifying')).toBe(true);
    expect(isLegalTransition('clarifying', 'quant')).toBe(false);
  });

  test('brainstorm is skippable', () => {
    expect(isLegalTransition('quant', 'recommendation')).toBe(true);
  });

  test('nextPhase walks the order and ends at debrief', () => {
    expect(nextPhase('menu')).toBe('prompt');
    expect(nextPhase('recommendation')).toBe('debrief');
    expect(nextPhase('debrief')).toBeNull();
  });

  test('quant brief exposes scripted setup and withholds the solution', () => {
    const brief = buildPhaseBrief('quant', 'realistic', saverite);
    expect(brief.may_say.join(' ')).toContain(saverite.quant_module.setup_spoken);
    expect(brief.must_withhold.join(' ')).toMatch(/worked solution/i);
    expect(brief.coaching_policy).toMatch(/cold/i);
  });

  test('guided mode brief carries the coaching policy', () => {
    const brief = buildPhaseBrief('structure', 'guided', saverite);
    expect(brief.coaching_policy).toMatch(/coaching/i);
    expect(brief.time_guidance).toMatch(/never force-advance/i);
  });

  test('brainstorm brief never volunteers sample answers', () => {
    const brief = buildPhaseBrief('brainstorm', 'realistic', saverite);
    for (const answer of saverite.brainstorm_module.sample_answers) {
      expect(brief.may_say.join(' ')).not.toContain(answer);
    }
  });
});
