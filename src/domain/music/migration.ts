import { getChordNotes, isChordQuality, isNoteName } from './chords';
import {
  DEFAULT_BPM,
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_TOTAL_MEASURES,
  gridToChordEvents,
  parseTimeSignature,
} from './timeline';
import type {
  ChordDefinition,
  ChordEvent,
  ChordQuality,
  MelodyNote,
  NoteName,
  Song,
  TimeSignature,
} from './types';
import type { ChordGridMeasure } from './timeline';

export interface LegacyBeatCell {
  chord: ChordDefinition | null;
  position: number;
  duration: number;
}

export interface LegacyMeasureCell {
  beats: LegacyBeatCell[];
  position: number;
}

export interface LegacySong {
  id: string;
  title: string;
  bpm: number;
  timeSignature: string;
  grid: LegacyMeasureCell[];
  createdAt: string;
  updatedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const asString = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);

const asPositiveNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
};

const asNonNegativeNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
};

const normalizeChordDefinition = (value: unknown): ChordDefinition | null => {
  if (!isRecord(value)) {
    return null;
  }

  const root = value.root;
  const quality = value.type;

  if (!isNoteName(root) || !isChordQuality(quality)) {
    return null;
  }

  return {
    root,
    type: quality,
    notes: getChordNotes(root, quality),
  };
};

const normalizeLegacyGrid = (value: unknown, timeSignature: TimeSignature): ChordGridMeasure[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((measure, measureIndex) => {
    if (!isRecord(measure) || !Array.isArray(measure.beats)) {
      return {
        position: measureIndex,
        beats: [],
      };
    }

    return {
      position: Number.isInteger(measure.position) ? Number(measure.position) : measureIndex,
      beats: measure.beats.slice(0, timeSignature.beatsPerMeasure).map((beat, beatIndex) => {
        if (!isRecord(beat)) {
          return {
            chord: null,
            position: beatIndex,
            duration: 1,
          };
        }

        return {
          chord: normalizeChordDefinition(beat.chord),
          position: Number.isInteger(beat.position) ? Number(beat.position) : beatIndex,
          duration: asPositiveNumber(beat.duration, 1),
        };
      }),
    };
  });
};

const normalizeChordEvents = (value: unknown): ChordEvent[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((event): ChordEvent[] => {
    if (!isRecord(event)) {
      return [];
    }

    const root = event.root;
    const quality = event.quality;

    if (!isNoteName(root) || !isChordQuality(quality)) {
      return [];
    }

    return [{
      id: asString(event.id, createId('chord')),
      root,
      quality,
      startBeat: asNonNegativeNumber(event.startBeat, 0),
      durationBeats: asPositiveNumber(event.durationBeats, 1),
    }];
  });
};

const normalizeMelodyNotes = (value: unknown): MelodyNote[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((note): MelodyNote[] => {
    if (!isRecord(note)) {
      return [];
    }

    const pitch = note.pitch;

    if (!isNoteName(pitch)) {
      return [];
    }

    return [{
      id: asString(note.id, createId('melody')),
      pitch,
      octave: Math.round(asPositiveNumber(note.octave, 4)),
      startBeat: asNonNegativeNumber(note.startBeat, 0),
      durationBeats: asPositiveNumber(note.durationBeats, 1),
      velocity: Math.min(1, Math.max(0, asPositiveNumber(note.velocity, 0.8))),
    }];
  });
};

const hasEventModel = (record: Record<string, unknown>) =>
  Array.isArray(record.chords) && Array.isArray(record.melodyNotes);

const hasLegacyGridModel = (record: Record<string, unknown>) => Array.isArray(record.grid);

export const normalizeSong = (value: unknown): Song | null => {
  if (!isRecord(value)) {
    return null;
  }

  const now = new Date().toISOString();
  const timeSignature = parseTimeSignature(value.timeSignature ?? DEFAULT_TIME_SIGNATURE);
  const legacyGrid = hasLegacyGridModel(value)
    ? normalizeLegacyGrid(value.grid, timeSignature)
    : [];
  const totalMeasures = Math.max(
    1,
    Math.round(asPositiveNumber(value.totalMeasures, legacyGrid.length || DEFAULT_TOTAL_MEASURES)),
  );

  if (!hasEventModel(value) && !hasLegacyGridModel(value)) {
    return null;
  }

  return {
    id: asString(value.id, createId('song')),
    title: asString(value.title, '新規曲'),
    bpm: asPositiveNumber(value.bpm, DEFAULT_BPM),
    timeSignature,
    totalMeasures,
    chords: hasEventModel(value)
      ? normalizeChordEvents(value.chords)
      : gridToChordEvents(legacyGrid, timeSignature),
    melodyNotes: hasEventModel(value) ? normalizeMelodyNotes(value.melodyNotes) : [],
    createdAt: asString(value.createdAt, now),
    updatedAt: asString(value.updatedAt, now),
  };
};

export const normalizeSongs = (value: unknown): Song[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((song): Song[] => {
    const normalizedSong = normalizeSong(song);
    return normalizedSong ? [normalizedSong] : [];
  });
};

export type { ChordQuality, NoteName };
