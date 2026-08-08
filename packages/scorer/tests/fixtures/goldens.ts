import fs from 'fs';
import path from 'path';
import { CasePackSchema, DebriefHandoff, EngineEvent, TranscriptTurn } from '@freshcase/types';

// Committed golden transcripts: one strong-candidate and one weak-candidate
// scripted SaveRite session, with event logs whose timings are hand-chosen.

export const saverite = CasePackSchema.parse(
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../fixtures/saverite.json'), 'utf-8'),
  ),
);

const T0 = 1_700_000_000_000;
const at = (s: number) => T0 + s * 1000;

function turns(script: [number, 'candidate' | 'interviewer', string][]): {
  transcript: TranscriptTurn[];
  events: EngineEvent[];
} {
  const transcript = script.map(([s, speaker, text]) => ({ speaker, text, timestamp: at(s) }));
  const events = script.map(
    ([s, speaker, text]): EngineEvent => ({
      type: speaker === 'candidate' ? 'candidate_turn' : 'interviewer_turn',
      text,
      timestamp: at(s),
    }),
  );
  return { transcript, events };
}

export function strongHandoff(): DebriefHandoff {
  const { transcript, events: turnEvents } = turns([
    [10, 'interviewer', saverite.prompt.spoken],
    [40, 'candidate', 'So to make sure I have this right: SaveRite is a national grocery retailer with flat profits despite growing revenue, and we need to find the source and fix it.'],
    [55, 'candidate', 'Before I structure — are competitors experiencing the same profitability problem?'],
    [60, 'interviewer', saverite.clarifying_ledger[2].answer],
    [70, 'candidate', 'Can I take a minute to structure my thoughts?'],
    [165, 'candidate', 'My framework: profit is revenue minus cost. Revenue is growing, so I suspect costs. On revenue: product mix and foot traffic. On costs: fixed like rent, and variable — COGS through the supply chain and labor. Given revenue grows while profit is flat, my hypothesis is a variable cost problem.'],
    [200, 'interviewer', saverite.quant_module.setup_spoken],
    [290, 'candidate', 'Revenue grows about five percent a year, but COGS grows twenty percent a year — four times faster than everything else. EBITDA is flat at about 165 million. So the profit plateau is a COGS problem, not a revenue problem.'],
    [310, 'candidate', 'What is inside COGS — which categories or components drive it?'],
    [325, 'interviewer', saverite.quant_module.followup_data_drop.spoken],
    [360, 'candidate', 'So it localizes to supplier purchase price in dry commodities. If competitors share the same suppliers, why are they not affected?'],
    [370, 'interviewer', saverite.hidden_insight.kicker.spoken],
    [420, 'candidate', 'My recommendation: shift dry commodities toward private brand to escape the supplier squeeze, renegotiating national-brand contracts in parallel. Risks: customer perception of private label and execution capability — mitigate with a pilot in a subset of stores and willingness-to-pay research. Next steps: size the margin uplift and identify private-label manufacturing partners.'],
  ]);

  const events: EngineEvent[] = [
    { type: 'phase_transition', from: 'menu', to: 'prompt', timestamp: at(5) },
    { type: 'phase_transition', from: 'prompt', to: 'clarifying', timestamp: at(45) },
    { type: 'ledger_release', entry_index: 2, answer: saverite.clarifying_ledger[2].answer, timestamp: at(60) },
    { type: 'thinking_time_granted', seconds: 90, timestamp: at(72) },
    { type: 'phase_transition', from: 'clarifying', to: 'structure', timestamp: at(160) },
    { type: 'phase_transition', from: 'structure', to: 'quant', timestamp: at(195) },
    { type: 'math_verdict', verdict: 'correct', timestamp: at(295) },
    { type: 'phase_transition', from: 'quant', to: 'recommendation', timestamp: at(400) },
    { type: 'phase_transition', from: 'recommendation', to: 'debrief', timestamp: at(430) },
    ...turnEvents,
  ];
  events.sort((a, b) => a.timestamp - b.timestamp);

  return { session_id: 'golden-strong', mode: 'realistic', case_pack: saverite, transcript, events };
}

export function weakHandoff(): DebriefHandoff {
  const { transcript, events: turnEvents } = turns([
    [10, 'interviewer', saverite.prompt.spoken],
    [30, 'candidate', 'Okay. Um, I would look at internal and external factors.'],
    [140, 'candidate', 'So internal would be like the company stuff, and external is the market and competitors and everything else out there.'],
    [170, 'interviewer', saverite.quant_module.setup_spoken],
    [400, 'candidate', 'So revenue went up... costs also went up. EBITDA is maybe around 180 million?'],
    [420, 'interviewer', 'Walk me through that calculation again.'],
    [500, 'candidate', 'Hmm, I get 190 this time.'],
    [510, 'interviewer', 'The figure is 165 million, flat across all three years — revenue grows five percent but COGS grows twenty. Let us move on.'],
    [560, 'candidate', 'So costs are up. I guess they should cut costs somehow. Maybe negotiate with suppliers.'],
  ]);

  const events: EngineEvent[] = [
    { type: 'phase_transition', from: 'menu', to: 'prompt', timestamp: at(5) },
    { type: 'phase_transition', from: 'prompt', to: 'clarifying', timestamp: at(25) },
    { type: 'phase_transition', from: 'clarifying', to: 'structure', timestamp: at(135) },
    { type: 'silence_crossing', phase: 'structure', seconds: 35, timestamp: at(100) },
    { type: 'silence_crossing', phase: 'structure', seconds: 40, timestamp: at(130) },
    { type: 'phase_transition', from: 'structure', to: 'quant', timestamp: at(165) },
    { type: 'silence_crossing', phase: 'quant', seconds: 45, timestamp: at(250) },
    { type: 'silence_crossing', phase: 'quant', seconds: 50, timestamp: at(320) },
    { type: 'hint_given', level: 1, timestamp: at(330) },
    { type: 'math_verdict', verdict: 'probe', timestamp: at(405) },
    { type: 'math_verdict', verdict: 'reveal', correct_figure: '165 / 165.5 / 165 — flat', timestamp: at(505) },
    { type: 'phase_transition', from: 'quant', to: 'recommendation', timestamp: at(540) },
    { type: 'phase_transition', from: 'recommendation', to: 'debrief', timestamp: at(590) },
    ...turnEvents,
  ];
  events.sort((a, b) => a.timestamp - b.timestamp);

  return { session_id: 'golden-weak', mode: 'realistic', case_pack: saverite, transcript, events };
}
