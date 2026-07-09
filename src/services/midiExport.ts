import { getChordNotes, NOTE_NAMES } from '../domain/music/chords';
import {
  getChordEndBeat,
  getMelodyNoteEndBeat,
  getTotalBeats,
  sortChordEvents,
  sortMelodyNotes,
} from '../domain/music/timeline';
import type { ChordEvent, NoteName, Song, TimeSignature } from '../domain/music/types';

const TICKS_PER_QUARTER_NOTE = 480;
const ACCOMPANIMENT_CHANNEL = 0;
const MELODY_CHANNEL = 1;

interface MidiEvent {
  tick: number;
  order: number;
  bytes: number[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const toAsciiBytes = (value: string) =>
  Array.from(value, (character) => character.charCodeAt(0) & 0x7f);

const pushUint16 = (target: number[], value: number) => {
  target.push((value >> 8) & 0xff, value & 0xff);
};

const pushUint32 = (target: number[], value: number) => {
  target.push(
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  );
};

const variableLengthQuantity = (value: number) => {
  const bytes = [value & 0x7f];
  let remaining = value >> 7;

  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }

  return bytes;
};

const metaEvent = (type: number, data: number[]) => [
  0xff,
  type,
  ...variableLengthQuantity(data.length),
  ...data,
];

const trackNameEvent = (name: string) => metaEvent(0x03, toAsciiBytes(name));

const programChangeEvent = (channel: number, program: number) => [
  0xc0 | clamp(channel, 0, 15),
  clamp(program, 0, 127),
];

const noteOnEvent = (channel: number, note: number, velocity: number) => [
  0x90 | clamp(channel, 0, 15),
  clamp(note, 0, 127),
  clamp(velocity, 0, 127),
];

const noteOffEvent = (channel: number, note: number) => [
  0x80 | clamp(channel, 0, 15),
  clamp(note, 0, 127),
  0,
];

const ticksPerTimelineBeat = (timeSignature: TimeSignature) =>
  Math.round(TICKS_PER_QUARTER_NOTE * (4 / timeSignature.beatUnit));

const beatToTick = (beat: number, timeSignature: TimeSignature) =>
  Math.max(0, Math.round(beat * ticksPerTimelineBeat(timeSignature)));

const microsecondsPerQuarterNote = (song: Song) => {
  const timelineBeatMs = (60 / Math.max(1, song.bpm)) * 1000;
  return Math.round(timelineBeatMs * 1000 * (song.timeSignature.beatUnit / 4));
};

const tempoEvent = (song: Song) => {
  const tempo = clamp(microsecondsPerQuarterNote(song), 1, 0xffffff);

  return metaEvent(0x51, [
    (tempo >> 16) & 0xff,
    (tempo >> 8) & 0xff,
    tempo & 0xff,
  ]);
};

const timeSignatureEvent = (timeSignature: TimeSignature) => {
  const denominatorPower = Math.max(0, Math.round(Math.log2(timeSignature.beatUnit)));

  return metaEvent(0x58, [
    clamp(timeSignature.beatsPerMeasure, 1, 255),
    clamp(denominatorPower, 0, 255),
    24,
    8,
  ]);
};

const BASS_OCTAVE = 2;

const noteNameToMidiNumber = (pitch: NoteName, octave: number) =>
  clamp((octave + 1) * 12 + NOTE_NAMES.indexOf(pitch), 0, 127);

const chordToMidiNumbers = (chord: ChordEvent) => {
  const rootNote = noteNameToMidiNumber(chord.root, 3);

  return getChordNotes(chord.root, chord.quality).map((noteName) => {
    let noteNumber = noteNameToMidiNumber(noteName, 3);

    while (noteNumber < rootNote) {
      noteNumber += 12;
    }

    return clamp(noteNumber, 0, 127);
  });
};

const chordBassMidiNumber = (chord: ChordEvent) =>
  chord.bass ? noteNameToMidiNumber(chord.bass, BASS_OCTAVE) : null;

const createNoteEvents = (
  startTick: number,
  endTick: number,
  channel: number,
  note: number,
  velocity: number,
): MidiEvent[] => {
  if (endTick <= startTick) {
    return [];
  }

  return [
    {
      tick: startTick,
      order: 2,
      bytes: noteOnEvent(channel, note, velocity),
    },
    {
      tick: endTick,
      order: 1,
      bytes: noteOffEvent(channel, note),
    },
  ];
};

const createChordTrackEvents = (song: Song): MidiEvent[] => {
  const totalBeats = getTotalBeats(song);

  return sortChordEvents(song.chords).flatMap((chord): MidiEvent[] => {
    if (chord.startBeat >= totalBeats || chord.durationBeats <= 0) {
      return [];
    }

    const startTick = beatToTick(chord.startBeat, song.timeSignature);
    const endTick = beatToTick(
      Math.min(getChordEndBeat(chord), totalBeats),
      song.timeSignature,
    );
    const bassNote = chordBassMidiNumber(chord);
    const notes = bassNote === null ? chordToMidiNumbers(chord) : [...chordToMidiNumbers(chord), bassNote];

    return notes.flatMap((note) =>
      createNoteEvents(startTick, endTick, ACCOMPANIMENT_CHANNEL, note, 72),
    );
  });
};

const createMelodyTrackEvents = (song: Song): MidiEvent[] => {
  const totalBeats = getTotalBeats(song);

  return sortMelodyNotes(song.melodyNotes).flatMap((note): MidiEvent[] => {
    if (note.startBeat >= totalBeats || note.durationBeats <= 0) {
      return [];
    }

    const startTick = beatToTick(note.startBeat, song.timeSignature);
    const endTick = beatToTick(
      Math.min(getMelodyNoteEndBeat(note), totalBeats),
      song.timeSignature,
    );
    const noteNumber = noteNameToMidiNumber(note.pitch, note.octave);
    const velocity = Math.round(clamp(note.velocity, 0, 1) * 127);

    return createNoteEvents(startTick, endTick, MELODY_CHANNEL, noteNumber, velocity);
  });
};

const createTrackChunk = (events: MidiEvent[]) => {
  const sortedEvents = [...events].sort((a, b) => {
    if (a.tick !== b.tick) {
      return a.tick - b.tick;
    }

    return a.order - b.order;
  });
  const body: number[] = [];
  let previousTick = 0;

  sortedEvents.forEach((event) => {
    body.push(...variableLengthQuantity(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  });

  body.push(0, ...metaEvent(0x2f, []));

  const track: number[] = toAsciiBytes('MTrk');
  pushUint32(track, body.length);
  track.push(...body);

  return track;
};

const createHeaderChunk = (trackCount: number) => {
  const header: number[] = toAsciiBytes('MThd');

  pushUint32(header, 6);
  pushUint16(header, 1);
  pushUint16(header, trackCount);
  pushUint16(header, TICKS_PER_QUARTER_NOTE);

  return header;
};

const createMetaTrack = (song: Song) =>
  createTrackChunk([
    { tick: 0, order: 0, bytes: trackNameEvent('Tempo') },
    { tick: 0, order: 1, bytes: tempoEvent(song) },
    { tick: 0, order: 2, bytes: timeSignatureEvent(song.timeSignature) },
  ]);

const createAccompanimentTrack = (song: Song) =>
  createTrackChunk([
    { tick: 0, order: 0, bytes: trackNameEvent('Chords') },
    { tick: 0, order: 1, bytes: programChangeEvent(ACCOMPANIMENT_CHANNEL, 0) },
    ...createChordTrackEvents(song),
  ]);

const createMelodyTrack = (song: Song) =>
  createTrackChunk([
    { tick: 0, order: 0, bytes: trackNameEvent('Melody') },
    { tick: 0, order: 1, bytes: programChangeEvent(MELODY_CHANNEL, 0) },
    ...createMelodyTrackEvents(song),
  ]);

export const createMidiFile = (song: Song) => {
  const tracks = [createMetaTrack(song), createAccompanimentTrack(song), createMelodyTrack(song)];
  const bytes = [...createHeaderChunk(tracks.length), ...tracks.flat()];

  return new Uint8Array(bytes);
};

export const createMidiBlob = (song: Song) =>
  new Blob([createMidiFile(song)], { type: 'audio/midi' });

export const createMidiFileName = (song: Pick<Song, 'title'>) => {
  const safeTitle = song.title.trim().replace(/[\\/:*?"<>|]+/g, '_');

  return `${safeTitle || 'song'}.mid`;
};
