import {
  chordDefinitionWithSymbolNotes,
  ensureChordEventSymbol,
  transposeChordSymbol,
} from './chordSymbol';
import { PITCH_CLASS_COUNT, noteNameToPitchClass, normalizePitchClass, pitchClassToNoteName } from './pitchClass';
import {
  beatToTick,
  getMeasureRangeTicks,
  getSongEndTick,
  getTimeSignatureAtTick,
  tickToBeat,
  ticksPerMeasure,
  withDisplayTiming,
} from './timing';
import { DEFAULT_TICKS_PER_QUARTER } from './types';
import type {
  ChordDefinition, ChordEvent, ChordQuality, MelodyNote, NoteName, Song, SongKey, SongMeasure, TieRelation, TimeSignature,
} from './types';

export const DEFAULT_TOTAL_MEASURES = 16;
export const MIN_TOTAL_MEASURES = 1;
export const MAX_TOTAL_MEASURES = 256;
export const DEFAULT_BPM = 120;
export const DEFAULT_TIME_SIGNATURE: TimeSignature = { beatsPerMeasure: 4, beatUnit: 4 };
export const DEFAULT_SONG_KEY: SongKey = { tonic: 'C', mode: 'major' };
/** The editor's input snap, deliberately separate from persisted ticks. */
export const MELODY_BEAT_QUANTUM = 0.5;
export const MIN_MELODY_DURATION_BEATS = MELODY_BEAT_QUANTUM;

export interface ChordGridBeat { chord: ChordDefinition | null; position: number; duration: number; }
export interface ChordGridMeasure { beats: ChordGridBeat[]; position: number; }
export interface MeasureRange { startMeasure: number; measureCount: number; }
export interface MeasureRangeClipboardChord {
  relativeStartTick: number; durationTicks: number; relativeStartBeat: number; durationBeats: number;
  root: ChordEvent['root']; quality: ChordEvent['quality']; bass?: ChordEvent['bass']; chordSymbol?: ChordEvent['chordSymbol']; tie?: TieRelation;
}
export interface MeasureRangeClipboardMelodyNote {
  relativeStartTick: number; durationTicks: number; relativeStartBeat: number; durationBeats: number;
  pitch: MelodyNote['pitch']; octave: number; velocity: number; tie?: TieRelation;
}
export interface MeasureRangeClipboard {
  measureCount: number; tickCount: number; beatCount: number;
  chords: MeasureRangeClipboardChord[]; melodyNotes: MeasureRangeClipboardMelodyNote[];
}

export const createMusicId = (prefix: string) =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const isPositiveInteger = (value: number) => Number.isInteger(value) && value > 0;
const roundBeat = (value: number) => Number(value.toFixed(6));
export const quantizeBeat = (value: number, quantum = MELODY_BEAT_QUANTUM) =>
  Number.isFinite(value) ? roundBeat(Math.round(value / (quantum > 0 ? quantum : 1)) * (quantum > 0 ? quantum : 1)) : 0;
const quantizeBeatDown = (value: number, quantum = MELODY_BEAT_QUANTUM) =>
  Number.isFinite(value) ? roundBeat(Math.floor(value / (quantum > 0 ? quantum : 1)) * (quantum > 0 ? quantum : 1)) : 0;

export const parseTimeSignature = (value: unknown): TimeSignature => {
  if (typeof value === 'string') {
    const [beatsPerMeasure, beatUnit] = value.split('/').map(Number);
    if (isPositiveInteger(beatsPerMeasure) && isPositiveInteger(beatUnit)) return { beatsPerMeasure, beatUnit };
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const beatsPerMeasure = Number(record.beatsPerMeasure);
    const beatUnit = Number(record.beatUnit);
    if (isPositiveInteger(beatsPerMeasure) && isPositiveInteger(beatUnit)) return { beatsPerMeasure, beatUnit };
  }
  return DEFAULT_TIME_SIGNATURE;
};
export const formatTimeSignature = (timeSignature: TimeSignature) => `${timeSignature.beatsPerMeasure}/${timeSignature.beatUnit}`;

