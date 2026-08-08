import { CasePackSchema } from '../src/casePack';
import fs from 'fs';
import path from 'path';

const fixturePath = path.join(__dirname, '../../../fixtures/saverite.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

describe('CasePack schema', () => {
  test('parses the SaveRite fixture', () => {
    expect(() => CasePackSchema.parse(fixture)).not.toThrow();
  });

  test('fails if brainstorm_module is missing', () => {
    const { brainstorm_module: _, ...incomplete } = fixture;
    expect(() => CasePackSchema.parse(incomplete)).toThrow();
  });
});
