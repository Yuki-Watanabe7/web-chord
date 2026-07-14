import { NOTE_NAMES } from './types';
import type { NoteName, SongKey, SongKeyMode } from './types';

/**
 * Internal pitch representation, independent of display spelling.
 * `NoteName` (e.g. "C#") stays the storage/display type for backward
 * compatibility; `PitchClass` is the normalized value used for comparisons
 * such as enharmonic equivalence (C# === D♭).
 */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export const PITCH_CLASS_COUNT = 12;

export const normalizePitchClass = (value: number): PitchClass =>
  (((Math.round(value) % PITCH_CLASS_COUNT) + PITCH_CLASS_COUNT) %
    PITCH_CLASS_COUNT) as PitchClass;

/** `NoteName` uses the same sharp-spelled ordering as `PitchClass`, so this is a direct lookup. */
export const noteNameToPitchClass = (note: NoteName): PitchClass =>
  NOTE_NAMES.indexOf(note) as PitchClass;

/** Canonical (sharp-spelled) display name for a pitch class. */
export const pitchClassToNoteName = (pitchClass: PitchClass): NoteName =>
  NOTE_NAMES[normalizePitchClass(pitchClass)];

type AccidentalPreference = 'sharp' | 'flat';
type NoteLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

interface KeySpelling {
  tonic: string;
  accidentalPreference: AccidentalPreference;
}

const FLAT_ALIAS_BY_PITCH_CLASS: Partial<Record<PitchClass, string>> = {
  1: 'D♭',
  3: 'E♭',
  6: 'G♭',
  8: 'A♭',
  10: 'B♭',
};

const SHARP_DISPLAY_BY_PITCH_CLASS: Record<PitchClass, string> = {
  0: 'C',
  1: 'C♯',
  2: 'D',
  3: 'D♯',
  4: 'E',
  5: 'F',
  6: 'F♯',
  7: 'G',
  8: 'G♯',
  9: 'A',
  10: 'A♯',
  11: 'B',
};

const FLAT_DISPLAY_BY_PITCH_CLASS: Record<PitchClass, string> = {
  0: 'C',
  1: 'D♭',
  2: 'D',
  3: 'E♭',
  4: 'E',
  5: 'F',
  6: 'G♭',
  7: 'G',
  8: 'A♭',
  9: 'A',
  10: 'B♭',
  11: 'B',
};

const KEY_SPELLINGS: Record<SongKeyMode, Record<NoteName, KeySpelling>> = {
  major: {
    C: { tonic: 'C', accidentalPreference: 'sharp' },
    'C#': { tonic: 'D♭', accidentalPreference: 'flat' },
    D: { tonic: 'D', accidentalPreference: 'sharp' },
    'D#': { tonic: 'E♭', accidentalPreference: 'flat' },
    E: { tonic: 'E', accidentalPreference: 'sharp' },
    F: { tonic: 'F', accidentalPreference: 'flat' },
    'F#': { tonic: 'F♯', accidentalPreference: 'sharp' },
    G: { tonic: 'G', accidentalPreference: 'sharp' },
    'G#': { tonic: 'A♭', accidentalPreference: 'flat' },
    A: { tonic: 'A', accidentalPreference: 'sharp' },
    'A#': { tonic: 'B♭', accidentalPreference: 'flat' },
    B: { tonic: 'B', accidentalPreference: 'sharp' },
  },
  minor: {
    C: { tonic: 'C', accidentalPreference: 'flat' },
    'C#': { tonic: 'C♯', accidentalPreference: 'sharp' },
    D: { tonic: 'D', accidentalPreference: 'flat' },
    'D#': { tonic: 'D♯', accidentalPreference: 'sharp' },
    E: { tonic: 'E', accidentalPreference: 'sharp' },
    F: { tonic: 'F', accidentalPreference: 'flat' },
    'F#': { tonic: 'F♯', accidentalPreference: 'sharp' },
    G: { tonic: 'G', accidentalPreference: 'flat' },
    'G#': { tonic: 'G♯', accidentalPreference: 'sharp' },
    A: { tonic: 'A', accidentalPreference: 'sharp' },
    'A#': { tonic: 'B♭', accidentalPreference: 'flat' },
    B: { tonic: 'B', accidentalPreference: 'sharp' },
  },
};

const NOTE_LETTERS: readonly NoteLetter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const MAJOR_SCALE_DEGREE_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE_DEGREE_SEMITONES: readonly number[] = [0, 2, 3, 5, 7, 8, 10];

/** All display spellings (sharp + flat) accepted for a pitch class, canonical name first. */
export const getEnharmonicNoteNames = (pitchClass: PitchClass): string[] => {
  const normalized = normalizePitchClass(pitchClass);
  const canonical = pitchClassToNoteName(normalized);
  const flatAlias = FLAT_ALIAS_BY_PITCH_CLASS[normalized];

  return flatAlias ? [canonical, flatAlias] : [canonical];
};

const NATURAL_PITCH_CLASS_BY_LETTER: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const getScaleDegreeSemitones = (mode: SongKeyMode) =>
  mode === 'minor' ? NATURAL_MINOR_SCALE_DEGREE_SEMITONES : MAJOR_SCALE_DEGREE_SEMITONES;

