import { getChordNotes } from './chords';
import { PITCH_CLASS_COUNT, noteNameToPitchClass, normalizePitchClass, pitchClassToNoteName } from './pitchClass';
import type {
  ChordDefinition,
  ChordEvent,
  MelodyNote,
  NoteName,
  Song,
  SongKey,
  TimeSignature,
} from './types';

export const DEFAULT_TOTAL_MEASURES = 16;
export const DEFAULT_BPM = 120;
export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beatsPerMeasure: 4,
  beatUnit: 4,
};
export const DEFAULT_SONG_KEY: SongKey = {
  tonic: 'C',
  mode: 'major',
};

export interface ChordGridBeat {
  chord: ChordDefinition | null;
  position: number;
  duration: number;
}

export interface ChordGridMeasure {
  beats: ChordGridBeat[];
  position: number;
}

export interface MeasureRange {
  startMeasure: number;
  measureCount: number;
}

export interface MeasureRangeClipboardChord {
  relativeStartBeat: number;
  root: ChordEvent['root'];
  quality: ChordEvent['quality'];
  bass?: ChordEvent['bass'];
  durationBeats: number;
}

export interface MeasureRangeClipboardMelodyNote {
  relativeStartBeat: number;
  pitch: MelodyNote['pitch'];
  octave: number;
  durationBeats: number;
  velocity: number;
}

export interface MeasureRangeClipboard {
  measureCount: number;
  beatCount: number;
  chords: MeasureRangeClipboardChord[];
  melodyNotes: MeasureRangeClipboardMelodyNote[];
}

export const createMusicId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isPositiveInteger = (value: number) => Number.isInteger(value) && value > 0;

export const parseTimeSignature = (value: unknown): TimeSignature => {
  if (typeof value === 'string') {
    const [beatsPerMeasure, beatUnit] = value.split('/').map(Number);
    if (isPositiveInteger(beatsPerMeasure) && isPositiveInteger(beatUnit)) {
      return { beatsPerMeasure, beatUnit };
    }
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const beatsPerMeasure = Number(record.beatsPerMeasure);
    const beatUnit = Number(record.beatUnit);

    if (isPositiveInteger(beatsPerMeasure) && isPositiveInteger(beatUnit)) {
      return { beatsPerMeasure, beatUnit };
    }
  }

  return DEFAULT_TIME_SIGNATURE;
};

export const formatTimeSignature = (timeSignature: TimeSignature) =>
  `${timeSignature.beatsPerMeasure}/${timeSignature.beatUnit}`;

export const getTotalBeats = (song: Pick<Song, 'timeSignature' | 'totalMeasures'>) =>
  Math.max(0, song.totalMeasures * song.timeSignature.beatsPerMeasure);

export const normalizeMeasureRange = (
  song: Pick<Song, 'totalMeasures'>,
  range: MeasureRange,
): MeasureRange => {
  const totalMeasures = Math.max(1, Math.floor(song.totalMeasures) || DEFAULT_TOTAL_MEASURES);
  const startMeasure = Math.max(
    0,
    Math.min(Math.floor(range.startMeasure) || 0, totalMeasures - 1),
  );
  const measureCount = Math.max(
    1,
    Math.min(Math.floor(range.measureCount) || 1, totalMeasures - startMeasure),
  );

  return { startMeasure, measureCount };
};

const getMeasureRangeBeats = (
  song: Pick<Song, 'timeSignature' | 'totalMeasures'>,
  range: MeasureRange,
) => {
  const normalizedRange = normalizeMeasureRange(song, range);
  const startBeat = normalizedRange.startMeasure * song.timeSignature.beatsPerMeasure;
  const beatCount = normalizedRange.measureCount * song.timeSignature.beatsPerMeasure;

  return {
    ...normalizedRange,
    startBeat,
    endBeat: startBeat + beatCount,
    beatCount,
  };
};

export const canDuplicateMeasureRangeToNext = (song: Song, range: MeasureRange) => {
  const totalBeats = getTotalBeats(song);
  const source = getMeasureRangeBeats(song, range);

  return source.beatCount > 0 && source.endBeat + source.beatCount <= totalBeats;
};

export const getChordEndBeat = (chord: Pick<ChordEvent, 'startBeat' | 'durationBeats'>) =>
  chord.startBeat + chord.durationBeats;

