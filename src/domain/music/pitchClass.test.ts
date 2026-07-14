import { describe, expect, it } from 'vitest';
import { NOTE_NAMES } from './types';
import {
  areEnharmonicallyEquivalent,
  extractLeadingNoteName,
  formatKeyTonicName,
  formatNoteNameInKey,
  getDiatonicPitchClassSpellings,
  getEnharmonicNoteNames,
  legacyNoteNameToPitchClass,
  noteNameToPitchClass,
  normalizePitchClass,
  parseNoteNameToPitchClass,
  pitchClassToNoteName,
  spellPitchClassInKey,
} from './pitchClass';

describe('noteNameToPitchClass / pitchClassToNoteName', () => {
  it('maps every canonical NoteName to its NOTE_NAMES index and back', () => {
    NOTE_NAMES.forEach((note, index) => {
      expect(noteNameToPitchClass(note)).toBe(index);
      expect(pitchClassToNoteName(noteNameToPitchClass(note))).toBe(note);
    });
  });
});

describe('normalizePitchClass', () => {
  it('wraps values into the 0-11 range', () => {
    expect(normalizePitchClass(12)).toBe(0);
    expect(normalizePitchClass(13)).toBe(1);
    expect(normalizePitchClass(-1)).toBe(11);
    expect(normalizePitchClass(-13)).toBe(11);
    expect(normalizePitchClass(0)).toBe(0);
  });
});

describe('parseNoteNameToPitchClass', () => {
  it('parses sharp, flat, and natural spellings', () => {
    expect(parseNoteNameToPitchClass('C')).toBe(0);
    expect(parseNoteNameToPitchClass('C#')).toBe(1);
    expect(parseNoteNameToPitchClass('C♯')).toBe(1);
    expect(parseNoteNameToPitchClass('D♭')).toBe(1);
    expect(parseNoteNameToPitchClass('Db')).toBe(1);
    expect(parseNoteNameToPitchClass('B')).toBe(11);
    expect(parseNoteNameToPitchClass('Cb')).toBe(11);
  });

  it('is case-insensitive', () => {
    expect(parseNoteNameToPitchClass('c#')).toBe(1);
    expect(parseNoteNameToPitchClass('db')).toBe(1);
  });

  it('returns null for unrecognized text', () => {
    expect(parseNoteNameToPitchClass('')).toBeNull();
    expect(parseNoteNameToPitchClass('H')).toBeNull();
    expect(parseNoteNameToPitchClass('C##')).toBeNull();
    expect(parseNoteNameToPitchClass('not a note')).toBeNull();
  });
});

describe('areEnharmonicallyEquivalent', () => {
  it('treats C# and D♭ as the same pitch class', () => {
    expect(areEnharmonicallyEquivalent('C#', 'D♭')).toBe(true);
    expect(areEnharmonicallyEquivalent('C#', 'Db')).toBe(true);
  });

  it('rejects differing pitch classes', () => {
    expect(areEnharmonicallyEquivalent('C', 'D')).toBe(false);
  });

  it('returns false when either side fails to parse', () => {
    expect(areEnharmonicallyEquivalent('C#', 'nope')).toBe(false);
  });
});

describe('getEnharmonicNoteNames', () => {
  it('returns the canonical sharp name plus a flat alias for black keys', () => {
    expect(getEnharmonicNoteNames(1)).toEqual(['C#', 'D♭']);
  });

  it('returns only the natural name for white keys', () => {
    expect(getEnharmonicNoteNames(0)).toEqual(['C']);
  });
});

describe('extractLeadingNoteName', () => {
  it('extracts the leading note name and keeps the remaining text', () => {
    expect(extractLeadingNoteName('Dbmaj7')).toEqual({ pitchClass: 1, rest: 'maj7' });
    expect(extractLeadingNoteName('D♭maj7')).toEqual({ pitchClass: 1, rest: 'maj7' });
    expect(extractLeadingNoteName('C#maj7')).toEqual({ pitchClass: 1, rest: 'maj7' });
    expect(extractLeadingNoteName('C')).toEqual({ pitchClass: 0, rest: '' });
  });

  it('returns null when the text does not start with a note name', () => {
    expect(extractLeadingNoteName('')).toBeNull();
    expect(extractLeadingNoteName('not a note')).toBeNull();
  });
});

describe('legacyNoteNameToPitchClass', () => {
  it('converts a stored NoteName the same way as noteNameToPitchClass', () => {
    NOTE_NAMES.forEach((note) => {
      expect(legacyNoteNameToPitchClass(note)).toBe(noteNameToPitchClass(note));
    });
  });
});

describe('spellPitchClassInKey', () => {
  it('spells the F minor scale with natural flat names', () => {
    const key = { tonic: 'F', mode: 'minor' } as const;

    expect(getDiatonicPitchClassSpellings(key)).toEqual([
      'F',
      'G',
      'A♭',
      'B♭',
      'C',
      'D♭',
      'E♭',
    ]);
    expect(spellPitchClassInKey(10, key)).toBe('B♭');
    expect(spellPitchClassInKey(1, key)).toBe('D♭');
    expect(spellPitchClassInKey(3, key)).toBe('E♭');
    expect(spellPitchClassInKey(8, key)).toBe('A♭');
  });

  it('uses sharp spellings for representative sharp-side keys', () => {
    expect(getDiatonicPitchClassSpellings({ tonic: 'C', mode: 'major' })).toEqual([
      'C',
      'D',
      'E',
      'F',
      'G',
      'A',
      'B',
    ]);
    expect(spellPitchClassInKey(6, { tonic: 'G', mode: 'major' })).toBe('F♯');
    expect(spellPitchClassInKey(6, { tonic: 'D', mode: 'major' })).toBe('F♯');
    expect(spellPitchClassInKey(1, { tonic: 'D', mode: 'major' })).toBe('C♯');
    expect(spellPitchClassInKey(6, { tonic: 'E', mode: 'minor' })).toBe('F♯');
  });

  it('uses flat spellings for representative flat-side keys', () => {
    expect(getDiatonicPitchClassSpellings({ tonic: 'D#', mode: 'major' })).toEqual([
      'E♭',
      'F',
      'G',
      'A♭',
      'B♭',
      'C',
      'D',
    ]);
    expect(spellPitchClassInKey(8, { tonic: 'D#', mode: 'major' })).toBe('A♭');
    expect(spellPitchClassInKey(1, { tonic: 'G#', mode: 'major' })).toBe('D♭');
  });

  it('falls back consistently for non-diatonic tones', () => {
    expect(spellPitchClassInKey(1, { tonic: 'C', mode: 'major' })).toBe('C♯');
    expect(spellPitchClassInKey(6, { tonic: 'F', mode: 'minor' })).toBe('G♭');
  });

  it('formats stored note names and key tonics without changing internal values', () => {
    expect(formatNoteNameInKey('A#', { tonic: 'F', mode: 'minor' })).toBe('B♭');
    expect(formatKeyTonicName('D#', 'major')).toBe('E♭');
    expect(formatKeyTonicName('C#', 'minor')).toBe('C♯');
  });
});