export const normalizeTotalMeasures = (value: number): number => {
  const rounded = Math.round(value);
  return Number.isFinite(rounded) ? Math.max(MIN_TOTAL_MEASURES, Math.min(MAX_TOTAL_MEASURES, rounded)) : MIN_TOTAL_MEASURES;
};

const createMeasures = (count: number, ticksPerQuarter: number, signature: TimeSignature, pickupTicks = 0): SongMeasure[] => {
  const duration = Math.round(ticksPerMeasure(ticksPerQuarter, signature));
  let startTick = 0;
  return Array.from({ length: normalizeTotalMeasures(count) }, (_, index) => {
    const durationTicks = index === 0 && pickupTicks > 0 ? pickupTicks : duration;
    const measure = { startTick, durationTicks };
    startTick += durationTicks;
    return measure;
  });
};

type TimingInput<T> = Omit<T, 'startTick' | 'durationTicks' | 'startBeat' | 'durationBeats'> & {
  startTick?: number; durationTicks?: number; startBeat?: number; durationBeats?: number;
};
export type SongCreationOptions = Omit<Partial<Song>, 'chords' | 'melodyNotes'> & {
  chords?: TimingInput<ChordEvent>[];
  melodyNotes?: TimingInput<MelodyNote>[];
};
const normalizeEventTiming = <T extends object>(
  timing: Pick<Song, 'ticksPerQuarter' | 'timeSignature'>, event: T,
) => ({
  ...event,
  startTick: Number.isInteger((event as TimingInput<T>).startTick) ? Math.max(0, Number((event as TimingInput<T>).startTick)) : beatToTick(timing, Number((event as TimingInput<T>).startBeat) || 0),
  durationTicks: Number.isInteger((event as TimingInput<T>).durationTicks) ? Math.max(1, Number((event as TimingInput<T>).durationTicks)) : Math.max(1, beatToTick(timing, Number((event as TimingInput<T>).durationBeats) || 1)),
});

const replaceInitialEvent = <T extends { tick: number }>(events: T[], fallback: T) => {
  const zero = events.find((event) => event.tick === 0) ?? fallback;
  return [zero, ...events.filter((event) => event.tick !== 0)].sort((first, second) => first.tick - second.tick);
};

const finalizeSong = (song: Song): Song => withDisplayTiming({
  ...song,
  totalMeasures: song.measures.length,
  measures: [...song.measures].sort((first, second) => first.startTick - second.startTick),
  timeSignatureEvents: replaceInitialEvent(song.timeSignatureEvents, { tick: 0, timeSignature: song.timeSignature }),
  keySignatureEvents: replaceInitialEvent(song.keySignatureEvents, { tick: 0, key: song.key }),
  tempoEvents: replaceInitialEvent(song.tempoEvents, { tick: 0, bpm: song.bpm }),
  chords: song.chords.map(ensureChordEventSymbol),
  melodyNotes: song.melodyNotes.map((note) => ({ ...note })),
});

