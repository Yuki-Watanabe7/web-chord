import { NOTE_NAMES } from '../domain/music/chords';
import { getSongEndTick, getTimeSignatureAtTick } from '../domain/music/timing';
import { chordEventToChordDefinition, getChordEndTick, getMelodyNoteEndTick, sortChordEvents, sortMelodyNotes } from '../domain/music/timeline';
import type { ChordEvent, NoteName, Song, SongKey, TimeSignature } from '../domain/music/types';

const ACCOMPANIMENT_CHANNEL = 0;
const MELODY_CHANNEL = 1;
interface MidiEvent { tick: number; order: number; bytes: number[]; }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toAsciiBytes = (value: string) => Array.from(value, (character) => character.charCodeAt(0) & 0x7f);
const pushUint16 = (target: number[], value: number) => { target.push((value >> 8) & 0xff, value & 0xff); };
const pushUint32 = (target: number[], value: number) => { target.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff); };
const variableLengthQuantity = (value: number) => { const bytes = [value & 0x7f]; let remaining = value >> 7; while (remaining > 0) { bytes.unshift((remaining & 0x7f) | 0x80); remaining >>= 7; } return bytes; };
const metaEvent = (type: number, data: number[]) => [0xff, type, ...variableLengthQuantity(data.length), ...data];
const trackNameEvent = (name: string) => metaEvent(0x03, toAsciiBytes(name));
const programChangeEvent = (channel: number, program: number) => [0xc0 | clamp(channel, 0, 15), clamp(program, 0, 127)];
const noteOnEvent = (channel: number, note: number, velocity: number) => [0x90 | clamp(channel, 0, 15), clamp(note, 0, 127), clamp(velocity, 0, 127)];
const noteOffEvent = (channel: number, note: number) => [0x80 | clamp(channel, 0, 15), clamp(note, 0, 127), 0];

const microsecondsPerQuarterNote = (bpm: number, signature: TimeSignature) =>
  Math.round((60_000_000 / Math.max(1, bpm)) * (signature.beatUnit / 4));
const tempoEvent = (bpm: number, signature: TimeSignature) => {
  const tempo = clamp(microsecondsPerQuarterNote(bpm, signature), 1, 0xffffff);
  return metaEvent(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]);
};
const timeSignatureEvent = (timeSignature: TimeSignature) => metaEvent(0x58, [
  clamp(timeSignature.beatsPerMeasure, 1, 255), clamp(Math.round(Math.log2(timeSignature.beatUnit)), 0, 255), 24, 8,
]);
const MAJOR_KEY_SIGNATURES: Record<NoteName, number> = { C: 0, 'C#': 7, D: 2, 'D#': -3, E: 4, F: -1, 'F#': 6, G: 1, 'G#': -4, A: 3, 'A#': -2, B: 5 };
const MINOR_KEY_SIGNATURES: Record<NoteName, number> = { C: -3, 'C#': 4, D: -1, 'D#': 6, E: 0, F: 1, 'F#': 3, G: -2, 'G#': 5, A: 0, 'A#': -5, B: 2 };
const keySignatureEvent = (key: SongKey) => metaEvent(0x59, [
  (key.mode === 'minor' ? MINOR_KEY_SIGNATURES[key.tonic] : MAJOR_KEY_SIGNATURES[key.tonic]) & 0xff,
  key.mode === 'minor' ? 1 : 0,
]);

