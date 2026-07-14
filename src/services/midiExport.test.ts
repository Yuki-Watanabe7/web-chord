import { describe, expect, it } from 'vitest';
import { createEmptySong, insertChordInSong, insertMelodyNoteInSong } from '../domain/music/timeline';
import { createMidiFile } from './midiExport';

const containsSubsequence = (haystack: Uint8Array, needle: number[]) => {
  for (let index = 0; index <= haystack.length - needle.length; index++) {
    if (needle.every((value, offset) => haystack[index + offset] === value)) {
      return true;
    }
  }

  return false;
};

describe('createMidiFile (slash chords)', () => {
  it('emits a note-on event for the bass note when the chord has one', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 1 }), 0, {
      root: 'C',
      type: 'major',
      notes: ['C', 'E', 'G'],
      bass: 'E',
    });

    const bytes = createMidiFile(song);
    // Note-on, channel 0, MIDI note 40 (E2), velocity 72.
    expect(containsSubsequence(bytes, [0x90, 40, 72])).toBe(true);
  });

  it('does not emit the bass note-on event for a root-position chord', () => {
    const song = insertChordInSong(createEmptySong({ totalMeasures: 1 }), 0, {
      root: 'C',
      type: 'major',
      notes: ['C', 'E', 'G'],
    });

    const bytes = createMidiFile(song);
    expect(containsSubsequence(bytes, [0x90, 40, 72])).toBe(false);
  });
});

describe('createMidiFile (fractional melody beats)', () => {
  it('emits half-beat melody timing as MIDI ticks', () => {
    const song = insertMelodyNoteInSong(
      createEmptySong({ totalMeasures: 1 }),
      0.5,
      'C',
      4,
      'melody-1',
      1.5,
    );

    const bytes = createMidiFile(song);

    expect(containsSubsequence(bytes, [0x81, 0x70, 0x91, 60, 102])).toBe(true);
    expect(containsSubsequence(bytes, [0x85, 0x50, 0x81, 60, 0])).toBe(true);
  });
});
