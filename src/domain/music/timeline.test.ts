import { describe, expect, it } from 'vitest';
import {
  changeSongKey,
  changeSongTotalMeasures,
  chordEventToChordDefinition,
  copyMeasureRangeFromSong,
  createEmptySong,
  duplicateMeasureRangeToNext,
  getKeyTransposeSemitones,
  insertChordInSong,
  insertChordProgressionInSong,
  insertMelodyNoteInSong,
  MAX_TOTAL_MEASURES,
  normalizeMeasureRange,
  normalizeTotalMeasures,
  pasteMeasureRangeClipboard,
  quantizeBeat,
  resizeChordInSong,
  resizeMelodyNoteInSong,
  transposeChordEvent,
  transposeMelodyNote,
  transposeNoteName,
  wouldShortenSongLoseContent,
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

describe('melody half-beat editing', () => {
  it('quantizes arbitrary beat values to the nearest half beat', () => {
    expect(quantizeBeat(0.24)).toBe(0);
    expect(quantizeBeat(0.26)).toBe(0.5);
    expect(quantizeBeat(1.24)).toBe(1);
    expect(quantizeBeat(1.26)).toBe(1.5);
  });

  it('inserts a 0.5 beat note at a 0.5 beat position', () => {
    const song = createEmptySong({ totalMeasures: 1 });
    const next = insertMelodyNoteInSong(song, 0.5, 'E', 4, 'melody-1', 0.5);

    expect(next.melodyNotes).toHaveLength(1);
    expect(next.melodyNotes[0]).toMatchObject({
      id: 'melody-1',
      startBeat: 0.5,
      durationBeats: 0.5,
    });
  });

  it('inserts a 1.5 beat note at a 0.5 beat position', () => {
    const song = createEmptySong({ totalMeasures: 1 });
    const next = insertMelodyNoteInSong(song, 0.5, 'E', 4, 'melody-1', 1.5);

    expect(next.melodyNotes[0]).toMatchObject({
      startBeat: 0.5,
      durationBeats: 1.5,
    });
  });

  it('normalizes inserted start and duration values to half beats', () => {
    const song = createEmptySong({ totalMeasures: 1 });
    const next = insertMelodyNoteInSong(song, 0.74, 'E', 4, 'melody-1', 1.26);

    expect(next.melodyNotes[0]).toMatchObject({
      startBeat: 0.5,
      durationBeats: 1.5,
    });
  });

  it('shortens an inserted note that would pass the end of the song', () => {
    const song = createEmptySong({ totalMeasures: 1 });
    const next = insertMelodyNoteInSong(song, 3.5, 'E', 4, 'melody-1', 2);

    expect(next.melodyNotes[0]).toMatchObject({
      startBeat: 3.5,
      durationBeats: 0.5,
    });
  });

  it('trims previous same-pitch notes and does not cross the next same-pitch note', () => {
    const song = createEmptySong({
      totalMeasures: 1,
      melodyNotes: [
        {
          id: 'previous',
          pitch: 'E',
          octave: 4,
          startBeat: 0,
          durationBeats: 2,
          velocity: 0.8,
        },
        {
          id: 'next',
          pitch: 'E',
          octave: 4,
          startBeat: 2,
          durationBeats: 1,
          velocity: 0.8,
        },
      ],
    });

    const next = insertMelodyNoteInSong(song, 0.5, 'E', 4, 'inserted', 3);

    expect(next.melodyNotes.map((note) => ({
      id: note.id,
      startBeat: note.startBeat,
      durationBeats: note.durationBeats,
    }))).toEqual([
      { id: 'previous', startBeat: 0, durationBeats: 0.5 },
      { id: 'inserted', startBeat: 0.5, durationBeats: 1.5 },
      { id: 'next', startBeat: 2, durationBeats: 1 },
    ]);
  });

  it('resizes melody notes in 0.5 beat steps', () => {
    const song = insertMelodyNoteInSong(
      createEmptySong({ totalMeasures: 1 }),
      0,
      'E',
      4,
      'melody-1',
      0.5,
    );
    const oneBeat = resizeMelodyNoteInSong(song, 'melody-1', 1);
    const oneAndHalfBeats = resizeMelodyNoteInSong(oneBeat, 'melody-1', 1.5);

    expect(song.melodyNotes[0].durationBeats).toBe(0.5);
    expect(oneBeat.melodyNotes[0].durationBeats).toBe(1);
    expect(oneAndHalfBeats.melodyNotes[0].durationBeats).toBe(1.5);
  });

  it('does not resize melody notes below 0.5 beats', () => {
    const song = insertMelodyNoteInSong(
      createEmptySong({ totalMeasures: 1 }),
      0,
      'E',
      4,
      'melody-1',
      0.5,
    );
    const resized = resizeMelodyNoteInSong(song, 'melody-1', 0.25);

    expect(resized.melodyNotes[0].durationBeats).toBe(0.5);
  });

  it('does not resize a melody note beyond the next same-pitch note', () => {
    const song = createEmptySong({
      totalMeasures: 1,
      melodyNotes: [
        {
          id: 'first',
          pitch: 'E',
          octave: 4,
          startBeat: 0,
          durationBeats: 0.5,
          velocity: 0.8,
        },
        {
          id: 'second',
          pitch: 'E',
          octave: 4,
          startBeat: 1.5,
          durationBeats: 0.5,
          velocity: 0.8,
        },
      ],
    });

    const resized = resizeMelodyNoteInSong(song, 'first', 4);

    expect(resized.melodyNotes[0].durationBeats).toBe(1.5);
  });

  it('preserves fractional melody timing when copying, pasting, and duplicating measures', () => {
    const song = insertMelodyNoteInSong(
      createEmptySong({ totalMeasures: 3 }),
      0.5,
      'E',
      4,
      'melody-1',
      1.5,
    );
    const clipboard = copyMeasureRangeFromSong(song, { startMeasure: 0, measureCount: 1 });
    const pasted = pasteMeasureRangeClipboard(song, clipboard, 1);
    const duplicated = duplicateMeasureRangeToNext(song, { startMeasure: 0, measureCount: 1 });

    expect(clipboard.melodyNotes[0]).toMatchObject({
      relativeStartBeat: 0.5,
      durationBeats: 1.5,
    });
    expect(pasted.melodyNotes.find((note) => note.startBeat === 4.5)).toMatchObject({
      durationBeats: 1.5,
    });
    expect(duplicated.melodyNotes.find((note) => note.startBeat === 4.5)).toMatchObject({
      durationBeats: 1.5,
    });
  });
});

describe('normalizeTotalMeasures', () => {
  it('clamps below the minimum up to 1', () => {
    expect(normalizeTotalMeasures(0)).toBe(1);
    expect(normalizeTotalMeasures(-5)).toBe(1);
  });

  it('clamps above the maximum down to MAX_TOTAL_MEASURES', () => {
    expect(normalizeTotalMeasures(1000)).toBe(MAX_TOTAL_MEASURES);
  });

  it('rounds fractional values to the nearest integer', () => {
    expect(normalizeTotalMeasures(8.6)).toBe(9);
  });

  it('falls back to the minimum for non-finite input', () => {
    expect(normalizeTotalMeasures(Number.NaN)).toBe(1);
  });
});

describe('changeSongTotalMeasures (growing)', () => {
  it('appends empty measures without touching existing chords or melody notes', () => {
    const withChord = insertChordInSong(createEmptySong({ totalMeasures: 4 }), 0, {
      root: 'C',
      type: 'major',
      notes: ['C', 'E', 'G'],
    });
    const withMelody = insertMelodyNoteInSong(withChord, 0, 'E', 4);

    const grown = changeSongTotalMeasures(withMelody, 8);

    expect(grown.totalMeasures).toBe(8);
    expect(grown.chords).toEqual(withMelody.chords);
    expect(grown.melodyNotes).toEqual(withMelody.melodyNotes);
  });
});

describe('changeSongTotalMeasures (shrinking)', () => {
  it('removes chords and melody notes that start after the new end', () => {
    const song = createEmptySong({ totalMeasures: 8, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const withChord = insertChordInSong(song, 20, { root: 'G', type: 'major', notes: ['G', 'B', 'D'] });
    const withMelody = insertMelodyNoteInSong(withChord, 20, 'B', 4);

    const shrunk = changeSongTotalMeasures(withMelody, 4);

    expect(shrunk.totalMeasures).toBe(4);
    expect(shrunk.chords).toHaveLength(0);
    expect(shrunk.melodyNotes).toHaveLength(0);
  });

  it('truncates the duration of events that straddle the new end boundary', () => {
    // insertChordInSong/insertMelodyNoteInSong fill to the song's current end by
    // default, so resize them explicitly to a duration that straddles beat 16
    // (the new end once shrunk to 4 measures) without reaching the old end.
    const song = createEmptySong({ totalMeasures: 8, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const withChord = insertChordInSong(song, 12, { root: 'F', type: 'major', notes: ['F', 'A', 'C'] });
    const resizedChord = resizeChordInSong(withChord, withChord.chords[0].id, 8);
    const withMelody = insertMelodyNoteInSong(resizedChord, 12, 'A', 4);
    const resizedMelody = resizeMelodyNoteInSong(withMelody, withMelody.melodyNotes[0].id, 8);

    const shrunk = changeSongTotalMeasures(resizedMelody, 4);

    expect(shrunk.totalMeasures).toBe(4);
    expect(shrunk.chords[0]).toMatchObject({ startBeat: 12, durationBeats: 4 });
    expect(shrunk.melodyNotes[0]).toMatchObject({ startBeat: 12, durationBeats: 4 });
  });

  it('truncates fractional melody notes at the new end boundary', () => {
    const song = insertMelodyNoteInSong(
      createEmptySong({ totalMeasures: 2, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } }),
      3.5,
      'E',
      4,
      'melody-1',
      1.5,
    );

    const shrunk = changeSongTotalMeasures(song, 1);

    expect(shrunk.melodyNotes[0]).toMatchObject({ startBeat: 3.5, durationBeats: 0.5 });
  });

  it('leaves events that already fit entirely before the new end untouched', () => {
    const song = createEmptySong({ totalMeasures: 8, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const withChord = insertChordInSong(song, 0, { root: 'C', type: 'major', notes: ['C', 'E', 'G'] });
    const resizedChord = resizeChordInSong(withChord, withChord.chords[0].id, 4);

    const shrunk = changeSongTotalMeasures(resizedChord, 4);

    expect(shrunk.chords).toEqual(resizedChord.chords);
  });

  it('drops the effective length to 0 or below without leaving a stray event', () => {
    const song = createEmptySong({ totalMeasures: 8, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const withChord = insertChordInSong(song, 16, { root: 'C', type: 'major', notes: ['C', 'E', 'G'] });

    const shrunk = changeSongTotalMeasures(withChord, 4);

    expect(shrunk.chords).toHaveLength(0);
  });

  it('normalizes totalMeasures to an integer within [1, MAX_TOTAL_MEASURES]', () => {
    const song = createEmptySong({ totalMeasures: 8 });

    expect(changeSongTotalMeasures(song, 0).totalMeasures).toBe(1);
    expect(changeSongTotalMeasures(song, -3).totalMeasures).toBe(1);
    expect(changeSongTotalMeasures(song, 10000).totalMeasures).toBe(MAX_TOTAL_MEASURES);
    expect(changeSongTotalMeasures(song, 5.6).totalMeasures).toBe(6);
  });
});

describe('wouldShortenSongLoseContent', () => {
  it('is false for an unaffected shortening (only trailing empty measures removed)', () => {
    const song = createEmptySong({ totalMeasures: 8, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const withChord = insertChordInSong(song, 0, { root: 'C', type: 'major', notes: ['C', 'E', 'G'] });
    const resizedChord = resizeChordInSong(withChord, withChord.chords[0].id, 4);

    expect(wouldShortenSongLoseContent(resizedChord, 4)).toBe(false);
  });

  it('is true when a chord would be truncated', () => {
    const song = createEmptySong({ totalMeasures: 8, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const withChord = insertChordInSong(song, 12, { root: 'F', type: 'major', notes: ['F', 'A', 'C'] });

    expect(wouldShortenSongLoseContent(withChord, 4)).toBe(true);
  });

  it('is true when a melody note would be deleted entirely', () => {
    const song = createEmptySong({ totalMeasures: 8, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } });
    const withMelody = insertMelodyNoteInSong(song, 20, 'B', 4);

    expect(wouldShortenSongLoseContent(withMelody, 4)).toBe(true);
  });

  it('is false when growing the song', () => {
    const song = createEmptySong({ totalMeasures: 4 });

    expect(wouldShortenSongLoseContent(song, 8)).toBe(false);
  });
});

describe('normalizeMeasureRange after changeSongTotalMeasures', () => {
  it('clamps a previously-selected range that no longer fits the shortened song', () => {
    const song = createEmptySong({ totalMeasures: 8 });
    const shrunk = changeSongTotalMeasures(song, 4);

    const clamped = normalizeMeasureRange(shrunk, { startMeasure: 6, measureCount: 2 });

    expect(clamped).toEqual({ startMeasure: 3, measureCount: 1 });
  });

  it('leaves a still-valid range untouched after growing the song', () => {
    const song = createEmptySong({ totalMeasures: 4 });
    const grown = changeSongTotalMeasures(song, 8);

    const range = normalizeMeasureRange(grown, { startMeasure: 1, measureCount: 2 });

    expect(range).toEqual({ startMeasure: 1, measureCount: 2 });
  });
});
