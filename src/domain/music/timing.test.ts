import { describe, expect, it } from 'vitest';
import { normalizeSong } from './migration';
import {
  addKeySignatureEvent,
  addTempoEvent,
  addTimeSignatureEvent,
  copyMeasureRangeFromSong,
  createEmptySong,
  insertMelodyNoteAtTick,
  pasteMeasureRangeClipboard,
} from './timeline';
import {
  musicXmlDurationToTicks,
  resolveTicksPerQuarterForMusicXml,
  validateSongTiming,
} from './timing';
import { parseSongExportFile, serializeSongExportFile } from '../../services/songFile';

describe('integer tick song timing', () => {
  it('keeps sixteenth notes, dotted notes, tuplets, syncopation, a pickup, and ties as integer ticks', () => {
    const song = createEmptySong({ totalMeasures: 3, pickupTicks: 480 });
    const withSixteenth = insertMelodyNoteAtTick(song, 0, 'C', 4, 'sixteenth', 120);
    const withDotted = insertMelodyNoteAtTick(withSixteenth, 480, 'D', 4, 'dotted', 720);
    const withTriplet = insertMelodyNoteAtTick(withDotted, 1_280, 'E', 4, 'triplet', 160, {
      id: 'tie-1', type: 'start',
    });
    const withTie = insertMelodyNoteAtTick(withTriplet, 1_440, 'E', 4, 'tied', 320, {
      id: 'tie-1', type: 'stop',
    });

    expect(withTie.pickupTicks).toBe(480);
    expect(withTie.measures[0]).toEqual({ startTick: 0, durationTicks: 480 });
    expect(withTie.melodyNotes.map(({ id, startTick, durationTicks, tie }) => ({ id, startTick, durationTicks, tie }))).toEqual([
      { id: 'sixteenth', startTick: 0, durationTicks: 120, tie: undefined },
      { id: 'dotted', startTick: 480, durationTicks: 720, tie: undefined },
      { id: 'triplet', startTick: 1_280, durationTicks: 160, tie: { id: 'tie-1', type: 'start' } },
      { id: 'tied', startTick: 1_440, durationTicks: 320, tie: { id: 'tie-1', type: 'stop' } },
    ]);
    expect(JSON.stringify(withTie)).not.toContain('startBeat');
    expect(JSON.stringify(withTie)).not.toContain('durationBeats');
  });

  it('retains non-grid tick timing while copying and pasting measures', () => {
    const song = insertMelodyNoteAtTick(createEmptySong({ totalMeasures: 2 }), 160, 'E', 4, 'triplet', 160);
    const pasted = pasteMeasureRangeClipboard(song, copyMeasureRangeFromSong(song, { startMeasure: 0, measureCount: 1 }), 1);

    expect(pasted.melodyNotes.map(({ startTick, durationTicks }) => ({ startTick, durationTicks }))).toEqual([
      { startTick: 160, durationTicks: 160 },
      { startTick: 2_080, durationTicks: 160 },
    ]);
  });

  it('migrates legacy beat data to exact integer ticks without dropping notes', () => {
    const song = normalizeSong({
      id: 'legacy', title: '旧曲', bpm: 120, timeSignature: '4/4', totalMeasures: 1,
      chords: [{ id: 'chord', root: 'C', quality: 'major', startBeat: 0, durationBeats: 1.5 }],
      melodyNotes: [{ id: 'note', pitch: 'E', octave: 4, startBeat: 0.5, durationBeats: 0.5, velocity: 0.8 }],
    });

    expect(song?.chords[0]).toMatchObject({ startTick: 0, durationTicks: 720 });
    expect(song?.melodyNotes[0]).toMatchObject({ startTick: 240, durationTicks: 240 });
  });

  it('round-trips tick and change events through the versioned JSON format', () => {
    const base = insertMelodyNoteAtTick(createEmptySong({ totalMeasures: 3 }), 160, 'E', 4, 'triplet', 160);
    const withChanges = addKeySignatureEvent(
      addTempoEvent(addTimeSignatureEvent(base, 1_920, { beatsPerMeasure: 3, beatUnit: 4 }), 1_920, 92),
      1_920,
      { tonic: 'A', mode: 'minor' },
    );
    const parsed = parseSongExportFile(serializeSongExportFile([withChanges], '2026-09-22T00:00:00.000Z'));

    expect(parsed).toMatchObject({ ok: true, exportedAt: '2026-09-22T00:00:00.000Z' });
    if (!parsed.ok) throw new Error('expected valid song export');
    expect(parsed.songs[0].melodyNotes[0]).toMatchObject({ startTick: 160, durationTicks: 160 });
    expect(parsed.songs[0].timeSignatureEvents).toEqual(withChanges.timeSignatureEvents);
    expect(parsed.songs[0].tempoEvents).toEqual(withChanges.tempoEvents);
    expect(parsed.songs[0].keySignatureEvents).toEqual(withChanges.keySignatureEvents);
    expect(validateSongTiming(parsed.songs[0]).some((warning) => warning.code === 'measure-length-mismatch')).toBe(true);
  });
});

describe('MusicXML divisions conversion', () => {
  it('chooses a common integer resolution and never rounds tuplets', () => {
    const ticksPerQuarter = resolveTicksPerQuarterForMusicXml([1, 2, 3, 4, 7]);

    expect(ticksPerQuarter).toBe(3_360);
    expect(musicXmlDurationToTicks(1, 4, ticksPerQuarter)).toBe(840);
    expect(musicXmlDurationToTicks(1, 3, ticksPerQuarter)).toBe(1_120);
    expect(musicXmlDurationToTicks(1, 7, ticksPerQuarter)).toBe(480);
  });
});