export const createEmptySong = (options: SongCreationOptions = {}): Song => {
  const timeSignature = options.timeSignatureEvents?.find((event) => event.tick === 0)?.timeSignature ?? options.timeSignature ?? DEFAULT_TIME_SIGNATURE;
  const key = options.keySignatureEvents?.find((event) => event.tick === 0)?.key ?? options.key ?? DEFAULT_SONG_KEY;
  const bpm = options.tempoEvents?.find((event) => event.tick === 0)?.bpm ?? options.bpm ?? DEFAULT_BPM;
  const ticksPerQuarter = options.ticksPerQuarter ?? DEFAULT_TICKS_PER_QUARTER;
  const context = { ticksPerQuarter, timeSignature } as Pick<Song, 'ticksPerQuarter' | 'timeSignature'>;
  const requestedTotalMeasures = options.totalMeasures ?? DEFAULT_TOTAL_MEASURES;
  const measures = options.measures ?? (requestedTotalMeasures === 0
    ? []
    : createMeasures(requestedTotalMeasures, ticksPerQuarter, timeSignature, options.pickupTicks ?? 0));
  const now = new Date().toISOString();
  return finalizeSong({
    id: options.id ?? createMusicId('song'), title: options.title ?? '新規曲', bpm, timeSignature,
    totalMeasures: measures.length, key, ticksPerQuarter, pickupTicks: options.pickupTicks ?? 0, measures,
    timeSignatureEvents: options.timeSignatureEvents ?? [{ tick: 0, timeSignature }],
    keySignatureEvents: options.keySignatureEvents ?? [{ tick: 0, key }],
    tempoEvents: options.tempoEvents ?? [{ tick: 0, bpm }],
    chords: (options.chords ?? []).map((chord) => normalizeEventTiming(context, chord)) as unknown as ChordEvent[],
    melodyNotes: (options.melodyNotes ?? []).map((note) => normalizeEventTiming(context, note)) as unknown as MelodyNote[],
    createdAt: options.createdAt ?? now, updatedAt: options.updatedAt ?? now,
  });
};

export const createEmptyGrid = (totalMeasures = DEFAULT_TOTAL_MEASURES, beatsPerMeasure = DEFAULT_TIME_SIGNATURE.beatsPerMeasure): ChordGridMeasure[] =>
  Array.from({ length: totalMeasures }, (_, position) => ({
    position,
    beats: Array.from({ length: beatsPerMeasure }, (_, beat) => ({ chord: null, position: beat, duration: 1 })),
  }));

export const getTotalTicks = (song: Song) => getSongEndTick(song);
/** Compatibility presentation helper. Domain calculations use getTotalTicks. */
export const getTotalBeats = (song: Song) => tickToBeat(song, getTotalTicks(song));
export const getChordEndTick = (chord: Pick<ChordEvent, 'startTick' | 'durationTicks'>) => chord.startTick + chord.durationTicks;
export const getMelodyNoteEndTick = (note: Pick<MelodyNote, 'startTick' | 'durationTicks'>) => note.startTick + note.durationTicks;
/** @deprecated Display only; persisted events are tick based. */
export const getChordEndBeat = (chord: Pick<ChordEvent, 'startBeat' | 'durationBeats'>) => chord.startBeat + chord.durationBeats;
/** @deprecated Display only; persisted events are tick based. */
export const getMelodyNoteEndBeat = (note: Pick<MelodyNote, 'startBeat' | 'durationBeats'>) => note.startBeat + note.durationBeats;
export const sortChordEvents = (chords: ChordEvent[]) => [...chords].sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id));
export const sortMelodyNotes = (notes: MelodyNote[]) => [...notes].sort((a, b) => a.startTick - b.startTick || a.octave - b.octave || a.pitch.localeCompare(b.pitch) || a.id.localeCompare(b.id));
export const chordEventToChordDefinition = (chord: ChordEvent): ChordDefinition => chordDefinitionWithSymbolNotes(chord);

export const gridToChordEvents = (grid: ChordGridMeasure[], timeSignature: TimeSignature, ticksPerQuarter = DEFAULT_TICKS_PER_QUARTER): ChordEvent[] => {
  const context = { ticksPerQuarter, timeSignature } as Pick<Song, 'ticksPerQuarter' | 'timeSignature'>;
  const raw = grid.flatMap((measure, measureIndex) => measure.beats.flatMap((beat, beatIndex) => {
    if (!beat.chord) return [];
    const measurePosition = Number.isInteger(measure.position) ? measure.position : measureIndex;
    const beatPosition = Number.isInteger(beat.position) ? beat.position : beatIndex;
    return [{ id: createMusicId('chord'), root: beat.chord.root, quality: beat.chord.type, bass: beat.chord.bass, chordSymbol: beat.chord.chordSymbol,
      startTick: beatToTick(context, measurePosition * timeSignature.beatsPerMeasure + beatPosition),
      durationTicks: Math.max(1, beatToTick(context, Math.max(1, beat.duration))),
    }];
  }));
  return createEmptySong({ ticksPerQuarter, timeSignature, totalMeasures: Math.max(1, grid.length), chords: raw as ChordEvent[] }).chords;
};

