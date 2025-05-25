import type { Chord, ChordType } from '../types/chord';

const chordTypes: ChordType[] = ['major', 'minor', 'diminished', 'augmented', 'dominant7', 'major7', 'minor7'];
const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const generateChordNotes = (root: string, type: ChordType): string[] => {
  const rootIndex = roots.indexOf(root);
  const notes: string[] = [root];

  switch (type) {
    case 'major':
      notes.push(roots[(rootIndex + 4) % 12], roots[(rootIndex + 7) % 12]);
      break;
    case 'minor':
      notes.push(roots[(rootIndex + 3) % 12], roots[(rootIndex + 7) % 12]);
      break;
    case 'diminished':
      notes.push(roots[(rootIndex + 3) % 12], roots[(rootIndex + 6) % 12]);
      break;
    case 'augmented':
      notes.push(roots[(rootIndex + 4) % 12], roots[(rootIndex + 8) % 12]);
      break;
    case 'dominant7':
      notes.push(roots[(rootIndex + 4) % 12], roots[(rootIndex + 7) % 12], roots[(rootIndex + 10) % 12]);
      break;
    case 'major7':
      notes.push(roots[(rootIndex + 4) % 12], roots[(rootIndex + 7) % 12], roots[(rootIndex + 11) % 12]);
      break;
    case 'minor7':
      notes.push(roots[(rootIndex + 3) % 12], roots[(rootIndex + 7) % 12], roots[(rootIndex + 10) % 12]);
      break;
  }

  return notes;
};

export const chords: Chord[] = roots.flatMap(root =>
  chordTypes.map(type => ({
    root,
    type,
    notes: generateChordNotes(root, type)
  }))
); 