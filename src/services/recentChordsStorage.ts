import { isChordQuality, isNoteName } from '../domain/music/chords';
import type { ChordQuality, NoteName } from '../domain/music/types';

const RECENT_CHORDS_STORAGE_KEY = 'web-chord:recent-chords';
const MAX_RECENT_CHORDS = 8;

export interface RecentChordEntry {
  root: NoteName;
  quality: ChordQuality;
  bass?: NoteName;
}

const isRecentChordEntry = (value: unknown): value is RecentChordEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isNoteName(candidate.root) &&
    isChordQuality(candidate.quality) &&
    (candidate.bass === undefined || isNoteName(candidate.bass))
  );
};

const entryKey = (entry: RecentChordEntry): string => `${entry.root}-${entry.quality}-${entry.bass ?? ''}`;

export const loadRecentChords = (): RecentChordEntry[] => {
  const stored = localStorage.getItem(RECENT_CHORDS_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isRecentChordEntry) : [];
  } catch {
    return [];
  }
};

/** Records a chord as recently used, moving it to the front and capping the stored list. */
export const addRecentChord = (entry: RecentChordEntry): RecentChordEntry[] => {
  const existing = loadRecentChords().filter((recent) => entryKey(recent) !== entryKey(entry));
  const next = [entry, ...existing].slice(0, MAX_RECENT_CHORDS);

  localStorage.setItem(RECENT_CHORDS_STORAGE_KEY, JSON.stringify(next));

  return next;
};