export const resizeChordGridToTimeSignature = (grid: ChordGridMeasure[], timeSignature: TimeSignature): ChordGridMeasure[] => grid.map((measure) => ({
  ...measure,
  beats: Array.from({ length: timeSignature.beatsPerMeasure }, (_, position) => ({ chord: measure.beats[position]?.chord ?? null, position, duration: 1 })),
}));
export const placeChordOnGrid = (grid: ChordGridMeasure[], measurePosition: number, beatPosition: number, chord: ChordDefinition): ChordGridMeasure[] => grid.map((measure) => {
  if (measure.position !== measurePosition) return measure;
  let duration = 1;
  for (let index = beatPosition + 1; index < measure.beats.length && !measure.beats[index].chord; index += 1) duration += 1;
  return { ...measure, beats: measure.beats.map((beat, index) => index === beatPosition ? { ...beat, chord, duration } : index > beatPosition && index < beatPosition + duration ? { ...beat, chord: null, duration: 1 } : beat) };
});
export const songToGrid = (song: Song): ChordGridMeasure[] => {
  const grid = createEmptyGrid(song.totalMeasures, song.timeSignature.beatsPerMeasure);
  song.chords.forEach((chord) => {
    const measureIndex = Math.floor(chord.startBeat / song.timeSignature.beatsPerMeasure);
    const beatIndex = chord.startBeat % song.timeSignature.beatsPerMeasure;
    if (!Number.isInteger(chord.startBeat) || !Number.isInteger(beatIndex) || !grid[measureIndex]?.beats[beatIndex]) return;
    grid[measureIndex].beats[beatIndex] = { ...grid[measureIndex].beats[beatIndex], chord: chordEventToChordDefinition(chord), duration: Math.max(1, chord.durationBeats) };
  });
  return grid;
};

const replaceEventAtTick = <T extends { tick: number }>(events: T[], event: T) => [event, ...events.filter((item) => item.tick !== event.tick)].sort((a, b) => a.tick - b.tick);
export const changeSongTimeSignature = (song: Song, timeSignature: TimeSignature): Song => finalizeSong({ ...song, timeSignature, timeSignatureEvents: replaceEventAtTick(song.timeSignatureEvents, { tick: 0, timeSignature }) });
export const changeSongTempo = (song: Song, bpm: number): Song => finalizeSong({ ...song, bpm, tempoEvents: replaceEventAtTick(song.tempoEvents, { tick: 0, bpm }) });
export const addTimeSignatureEvent = (song: Song, tick: number, timeSignature: TimeSignature): Song => finalizeSong({ ...song, timeSignatureEvents: replaceEventAtTick(song.timeSignatureEvents, { tick, timeSignature }) });
export const addTempoEvent = (song: Song, tick: number, bpm: number): Song => finalizeSong({ ...song, tempoEvents: replaceEventAtTick(song.tempoEvents, { tick, bpm }) });
export const addKeySignatureEvent = (song: Song, tick: number, key: SongKey): Song => finalizeSong({ ...song, keySignatureEvents: replaceEventAtTick(song.keySignatureEvents, { tick, key }) });

