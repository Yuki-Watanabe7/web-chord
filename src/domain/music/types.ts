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

/** A letter name and its written accidental, kept independently from its pitch class. */
export type ChordStep = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface ChordPitch {
  step: ChordStep;
  /** Semitone offset from the natural letter: -2 = ♭♭, -1 = ♭, 0 = natural, 1 = ♯. */
  alter: -2 | -1 | 0 | 1 | 2;
}

/**
 * The MusicXML-compatible core chord kind. Extensions and degree changes are
 * deliberately separate so, for example, `C7(♭9)` does not collapse into a
 * single lossy quality string.
 */
export const CHORD_KINDS = [
  'major',
  'minor',
  'diminished',
  'augmented',
  'dominant',
  'suspended-second',
  'suspended-fourth',
  'half-diminished',
  'none',
  'other',
] as const;

export type ChordKind = (typeof CHORD_KINDS)[number];

export type ChordExtension = 6 | 7 | 9 | 11 | 13;

/** Mirrors MusicXML's degree-value, degree-alter, and degree-type fields. */
export interface ChordDegree {
  value: number;
  alter: number;
  type: 'add' | 'alter' | 'subtract';
}

export interface ChordParseWarning {
  code: 'empty-symbol' | 'missing-root' | 'invalid-bass' | 'unsupported-token' | 'ambiguous-symbol';
  message: string;
}

/**
 * A lossless chord-symbol representation used by imported scores. `raw` is
 * the exact score text (apart from surrounding whitespace); `normalized`
 * normalizes ASCII and music accidental glyphs for parsing/comparison.
 */
export interface ChordSymbol {
  raw: string;
  normalized: string;
  root?: ChordPitch;
  kind: ChordKind;
  extension?: ChordExtension;
  degrees: ChordDegree[];
  bass?: ChordPitch;
  warnings: ChordParseWarning[];
}

export interface ChordDefinition {
  root: NoteName;
  type: ChordQuality;
  notes: NoteName[];
  /** Optional slash-chord bass note (e.g. the `E` in `C/E`). Undefined means root-position. */
  bass?: NoteName;
  /** Preserves the written score symbol and its structured MusicXML-style meaning. */
  chordSymbol?: ChordSymbol;
}

export interface TimeSignature {
  beatsPerMeasure: number;
  beatUnit: number;
}

/** The initial resolution used by new songs. One quarter note is 480 ticks. */
export const DEFAULT_TICKS_PER_QUARTER = 480;

/**
 * A contiguous, already-expanded measure on the linear playback timeline.
 * `durationTicks` may be shorter than the active time signature only for the
 * first pickup measure.
 */
export interface SongMeasure {
  startTick: number;
  durationTicks: number;
}

export interface TimeSignatureEvent {
  tick: number;
  timeSignature: TimeSignature;
}

export interface KeySignatureEvent {
  tick: number;
  key: SongKey;
}

/** BPM is expressed in the active time-signature's beat unit. */
export interface TempoEvent {
  tick: number;
  bpm: number;
}

/**
 * An explicit MusicXML-style tie relationship. Notes in the same tie chain
 * share `id`; `type` records this fragment's role in that chain.
 */
export interface TieRelation {
  id: string;
  type: 'start' | 'continue' | 'stop';
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
  /**
   * Structured score notation. Legacy root/quality/bass remain for editor
   * compatibility; `none` and `other` use this field as their source of truth.
   */
  chordSymbol?: ChordSymbol;
  /** Integer tick position. This is the persisted timing value. */
  startTick: number;
  /** Integer tick duration. This is the persisted timing value. */
  durationTicks: number;
  tie?: TieRelation;
  /**
   * Derived compatibility value for the current editor UI. It is deliberately
   * non-enumerable, so it is never written to JSON persistence.
   */
  readonly startBeat: number;
  /** @see startBeat */
  readonly durationBeats: number;
}

export interface MelodyNote {
  id: string;
  pitch: NoteName;
  octave: number;
  /** Integer tick position. This is the persisted timing value. */
  startTick: number;
  /** Integer tick duration. This is the persisted timing value. */
  durationTicks: number;
  tie?: TieRelation;
  /** Derived, non-persisted editor compatibility value. */
  readonly startBeat: number;
  /** Derived, non-persisted editor compatibility value. */
  readonly durationBeats: number;
  velocity: number;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  totalMeasures: number;
  key: SongKey;
  /** Resolution for every persisted tick in this song. */
  ticksPerQuarter: number;
  /** Duration of the first measure when the song begins with an anacrusis. */
  pickupTicks: number;
  /** Expanded linear measures, including an optional first pickup measure. */
  measures: SongMeasure[];
  /** Ordered changes; each song always has an event at tick 0. */
  timeSignatureEvents: TimeSignatureEvent[];
  /** Ordered changes; each song always has an event at tick 0. */
  keySignatureEvents: KeySignatureEvent[];
  /** Ordered changes; each song always has an event at tick 0. */
  tempoEvents: TempoEvent[];
  chords: ChordEvent[];
  melodyNotes: MelodyNote[];
  createdAt: string;
  updatedAt: string;
}
