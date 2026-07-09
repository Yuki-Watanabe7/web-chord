import { describe, expect, it } from 'vitest';
import {
  changeSongKey,
  chordEventToChordDefinition,
  copyMeasureRangeFromSong,
  createEmptySong,
  duplicateMeasureRangeToNext,
  getKeyTransposeSemitones,
  insertChordInSong,
  insertMelodyNoteInSong,
  pasteMeasureRangeClipboard,
  transposeChordEvent,
  transposeMelodyNote,
  transposeNoteName,
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

describe('transposeNoteName', () => {
  it('shifts a note name by the given number of semitones, wrapping around the octave', () => {
    expect(transposeNoteName('C', 2)).toBe('D');
    expect(transposeNoteName('B', 2)).toBe('C#');
    expect(transposeNoteName('C', -1)).toBe('B');
  });
});

describe('getKeyTransposeSemitones', () => {
  it('picks the shortest signed shift between two tonics', () => {
    expect(getKeyTransposeSemitones('C', 'D')).toBe(2);
    expect(getKeyTransposeSemitones('C', 'B')).toBe(-1);
    expect(getKeyTransposeSemitones('C', 'F#')).toBe(6);
    expect(getKeyTransposeSemitones('C', 'C')).toBe(0);
  });
});

describe('transposeChordEvent', () => {
  it('transposes the root and bass note by the given semitones', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, cOverE);
    const transposed = transposeChordEvent(song.chords[0], 2);

    expect(transposed).toMatchObject({ root: 'D', quality: 'major', bass: 'F#' });
  });

  it('leaves a root-position chord without a bass note', () => {
    const chord = { id: 'chord-1', root: 'C' as const, quality: 'major' as const, startBeat: 0, durationBeats: 4 };
    expect(transposeChordEvent(chord, 2).bass).toBeUndefined();
  });
});

describe('transposeMelodyNote', () => {
  it('transposes the pitch and keeps the octave when there is no wrap-around', () => {
    const song = insertMelodyNoteInSong(createEmptySong({ totalMeasures: 4 }), 0, 'C', 4);
    const transposed = transposeMelodyNote(song.melodyNotes[0], 2);

    expect(transposed).toMatchObject({ pitch: 'D', octave: 4 });
  });

  it('bumps the octave up when transposing crosses the C boundary', () => {
    const song = insertMelodyNoteInSong(createEmptySong({ totalMeasures: 4 }), 0, 'B', 4);
    const transposed = transposeMelodyNote(song.melodyNotes[0], 2);

    expect(transposed).toMatchObject({ pitch: 'C#', octave: 5 });
  });

  it('bumps the octave down when transposing downward crosses the C boundary', () => {
    const song = insertMelodyNoteInSong(createEmptySong({ totalMeasures: 4 }), 0, 'C', 4);
    const transposed = transposeMelodyNote(song.melodyNotes[0], -1);

    expect(transposed).toMatchObject({ pitch: 'B', octave: 3 });
  });
});

describe('changeSongKey', () => {
  it('only updates the key label when transposeExisting is not requested', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, cOverE);
    const changed = changeSongKey(song, { tonic: 'D', mode: 'major' });

    expect(changed.key).toEqual({ tonic: 'D', mode: 'major' });
    expect(changed.chords[0]).toMatchObject({ root: 'C', bass: 'E' });
  });

  it('transposes chords and melody notes together when transposeExisting is true', () => {
    const withChord = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, cOverE);
    const song = insertMelodyNoteInSong(withChord, 0, 'C', 4);

    const changed = changeSongKey(song, { tonic: 'D', mode: 'major' }, { transposeExisting: true });

    expect(changed.key).toEqual({ tonic: 'D', mode: 'major' });
    expect(changed.chords[0]).toMatchObject({ root: 'D', bass: 'F#' });
    expect(changed.melodyNotes[0]).toMatchObject({ pitch: 'D', octave: 4 });
  });

  it('does not transpose when only the mode changes for the same tonic', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, cOverE);
    const changed = changeSongKey(song, { tonic: 'C', mode: 'minor' }, { transposeExisting: true });

    expect(changed.key).toEqual({ tonic: 'C', mode: 'minor' });
    expect(changed.chords[0]).toMatchObject({ root: 'C', bass: 'E' });
  });
});
