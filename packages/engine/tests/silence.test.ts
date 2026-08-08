import { escalate, EscalationAction } from '../src/silence';
import { saverite } from '../src/index';

function sequence(mode: 'realistic' | 'guided', stalls: number): EscalationAction[] {
  const actions: EscalationAction[] = [];
  let hints = 0;
  for (let s = 1; s <= stalls; s++) {
    const action = escalate(s, hints, mode, 'quant', saverite);
    actions.push(action);
    if (action.action === 'hint') hints += 1;
  }
  return actions;
}

describe('silence escalation ladder', () => {
  test('realistic: two full stalls before the first pack hint', () => {
    const actions = sequence('realistic', 6).map((a) =>
      a.action === 'hint' ? `hint${a.level}` : a.action,
    );
    expect(actions).toEqual(['check_in', 'nudge', 'check_in', 'nudge', 'hint1', 'hint2']);
  });

  test('guided: hints one stall earlier', () => {
    const actions = sequence('guided', 4).map((a) =>
      a.action === 'hint' ? `hint${a.level}` : a.action,
    );
    expect(actions).toEqual(['check_in', 'nudge', 'hint1', 'hint2']);
  });

  test('never jumps straight to a hint', () => {
    expect(escalate(1, 0, 'realistic', 'structure', saverite).action).toBe('check_in');
    expect(escalate(1, 0, 'guided', 'structure', saverite).action).toBe('check_in');
  });

  test('hint levels cap at 3 (reveal the layer)', () => {
    const action = escalate(9, 5, 'realistic', 'quant', saverite);
    expect(action.action).toBe('hint');
    if (action.action === 'hint') {
      expect(action.level).toBe(3);
      expect(action.spoken_guidance).toContain(
        saverite.quant_module.followup_data_drop.spoken,
      );
    }
  });

  test('hint 1 restates the directive, never new information', () => {
    const action = escalate(5, 0, 'realistic', 'quant', saverite);
    expect(action.action).toBe('hint');
    if (action.action === 'hint') {
      expect(action.level).toBe(1);
      expect(action.spoken_guidance).not.toContain(
        saverite.quant_module.followup_data_drop.spoken,
      );
    }
  });
});
