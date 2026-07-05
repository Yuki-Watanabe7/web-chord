import { CHORD_QUALITIES, NOTE_NAMES, getChordNotes } from '../domain/music/chords';
import type { Chord, ChordType } from '../types/chord';
import type { NoteName } from '../domain/music/types';

const chordTypes: ChordType[] = [...CHORD_QUALITIES];
const roots: NoteName[] = [...NOTE_NAMES];

export const generateChordNotes = (root: NoteName, type: ChordType): NoteName[] =>
  getChordNotes(root, type);

export const chords: Chord[] = roots.flatMap(root =>
  chordTypes.map(type => ({
    root,
    type,
    notes: generateChordNotes(root, type)
  }))
); 
