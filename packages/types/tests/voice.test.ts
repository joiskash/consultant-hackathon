import { PhaseBriefSchema } from '../src/voice';

test('PhaseBrief requires phase + spoken guidance fields', () => {
  const ok = PhaseBriefSchema.safeParse({
    phase: 'structure', may_say: ['Take a moment to structure.'],
    must_withhold: ['segment revenue split'], coaching_policy: 'no mid-case feedback',
    time_guidance: 'structure is running long — offer to move on',
  });
  expect(ok.success).toBe(true);
  expect(PhaseBriefSchema.safeParse({ phase: 'not_a_phase' }).success).toBe(false);
});
