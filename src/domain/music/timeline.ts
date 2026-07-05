import { getChordNotes } from './chords';
import type {
  ChordDefinition,
  ChordEvent,
  MelodyNote,
  NoteName,
  Song,
  TimeSignature,
} from './types';

export const DEFAULT_TOTAL_MEASURES = 16;
export const DEFAULT_BPM = 120;
export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beatsPerMeasure: 4,
  beatUnit: 4,
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
