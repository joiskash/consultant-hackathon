import { DebriefHandoff, EngineEvent, Phase, VoiceMetrics } from '@freshcase/types';

// Stage 1 — deterministic metrics. Pure functions over the event log; computed
// BEFORE any LLM call and passed in as ground truth the LLM may interpret but
// never restate differently.

type EventOf<T extends EngineEvent['type']> = Extract<EngineEvent, { type: T }>;

function transitions(events: EngineEvent[]): EventOf<'phase_transition'>[] {
  return events.filter((e): e is EventOf<'phase_transition'> => e.type === 'phase_transition');
}

// prompt-end -> candidate's structure presentation start.
export function timeToFramework(events: EngineEvent[]): number {
  const promptEnd = transitions(events).find((e) => e.from === 'prompt');
  const structureStart = transitions(events).find((e) => e.to === 'structure');
  if (!promptEnd || !structureStart) return 0;
  return Math.max(0, (structureStart.timestamp - promptEnd.timestamp) / 1000);
}

export function silenceProfile(events: EngineEvent[]): VoiceMetrics['unannounced_silence'] {
  const profile: Partial<Record<Phase, { count: number; total_duration_seconds: number }>> = {};
  for (const e of events) {
    if (e.type !== 'silence_crossing') continue;
    const entry = profile[e.phase] ?? { count: 0, total_duration_seconds: 0 };
    entry.count += 1;
    entry.total_duration_seconds += e.seconds;
    profile[e.phase] = entry;
  }
  return profile;
}

// Word counts as a duration proxy (transcript carries no per-turn durations):
// candidate words / total words, 0..1.
export function talkTimeRatio(handoff: DebriefHandoff): number {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  let candidate = 0;
  let interviewer = 0;
  for (const turn of handoff.transcript) {
    if (turn.speaker === 'candidate') candidate += words(turn.text);
    else interviewer += words(turn.text);
  }
  const total = candidate + interviewer;
  return total === 0 ? 0 : candidate / total;
}

// Quant data-drop end (entering quant) -> first correct verdict.
export function calcElapsed(events: EngineEvent[]): number {
  const quantStart = transitions(events).find((e) => e.to === 'quant');
  const firstCorrect = events.find(
    (e): e is EventOf<'math_verdict'> => e.type === 'math_verdict' && e.verdict === 'correct',
  );
  if (!quantStart || !firstCorrect) return 0;
  return Math.max(0, (firstCorrect.timestamp - quantStart.timestamp) / 1000);
}

export function hintsConsumed(events: EngineEvent[]): VoiceMetrics['hints_consumed'] {
  const hints = events.filter((e): e is EventOf<'hint_given'> => e.type === 'hint_given');
  return {
    count: hints.length,
    max_level: hints.reduce((max, h) => Math.max(max, h.level), 0),
  };
}

// Layer 1 = localized the anomaly (correct math verdict); layer 2 = the
// follow-up data drop was delivered (its spoken text appears in an interviewer
// turn); the kicker landing counts as the full layer list. Capped at the
// pack's layer count.
export function insightLayersReached(handoff: DebriefHandoff): number {
  const layerCount = handoff.case_pack.hidden_insight.layers.length;
  const interviewerText = handoff.transcript
    .filter((t) => t.speaker === 'interviewer')
    .map((t) => t.text)
    .join('\n');
  let reached = 0;
  if (handoff.events.some((e) => e.type === 'math_verdict' && e.verdict === 'correct')) {
    reached = 1;
  }
  if (interviewerText.includes(handoff.case_pack.quant_module.followup_data_drop.spoken)) {
    reached = Math.max(reached, 2);
  }
  if (interviewerText.includes(handoff.case_pack.hidden_insight.kicker.spoken)) {
    reached = layerCount;
  }
  return Math.min(reached, layerCount);
}

// Verdict sequence; a correct that follows a probe is marked recovered — a
// positive signal, surfaced as such.
export function mathRecord(events: EngineEvent[]): VoiceMetrics['math_record'] {
  const verdicts = events.filter(
    (e): e is EventOf<'math_verdict'> => e.type === 'math_verdict',
  );
  let probePending = false;
  return verdicts.map((v) => {
    const entry: VoiceMetrics['math_record'][number] =
      v.verdict === 'correct' && probePending
        ? { verdict: v.verdict, recovered: true }
        : { verdict: v.verdict };
    if (v.verdict === 'probe') probePending = true;
    else if (v.verdict === 'correct') probePending = false;
    return entry;
  });
}

export function computeMetrics(handoff: DebriefHandoff): VoiceMetrics {
  const announced = handoff.events
    .filter((e): e is EventOf<'thinking_time_granted'> => e.type === 'thinking_time_granted')
    .reduce((sum, e) => sum + e.seconds, 0);

  return {
    time_to_framework_seconds: timeToFramework(handoff.events),
    unannounced_silence: silenceProfile(handoff.events),
    announced_thinking_time_seconds: announced,
    talk_time_ratio: talkTimeRatio(handoff),
    calc_elapsed_seconds: calcElapsed(handoff.events),
    hints_consumed: hintsConsumed(handoff.events),
    insight_layers_reached: insightLayersReached(handoff),
    math_record: mathRecord(handoff.events),
  };
}
