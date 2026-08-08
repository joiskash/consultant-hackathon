import { score, scorecardMarkdown } from '../../src';
import { strongHandoff, weakHandoff } from '../fixtures/goldens';

// Golden-transcript acceptance runs against the real LLM. Skipped unless
// OPENROUTER_API_KEY is configured.
const maybe = process.env.OPENROUTER_API_KEY ? describe : describe.skip;

maybe('golden transcripts (live LLM)', () => {
  jest.setTimeout(180000);

  test('strong candidate yields >= 3 strength bands', async () => {
    const result = await score(strongHandoff());
    expect(result.scorecard.dimensions).toHaveLength(5);
    const strengths = result.scorecard.dimensions.filter((d) => d.band === 'strength');
    expect(strengths.length).toBeGreaterThanOrEqual(3);
    console.log(scorecardMarkdown(result, strongHandoff()));
    console.log('--- spoken debrief ---\n' + result.spoken_debrief);
  });

  test('weak candidate: every needs_work gap carries a drill', async () => {
    const handoff = weakHandoff();
    const result = await score(handoff);
    expect(result.scorecard.dimensions).toHaveLength(5);
    const needsWork = result.scorecard.dimensions.filter((d) => d.band === 'needs_work');
    expect(needsWork.length).toBeGreaterThanOrEqual(1);
    for (const dim of needsWork) {
      for (const finding of dim.findings) {
        if (finding.answer !== 'yes') expect((finding.drill ?? '').trim()).not.toBe('');
      }
    }
    console.log('--- weak spoken debrief ---\n' + result.spoken_debrief);
  });
});
