import { CHORD_QUALITIES, NOTE_NAMES } from './types';
import type { ChordQuality, NoteName } from './types';
import { noteNameToPitchClass, normalizePitchClass, pitchClassToNoteName } from './pitchClass';

export { CHORD_QUALITIES, NOTE_NAMES };

const hasOwnValue = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value);

export const isNoteName = (value: unknown): value is NoteName => hasOwnValue(NOTE_NAMES, value);

export const isChordQuality = (value: unknown): value is ChordQuality =>
  hasOwnValue(CHORD_QUALITIES, value);

// Semitone offsets from the root, expressed as pitch-class intervals rather than
// display-name array positions, so chord math stays independent of note spelling.
const CHORD_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  dominant7: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
};

export const getChordNotes = (root: NoteName, quality: ChordQuality): NoteName[] => {
  const rootPitchClass = noteNameToPitchClass(root);

  return CHORD_INTERVALS[quality].map((interval) =>
    pitchClassToNoteName(normalizePitchClass(rootPitchClass + interval)),
  );
};

/** Appends a slash-chord bass note to a chord label, e.g. `formatSlashChordLabel('C major', 'E')` -> `C major/E`. */
export const formatSlashChordLabel = (label: string, bass?: NoteName): string =>
  bass ? `${label}/${bass}` : label;
