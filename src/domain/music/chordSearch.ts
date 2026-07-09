import type { ChordDefinition, ChordQuality } from './types';
import { extractLeadingNoteName, pitchClassToNoteName } from './pitchClass';

const QUALITY_ALIASES: Record<ChordQuality, string[]> = {
  major: ['maj'],
  minor: ['m', 'min'],
  diminished: ['dim'],
  augmented: ['aug'],
  dominant7: ['7'],
  major7: ['maj7'],
  minor7: ['m7', 'min7'],
};

const normalizeWhitespace = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Normalizes a chord-search query so enharmonic root spellings (Db, D♭, C#, C♯, ...)
 * and shorthand quality suffixes (e.g. "Dbmaj7") resolve to the same text used
 * internally, which is always sharp-spelled (see NOTE_NAMES). Only the leading
 * note name is rewritten; any quality shorthand that follows it (e.g. "maj7")
 * is preserved as-is.
 */
export const normalizeChordQuery = (query: string): string => {
  const trimmed = query.trim();
  const leadingNote = extractLeadingNoteName(trimmed);

  const combined = leadingNote
    ? `${pitchClassToNoteName(leadingNote.pitchClass)}${leadingNote.rest}`
    : trimmed;

  return normalizeWhitespace(combined);
};

const getSearchTextValues = (chord: ChordDefinition) =>
  [chord.root, chord.type, `${chord.root} ${chord.type}`, chord.notes.join(' ')].map(
    normalizeWhitespace,
  );

const getShorthandValues = (chord: ChordDefinition) => {
  const root = chord.root.toLowerCase();

  return QUALITY_ALIASES[chord.type].map((alias) => normalizeWhitespace(`${root}${alias}`));
};

/** True when a chord matches a free-form search query, including enharmonic spellings and shorthand. */
export const chordMatchesQuery = (chord: ChordDefinition, query: string): boolean => {
  const normalizedQuery = normalizeChordQuery(query);

  if (normalizedQuery.length === 0) {
    return true;
  }

  return (
    getSearchTextValues(chord).some((value) => value.includes(normalizedQuery)) ||
    getShorthandValues(chord).some((value) => value === normalizedQuery)
  );
};
