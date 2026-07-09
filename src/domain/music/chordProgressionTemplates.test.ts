import { describe, expect, it } from 'vitest';
import {
  CHORD_PROGRESSION_TEMPLATES,
  parseRomanNumeral,
  resolveChordProgressionTemplate,
  resolveRomanNumeralChord,
} from './chordProgressionTemplates';

describe('parseRomanNumeral', () => {
  it('maps uppercase numerals to major triads and lowercase to minor', () => {
    expect(parseRomanNumeral('I')).toEqual({ degree: 1, quality: 'major' });
    expect(parseRomanNumeral('IV')).toEqual({ degree: 4, quality: 'major' });
    expect(parseRomanNumeral('V')).toEqual({ degree: 5, quality: 'major' });
    expect(parseRomanNumeral('ii')).toEqual({ degree: 2, quality: 'minor' });
    expect(parseRomanNumeral('iii')).toEqual({ degree: 3, quality: 'minor' });
    expect(parseRomanNumeral('vi')).toEqual({ degree: 6, quality: 'minor' });
  });

  it('does not let a shorter numeral prefix-match a longer one', () => {
    expect(parseRomanNumeral('III')).toEqual({ degree: 3, quality: 'major' });
    expect(parseRomanNumeral('VII')).toEqual({ degree: 7, quality: 'major' });
  });

  it('overrides the default triad quality via a diminished/augmented suffix', () => {
    expect(parseRomanNumeral('vii°')).toEqual({ degree: 7, quality: 'diminished' });
    expect(parseRomanNumeral('iidim')).toEqual({ degree: 2, quality: 'diminished' });
    expect(parseRomanNumeral('III+')).toEqual({ degree: 3, quality: 'augmented' });
  });

  it('throws for an unrecognized numeral', () => {
    expect(() => parseRomanNumeral('IX')).toThrow();
  });
});

describe('resolveRomanNumeralChord', () => {
  it('resolves each diatonic degree relative to a C tonic', () => {
    expect(resolveRomanNumeralChord('I', 'C')).toEqual({ root: 'C', quality: 'major' });
    expect(resolveRomanNumeralChord('ii', 'C')).toEqual({ root: 'D', quality: 'minor' });
    expect(resolveRomanNumeralChord('iii', 'C')).toEqual({ root: 'E', quality: 'minor' });
    expect(resolveRomanNumeralChord('IV', 'C')).toEqual({ root: 'F', quality: 'major' });
    expect(resolveRomanNumeralChord('V', 'C')).toEqual({ root: 'G', quality: 'major' });
    expect(resolveRomanNumeralChord('vi', 'C')).toEqual({ root: 'A', quality: 'minor' });
  });

  it('transposes to a different tonic', () => {
    expect(resolveRomanNumeralChord('I', 'G')).toEqual({ root: 'G', quality: 'major' });
    expect(resolveRomanNumeralChord('V', 'G')).toEqual({ root: 'D', quality: 'major' });
    expect(resolveRomanNumeralChord('vi', 'G')).toEqual({ root: 'E', quality: 'minor' });
    expect(resolveRomanNumeralChord('IV', 'G')).toEqual({ root: 'C', quality: 'major' });
  });
});

describe('resolveChordProgressionTemplate', () => {
  it('expands the 1564 template in C major', () => {
    const template = CHORD_PROGRESSION_TEMPLATES.find((candidate) => candidate.id === '1564')!;

    expect(resolveChordProgressionTemplate(template, { tonic: 'C' })).toEqual([
      { root: 'C', quality: 'major' },
      { root: 'G', quality: 'major' },
      { root: 'A', quality: 'minor' },
      { root: 'F', quality: 'major' },
    ]);
  });

  it('expands the same template transposed into G', () => {
    const template = CHORD_PROGRESSION_TEMPLATES.find((candidate) => candidate.id === '1564')!;

    expect(resolveChordProgressionTemplate(template, { tonic: 'G' })).toEqual([
      { root: 'G', quality: 'major' },
      { root: 'D', quality: 'major' },
      { root: 'E', quality: 'minor' },
      { root: 'C', quality: 'major' },
    ]);
  });

  it('expands the 251 template in C major', () => {
    const template = CHORD_PROGRESSION_TEMPLATES.find((candidate) => candidate.id === '251')!;

    expect(resolveChordProgressionTemplate(template, { tonic: 'C' })).toEqual([
      { root: 'D', quality: 'minor' },
      { root: 'G', quality: 'major' },
      { root: 'C', quality: 'major' },
    ]);
  });

  it('ships at least five initial templates, each with a name, description and degrees', () => {
    expect(CHORD_PROGRESSION_TEMPLATES.length).toBeGreaterThanOrEqual(5);

    CHORD_PROGRESSION_TEMPLATES.forEach((template) => {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.degrees.length).toBeGreaterThan(0);
    });
  });
});