export const normalizeMeasureRange = (song: Pick<Song, 'totalMeasures'>, range: MeasureRange): MeasureRange => {
  const total = Math.max(1, Math.floor(song.totalMeasures) || DEFAULT_TOTAL_MEASURES);
  const startMeasure = Math.max(0, Math.min(Math.floor(range.startMeasure) || 0, total - 1));
  return { startMeasure, measureCount: Math.max(1, Math.min(Math.floor(range.measureCount) || 1, total - startMeasure)) };
};
const normalizedRangeTicks = (song: Song, range: MeasureRange) => {
  const normalized = normalizeMeasureRange(song, range);
  const ticks = getMeasureRangeTicks(song, normalized.startMeasure, normalized.measureCount);
  return ticks ? { ...normalized, ...ticks } : null;
};
const trimToEnd = <T extends { startTick: number; durationTicks: number }>(event: T, endTick: number): T | null => {
  if (event.startTick >= endTick) return null;
  return event.startTick + event.durationTicks <= endTick ? event : { ...event, durationTicks: endTick - event.startTick };
};
export const wouldShortenSongLoseContent = (song: Song, nextTotalMeasures: number) => {
  const last = song.measures[normalizeTotalMeasures(nextTotalMeasures) - 1];
  const endTick = last ? last.startTick + last.durationTicks : 0;
  return song.chords.some((event) => getChordEndTick(event) > endTick) || song.melodyNotes.some((event) => getMelodyNoteEndTick(event) > endTick);
};
const appendMeasures = (song: Song, count: number) => {
  const measures = song.measures.slice(); let startTick = getTotalTicks(song);
  while (measures.length < count) {
    const durationTicks = Math.round(ticksPerMeasure(song.ticksPerQuarter, getTimeSignatureAtTick(song, startTick)));
    measures.push({ startTick, durationTicks }); startTick += durationTicks;
  }
  return measures;
};
export const changeSongTotalMeasures = (song: Song, nextTotalMeasures: number): Song => {
  const count = normalizeTotalMeasures(nextTotalMeasures);
  const measures = count <= song.measures.length ? song.measures.slice(0, count) : appendMeasures(song, count);
  const endTick = measures[measures.length - 1].startTick + measures[measures.length - 1].durationTicks;
  return finalizeSong({ ...song, totalMeasures: count, measures,
    chords: song.chords.flatMap((event) => { const trimmed = trimToEnd(event, endTick); return trimmed ? [trimmed] : []; }),
    melodyNotes: song.melodyNotes.flatMap((event) => { const trimmed = trimToEnd(event, endTick); return trimmed ? [trimmed] : []; }),
  });
};

const MIN_MELODY_OCTAVE = 0; const MAX_MELODY_OCTAVE = 8;
export const transposeNoteName = (note: NoteName, semitones: number): NoteName => pitchClassToNoteName(normalizePitchClass(noteNameToPitchClass(note) + semitones));
export const getKeyTransposeSemitones = (from: NoteName, to: NoteName) => { const upward = normalizePitchClass(noteNameToPitchClass(to) - noteNameToPitchClass(from)); return upward > 6 ? upward - 12 : upward; };
export const transposeChordEvent = (chord: ChordEvent, semitones: number): ChordEvent => ({
  ...chord,
  root: transposeNoteName(chord.root, semitones),
  bass: chord.bass ? transposeNoteName(chord.bass, semitones) : undefined,
  chordSymbol: transposeChordSymbol(ensureChordEventSymbol(chord).chordSymbol!, semitones),
});
export const transposeMelodyNote = (note: MelodyNote, semitones: number): MelodyNote => ({ ...note, pitch: transposeNoteName(note.pitch, semitones), octave: Math.max(MIN_MELODY_OCTAVE, Math.min(MAX_MELODY_OCTAVE, note.octave + Math.floor((noteNameToPitchClass(note.pitch) + semitones) / PITCH_CLASS_COUNT))) });
export interface ChangeSongKeyOptions { transposeExisting?: boolean; }
export const changeSongKey = (song: Song, key: SongKey, options: ChangeSongKeyOptions = {}): Song => {
  const semitones = getKeyTransposeSemitones(song.key.tonic, key.tonic);
  const next = { ...song, key, keySignatureEvents: replaceEventAtTick(song.keySignatureEvents, { tick: 0, key }) };
  return finalizeSong(options.transposeExisting && semitones !== 0 ? { ...next, chords: song.chords.map((event) => transposeChordEvent(event, semitones)), melodyNotes: song.melodyNotes.map((event) => transposeMelodyNote(event, semitones)) } : next);
};
export const placeChordInSong = (song: Song, measure: number, beat: number, chord: ChordDefinition) => insertChordInSong(song, measure * song.timeSignature.beatsPerMeasure + beat, chord);

