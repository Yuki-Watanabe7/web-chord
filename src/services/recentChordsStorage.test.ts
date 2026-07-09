import { beforeEach, describe, expect, it } from 'vitest';
import { addRecentChord, loadRecentChords } from './recentChordsStorage';

// The vitest environment here is plain Node, which has no `localStorage` global
// (unlike the browser this code actually runs in), so tests install a minimal
// in-memory stand-in scoped to each test.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

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
    this.store.set(key, value);
  };
}

describe('recentChordsStorage', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
  });

  it('returns an empty list when nothing has been stored', () => {
    expect(loadRecentChords()).toEqual([]);
  });

  it('adds a chord to the front of the recent list', () => {
    addRecentChord({ root: 'C', quality: 'major' });
    const result = addRecentChord({ root: 'A', quality: 'minor' });

    expect(result).toEqual([
      { root: 'A', quality: 'minor' },
      { root: 'C', quality: 'major' },
    ]);
    expect(loadRecentChords()).toEqual(result);
  });

  it('moves a repeated chord to the front instead of duplicating it', () => {
    addRecentChord({ root: 'C', quality: 'major' });
    addRecentChord({ root: 'A', quality: 'minor' });
    const result = addRecentChord({ root: 'C', quality: 'major' });

    expect(result).toEqual([
      { root: 'C', quality: 'major' },
      { root: 'A', quality: 'minor' },
    ]);
  });

  it('treats the same root/quality with a different bass as a distinct entry', () => {
    addRecentChord({ root: 'C', quality: 'major' });
    const result = addRecentChord({ root: 'C', quality: 'major', bass: 'E' });

    expect(result).toEqual([
      { root: 'C', quality: 'major', bass: 'E' },
      { root: 'C', quality: 'major' },
    ]);
  });

  it('caps the stored list at 8 entries', () => {
    const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;
    roots.forEach((root) => addRecentChord({ root, quality: 'major' }));

    const result = loadRecentChords();
    expect(result).toHaveLength(8);
    expect(result[0]).toEqual({ root: 'G#', quality: 'major' });
  });

  it('ignores malformed data already in storage', () => {
    localStorage.setItem('web-chord:recent-chords', JSON.stringify([{ root: 'H', quality: 'major' }, 'oops']));

    expect(loadRecentChords()).toEqual([]);
  });
});
