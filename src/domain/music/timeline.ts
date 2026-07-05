import { getChordNotes } from './chords';
import type { ChordDefinition, ChordEvent, Song, TimeSignature } from './types';

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

const createId = (prefix: string) => {
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
    id: options.id ?? createId('song'),
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
        id: createId('chord'),
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
  const nextGrid = resizeChordGridToTimeSignature(songToGrid(song), timeSignature);

  return {
    ...song,
    timeSignature,
    chords: gridToChordEvents(nextGrid, timeSignature),
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
