export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

export const CHORD_QUALITIES = [
  'major',
  'minor',
  'diminished',
  'augmented',
  'dominant7',
  'major7',
  'minor7',
] as const;

export type ChordQuality = (typeof CHORD_QUALITIES)[number];

export interface ChordDefinition {
  root: NoteName;
  type: ChordQuality;
  notes: NoteName[];
  /** Optional slash-chord bass note (e.g. the `E` in `C/E`). Undefined means root-position. */
  bass?: NoteName;
}

export interface TimeSignature {
  beatsPerMeasure: number;
  beatUnit: number;
}

export const SONG_KEY_MODES = ['major', 'minor'] as const;

export type SongKeyMode = (typeof SONG_KEY_MODES)[number];

export interface SongKey {
  tonic: NoteName;
  mode: SongKeyMode;
}

// UI-only preference for how chords are labeled (chord name vs. roman numeral
// relative to the song's key). Not persisted as part of `Song`.
export const CHORD_DISPLAY_MODES = ['symbol', 'roman'] as const;

export type ChordDisplayMode = (typeof CHORD_DISPLAY_MODES)[number];

export interface ChordEvent {
  id: string;
  root: NoteName;
  quality: ChordQuality;
  /** Optional slash-chord bass note (e.g. the `E` in `C/E`). Undefined means root-position. */
  bass?: NoteName;
  startBeat: number;
  durationBeats: number;
}

export interface MelodyNote {
  id: string;
  pitch: NoteName;
  octave: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  totalMeasures: number;
  key: SongKey;
  chords: ChordEvent[];
  melodyNotes: MelodyNote[];
  createdAt: string;
  updatedAt: string;
}