export const getMelodyNoteEndBeat = (
  note: Pick<MelodyNote, 'startBeat' | 'durationBeats'>,
) => note.startBeat + note.durationBeats;

export const sortChordEvents = (chords: ChordEvent[]) =>
  [...chords].sort((a, b) => {
    if (a.startBeat === b.startBeat) {
      return a.id.localeCompare(b.id);
    }

    return a.startBeat - b.startBeat;
  });

export const sortMelodyNotes = (notes: MelodyNote[]) =>
  [...notes].sort((a, b) => {
    if (a.startBeat !== b.startBeat) {
      return a.startBeat - b.startBeat;
    }

    if (a.octave !== b.octave) {
      return a.octave - b.octave;
    }

    if (a.pitch !== b.pitch) {
      return a.pitch.localeCompare(b.pitch);
    }

    return a.id.localeCompare(b.id);
  });

export const chordEventToChordDefinition = (chord: ChordEvent): ChordDefinition => ({
  root: chord.root,
  type: chord.quality,
  notes: getChordNotes(chord.root, chord.quality),
  bass: chord.bass,
});

export const createEmptyGrid = (
  totalMeasures = DEFAULT_TOTAL_MEASURES,
  beatsPerMeasure = DEFAULT_TIME_SIGNATURE.beatsPerMeasure,
): ChordGridMeasure[] =>
  Array.from({ length: totalMeasures }, (_, measureIndex) => ({
    position: measureIndex,
    beats: Array.from({ length: beatsPerMeasure }, (_, beatIndex) => ({
      chord: null,
      position: beatIndex,
      duration: 1,
    })),
  }));

export const createEmptySong = (options: Partial<Song> = {}): Song => {
  const now = new Date().toISOString();

  return {
    id: options.id ?? createMusicId('song'),
    title: options.title ?? '新規曲',
    bpm: options.bpm ?? DEFAULT_BPM,
    timeSignature: options.timeSignature ?? DEFAULT_TIME_SIGNATURE,
    totalMeasures: options.totalMeasures ?? DEFAULT_TOTAL_MEASURES,
    key: options.key ?? DEFAULT_SONG_KEY,
    chords: options.chords ?? [],
    melodyNotes: options.melodyNotes ?? [],
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  };
};

export const gridToChordEvents = (
  grid: ChordGridMeasure[],
  timeSignature: TimeSignature,
): ChordEvent[] =>
  grid.flatMap((measure, measureIndex) => {
    const measurePosition = Number.isInteger(measure.position) ? measure.position : measureIndex;

    return measure.beats.flatMap((beat, beatIndex) => {
      if (!beat.chord) {
        return [];
      }

      const beatPosition = Number.isInteger(beat.position) ? beat.position : beatIndex;
      const durationBeats = Math.max(1, beat.duration);

      return {
        id: createMusicId('chord'),
        root: beat.chord.root,
        quality: beat.chord.type,
        bass: beat.chord.bass,
        startBeat: measurePosition * timeSignature.beatsPerMeasure + beatPosition,
        durationBeats,
      };
    });
  });

export const resizeChordGridToTimeSignature = (
  grid: ChordGridMeasure[],
  timeSignature: TimeSignature,
): ChordGridMeasure[] =>
  grid.map((measure) => ({
    ...measure,
    beats: Array.from({ length: timeSignature.beatsPerMeasure }, (_, beatIndex) => ({
      chord: measure.beats[beatIndex]?.chord ?? null,
      position: beatIndex,
      duration: 1,
    })),
  }));

export const placeChordOnGrid = (
  grid: ChordGridMeasure[],
  measurePosition: number,
  beatPosition: number,
  chord: ChordDefinition,
): ChordGridMeasure[] =>
  grid.map((measure) => {
    if (measure.position !== measurePosition) {
      return measure;
    }

    const updatedBeats = measure.beats.map((beat, index) => {
      if (index < beatPosition && beat.chord !== null) {
        let duration = 1;

        for (let nextIndex = index + 1; nextIndex < beatPosition; nextIndex++) {
          if (measure.beats[nextIndex]?.chord === null) {
            duration++;
          } else {
            break;
          }
        }

        return { ...beat, duration };
      }

      return beat;
    });

    let duration = 1;
    for (let index = beatPosition + 1; index < measure.beats.length; index++) {
      if (updatedBeats[index]?.chord === null) {
        duration++;
      } else {
        break;
      }
    }

    return {
      ...measure,
      beats: updatedBeats.map((beat, index) => {
        if (index === beatPosition) {
          return { ...beat, chord, duration };
        }

        if (index > beatPosition && index < beatPosition + duration) {
          return { ...beat, chord: null, duration: 1 };
        }

        return beat;
      }),
    };
  });