const inRange = (event: { startTick: number; durationTicks: number }, start: number, end: number) => event.startTick < end && event.startTick + event.durationTicks > start;
const preserveOutsideRange = <T extends { startTick: number; durationTicks: number }>(events: T[], start: number, end: number) => events.flatMap((event): T[] => {
  if (!inRange(event, start, end)) return [event];
  if (event.startTick < start) { const trimmed = trimToEnd(event, start); return trimmed ? [trimmed] : []; }
  return [];
});
export const copyMeasureRangeFromSong = (song: Song, range: MeasureRange): MeasureRangeClipboard => {
  const source = normalizedRangeTicks(song, range);
  if (!source) return { measureCount: 0, tickCount: 0, beatCount: 0, chords: [], melodyNotes: [] };
  const display = (tick: number) => tickToBeat(song, tick);
  return { measureCount: source.measureCount, tickCount: source.durationTicks, beatCount: display(source.durationTicks),
    chords: song.chords.flatMap((event) => {
      if (!inRange(event, source.startTick, source.endTick)) return [];
      const startTick = Math.max(event.startTick, source.startTick); const endTick = Math.min(getChordEndTick(event), source.endTick);
      return endTick > startTick ? [{ root: event.root, quality: event.quality, bass: event.bass, chordSymbol: event.chordSymbol, tie: event.tie, relativeStartTick: startTick - source.startTick, durationTicks: endTick - startTick, relativeStartBeat: display(startTick - source.startTick), durationBeats: display(endTick - startTick) }] : [];
    }),
    melodyNotes: song.melodyNotes.flatMap((event) => {
      if (!inRange(event, source.startTick, source.endTick)) return [];
      const startTick = Math.max(event.startTick, source.startTick); const endTick = Math.min(getMelodyNoteEndTick(event), source.endTick);
      return endTick > startTick ? [{ pitch: event.pitch, octave: event.octave, velocity: event.velocity, tie: event.tie, relativeStartTick: startTick - source.startTick, durationTicks: endTick - startTick, relativeStartBeat: display(startTick - source.startTick), durationBeats: display(endTick - startTick) }] : [];
    }),
  };
};
export const canPasteMeasureRangeClipboard = (song: Song, clipboard: MeasureRangeClipboard | null, targetStartMeasure: number) => {
  if (!clipboard || clipboard.tickCount <= 0 || !Number.isInteger(targetStartMeasure) || targetStartMeasure < 0 || targetStartMeasure >= song.totalMeasures) return false;
  return getMeasureRangeTicks(song, targetStartMeasure, clipboard.measureCount)?.durationTicks === clipboard.tickCount;
};
export const canDuplicateMeasureRangeToNext = (song: Song, range: MeasureRange) => { const normalized = normalizeMeasureRange(song, range); return normalized.startMeasure + normalized.measureCount * 2 <= song.totalMeasures; };
export const pasteMeasureRangeClipboard = (song: Song, clipboard: MeasureRangeClipboard | null, targetStartMeasure: number): Song => {
  if (!clipboard || !canPasteMeasureRangeClipboard(song, clipboard, targetStartMeasure)) return song;
  const target = getMeasureRangeTicks(song, targetStartMeasure, clipboard.measureCount); if (!target) return song;
  return finalizeSong({ ...song,
    chords: sortChordEvents([...preserveOutsideRange(song.chords, target.startTick, target.endTick), ...clipboard.chords.map((event) => ({ id: createMusicId('chord'), root: event.root, quality: event.quality, bass: event.bass, chordSymbol: event.chordSymbol, tie: event.tie, startTick: target.startTick + event.relativeStartTick, durationTicks: event.durationTicks })) as ChordEvent[]]),
    melodyNotes: sortMelodyNotes([...preserveOutsideRange(song.melodyNotes, target.startTick, target.endTick), ...clipboard.melodyNotes.map((event) => ({ id: createMusicId('melody'), pitch: event.pitch, octave: event.octave, velocity: event.velocity, tie: event.tie, startTick: target.startTick + event.relativeStartTick, durationTicks: event.durationTicks })) as MelodyNote[]]),
  });
};
export const duplicateMeasureRangeToNext = (song: Song, range: MeasureRange) => { if (!canDuplicateMeasureRangeToNext(song, range)) return song; const normalized = normalizeMeasureRange(song, range); return pasteMeasureRangeClipboard(song, copyMeasureRangeFromSong(song, normalized), normalized.startMeasure + normalized.measureCount); };