const noteNameToMidiNumber = (pitch: NoteName, octave: number) => clamp((octave + 1) * 12 + NOTE_NAMES.indexOf(pitch), 0, 127);
const chordToMidiNumbers = (chord: ChordEvent) => {
  const root = noteNameToMidiNumber(chord.root, 3);
  return chordEventToChordDefinition(chord).notes.map((name) => { let midi = noteNameToMidiNumber(name, 3); while (midi < root) midi += 12; return clamp(midi, 0, 127); });
};
const noteEvents = (startTick: number, endTick: number, channel: number, note: number, velocity: number): MidiEvent[] => endTick <= startTick ? [] : [
  { tick: startTick, order: 2, bytes: noteOnEvent(channel, note, velocity) },
  { tick: endTick, order: 1, bytes: noteOffEvent(channel, note) },
];
const createChordTrackEvents = (song: Song): MidiEvent[] => {
  const end = getSongEndTick(song);
  return sortChordEvents(song.chords).flatMap((chord) => {
    if (chord.startTick >= end || chord.durationTicks <= 0) return [];
    const chordNotes = chordToMidiNumbers(chord);
    if (chordNotes.length === 0) return [];
    const notes = chord.bass ? [...chordNotes, noteNameToMidiNumber(chord.bass, 2)] : chordNotes;
    return notes.flatMap((note) => noteEvents(chord.startTick, Math.min(getChordEndTick(chord), end), ACCOMPANIMENT_CHANNEL, note, 72));
  });
};
const createMelodyTrackEvents = (song: Song): MidiEvent[] => {
  const end = getSongEndTick(song);
  return sortMelodyNotes(song.melodyNotes).flatMap((note) => note.startTick >= end || note.durationTicks <= 0 ? [] :
    noteEvents(note.startTick, Math.min(getMelodyNoteEndTick(note), end), MELODY_CHANNEL, noteNameToMidiNumber(note.pitch, note.octave), Math.round(clamp(note.velocity, 0, 1) * 127)));
};
const createTrackChunk = (events: MidiEvent[]) => {
  const body: number[] = []; let previousTick = 0;
  [...events].sort((a, b) => a.tick - b.tick || a.order - b.order).forEach((event) => { body.push(...variableLengthQuantity(event.tick - previousTick), ...event.bytes); previousTick = event.tick; });
  body.push(0, ...metaEvent(0x2f, []));
  const track = toAsciiBytes('MTrk'); pushUint32(track, body.length); track.push(...body); return track;
};
const createHeaderChunk = (trackCount: number, ticksPerQuarter: number) => {
  const header = toAsciiBytes('MThd'); pushUint32(header, 6); pushUint16(header, 1); pushUint16(header, trackCount); pushUint16(header, clamp(ticksPerQuarter, 1, 0x7fff)); return header;
};
const createMetaTrack = (song: Song) => createTrackChunk([
  { tick: 0, order: 0, bytes: trackNameEvent('Tempo') },
  ...song.tempoEvents.map((event) => ({ tick: event.tick, order: 1, bytes: tempoEvent(event.bpm, getTimeSignatureAtTick(song, event.tick)) })),
  ...song.timeSignatureEvents.map((event) => ({ tick: event.tick, order: 2, bytes: timeSignatureEvent(event.timeSignature) })),
  ...song.keySignatureEvents.map((event) => ({ tick: event.tick, order: 3, bytes: keySignatureEvent(event.key) })),
]);
const createAccompanimentTrack = (song: Song) => createTrackChunk([{ tick: 0, order: 0, bytes: trackNameEvent('Chords') }, { tick: 0, order: 1, bytes: programChangeEvent(ACCOMPANIMENT_CHANNEL, 0) }, ...createChordTrackEvents(song)]);
const createMelodyTrack = (song: Song) => createTrackChunk([{ tick: 0, order: 0, bytes: trackNameEvent('Melody') }, { tick: 0, order: 1, bytes: programChangeEvent(MELODY_CHANNEL, 0) }, ...createMelodyTrackEvents(song)]);
export const createMidiFile = (song: Song) => {
  const tracks = [createMetaTrack(song), createAccompanimentTrack(song), createMelodyTrack(song)];
  return new Uint8Array([...createHeaderChunk(tracks.length, song.ticksPerQuarter), ...tracks.flat()]);
};
export const createMidiBlob = (song: Song) => new Blob([createMidiFile(song)], { type: 'audio/midi' });
export const createMidiFileName = (song: Pick<Song, 'title'>) => `${song.title.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'song'}.mid`;
