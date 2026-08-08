import fs from 'fs';
import path from 'path';
import { CasePack, Mode, Phase, PhaseBrief } from '@freshcase/types';

// M2 state machine — candidate-led, no hard time caps. The engine validates
// transition legality but never force-advances on time; per-phase budgets are
// soft guidance strings only. config.strictTimeValves = false is the only
// supported value for MVP (reserved for a future final-prep mode).
export const config = { strictTimeValves: false } as const;

export const PHASE_ORDER: Phase[] = [
  'menu',
  'prompt',
  'clarifying',
  'structure',
  'quant',
  'brainstorm',
  'recommendation',
  'debrief',
];

interface SilenceConfig {
  announced_thinking_seconds: number;
  unannounced_tolerance_seconds: { dialogue: number; work: number };
  phase_categories: Record<Phase, 'dialogue' | 'work'>;
  soft_phase_budget_minutes: Partial<Record<Phase, number>>;
}

let silenceConfig: SilenceConfig | null = null;
export function getSilenceConfig(): SilenceConfig {
  if (!silenceConfig) {
    silenceConfig = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../config/silence.json'), 'utf-8'),
    ) as SilenceConfig;
  }
  return silenceConfig;
}

// Candidates move strictly forward one phase at a time, with two exceptions:
// brainstorm is skippable (quant -> recommendation), and clarifying may be
// revisited from later phases (/ask works in any phase anyway; the return
// trip walks the normal forward path).
export function isLegalTransition(from: Phase, to: Phase): boolean {
  const fromIdx = PHASE_ORDER.indexOf(from);
  const toIdx = PHASE_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  if (toIdx === fromIdx + 1) return true;
  if (from === 'quant' && to === 'recommendation') return true; // brainstorm skippable
  if (to === 'clarifying' && fromIdx > PHASE_ORDER.indexOf('clarifying')) return true;
  return false;
}

export function nextPhase(from: Phase): Phase | null {
  const idx = PHASE_ORDER.indexOf(from);
  return idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null;
}

const COACHING_POLICY: Record<Mode, string> = {
  realistic:
    'Professionally cold. No mid-case feedback, no technique coaching. Hints only after two full stalls, and only from the pack hint ladder.',
  guided:
    'Supportive first-timer mode. Brief in-the-moment technique coaching is allowed at natural pauses (e.g. "before we go on — is that structure MECE?"). Hints one stall earlier than realistic mode.',
};

function timeGuidance(phase: Phase): string {
  const budget = getSilenceConfig().soft_phase_budget_minutes[phase];
  if (!budget) return 'No time pressure in this phase.';
  const valve =
    phase === 'quant'
      ? ' If it runs long, consider offering the derived figure instead of making the candidate grind it out, IESE-style.'
      : '';
  return `Soft budget ~${budget} minutes — guidance only, never force-advance on time.${valve}`;
}

// What the interviewer may say and must withhold, per phase, from the pack.
export function buildPhaseBrief(phase: Phase, mode: Mode, pack: CasePack | null): PhaseBrief {
  const maySay: string[] = [];
  const withhold: string[] = [];

  if (!pack) {
    return {
      phase,
      may_say: ['Present the case menu teasers and ask the candidate to pick a case.'],
      must_withhold: ['Everything about pack contents beyond the spoken teasers.'],
      coaching_policy: COACHING_POLICY[mode],
      time_guidance: timeGuidance(phase),
    };
  }

  const q = pack.quant_module;
  switch (phase) {
    case 'menu':
      maySay.push('The case menu teasers; ask the candidate to pick.');
      withhold.push('All pack contents.');
      break;
    case 'prompt':
      maySay.push(`Case prompt, verbatim: ${pack.prompt.spoken}`);
      if (pack.prompt.constraint) maySay.push(`Constraint if asked about timeline: ${pack.prompt.constraint}`);
      withhold.push('All quant figures, the hidden insight, ledger answers not yet asked for.');
      break;
    case 'clarifying':
      maySay.push(
        'Answers to clarifying questions ONLY via the /ask endpoint (ledger-matched or live-fetched).',
      );
      withhold.push(
        'Unasked ledger entries, all quant figures, the hidden insight and kicker.',
      );
      break;
    case 'structure':
      maySay.push(
        'Acknowledge the framework neutrally. If the candidate asks whether a bucket is worth exploring, steer gently using the rubric.',
      );
      maySay.push(`Rubric — expected: ${pack.framework_rubric.expected_buckets.join(' | ')}`);
      maySay.push(
        `Do not reward dwelling on: ${pack.framework_rubric.buckets_to_avoid_dwelling_on.join(' | ')}`,
      );
      withhold.push('Quant data (until the candidate asks for data or advances), the insight.');
      break;
    case 'quant':
      maySay.push(`Quant setup, scripted: ${q.setup_spoken}`);
      maySay.push(
        `Follow-up data drop ONLY if earned (${q.followup_data_drop.trigger}): ${q.followup_data_drop.spoken}`,
      );
      withhold.push(
        'The worked solution and takeaways unless the math ladder reveals them; the kicker until its trigger.',
      );
      break;
    case 'brainstorm':
      maySay.push(`Brainstorm prompt, scripted: ${pack.brainstorm_module.prompt_spoken}`);
      maySay.push(`Facilitation note: ${pack.brainstorm_module.note}`);
      withhold.push(`Sample answers (${pack.brainstorm_module.sample_answers.length} on file) — never volunteer them.`);
      break;
    case 'recommendation':
      maySay.push('Ask for the recommendation; probe risks/next steps if missing.');
      maySay.push(
        `Kicker if triggered (${pack.hidden_insight.kicker.trigger}): ${pack.hidden_insight.kicker.spoken}`,
      );
      withhold.push('The expected recommendation and supporting logic — the candidate must supply them.');
      break;
    case 'debrief':
      maySay.push('Wrap up warmly and hand off to the debrief. No scoring content here (M4 owns it).');
      withhold.push('Rubric bands or scores — those come from the scorer.');
      break;
  }

  return {
    phase,
    may_say: maySay,
    must_withhold: withhold,
    coaching_policy: COACHING_POLICY[mode],
    time_guidance: timeGuidance(phase),
  };
}