const clampBeat = (value: number, total: number) => Math.max(0, Math.min(Math.floor(value), Math.max(0, total - 1)));
export const getChordMaxDurationBeats = (song: Song, id: string) => {
  const target = song.chords.find((event) => event.id === id); if (!target) return 1;
  const next = sortChordEvents(song.chords).find((event) => event.id !== id && event.startTick > target.startTick);
  return Math.max(1, Math.floor(tickToBeat(song, (next?.startTick ?? getTotalTicks(song)) - target.startTick)));
};
export const insertChordAtTick = (song: Song, startTick: number, chord: ChordDefinition): Song => {
  const total = getTotalTicks(song); if (total <= 0) return song;
  const start = Math.max(0, Math.min(Math.round(startTick), total - 1));
  const next = sortChordEvents(song.chords).find((event) => event.startTick > start);
  const end = next?.startTick ?? total;
  const inserted = { id: createMusicId('chord'), root: chord.root, quality: chord.type, bass: chord.bass, chordSymbol: chord.chordSymbol, startTick: start, durationTicks: Math.max(1, end - start) } as ChordEvent;
  const preserved = song.chords.flatMap((event) => event.startTick === start ? [] : event.startTick < start && getChordEndTick(event) > start ? [{ ...event, durationTicks: Math.max(1, start - event.startTick) }] : [event]);
  return finalizeSong({ ...song, chords: sortChordEvents([...preserved, inserted]) });
};
export const insertChordInSong = (song: Song, startBeat: number, chord: ChordDefinition) => insertChordAtTick(song, beatToTick(song, clampBeat(startBeat, getTotalBeats(song))), chord);
export interface ChordProgressionEntry { root: NoteName; quality: ChordQuality; bass?: NoteName; chordSymbol?: ChordEvent['chordSymbol']; }
export const insertChordProgressionInSong = (song: Song, startBeat: number, chords: ChordProgressionEntry[], beatsPerChord: number): Song => {
  const total = getTotalBeats(song); if (total <= 0 || chords.length === 0 || beatsPerChord <= 0) return song;
  const startBeatClamped = clampBeat(startBeat, total); const count = Math.min(chords.length, Math.floor((total - startBeatClamped) / beatsPerChord)); if (count <= 0) return song;
  const startTick = beatToTick(song, startBeatClamped); const durationTicks = Math.max(1, beatToTick(song, beatsPerChord)); const endTick = startTick + count * durationTicks;
  const inserted = chords.slice(0, count).map((event, index) => ({ id: createMusicId('chord'), root: event.root, quality: event.quality, bass: event.bass, chordSymbol: event.chordSymbol, startTick: startTick + index * durationTicks, durationTicks }));
  return finalizeSong({ ...song, chords: sortChordEvents([...preserveOutsideRange(song.chords, startTick, endTick), ...inserted as ChordEvent[]]) });
};
export const deleteChordFromSong = (song: Song, id: string) => finalizeSong({ ...song, chords: song.chords.filter((event) => event.id !== id) });
export const resizeChordInSong = (song: Song, id: string, durationBeats: number) => {
  const max = Math.max(1, beatToTick(song, getChordMaxDurationBeats(song, id))); const durationTicks = Math.max(1, Math.min(beatToTick(song, Math.round(durationBeats)), max));
  return finalizeSong({ ...song, chords: song.chords.map((event) => event.id === id ? { ...event, durationTicks } : event) });
};