export const songToGrid = (song: Song): ChordGridMeasure[] => {
  const grid = createEmptyGrid(song.totalMeasures, song.timeSignature.beatsPerMeasure);

  song.chords.forEach((chordEvent) => {
    const measureIndex = Math.floor(chordEvent.startBeat / song.timeSignature.beatsPerMeasure);
    const beatIndex = chordEvent.startBeat % song.timeSignature.beatsPerMeasure;

    if (
      !Number.isInteger(chordEvent.startBeat) ||
      !Number.isInteger(beatIndex) ||
      !grid[measureIndex]?.beats[beatIndex]
    ) {
      return;
    }

    grid[measureIndex].beats[beatIndex] = {
      ...grid[measureIndex].beats[beatIndex],
      chord: {
        root: chordEvent.root,
        type: chordEvent.quality,
        notes: getChordNotes(chordEvent.root, chordEvent.quality),
        bass: chordEvent.bass,
      },
      duration: Math.max(1, chordEvent.durationBeats),
    };
  });

  return grid;
};

export const changeSongTimeSignature = (song: Song, timeSignature: TimeSignature): Song => {
  return {
    ...song,
    timeSignature,
  };
};

const MIN_MELODY_OCTAVE = 0;
const MAX_MELODY_OCTAVE = 8;

export const transposeNoteName = (note: NoteName, semitones: number): NoteName =>
  pitchClassToNoteName(normalizePitchClass(noteNameToPitchClass(note) + semitones));

/**
 * Signed shift (in [-6, 6]) from one tonic to another, chosen as the shortest
 * path around the pitch-class circle rather than always going upward — e.g.
 * C -> B transposes down a semitone instead of up eleven.
 */
export const getKeyTransposeSemitones = (fromTonic: NoteName, toTonic: NoteName): number => {
  const upwardShift = normalizePitchClass(
    noteNameToPitchClass(toTonic) - noteNameToPitchClass(fromTonic),
  );

  return upwardShift > 6 ? upwardShift - 12 : upwardShift;
};

export const transposeChordEvent = (chord: ChordEvent, semitones: number): ChordEvent => ({
  ...chord,
  root: transposeNoteName(chord.root, semitones),
  bass: chord.bass ? transposeNoteName(chord.bass, semitones) : undefined,
});

export const transposeMelodyNote = (note: MelodyNote, semitones: number): MelodyNote => {
  const octaveShift = Math.floor((noteNameToPitchClass(note.pitch) + semitones) / PITCH_CLASS_COUNT);

  return {
    ...note,
    pitch: transposeNoteName(note.pitch, semitones),
    octave: Math.max(MIN_MELODY_OCTAVE, Math.min(MAX_MELODY_OCTAVE, note.octave + octaveShift)),
  };
};

export interface ChangeSongKeyOptions {
  /**
   * Whether to transpose existing chords and melody notes to follow the new
   * tonic. Chords and melody are always transposed together (never chords
   * only) so their harmonic relationship stays intact; when false, only the
   * `key` label is updated and existing notes are left as-is.
   */
  transposeExisting?: boolean;
}

export const changeSongKey = (
  song: Song,
  nextKey: SongKey,
  options: ChangeSongKeyOptions = {},
): Song => {
  const semitones = getKeyTransposeSemitones(song.key.tonic, nextKey.tonic);

  if (!options.transposeExisting || semitones === 0) {
    return { ...song, key: nextKey };
  }

  return {
    ...song,
    key: nextKey,
    chords: song.chords.map((chord) => transposeChordEvent(chord, semitones)),
    melodyNotes: song.melodyNotes.map((note) => transposeMelodyNote(note, semitones)),
  };
};

export const placeChordInSong = (
  song: Song,
  measurePosition: number,
  beatPosition: number,
  chord: ChordDefinition,
): Song => {
  const nextGrid = placeChordOnGrid(songToGrid(song), measurePosition, beatPosition, chord);

  return {
    ...song,
    chords: gridToChordEvents(nextGrid, song.timeSignature),
  };
};

