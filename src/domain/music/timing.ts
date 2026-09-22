import type {
  KeySignatureEvent,
  Song,
  SongKey,
  SongMeasure,
  TempoEvent,
  TimeSignature,
  TimeSignatureEvent,
} from './types';

export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export const ticksPerBeat = (ticksPerQuarter: number, timeSignature: TimeSignature) =>
  (ticksPerQuarter * 4) / timeSignature.beatUnit;

export const ticksPerMeasure = (ticksPerQuarter: number, timeSignature: TimeSignature) =>
  ticksPerBeat(ticksPerQuarter, timeSignature) * timeSignature.beatsPerMeasure;

export const tickToBeat = (song: Pick<Song, 'ticksPerQuarter' | 'timeSignature'>, tick: number) =>
  tick / ticksPerBeat(song.ticksPerQuarter, song.timeSignature);

export const beatToTick = (song: Pick<Song, 'ticksPerQuarter' | 'timeSignature'>, beat: number) =>
  Math.round(beat * ticksPerBeat(song.ticksPerQuarter, song.timeSignature));

const getEventAtTick = <T extends { tick: number }>(events: T[], tick: number): T => {
  const sorted = [...events].sort((first, second) => first.tick - second.tick);
  const initial = sorted[0];

  return sorted.reduce((active, event) => (event.tick <= tick ? event : active), initial);
};

export const getTimeSignatureAtTick = (song: Pick<Song, 'timeSignatureEvents' | 'timeSignature'>, tick: number) =>
  song.timeSignatureEvents.length > 0
    ? getEventAtTick(song.timeSignatureEvents, tick).timeSignature
    : song.timeSignature;

export const getKeyAtTick = (song: Pick<Song, 'keySignatureEvents' | 'key'>, tick: number): SongKey =>
  song.keySignatureEvents.length > 0 ? getEventAtTick(song.keySignatureEvents, tick).key : song.key;

export const getTempoAtTick = (song: Pick<Song, 'tempoEvents' | 'bpm'>, tick: number) =>
  song.tempoEvents.length > 0 ? getEventAtTick(song.tempoEvents, tick).bpm : song.bpm;

export const getSongEndTick = (song: Pick<Song, 'measures' | 'ticksPerQuarter' | 'timeSignature' | 'totalMeasures'>) => {
  const lastMeasure = song.measures[song.measures.length - 1];

  if (lastMeasure) {
    return lastMeasure.startTick + lastMeasure.durationTicks;
  }

  return Math.round(ticksPerMeasure(song.ticksPerQuarter, song.timeSignature) * song.totalMeasures);
};

export const getMeasureRangeTicks = (song: Pick<Song, 'measures'>, startMeasure: number, measureCount: number) => {
  const measures = song.measures.slice(startMeasure, startMeasure + measureCount);
  const first = measures[0];
  const last = measures[measures.length - 1];

  if (!first || !last) {
    return null;
  }

  return {
    startTick: first.startTick,
    endTick: last.startTick + last.durationTicks,
    durationTicks: last.startTick + last.durationTicks - first.startTick,
  };
};

const defineDisplayTiming = <T extends { startTick: number; durationTicks: number }>(
  song: Pick<Song, 'ticksPerQuarter' | 'timeSignature'>,
  event: T,
): T => {
  Object.defineProperties(event, {
    startBeat: {
      configurable: true,
      enumerable: false,
      value: tickToBeat(song, event.startTick),
    },
    durationBeats: {
      configurable: true,
      enumerable: false,
      value: tickToBeat(song, event.durationTicks),
    },
  });

  return event;
};

/**
 * Adds non-persisted, legacy display fields used by the coarse editor. The
 * source of truth remains the integer tick fields above.
 */
export const withDisplayTiming = (song: Song): Song => ({
  ...song,
  chords: song.chords.map((chord) => defineDisplayTiming(song, { ...chord })),
  melodyNotes: song.melodyNotes.map((note) => defineDisplayTiming(song, { ...note })),
});

export interface SongTimingWarning {
  code: 'measure-gap' | 'measure-length-mismatch' | 'event-outside-song';
  message: string;
  measureIndex?: number;
  eventId?: string;
}

/** Reports timing inconsistencies without mutating or rounding imported data. */
export const validateSongTiming = (song: Song): SongTimingWarning[] => {
  const warnings: SongTimingWarning[] = [];
  const songEndTick = getSongEndTick(song);

  song.measures.forEach((measure, index) => {
    const previous = song.measures[index - 1];
    const signature = getTimeSignatureAtTick(song, measure.startTick);
    const expectedDuration = ticksPerMeasure(song.ticksPerQuarter, signature);
    const isPickup = index === 0 && song.pickupTicks > 0;

    if (previous && measure.startTick !== previous.startTick + previous.durationTicks) {
      warnings.push({
        code: 'measure-gap',
        measureIndex: index,
        message: `${index + 1}小節目の開始tickが前の小節末尾と連続していません。`,
      });
    }

    if (!isPickup && measure.durationTicks !== expectedDuration) {
      warnings.push({
        code: 'measure-length-mismatch',
        measureIndex: index,
        message: `${index + 1}小節目のtick長が拍子 ${signature.beatsPerMeasure}/${signature.beatUnit} と一致しません。`,
      });
    }
  });

  [...song.chords, ...song.melodyNotes].forEach((event) => {
    if (event.startTick < 0 || event.startTick + event.durationTicks > songEndTick) {
      warnings.push({
        code: 'event-outside-song',
        eventId: event.id,
        message: `イベント ${event.id} が曲のタイムライン外にあります。`,
      });
    }
  });

  return warnings;
};

const greatestCommonDivisor = (first: number, second: number): number => {
  let left = Math.abs(first);
  let right = Math.abs(second);

  while (right !== 0) {
    [left, right] = [right, left % right];
  }

  return left;
};

const leastCommonMultiple = (first: number, second: number) =>
  Math.abs(first * second) / greatestCommonDivisor(first, second);

/**
 * Picks a PPQ divisible by each MusicXML `divisions` value. This avoids
 * rounding tuplets and other subdivisions while keeping 480 PPQ whenever it
 * is sufficient.
 */
export const resolveTicksPerQuarterForMusicXml = (
  divisionsValues: number[],
  preferredTicksPerQuarter = 480,
) => divisionsValues.reduce((resolution, divisions) => {
  if (!isPositiveInteger(divisions)) {
    throw new Error('MusicXML divisions must be a positive integer.');
  }

  return leastCommonMultiple(resolution, divisions);
}, preferredTicksPerQuarter);

export const musicXmlDurationToTicks = (
  durationInDivisions: number,
  divisions: number,
  ticksPerQuarter: number,
) => {
  if (
    !isNonNegativeInteger(durationInDivisions) ||
    !isPositiveInteger(divisions) ||
    !isPositiveInteger(ticksPerQuarter) ||
    ticksPerQuarter % divisions !== 0
  ) {
    throw new Error('MusicXML duration cannot be represented exactly at this tick resolution.');
  }

  return durationInDivisions * (ticksPerQuarter / divisions);
};

export const sortTimeSignatureEvents = (events: TimeSignatureEvent[]) =>
  [...events].sort((first, second) => first.tick - second.tick);

export const sortKeySignatureEvents = (events: KeySignatureEvent[]) =>
  [...events].sort((first, second) => first.tick - second.tick);

export const sortTempoEvents = (events: TempoEvent[]) =>
  [...events].sort((first, second) => first.tick - second.tick);

export const sortMeasures = (measures: SongMeasure[]) =>
  [...measures].sort((first, second) => first.startTick - second.startTick);
