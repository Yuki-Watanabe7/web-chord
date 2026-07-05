import type { ChordDefinition, ChordQuality } from '../domain/music/types';

export type ChordType = ChordQuality;
export type Chord = ChordDefinition;

export interface ChordGridCell {
  chord: Chord | null;
  position: number;
} 