const isEventInBeatRange = (
  event: Pick<ChordEvent | MelodyNote, 'startBeat' | 'durationBeats'>,
  rangeStartBeat: number,
  rangeEndBeat: number,
) => event.startBeat < rangeEndBeat && event.startBeat + event.durationBeats > rangeStartBeat;

const trimEventAtBeat = <T extends Pick<ChordEvent | MelodyNote, 'startBeat' | 'durationBeats'>>(
  event: T,
  endBeat: number,
): T | null => {
  const nextDuration = endBeat - event.startBeat;

  if (nextDuration <= 0) {
    return null;
  }

  return {
    ...event,
    durationBeats: nextDuration,
  };
};

const copyChordRange = (
  chords: ChordEvent[],
  sourceStartBeat: number,
  sourceEndBeat: number,
): MeasureRangeClipboardChord[] =>
  chords.flatMap((chord): MeasureRangeClipboardChord[] => {
    if (!isEventInBeatRange(chord, sourceStartBeat, sourceEndBeat)) {
      return [];
    }

    const clippedStartBeat = Math.max(chord.startBeat, sourceStartBeat);
    const clippedEndBeat = Math.min(getChordEndBeat(chord), sourceEndBeat);

    if (clippedEndBeat <= clippedStartBeat) {
      return [];
    }

    return [{
      root: chord.root,
      quality: chord.quality,
      bass: chord.bass,
      relativeStartBeat: clippedStartBeat - sourceStartBeat,
      durationBeats: clippedEndBeat - clippedStartBeat,
    }];
  });

const copyMelodyRange = (
  notes: MelodyNote[],
  sourceStartBeat: number,
  sourceEndBeat: number,
): MeasureRangeClipboardMelodyNote[] =>
  notes.flatMap((note): MeasureRangeClipboardMelodyNote[] => {
    if (!isEventInBeatRange(note, sourceStartBeat, sourceEndBeat)) {
      return [];
    }

    const clippedStartBeat = Math.max(note.startBeat, sourceStartBeat);
    const clippedEndBeat = Math.min(getMelodyNoteEndBeat(note), sourceEndBeat);

    if (clippedEndBeat <= clippedStartBeat) {
      return [];
    }

    return [{
      pitch: note.pitch,
      octave: note.octave,
      relativeStartBeat: clippedStartBeat - sourceStartBeat,
      durationBeats: clippedEndBeat - clippedStartBeat,
      velocity: note.velocity,
    }];
  });

export const copyMeasureRangeFromSong = (
  song: Song,
  range: MeasureRange,
): MeasureRangeClipboard => {
  const source = getMeasureRangeBeats(song, range);

  return {
    measureCount: source.measureCount,
    beatCount: source.beatCount,
    chords: copyChordRange(song.chords, source.startBeat, source.endBeat),
    melodyNotes: copyMelodyRange(song.melodyNotes, source.startBeat, source.endBeat),
  };
};

const getMeasureStartBeat = (
  song: Pick<Song, 'timeSignature'>,
  startMeasure: number,
) => Math.floor(startMeasure) * song.timeSignature.beatsPerMeasure;

export const canPasteMeasureRangeClipboard = (
  song: Song,
  clipboard: MeasureRangeClipboard | null,
  targetStartMeasure: number,
) => {
  if (!clipboard || clipboard.beatCount <= 0) {
    return false;
  }

  const targetMeasure = Math.floor(targetStartMeasure);

  if (
    !Number.isInteger(targetMeasure) ||
    targetMeasure < 0 ||
    targetMeasure >= song.totalMeasures
  ) {
    return false;
  }

  const totalBeats = getTotalBeats(song);
  const targetStartBeat = getMeasureStartBeat(song, targetMeasure);

  return targetStartBeat + clipboard.beatCount <= totalBeats;
};

const preserveEventsOutsidePasteRange = <
  T extends Pick<ChordEvent | MelodyNote, 'startBeat' | 'durationBeats'>,
>(
  events: T[],
  targetStartBeat: number,
  targetEndBeat: number,
) =>
  events.flatMap((event): T[] => {
    if (!isEventInBeatRange(event, targetStartBeat, targetEndBeat)) {
      return [event];
    }

    if (event.startBeat < targetStartBeat) {
      const trimmedEvent = trimEventAtBeat(event, targetStartBeat);
      return trimmedEvent ? [trimmedEvent] : [];
    }

    return [];
  });

