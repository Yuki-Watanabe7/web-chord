import { describe, expect, it } from 'vitest';
import {
  formatChordNameInKey,
  formatChordSymbol,
  formatChordSymbolInKey,
  formatSlashChordLabel,
  getChordNotes,
  isChordQuality,
  isNoteName,
} from './chords';

describe('getChordNotes', () => {
  it('builds triads and sevenths from C (regression: matches pre-pitch-class output)', () => {
    expect(getChordNotes('C', 'major')).toEqual(['C', 'E', 'G']);
    expect(getChordNotes('C', 'minor')).toEqual(['C', 'D#', 'G']);
    expect(getChordNotes('C', 'diminished')).toEqual(['C', 'D#', 'F#']);
    expect(getChordNotes('C', 'augmented')).toEqual(['C', 'E', 'G#']);
    expect(getChordNotes('C', 'dominant7')).toEqual(['C', 'E', 'G', 'A#']);
    expect(getChordNotes('C', 'major7')).toEqual(['C', 'E', 'G', 'B']);
    expect(getChordNotes('C', 'minor7')).toEqual(['C', 'D#', 'G', 'A#']);
  });

  it('wraps around the octave when the root is near the top of NOTE_NAMES', () => {
    expect(getChordNotes('A', 'major')).toEqual(['A', 'C#', 'E']);
    expect(getChordNotes('B', 'major7')).toEqual(['B', 'D#', 'F#', 'A#']);
  });
});

describe('isNoteName / isChordQuality', () => {
  it('accepts valid values and rejects invalid ones', () => {
    expect(isNoteName('C#')).toBe(true);
    expect(isNoteName('D♭')).toBe(false);
    expect(isNoteName('H')).toBe(false);

    expect(isChordQuality('major7')).toBe(true);
    expect(isChordQuality('power')).toBe(false);
  });
});

describe('formatSlashChordLabel', () => {
  it('appends the bass note when present', () => {
    expect(formatSlashChordLabel('C major', 'E')).toBe('C major/E');
  });

  it('returns the label unchanged when there is no bass note', () => {
    expect(formatSlashChordLabel('C major', undefined)).toBe('C major');
  });
});

describe('formatChordSymbol', () => {
  it('formats each quality as a compact chord-symbol suffix', () => {
    expect(formatChordSymbol('C', 'major')).toBe('C');
    expect(formatChordSymbol('C', 'minor')).toBe('Cm');
    expect(formatChordSymbol('C', 'diminished')).toBe('Cdim');
    expect(formatChordSymbol('C', 'augmented')).toBe('Caug');
    expect(formatChordSymbol('C', 'dominant7')).toBe('C7');
    expect(formatChordSymbol('C', 'major7')).toBe('Cmaj7');
    expect(formatChordSymbol('F#', 'minor7')).toBe('F#m7');
  });

  it('appends a bass note as a slash chord', () => {
    expect(formatChordSymbol('C', 'major', 'E')).toBe('C/E');
    expect(formatChordSymbol('D', 'major', 'F#')).toBe('D/F#');
  });
});

describe('key-dependent chord formatting', () => {
  const fMinorKey = { tonic: 'F', mode: 'minor' } as const;

  it('formats F minor chord symbols with flat-side spellings', () => {
    expect(formatChordSymbolInKey('A#', 'minor7', fMinorKey)).toBe('B♭m7');
    expect(formatChordSymbolInKey('C#', 'major7', fMinorKey)).toBe('D♭maj7');
    expect(formatChordSymbolInKey('D#', 'dominant7', fMinorKey)).toBe('E♭7');
    expect(formatChordSymbolInKey('G#', 'major7', fMinorKey)).toBe('A♭maj7');
  });

  it('formats slash-chord root and bass with the same key spelling rule', () => {
    expect(formatChordSymbolInKey('C#', 'major', fMinorKey, 'G#')).toBe('D♭/A♭');
    expect(formatChordNameInKey('C#', 'major7', fMinorKey, 'G#')).toBe('D♭ major7/A♭');
  });
});
