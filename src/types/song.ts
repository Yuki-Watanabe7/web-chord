import type { Chord } from './chord';

export interface BeatCell {
  chord: Chord | null;
  position: number;
  duration: number;
}

export interface MeasureCell {
  beats: BeatCell[];
  position: number;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  timeSignature: string;
  grid: MeasureCell[];
  createdAt: string;
  updatedAt: string;
} 