const pasteChordRange = (
  chords: ChordEvent[],
  clipboard: MeasureRangeClipboard,
  targetStartBeat: number,
  targetEndBeat: number,
) => {
  const pastedChords = clipboard.chords.map((chord): ChordEvent => ({
    id: createMusicId('chord'),
    root: chord.root,
    quality: chord.quality,
    bass: chord.bass,
    startBeat: targetStartBeat + chord.relativeStartBeat,
    durationBeats: chord.durationBeats,
  }));

  const preservedChords = preserveEventsOutsidePasteRange(
    chords,
    targetStartBeat,
    targetEndBeat,
  );

  return sortChordEvents([...preservedChords, ...pastedChords]);
};

const pasteMelodyRange = (
  notes: MelodyNote[],
  clipboard: MeasureRangeClipboard,
  targetStartBeat: number,
  targetEndBeat: number,
) => {
  const pastedNotes = clipboard.melodyNotes.map((note): MelodyNote => ({
    id: createMusicId('melody'),
    pitch: note.pitch,
    octave: note.octave,
    startBeat: targetStartBeat + note.relativeStartBeat,
    durationBeats: note.durationBeats,
    velocity: note.velocity,
  }));

  const preservedNotes = preserveEventsOutsidePasteRange(
    notes,
    targetStartBeat,
    targetEndBeat,
  );

  return sortMelodyNotes([...preservedNotes, ...pastedNotes]);
};

export const pasteMeasureRangeClipboard = (
  song: Song,
  clipboard: MeasureRangeClipboard | null,
  targetStartMeasure: number,
): Song => {
  if (!clipboard || !canPasteMeasureRangeClipboard(song, clipboard, targetStartMeasure)) {
    return song;
  }

  const targetMeasure = Math.floor(targetStartMeasure);
  const targetStartBeat = getMeasureStartBeat(song, targetMeasure);
  const targetEndBeat = targetStartBeat + clipboard.beatCount;

  return {
    ...song,
    chords: pasteChordRange(song.chords, clipboard, targetStartBeat, targetEndBeat),
    melodyNotes: pasteMelodyRange(song.melodyNotes, clipboard, targetStartBeat, targetEndBeat),
  };
};

export const duplicateMeasureRangeToNext = (song: Song, range: MeasureRange): Song => {
  if (!canDuplicateMeasureRangeToNext(song, range)) {
    return song;
  }

  const source = getMeasureRangeBeats(song, range);
  const clipboard = copyMeasureRangeFromSong(song, range);

  return pasteMeasureRangeClipboard(song, clipboard, source.startMeasure + source.measureCount);
};

const clampBeatPosition = (startBeat: number, totalBeats: number) =>
  Math.max(0, Math.min(Math.floor(startBeat), Math.max(0, totalBeats - 1)));

export const getChordMaxDurationBeats = (song: Song, chordId: string) => {
  const targetChord = song.chords.find((chord) => chord.id === chordId);

  if (!targetChord) {
    return 1;
  }

  const totalBeats = getTotalBeats(song);
  const nextChord = sortChordEvents(song.chords).find(
    (chord) => chord.id !== chordId && chord.startBeat > targetChord.startBeat,
  );
  const nextBoundary = nextChord ? nextChord.startBeat : totalBeats;

  return Math.max(1, Math.floor(nextBoundary - targetChord.startBeat));
};

export const insertChordInSong = (
  song: Song,
  startBeat: number,
  chord: ChordDefinition,
): Song => {
  const totalBeats = getTotalBeats(song);

  if (totalBeats === 0) {
    return song;
  }

  const nextStartBeat = clampBeatPosition(startBeat, totalBeats);
  const nextChord = sortChordEvents(song.chords).find(
    (existingChord) => existingChord.startBeat > nextStartBeat,
  );
  const nextBoundary = nextChord ? nextChord.startBeat : totalBeats;
  const insertedChord: ChordEvent = {
    id: createMusicId('chord'),
    root: chord.root,
    quality: chord.type,
    bass: chord.bass,
    startBeat: nextStartBeat,
    durationBeats: Math.max(1, Math.floor(nextBoundary - nextStartBeat)),
  };

  const preservedChords = song.chords.flatMap((existingChord): ChordEvent[] => {
    if (existingChord.startBeat === nextStartBeat) {
      return [];
    }

    if (
      existingChord.startBeat < nextStartBeat &&
      getChordEndBeat(existingChord) > nextStartBeat
    ) {
      return [{
        ...existingChord,
        durationBeats: Math.max(1, nextStartBeat - existingChord.startBeat),
      }];
    }

    return [existingChord];
  });

  return {
    ...song,
    chords: sortChordEvents([...preservedChords, insertedChord]),
  };
};

