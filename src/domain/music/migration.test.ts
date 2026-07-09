import { describe, expect, it } from 'vitest';
import { normalizeSong } from './migration';

describe('normalizeSong (slash chords)', () => {
  it('keeps a valid bass note on a chord event', () => {
    const song = normalizeSong({
      id: 'song-1',
      title: 'テスト',
      bpm: 120,
      timeSignature: { beatsPerMeasure: 4, beatUnit: 4 },
      totalMeasures: 4,
      chords: [
        { id: 'chord-1', root: 'C', quality: 'major', bass: 'E', startBeat: 0, durationBeats: 4 },
      ],
      melodyNotes: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(song?.chords[0]).toMatchObject({ root: 'C', quality: 'major', bass: 'E' });
  });

  it('drops an invalid bass value instead of failing the whole chord', () => {
    const song = normalizeSong({
      id: 'song-1',
      title: 'テスト',
      bpm: 120,
      timeSignature: { beatsPerMeasure: 4, beatUnit: 4 },
      totalMeasures: 4,
      chords: [
        { id: 'chord-1', root: 'C', quality: 'major', bass: 'H', startBeat: 0, durationBeats: 4 },
      ],
      melodyNotes: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(song?.chords[0].root).toBe('C');
    expect(song?.chords[0].bass).toBeUndefined();
  });

  it('treats existing songs without a bass field as root-position chords (backward compatibility)', () => {
    const song = normalizeSong({
      id: 'song-1',
      title: 'テスト',
      bpm: 120,
      timeSignature: { beatsPerMeasure: 4, beatUnit: 4 },
      totalMeasures: 4,
      chords: [
        { id: 'chord-1', root: 'C', quality: 'major', startBeat: 0, durationBeats: 4 },
      ],
      melodyNotes: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(song?.chords[0].bass).toBeUndefined();
  });
});
