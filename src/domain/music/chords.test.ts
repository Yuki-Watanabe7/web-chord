import { describe, expect, it } from 'vitest';
import { formatSlashChordLabel, getChordNotes, isChordQuality, isNoteName } from './chords';

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
