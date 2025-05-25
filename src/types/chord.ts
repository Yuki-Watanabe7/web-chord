export type ChordType = 'major' | 'minor' | 'diminished' | 'augmented' | 'dominant7' | 'major7' | 'minor7';

export interface Chord {
  root: string;
  type: ChordType;
  notes: string[];
}

export interface ChordGridCell {
  chord: Chord | null;
  position: number;
} 