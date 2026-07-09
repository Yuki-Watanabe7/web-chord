import { describe, expect, it } from 'vitest';
import {
  changeSongKey,
  chordEventToChordDefinition,
  copyMeasureRangeFromSong,
  createEmptySong,
  duplicateMeasureRangeToNext,
  getKeyTransposeSemitones,
  insertChordInSong,
  insertChordProgressionInSong,
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

describe('insertChordProgressionInSong', () => {
  const progression = [
    { root: 'C', quality: 'major' },
    { root: 'G', quality: 'major' },
    { root: 'A', quality: 'minor' },
    { root: 'F', quality: 'major' },
  ] as const;

  it('lays out each chord back-to-back starting at the given beat', () => {
    const song = createEmptySong({ totalMeasures: 4, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const next = insertChordProgressionInSong(song, 0, [...progression], 4);

    expect(next.chords).toHaveLength(4);
    expect(next.chords.map((chord) => ({ root: chord.root, quality: chord.quality, startBeat: chord.startBeat, durationBeats: chord.durationBeats }))).toEqual([
      { root: 'C', quality: 'major', startBeat: 0, durationBeats: 4 },
      { root: 'G', quality: 'major', startBeat: 4, durationBeats: 4 },
      { root: 'A', quality: 'minor', startBeat: 8, durationBeats: 4 },
      { root: 'F', quality: 'major', startBeat: 12, durationBeats: 4 },
    ]);
  });

  it('respects a smaller per-chord beat length', () => {
    const song = createEmptySong({ totalMeasures: 4, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const next = insertChordProgressionInSong(song, 0, [...progression], 2);

    expect(next.chords.map((chord) => chord.startBeat)).toEqual([0, 2, 4, 6]);
    expect(next.chords.every((chord) => chord.durationBeats === 2)).toBe(true);
  });

  it('overwrites and trims existing chords within the inserted range', () => {
    const withExisting = insertChordInSong(
      createEmptySong({ totalMeasures: 4, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } }),
      2,
      { root: 'D', type: 'major', notes: ['D', 'F#', 'A'] },
    );

    const next = insertChordProgressionInSong(withExisting, 0, [...progression], 4);

    expect(next.chords).toHaveLength(4);
    expect(next.chords[0]).toMatchObject({ root: 'C', startBeat: 0, durationBeats: 4 });
  });

  it('truncates the progression when it does not fully fit before the end of the song', () => {
    const song = createEmptySong({ totalMeasures: 1, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const next = insertChordProgressionInSong(song, 0, [...progression], 2);

    expect(next.chords.map((chord) => ({ root: chord.root, startBeat: chord.startBeat }))).toEqual([
      { root: 'C', startBeat: 0 },
      { root: 'G', startBeat: 2 },
    ]);
  });

  it('does nothing when the song has no beats', () => {
    const song = createEmptySong({ totalMeasures: 0 });
    const next = insertChordProgressionInSong(song, 0, [...progression], 4);

    expect(next).toBe(song);
  });
});
