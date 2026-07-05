import { CHORD_QUALITIES, NOTE_NAMES } from './types';
import type { ChordQuality, NoteName } from './types';

export { CHORD_QUALITIES, NOTE_NAMES };

const hasOwnValue = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value);

export const isNoteName = (value: unknown): value is NoteName => hasOwnValue(NOTE_NAMES, value);

export const isChordQuality = (value: unknown): value is ChordQuality =>
  hasOwnValue(CHORD_QUALITIES, value);

export const getChordNotes = (root: NoteName, quality: ChordQuality): NoteName[] => {
  const rootIndex = NOTE_NAMES.indexOf(root);
  const notes: NoteName[] = [root];

  const noteAt = (semitones: number) => NOTE_NAMES[(rootIndex + semitones) % NOTE_NAMES.length];

  switch (quality) {
    case 'major':
      notes.push(noteAt(4), noteAt(7));
      break;
    case 'minor':
      notes.push(noteAt(3), noteAt(7));
      break;
    case 'diminished':
      notes.push(noteAt(3), noteAt(6));
      break;
    case 'augmented':
      notes.push(noteAt(4), noteAt(8));
      break;
    case 'dominant7':
      notes.push(noteAt(4), noteAt(7), noteAt(10));
      break;
    case 'major7':
      notes.push(noteAt(4), noteAt(7), noteAt(11));
      break;
    case 'minor7':
      notes.push(noteAt(3), noteAt(7), noteAt(10));
      break;
  }

  return notes;
};