const samePitch = (a: Pick<MelodyNote, 'pitch' | 'octave'>, b: Pick<MelodyNote, 'pitch' | 'octave'>) => a.pitch === b.pitch && a.octave === b.octave;
export const getMelodyNoteMaxDurationBeats = (song: Song, id: string) => {
  const target = song.melodyNotes.find((event) => event.id === id); if (!target) return MIN_MELODY_DURATION_BEATS;
  const next = sortMelodyNotes(song.melodyNotes).find((event) => event.id !== id && samePitch(event, target) && event.startTick > target.startTick);
  return Math.max(MIN_MELODY_DURATION_BEATS, quantizeBeatDown(tickToBeat(song, (next?.startTick ?? getTotalTicks(song)) - target.startTick)));
};
export const insertMelodyNoteAtTick = (song: Song, startTick: number, pitch: NoteName, octave: number, id = createMusicId('melody'), durationTicks = song.ticksPerQuarter, tie?: TieRelation): Song => {
  const total = getTotalTicks(song); if (total <= 0) return song;
  const start = Math.max(0, Math.min(Math.round(startTick), total - 1)); const nextOctave = Math.max(0, Math.min(8, Math.round(octave)));
  const next = sortMelodyNotes(song.melodyNotes).find((event) => event.pitch === pitch && event.octave === nextOctave && event.startTick > start);
  const max = (next?.startTick ?? total) - start; if (max < 1) return song;
  const inserted = { id, pitch, octave: nextOctave, velocity: 0.8, tie, startTick: start, durationTicks: Math.max(1, Math.min(Math.round(durationTicks), max)) } as MelodyNote;
  const preserved = song.melodyNotes.flatMap((event) => !samePitch(event, inserted) ? [event] : event.startTick === start ? [] : event.startTick < start && getMelodyNoteEndTick(event) > start ? start - event.startTick > 0 ? [{ ...event, durationTicks: start - event.startTick }] : [] : [event]);
  return finalizeSong({ ...song, melodyNotes: sortMelodyNotes([...preserved, inserted]) });
};
export const insertMelodyNoteInSong = (song: Song, startBeat: number, pitch: NoteName, octave: number, id = createMusicId('melody'), durationBeats = 1) => {
  const total = getTotalBeats(song); const start = Math.max(0, Math.min(quantizeBeat(startBeat), Math.max(0, total - MELODY_BEAT_QUANTUM)));
  return insertMelodyNoteAtTick(song, beatToTick(song, start), pitch, octave, id, beatToTick(song, Math.max(MIN_MELODY_DURATION_BEATS, quantizeBeat(durationBeats))));
};
export const deleteMelodyNoteFromSong = (song: Song, id: string) => finalizeSong({ ...song, melodyNotes: song.melodyNotes.filter((event) => event.id !== id) });
export const resizeMelodyNoteInSongAtTick = (song: Song, id: string, durationTicks: number) => {
  const target = song.melodyNotes.find((event) => event.id === id); if (!target) return song;
  const next = sortMelodyNotes(song.melodyNotes).find((event) => event.id !== id && samePitch(event, target) && event.startTick > target.startTick);
  const max = (next?.startTick ?? getTotalTicks(song)) - target.startTick;
  return finalizeSong({ ...song, melodyNotes: song.melodyNotes.map((event) => event.id === id ? { ...event, durationTicks: Math.max(1, Math.min(Math.round(durationTicks), max)) } : event) });
};
export const resizeMelodyNoteInSong = (song: Song, id: string, durationBeats: number) => resizeMelodyNoteInSongAtTick(song, id, beatToTick(song, Math.max(MIN_MELODY_DURATION_BEATS, quantizeBeat(durationBeats))));