export const deleteChordFromSong = (song: Song, chordId: string): Song => ({
  ...song,
  chords: song.chords.filter((chord) => chord.id !== chordId),
});

export const resizeChordInSong = (
  song: Song,
  chordId: string,
  durationBeats: number,
): Song => {
  const targetChord = song.chords.find((chord) => chord.id === chordId);

  if (!targetChord) {
    return song;
  }

  const maxDuration = getChordMaxDurationBeats(song, chordId);
  const nextDuration = Math.max(1, Math.min(Math.round(durationBeats), maxDuration));

  return {
    ...song,
    chords: sortChordEvents(song.chords.map((chord) => (
      chord.id === chordId ? { ...chord, durationBeats: nextDuration } : chord
    ))),
  };
};

const isSameMelodyPitch = (
  first: Pick<MelodyNote, 'pitch' | 'octave'>,
  second: Pick<MelodyNote, 'pitch' | 'octave'>,
) => first.pitch === second.pitch && first.octave === second.octave;

export const getMelodyNoteMaxDurationBeats = (song: Song, noteId: string) => {
  const targetNote = song.melodyNotes.find((note) => note.id === noteId);

  if (!targetNote) {
    return 1;
  }

  const totalBeats = getTotalBeats(song);
  const nextNote = sortMelodyNotes(song.melodyNotes).find(
    (note) =>
      note.id !== noteId &&
      isSameMelodyPitch(note, targetNote) &&
      note.startBeat > targetNote.startBeat,
  );
  const nextBoundary = nextNote ? nextNote.startBeat : totalBeats;

  return Math.max(1, Math.floor(nextBoundary - targetNote.startBeat));
};

export const insertMelodyNoteInSong = (
  song: Song,
  startBeat: number,
  pitch: NoteName,
  octave: number,
  noteId = createMusicId('melody'),
): Song => {
  const totalBeats = getTotalBeats(song);

  if (totalBeats === 0) {
    return song;
  }

  const nextStartBeat = clampBeatPosition(startBeat, totalBeats);
  const nextOctave = Math.max(0, Math.min(8, Math.round(octave)));
  const insertedNote: MelodyNote = {
    id: noteId,
    pitch,
    octave: nextOctave,
    startBeat: nextStartBeat,
    durationBeats: 1,
    velocity: 0.8,
  };

  const preservedNotes = song.melodyNotes.flatMap((existingNote): MelodyNote[] => {
    if (!isSameMelodyPitch(existingNote, insertedNote)) {
      return [existingNote];
    }

    if (existingNote.startBeat === nextStartBeat) {
      return [];
    }

    if (
      existingNote.startBeat < nextStartBeat &&
      getMelodyNoteEndBeat(existingNote) > nextStartBeat
    ) {
      return [{
        ...existingNote,
        durationBeats: Math.max(1, nextStartBeat - existingNote.startBeat),
      }];
    }

    return [existingNote];
  });

  return {
    ...song,
    melodyNotes: sortMelodyNotes([...preservedNotes, insertedNote]),
  };
};

export const deleteMelodyNoteFromSong = (song: Song, noteId: string): Song => ({
  ...song,
  melodyNotes: song.melodyNotes.filter((note) => note.id !== noteId),
});

export const resizeMelodyNoteInSong = (
  song: Song,
  noteId: string,
  durationBeats: number,
): Song => {
  const targetNote = song.melodyNotes.find((note) => note.id === noteId);

  if (!targetNote) {
    return song;
  }

  const maxDuration = getMelodyNoteMaxDurationBeats(song, noteId);
  const nextDuration = Math.max(1, Math.min(Math.round(durationBeats), maxDuration));

  return {
    ...song,
    melodyNotes: sortMelodyNotes(song.melodyNotes.map((note) => (
      note.id === noteId ? { ...note, durationBeats: nextDuration } : note
    ))),
  };
};
