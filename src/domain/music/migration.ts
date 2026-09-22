import { getChordNotes, isChordQuality, isNoteName, isSongKeyMode } from './chords';
import {
  chordSymbolToLegacyFields,
  createChordSymbolFromLegacyChord,
  normalizeChordSymbol,
} from './chordSymbol';
import { DEFAULT_TICKS_PER_QUARTER } from './types';
import {
  DEFAULT_BPM, DEFAULT_SONG_KEY, DEFAULT_TIME_SIGNATURE, DEFAULT_TOTAL_MEASURES,
  createEmptySong, gridToChordEvents, normalizeTotalMeasures, parseTimeSignature,
} from './timeline';
import { isNonNegativeInteger, isPositiveInteger } from './timing';
import type {
  ChordDefinition, ChordEvent, ChordQuality, KeySignatureEvent, MelodyNote, NoteName,
  Song, SongKey, SongMeasure, TempoEvent, TieRelation, TimeSignature, TimeSignatureEvent,
} from './types';
import type { ChordGridMeasure } from './timeline';

export interface LegacyBeatCell { chord: ChordDefinition | null; position: number; duration: number; }
export interface LegacyMeasureCell { beats: LegacyBeatCell[]; position: number; }
export interface LegacySong { id: string; title: string; bpm: number; timeSignature: string; grid: LegacyMeasureCell[]; createdAt: string; updatedAt: string; }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const asString = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback;
const asPositiveNumber = (value: unknown, fallback: number) => { const numberValue = Number(value); return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback; };
const asNonNegativeNumber = (value: unknown, fallback: number) => { const numberValue = Number(value); return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback; };
const createId = (prefix: string) => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalizeBass = (value: unknown): NoteName | undefined => isNoteName(value) ? value : undefined;
const normalizeTie = (value: unknown): TieRelation | undefined => isRecord(value) && typeof value.id === 'string' && ['start', 'continue', 'stop'].includes(String(value.type)) ? { id: value.id, type: value.type as TieRelation['type'] } : undefined;
const normalizeSongKey = (value: unknown): SongKey => isRecord(value)
  ? { tonic: isNoteName(value.tonic) ? value.tonic : DEFAULT_SONG_KEY.tonic, mode: isSongKeyMode(value.mode) ? value.mode : DEFAULT_SONG_KEY.mode }
  : DEFAULT_SONG_KEY;

const normalizeChordDefinition = (value: unknown): ChordDefinition | null => {
  if (!isRecord(value) || !isNoteName(value.root) || !isChordQuality(value.type)) return null;
  const bass = normalizeBass(value.bass);
  return {
    root: value.root,
    type: value.type,
    notes: getChordNotes(value.root, value.type),
    bass,
    chordSymbol: normalizeChordSymbol(value.chordSymbol ?? value.symbol) ?? createChordSymbolFromLegacyChord(value.root, value.type, bass),
  };
};
const normalizeLegacyGrid = (value: unknown, signature: TimeSignature): ChordGridMeasure[] => !Array.isArray(value) ? [] : value.map((measure, index) => {
  if (!isRecord(measure) || !Array.isArray(measure.beats)) return { position: index, beats: [] };
  return { position: Number.isInteger(measure.position) ? Number(measure.position) : index,
    beats: measure.beats.slice(0, signature.beatsPerMeasure).map((beat, beatIndex) => !isRecord(beat)
      ? { chord: null, position: beatIndex, duration: 1 }
      : { chord: normalizeChordDefinition(beat.chord), position: Number.isInteger(beat.position) ? Number(beat.position) : beatIndex, duration: asPositiveNumber(beat.duration, 1) }),
  };
});

const normalizeChordEvents = (value: unknown): ChordEvent[] => !Array.isArray(value) ? [] : value.flatMap((event): ChordEvent[] => {
  if (!isRecord(event)) return [];
  const chordSymbol = normalizeChordSymbol(event.chordSymbol ?? event.symbol);
  const legacy = isNoteName(event.root) && isChordQuality(event.quality)
    ? { root: event.root, quality: event.quality, bass: normalizeBass(event.bass) }
    : chordSymbol ? chordSymbolToLegacyFields(chordSymbol) : null;
  if (!legacy) return [];
  const tickBased = isNonNegativeInteger(event.startTick) && isPositiveInteger(event.durationTicks);
  return [{ id: asString(event.id, createId('chord')), ...legacy, chordSymbol: chordSymbol ?? createChordSymbolFromLegacyChord(legacy.root, legacy.quality, legacy.bass), tie: normalizeTie(event.tie),
    ...(tickBased ? { startTick: event.startTick, durationTicks: event.durationTicks } : { startBeat: asNonNegativeNumber(event.startBeat, 0), durationBeats: asPositiveNumber(event.durationBeats, 1) }),
  } as ChordEvent];
});
const normalizeMelodyNotes = (value: unknown): MelodyNote[] => !Array.isArray(value) ? [] : value.flatMap((note): MelodyNote[] => {
  if (!isRecord(note) || !isNoteName(note.pitch)) return [];
  const tickBased = isNonNegativeInteger(note.startTick) && isPositiveInteger(note.durationTicks);
  return [{ id: asString(note.id, createId('melody')), pitch: note.pitch, octave: Math.round(asPositiveNumber(note.octave, 4)), velocity: Math.min(1, Math.max(0, asPositiveNumber(note.velocity, 0.8))), tie: normalizeTie(note.tie),
    ...(tickBased ? { startTick: note.startTick, durationTicks: note.durationTicks } : { startBeat: asNonNegativeNumber(note.startBeat, 0), durationBeats: asPositiveNumber(note.durationBeats, 1) }),
  } as MelodyNote];
});