const getLetterAtDegree = (tonicLetter: NoteLetter, degreeIndex: number): NoteLetter => {
  const tonicIndex = NOTE_LETTERS.indexOf(tonicLetter);

  return NOTE_LETTERS[(tonicIndex + degreeIndex) % NOTE_LETTERS.length];
};

const parseDisplayTonicLetter = (tonic: string): NoteLetter => tonic[0] as NoteLetter;

const spellPitchClassWithLetter = (pitchClass: PitchClass, letter: NoteLetter): string => {
  const naturalPitchClass = NATURAL_PITCH_CLASS_BY_LETTER[letter];
  const accidentalOffset = normalizePitchClass(pitchClass - naturalPitchClass);

  if (accidentalOffset === 0) {
    return letter;
  }

  if (accidentalOffset === 1) {
    return `${letter}♯`;
  }

  if (accidentalOffset === 11) {
    return `${letter}♭`;
  }

  return SHARP_DISPLAY_BY_PITCH_CLASS[pitchClass];
};

const getKeySpelling = (tonic: NoteName, mode: SongKeyMode): KeySpelling =>
  KEY_SPELLINGS[mode][tonic];

export const formatKeyTonicName = (tonic: NoteName, mode: SongKeyMode): string =>
  getKeySpelling(tonic, mode).tonic;

export const getDiatonicPitchClassSpellings = (key: SongKey): string[] => {
  const tonicPitchClass = noteNameToPitchClass(key.tonic);
  const tonicLetter = parseDisplayTonicLetter(formatKeyTonicName(key.tonic, key.mode));

  return getScaleDegreeSemitones(key.mode).map((semitones, degreeIndex) => {
    const pitchClass = normalizePitchClass(tonicPitchClass + semitones);
    const letter = getLetterAtDegree(tonicLetter, degreeIndex);

    return spellPitchClassWithLetter(pitchClass, letter);
  });
};

export const spellPitchClassInKey = (pitchClass: number, key: SongKey): string => {
  const normalizedPitchClass = normalizePitchClass(pitchClass);
  const tonicPitchClass = noteNameToPitchClass(key.tonic);
  const scaleDegreeSemitones = getScaleDegreeSemitones(key.mode);
  const scaleDegreeIndex = scaleDegreeSemitones.indexOf(
    normalizePitchClass(normalizedPitchClass - tonicPitchClass),
  );

  if (scaleDegreeIndex !== -1) {
    return getDiatonicPitchClassSpellings(key)[scaleDegreeIndex];
  }

  const { accidentalPreference } = getKeySpelling(key.tonic, key.mode);

  return accidentalPreference === 'flat'
    ? FLAT_DISPLAY_BY_PITCH_CLASS[normalizedPitchClass]
    : SHARP_DISPLAY_BY_PITCH_CLASS[normalizedPitchClass];
};

export const formatNoteNameInKey = (note: NoteName, key: SongKey): string =>
  spellPitchClassInKey(noteNameToPitchClass(note), key);

const LEADING_NOTE_NAME_PATTERN = /^([A-Ga-g])([#♯]|[b♭])?/;

/**
 * Extracts a leading note name (e.g. "D♭", "C#", "Bb") from free-form text and
 * returns its pitch class plus whatever text follows it. Lets callers such as
 * chord search normalize an enharmonic root spelling (Db -> C#) while keeping
 * a trailing quality shorthand (e.g. "maj7") intact. Returns null when the
 * text doesn't start with a recognizable note name.
 */
export const extractLeadingNoteName = (
  value: string,
): { pitchClass: PitchClass; rest: string } | null => {
  const match = LEADING_NOTE_NAME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [fullMatch, letter, accidental] = match;
  const naturalPitchClass = NATURAL_PITCH_CLASS_BY_LETTER[letter.toUpperCase()];

  const pitchClass =
    accidental === '#' || accidental === '♯'
      ? normalizePitchClass(naturalPitchClass + 1)
      : accidental === 'b' || accidental === '♭'
        ? normalizePitchClass(naturalPitchClass - 1)
        : normalizePitchClass(naturalPitchClass);

  return { pitchClass, rest: value.slice(fullMatch.length) };
};

/**
 * Parses free-form note-name text ("C#", "D♭", "Db", "c") into a pitch class.
 * Accepts both sharp and flat spellings so callers can treat enharmonic
 * equivalents (e.g. C# and D♭) as the same pitch. Returns null for anything
 * that isn't a recognizable note name.
 */
export const parseNoteNameToPitchClass = (value: string): PitchClass | null => {
  const extracted = extractLeadingNoteName(value.trim());

  return extracted && extracted.rest === '' ? extracted.pitchClass : null;
};

/** True when two note-name strings refer to the same pitch class (e.g. "C#" and "D♭"). */
export const areEnharmonicallyEquivalent = (a: string, b: string): boolean => {
  const pitchClassA = parseNoteNameToPitchClass(a);
  const pitchClassB = parseNoteNameToPitchClass(b);

  return pitchClassA !== null && pitchClassB !== null && pitchClassA === pitchClassB;
};

/**
 * Converts a validated legacy `NoteName` (the type stored on `ChordEvent`/`MelodyNote`)
 * into the internal pitch-class representation. Kept distinct from
 * `parseNoteNameToPitchClass` because the input here is already known to be a
 * valid `NoteName`, not free-form text.
 */
export const legacyNoteNameToPitchClass = (note: NoteName): PitchClass => noteNameToPitchClass(note);
