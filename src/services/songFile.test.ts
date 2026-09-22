import { describe, expect, it } from 'vitest';
import type { Song } from '../domain/music/types';
import { parseChordSymbol } from '../domain/music/chordSymbol';
import { createEmptySong } from '../domain/music/timeline';
import {
  createSongExportFile,
  createSongJsonFileName,
  createSongsBackupFileName,
  parseSongExportFile,
  sanitizeSongFileName,
  serializeSongExportFile,
} from './songFile';

const song: Song = createEmptySong({
  id: 'song-1', title: 'テスト曲', bpm: 128,
  timeSignature: { beatsPerMeasure: 3, beatUnit: 4 }, totalMeasures: 8,
  key: { tonic: 'A', mode: 'minor' },
  chords: [{ id: 'chord-1', root: 'A', quality: 'minor', startTick: 0, durationTicks: 1440 }],
  melodyNotes: [{ id: 'melody-1', pitch: 'C', octave: 5, startTick: 720, durationTicks: 240, velocity: 0.8 }],
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z',
});

describe('songFile', () => {
  it('wraps a single song in the versioned export envelope', () => {
    expect(createSongExportFile([song], '2026-07-14T00:00:00.000Z')).toEqual({
      format: 'web-chord',
      schemaVersion: 3,
      exportedAt: '2026-07-14T00:00:00.000Z',
      songs: [song],
    });
  });

  it('round-trips multiple songs without losing editable song data', () => {
    const secondSong = { ...song, id: 'song-2', title: '2曲目', chords: [], melodyNotes: [] };
    const json = serializeSongExportFile([song, secondSong], '2026-07-14T00:00:00.000Z');

    expect(parseSongExportFile(json)).toEqual({
      ok: true,
      exportedAt: '2026-07-14T00:00:00.000Z',
      songs: [song, secondSong],
    });
  });

  it('round-trips a structured symbol and its parse warning without replacing its raw text', () => {
    const unknownSymbolSong = createEmptySong({
      ...song,
      id: 'unknown-symbol-song',
      chords: [{
        id: 'chord-unknown',
        root: 'C',
        quality: 'major',
        chordSymbol: parseChordSymbol('C7alt'),
        startTick: 0,
        durationTicks: 1440,
      }],
    });

    const result = parseSongExportFile(serializeSongExportFile([unknownSymbolSong]));

    expect(result).toMatchObject({
      ok: true,
      songs: [{ chords: [{ chordSymbol: { raw: 'C7alt', kind: 'other' } }] }],
    });
  });

  it('imports a raw-only chord symbol when no legacy quality is available', () => {
    const result = parseSongExportFile(JSON.stringify({
      format: 'web-chord',
      schemaVersion: 3,
      exportedAt: '2026-07-14T00:00:00.000Z',
      songs: [{
        ...song,
        id: 'raw-only-symbol-song',
        chords: [{ id: 'chord-no-chord', chordSymbol: 'N.C.', startTick: 0, durationTicks: 1440 }],
      }],
    }));

    expect(result).toMatchObject({
      ok: true,
      songs: [{ chords: [{ root: 'C', quality: 'major', chordSymbol: { raw: 'N.C.', kind: 'none' } }] }],
    });
  });

  it('rejects JSON from another application', () => {
    const result = parseSongExportFile(JSON.stringify({ format: 'another-app', schemaVersion: 1, songs: [] }));

    expect(result).toMatchObject({ ok: false, code: 'invalid-format' });
  });

  it('identifies files made by a newer version', () => {
    const result = parseSongExportFile(JSON.stringify({ format: 'web-chord', schemaVersion: 4, songs: [] }));

    expect(result).toMatchObject({ ok: false, code: 'newer-schema-version' });
  });

  it('identifies invalid JSON and a non-array songs field', () => {
    expect(parseSongExportFile('{')).toMatchObject({ ok: false, code: 'invalid-json' });
    expect(
      parseSongExportFile(
        JSON.stringify({
          format: 'web-chord',
          schemaVersion: 1,
          exportedAt: '2026-07-14T00:00:00.000Z',
          songs: song,
        }),
      ),
    ).toMatchObject({ ok: false, code: 'invalid-songs' });
  });

  it('normalizes legacy grid-based songs through the existing migration', () => {
    const result = parseSongExportFile(
      JSON.stringify({
        format: 'web-chord',
        schemaVersion: 1,
        exportedAt: '2026-07-14T00:00:00.000Z',
        songs: [
          {
            id: 'legacy-song',
            title: '旧形式',
            bpm: 120,
            timeSignature: '4/4',
            totalMeasures: 4,
            grid: [],
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      songs: [
        {
          id: 'legacy-song',
          key: { tonic: 'C', mode: 'major' },
          chords: [],
          melodyNotes: [],
        },
      ],
    });
  });

  it('rejects the whole import when one song is malformed', () => {
    const result = parseSongExportFile(
      serializeSongExportFile([song, { ...song, id: 'broken', bpm: -20 }]),
    );

    expect(result).toMatchObject({ ok: false, code: 'invalid-song' });
  });

  it('creates safe and descriptive JSON file names', () => {
    expect(sanitizeSongFileName('  my/song:demo?  ')).toBe('my-song-demo');
    expect(createSongJsonFileName({ title: 'my/song' })).toBe('my-song.web-chord.json');
    expect(createSongJsonFileName({ title: '' })).toBe('song.web-chord.json');
    expect(createSongsBackupFileName(new Date('2026-07-14T00:00:00.000Z'))).toBe(
      'web-chord-backup-2026-07-14.json',
    );
  });
});
