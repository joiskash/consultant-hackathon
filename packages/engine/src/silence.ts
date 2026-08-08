import { CasePack, Mode, Phase } from '@freshcase/types';

// Escalation ladder per stall: check-in -> orienting nudge -> calibrated pack
// hint. Never jumps straight to a hint. Realistic mode requires two full
// stalls (check-in + nudge, twice) before the first pack hint; Guided hints
// one stall earlier. Ladder position resets when the candidate makes progress.

export type EscalationAction =
  | { action: 'check_in'; spoken_guidance: string }
  | { action: 'nudge'; spoken_guidance: string }
  | { action: 'hint'; level: number; spoken_guidance: string };

const LADDERS: Record<Mode, ('check_in' | 'nudge')[]> = {
  realistic: ['check_in', 'nudge', 'check_in', 'nudge'],
  guided: ['check_in', 'nudge'],
};

function hintContent(pack: CasePack, phase: Phase, level: number): string {
  // Fixed ladder: restate directive -> point at the neglected dimension ->
  // reveal the layer (the data drop, unearned).
  if (level === 1) {
    return phase === 'quant'
      ? `Restate the task directive from the quant setup: ${pack.quant_module.expected_setup}`
      : `Restate the task at hand for the ${phase} phase in your own words — no new information.`;
  }
  if (level === 2) {
    return phase === 'structure'
      ? `Point at a neglected dimension from the rubric without giving the bucket away: ${pack.framework_rubric.expected_buckets.join(' | ')}`
      : `Point toward the basic takeaway without revealing it: ${pack.quant_module.worked_solution.takeaway_basic ?? 'guide toward the anomalous line item'}`;
  }
  return `Reveal the layer — give the follow-up data drop unearned: ${pack.quant_module.followup_data_drop.spoken}`;
}

export function escalate(
  stallCount: number,
  hintsGiven: number,
  mode: Mode,
  phase: Phase,
  pack: CasePack,
): EscalationAction {
  const ladder = LADDERS[mode];
  if (stallCount <= ladder.length) {
    const step = ladder[stallCount - 1];
    return step === 'check_in'
      ? {
          action: 'check_in',
          spoken_guidance: 'Natural check-in, e.g. "talk me through where your head\'s at."',
        }
      : {
          action: 'nudge',
          spoken_guidance: 'Orienting nudge: restate the task directive for this phase.',
        };
  }
  const level = Math.min(hintsGiven + 1, 3);
  return { action: 'hint', level, spoken_guidance: hintContent(pack, phase, level) };
}
