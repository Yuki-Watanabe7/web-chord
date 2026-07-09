import { transposeNoteName } from './timeline';
import type { ChordQuality, NoteName, SongKey } from './types';

export interface ChordProgressionTemplate {
  id: string;
  name: string;
  description: string;
  /** Roman-numeral degrees relative to the song's tonic, e.g. ['I', 'V', 'vi', 'IV']. */
  degrees: string[];
}

export interface ResolvedTemplateChord {
  root: NoteName;
  quality: ChordQuality;
}

// Semitone offset of each scale degree above the tonic. Roman-numeral
// analysis positions a degree using the major scale regardless of the song's
// mode; the numeral's case/suffix (handled in parseRomanNumeral) carries the
// chord quality, so e.g. "vi" in a minor-key song still resolves relative to
// the major-scale 6th above the tonic.
const DEGREE_SEMITONES: Record<number, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
};

// Ordered longest-numeral-first so e.g. "III" is matched before "II" or "I".
const NUMERAL_DEGREES: ReadonlyArray<{ numeral: string; degree: number }> = [
  { numeral: 'VII', degree: 7 },
  { numeral: 'III', degree: 3 },
  { numeral: 'VI', degree: 6 },
  { numeral: 'IV', degree: 4 },
  { numeral: 'II', degree: 2 },
  { numeral: 'V', degree: 5 },
  { numeral: 'I', degree: 1 },
];

export interface ParsedRomanNumeral {
  degree: number;
  quality: ChordQuality;
}

/**
 * Parses a roman numeral degree (e.g. "I", "vi", "vii°") into a scale degree
 * and chord quality. Case indicates the default triad (uppercase = major,
 * lowercase = minor); a trailing "°"/"o"/"dim" or "+"/"aug" overrides it to
 * diminished/augmented.
 */
export const parseRomanNumeral = (roman: string): ParsedRomanNumeral => {
  const trimmed = roman.trim();
  const upper = trimmed.toUpperCase();
  const match = NUMERAL_DEGREES.find(({ numeral }) => upper.startsWith(numeral));

  if (!match) {
    throw new Error(`Unknown roman numeral: ${roman}`);
  }

  const base = trimmed.slice(0, match.numeral.length);
  const suffix = trimmed.slice(match.numeral.length).toLowerCase();
  const isLowercase = base === base.toLowerCase() && base !== base.toUpperCase();

  let quality: ChordQuality = isLowercase ? 'minor' : 'major';

  if (suffix === '' || suffix === 'maj') {
    quality = isLowercase ? 'minor' : 'major';
  } else if (suffix === '°' || suffix === 'o' || suffix === 'dim') {
    quality = 'diminished';
  } else if (suffix === '+' || suffix === 'aug') {
    quality = 'augmented';
  } else {
    throw new Error(`Unknown roman numeral: ${roman}`);
  }

  return { degree: match.degree, quality };
};

export const resolveRomanNumeralChord = (
  roman: string,
  tonic: NoteName,
): ResolvedTemplateChord => {
  const { degree, quality } = parseRomanNumeral(roman);

  return {
    root: transposeNoteName(tonic, DEGREE_SEMITONES[degree]),
    quality,
  };
};

/** Expands a template's roman-numeral degrees into concrete chords for the given key's tonic. */
export const resolveChordProgressionTemplate = (
  template: ChordProgressionTemplate,
  key: Pick<SongKey, 'tonic'>,
): ResolvedTemplateChord[] =>
  template.degrees.map((roman) => resolveRomanNumeralChord(roman, key.tonic));

export const CHORD_PROGRESSION_TEMPLATES: ChordProgressionTemplate[] = [
  {
    id: 'royal-road',
    name: '王道進行',
    description: 'J-POPで多用される定番進行。切なさと爽やかさを併せ持つ。',
    degrees: ['IV', 'V', 'iii', 'vi'],
  },
  {
    id: 'canon',
    name: 'カノン進行',
    description: 'パッヘルベルの「カノン」に由来する、壮大で安定感のある進行。',
    degrees: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'],
  },
  {
    id: '1564',
    name: '1564進行',
    description: '洋楽ポップスの定番進行。明るく前向きな響き。',
    degrees: ['I', 'V', 'vi', 'IV'],
  },
  {
    id: '6415',
    name: '6415進行',
    description: '切なさから始まり安心感で終わる、バラードでも人気の進行。',
    degrees: ['vi', 'IV', 'I', 'V'],
  },
  {
    id: '251',
    name: '251進行',
    description: 'ジャズで頻出するII-V-Iの定番進行。',
    degrees: ['ii', 'V', 'I'],
  },
];
