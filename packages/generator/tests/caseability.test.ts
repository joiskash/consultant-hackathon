import fs from 'fs';
import path from 'path';
import { scoreHeadline } from '../src/caseability';
import { loadConfig } from '../src/config';
import { NaicsCode, SearchResult } from '../src/contextClient';

interface HeadlineFixture {
  result: SearchResult;
  naics: NaicsCode[];
  expected_score: number;
}

const fixtures: HeadlineFixture[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/headlines.json'), 'utf-8'),
);

const config = loadConfig();

describe('case-ability scorer (Stage 2)', () => {
  test.each(fixtures.map((f) => [f.result.title, f]))(
    'scores "%s" as expected',
    (_title, fixture) => {
      const { score } = scoreHeadline(
        (fixture as HeadlineFixture).result,
        config.caseTriggers,
        config.industryWhitelist,
        (fixture as HeadlineFixture).naics,
      );
      expect(score.score).toBe((fixture as HeadlineFixture).expected_score);
    },
  );

  test('a perfect story hits all five criteria', () => {
    const perfect = fixtures.find((f) => f.expected_score === 5)!;
    const { score } = scoreHeadline(
      perfect.result,
      config.caseTriggers,
      config.industryWhitelist,
      perfect.naics,
    );
    expect(Object.values(score.criteria).every(Boolean)).toBe(true);
  });
});
