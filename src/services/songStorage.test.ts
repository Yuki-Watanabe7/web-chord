import { beforeEach, describe, expect, it } from 'vitest';
import type { Song } from '../domain/music/types';
import { mergeAndSaveImportedSongs, mergeImportedSongs, replaceSongs } from './songStorage';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  failWrites = false;

  get length() {
    return this.store.size;
  }

  clear = () => this.store.clear();
  getItem = (key: string) => this.store.get(key) ?? null;
  key = (index: number) => Array.from(this.store.keys())[index] ?? null;
  removeItem = (key: string) => {
    this.store.delete(key);
  };
  setItem = (key: string, value: string) => {
    if (this.failWrites) {
      throw new Error('storage quota exceeded');
    }

    this.store.set(key, value);
  };
}

const makeSong = (id: string, title = 'テスト曲'): Song => ({
  id,
  title,
  bpm: 120,
  timeSignature: { beatsPerMeasure: 4, beatUnit: 4 },
  totalMeasures: 4,
  key: { tonic: 'C', mode: 'major' },
  chords: [],
  melodyNotes: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
});

describe('songStorage import', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
  });

  it('adds a conflicting imported ID as a copy without overwriting the existing song', () => {
    const existing = makeSong('song-1', '元の曲');
    const imported = makeSong('song-1', '読み込んだ曲');
    const result = mergeImportedSongs([existing], [imported], '2026-07-14T00:00:00.000Z');

    expect(result).toMatchObject({ importedCount: 1, addedCount: 1, conflictCount: 1 });
    expect(result.songs).toHaveLength(2);
    expect(result.songs[0]).toEqual(existing);
    expect(result.songs[1]).toMatchObject({
      title: '読み込んだ曲（インポート）',
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    });
    expect(result.songs[1].id).not.toBe(existing.id);
  });

  it('persists all imported songs only after a successful merge', () => {
    replaceSongs([makeSong('song-1')]);

    const result = mergeAndSaveImportedSongs([makeSong('song-2', '2曲目')]);

    expect(result).toMatchObject({ importedCount: 1, addedCount: 1, conflictCount: 0 });
    expect(JSON.parse(localStorage.getItem('songs') ?? '[]')).toHaveLength(2);
  });

  it('does not report a successful import when storage writing fails', () => {
    const storage = localStorage as MemoryStorage;
    replaceSongs([makeSong('song-1')]);
    const previousValue = storage.getItem('songs');
    storage.failWrites = true;

    expect(() => mergeAndSaveImportedSongs([makeSong('song-2')])).toThrow('storage quota exceeded');
    expect(storage.getItem('songs')).toBe(previousValue);
  });
});