const normalizeMeasures = (value: unknown): SongMeasure[] => !Array.isArray(value) ? [] : value.flatMap((measure): SongMeasure[] => isRecord(measure) && isNonNegativeInteger(measure.startTick) && isPositiveInteger(measure.durationTicks) ? [{ startTick: measure.startTick, durationTicks: measure.durationTicks }] : []);
const normalizeTimeSignatureEvents = (value: unknown): TimeSignatureEvent[] => !Array.isArray(value) ? [] : value.flatMap((event): TimeSignatureEvent[] => isRecord(event) && isNonNegativeInteger(event.tick) ? [{ tick: event.tick, timeSignature: parseTimeSignature(event.timeSignature) }] : []);
const normalizeKeySignatureEvents = (value: unknown): KeySignatureEvent[] => !Array.isArray(value) ? [] : value.flatMap((event): KeySignatureEvent[] => isRecord(event) && isNonNegativeInteger(event.tick) ? [{ tick: event.tick, key: normalizeSongKey(event.key) }] : []);
const normalizeTempoEvents = (value: unknown): TempoEvent[] => !Array.isArray(value) ? [] : value.flatMap((event): TempoEvent[] => isRecord(event) && isNonNegativeInteger(event.tick) && asPositiveNumber(event.bpm, 0) > 0 ? [{ tick: event.tick, bpm: Number(event.bpm) }] : []);

const hasEventModel = (record: Record<string, unknown>) => Array.isArray(record.chords) && Array.isArray(record.melodyNotes);
const hasLegacyGridModel = (record: Record<string, unknown>) => Array.isArray(record.grid);
const hasPreciseTiming = (record: Record<string, unknown>) => isPositiveInteger(record.ticksPerQuarter) && Array.isArray(record.measures) && Array.isArray(record.timeSignatureEvents) && Array.isArray(record.keySignatureEvents) && Array.isArray(record.tempoEvents);

export const normalizeSong = (value: unknown): Song | null => {
  if (!isRecord(value) || (!hasEventModel(value) && !hasLegacyGridModel(value))) return null;
  const now = new Date().toISOString();
  const timeSignature = parseTimeSignature(value.timeSignature ?? DEFAULT_TIME_SIGNATURE);
  const key = normalizeSongKey(value.key);
  const bpm = asPositiveNumber(value.bpm, DEFAULT_BPM);
  const ticksPerQuarter = hasPreciseTiming(value) ? Number(value.ticksPerQuarter) : DEFAULT_TICKS_PER_QUARTER;
  const legacyGrid = hasLegacyGridModel(value) ? normalizeLegacyGrid(value.grid, timeSignature) : [];
  const totalMeasures = normalizeTotalMeasures(asPositiveNumber(value.totalMeasures, legacyGrid.length || DEFAULT_TOTAL_MEASURES));
  const measures = hasPreciseTiming(value) ? normalizeMeasures(value.measures) : [];
  const chords = hasEventModel(value) ? normalizeChordEvents(value.chords) : gridToChordEvents(legacyGrid, timeSignature, ticksPerQuarter);
  const melodyNotes = hasEventModel(value) ? normalizeMelodyNotes(value.melodyNotes) : [];
  return createEmptySong({
    id: asString(value.id, createId('song')), title: asString(value.title, '新規曲'), bpm, timeSignature, key,
    totalMeasures, ticksPerQuarter, pickupTicks: isNonNegativeInteger(value.pickupTicks) ? value.pickupTicks : 0,
    measures: measures.length > 0 ? measures : undefined,
    timeSignatureEvents: normalizeTimeSignatureEvents(value.timeSignatureEvents), keySignatureEvents: normalizeKeySignatureEvents(value.keySignatureEvents), tempoEvents: normalizeTempoEvents(value.tempoEvents),
    chords, melodyNotes, createdAt: asString(value.createdAt, now), updatedAt: asString(value.updatedAt, now),
  });
};
export const normalizeSongs = (value: unknown): Song[] => !Array.isArray(value) ? [] : value.flatMap((song): Song[] => { const normalized = normalizeSong(song); return normalized ? [normalized] : []; });
export type { ChordQuality, NoteName };
