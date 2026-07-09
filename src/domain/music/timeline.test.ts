import { describe, expect, it } from 'vitest';
import {
  chordEventToChordDefinition,
  copyMeasureRangeFromSong,
  createEmptySong,
  duplicateMeasureRangeToNext,
  insertChordInSong,
  pasteMeasureRangeClipboard,
} from './timeline';
import type { ChordDefinition } from './types';

const cOverE: ChordDefinition = { root: 'C', type: 'major', notes: ['C', 'E', 'G'], bass: 'E' };

describe('insertChordInSong (slash chords)', () => {
  it('stores the bass note on the inserted chord event', () => {
    const song = createEmptySong({ totalMeasures: 4 });
    const next = insertChordInSong(song, 0, cOverE);

    expect(next.chords).toHaveLength(1);
    expect(next.chords[0]).toMatchObject({ root: 'C', quality: 'major', bass: 'E' });
  });

  it('leaves bass undefined for a root-position chord', () => {
    const song = createEmptySong({ totalMeasures: 4 });
    const next = insertChordInSong(song, 0, { root: 'C', type: 'major', notes: ['C', 'E', 'G'] });

    expect(next.chords[0].bass).toBeUndefined();
  });
});

describe('chordEventToChordDefinition (slash chords)', () => {
  it('carries the bass note through to the chord definition', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, cOverE);
    const definition = chordEventToChordDefinition(song.chords[0]);

    expect(definition.bass).toBe('E');
    expect(definition.notes).toEqual(['C', 'E', 'G']);
  });
});

describe('measure range copy/paste (slash chords)', () => {
  it('preserves the bass note when copying and pasting a measure range', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, cOverE);
    const clipboard = copyMeasureRangeFromSong(song, { startMeasure: 0, measureCount: 1 });

    expect(clipboard.chords[0]).toMatchObject({ root: 'C', quality: 'major', bass: 'E' });

    const pasted = pasteMeasureRangeClipboard(song, clipboard, 1);
    const pastedChord = pasted.chords.find((chord) => chord.startBeat === 4);

    expect(pastedChord).toMatchObject({ root: 'C', quality: 'major', bass: 'E' });
  });

  it('preserves the bass note when duplicating a measure range', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, cOverE);
    const duplicated = duplicateMeasureRangeToNext(song, { startMeasure: 0, measureCount: 1 });
    const duplicatedChord = duplicated.chords.find((chord) => chord.startBeat === 4);

    expect(duplicatedChord).toMatchObject({ root: 'C', quality: 'major', bass: 'E' });
  });
});
