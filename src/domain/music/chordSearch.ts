import type { ChordDefinition, ChordQuality, NoteName } from './types';
import {
  extractLeadingNoteName,
  parseNoteNameToPitchClass,
  pitchClassToNoteName,
} from './pitchClass';

// The first alias per quality doubles as the compact label shown on quality-selector
// buttons, so it should read as a chord-symbol suffix (e.g. "maj", "m", "dim").
export const QUALITY_ALIASES: Record<ChordQuality, string[]> = {
  major: ['maj', ''],
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

/** True when a chord's shorthand (e.g. "c#maj7") is an exact match for the query, not just a substring. */
export const chordMatchesQueryExactly = (chord: ChordDefinition, query: string): boolean => {
  const normalizedQuery = normalizeChordQuery(query);

  if (normalizedQuery.length === 0) {
    return false;
  }

  return getShorthandValues(chord).some((value) => value === normalizedQuery);
};

export interface ParsedChordSearchQuery {
  /** The part of the query before an optional "/bass" suffix, e.g. "Cmaj7" from "Cmaj7/E". */
  chordQuery: string;
  /** Resolved bass note when the query contains a recognizable "/<note>" suffix. */
  bass: NoteName | null;
  /** True when a "/..." suffix was typed at all, even if it didn't resolve to a valid note name. */
  hasBassQuery: boolean;
}

/**
 * Splits a free-form chord search query (e.g. "C/E", "F#m7/A#") into the chord
 * portion and an optional slash-chord bass note, so search and direct-entry
 * selection can support the same slash-chord notation used elsewhere in the app.
 */
export const parseChordSearchQuery = (query: string): ParsedChordSearchQuery => {
  const slashIndex = query.indexOf('/');

  if (slashIndex === -1) {
    return { chordQuery: query, bass: null, hasBassQuery: false };
  }

  const chordQuery = query.slice(0, slashIndex);
  const bassText = query.slice(slashIndex + 1).trim();
  const bassPitchClass = parseNoteNameToPitchClass(bassText);

  return {
    chordQuery,
    bass: bassPitchClass !== null ? pitchClassToNoteName(bassPitchClass) : null,
    hasBassQuery: bassText.length > 0,
  };
};
