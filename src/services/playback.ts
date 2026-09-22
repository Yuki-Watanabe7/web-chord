import * as Tone from 'tone';
import { getSongEndTick, getTempoAtTick, getTimeSignatureAtTick, ticksPerBeat } from '../domain/music/timing';
import { chordEventToChordDefinition, getChordEndTick, getMelodyNoteEndTick, sortChordEvents, sortMelodyNotes } from '../domain/music/timeline';
import type { ChordDefinition, MelodyNote, Song } from '../domain/music/types';

export type ChordPlaybackSynth = Tone.PolySynth;
export interface SongPlaybackSynths { chords: ChordPlaybackSynth; melody: ChordPlaybackSynth; dispose: () => void; releaseAll: () => void; }
const wait = (milliseconds: number) => new Promise<void>((resolve) => { setTimeout(resolve, milliseconds); });
const getBeatDurationMs = (bpm: number) => (60 / Math.max(1, bpm)) * 1000;
const getNoteName = (note: Pick<MelodyNote, 'pitch' | 'octave'>) => `${note.pitch}${note.octave}`;
const getChordPlaybackNotes = (chord: Pick<ChordDefinition, 'notes' | 'bass'>) => [...chord.notes.map((note) => `${note}4`), ...(chord.bass ? [`${chord.bass}2`] : [])];
export const createChordPlaybackSynth = (): ChordPlaybackSynth => new Tone.PolySynth(Tone.Synth).toDestination();
export const createSongPlaybackSynths = (): SongPlaybackSynths => {
  const chords = createChordPlaybackSynth(); const melody = createChordPlaybackSynth(); chords.volume.value = -8; melody.volume.value = -3;
  return { chords, melody, dispose: () => { chords.dispose(); melody.dispose(); }, releaseAll: () => { chords.releaseAll(); melody.releaseAll(); } };
};
export const playChord = async (synth: ChordPlaybackSynth, chord: ChordDefinition, durationBeats: number, bpm: number) => {
  await Tone.start(); const notes = getChordPlaybackNotes(chord); synth.releaseAll(); synth.triggerAttack(notes); await wait(getBeatDurationMs(bpm) * durationBeats); synth.triggerRelease(notes); await wait(100);
};
export const previewMelodyNote = async (synth: ChordPlaybackSynth, note: Pick<MelodyNote, 'pitch' | 'octave' | 'velocity'>) => { await Tone.start(); synth.triggerAttackRelease(getNoteName(note), '8n', undefined, note.velocity); };

/** Converts a tick position to elapsed wall-clock time without rounding ticks. */
export const tickToPlaybackMilliseconds = (song: Song, targetTick: number) => {
  const boundedTarget = Math.max(0, Math.min(targetTick, getSongEndTick(song)));
  const changeTicks = Array.from(new Set([0, boundedTarget, ...song.tempoEvents.map((event) => event.tick), ...song.timeSignatureEvents.map((event) => event.tick)]))
    .filter((tick) => tick >= 0 && tick <= boundedTarget).sort((first, second) => first - second);
  let milliseconds = 0;
  for (let index = 0; index < changeTicks.length - 1; index += 1) {
    const start = changeTicks[index]; const end = changeTicks[index + 1];
    const bpm = getTempoAtTick(song, start); const signature = getTimeSignatureAtTick(song, start);
    milliseconds += (end - start) * getBeatDurationMs(bpm) / ticksPerBeat(song.ticksPerQuarter, signature);
  }
  return milliseconds;
};

export const playChordProgression = async (song: Song, synth: ChordPlaybackSynth) => {
  await Tone.start(); synth.releaseAll();
  const end = getSongEndTick(song); const chords = sortChordEvents(song.chords).filter((event) => event.startTick < end && event.durationTicks > 0);
  if (chords.length === 0) return;
  let currentTick = 0;
  for (const chord of chords) {
    if (chord.startTick < currentTick) continue;
    await wait(tickToPlaybackMilliseconds(song, chord.startTick) - tickToPlaybackMilliseconds(song, currentTick));
    const chordEnd = Math.min(getChordEndTick(chord), end);
    const notes = getChordPlaybackNotes(chordEventToChordDefinition(chord));
    if (notes.length === 0) {
      await wait(tickToPlaybackMilliseconds(song, chordEnd) - tickToPlaybackMilliseconds(song, chord.startTick));
      currentTick = chordEnd;
      continue;
    }
    synth.triggerAttack(notes);
    await wait(tickToPlaybackMilliseconds(song, chordEnd) - tickToPlaybackMilliseconds(song, chord.startTick));
    synth.triggerRelease(notes); currentTick = chordEnd;
  }
};

export const playSong = async (song: Song, synths: SongPlaybackSynths) => {
  await Tone.start(); synths.releaseAll();
  const end = getSongEndTick(song);
  const scheduled = [
    ...sortChordEvents(song.chords).filter((event) => event.startTick < end && event.durationTicks > 0).flatMap((event) => {
      const endTick = Math.min(getChordEndTick(event), end); const startMs = tickToPlaybackMilliseconds(song, event.startTick); const endMs = tickToPlaybackMilliseconds(song, endTick);
      const notes = getChordPlaybackNotes(chordEventToChordDefinition(event));
      return notes.length > 0 ? [{ startMs, endMs, play: () => synths.chords.triggerAttackRelease(notes, (endMs - startMs) / 1000, undefined, 0.58) }] : [];
    }),
    ...sortMelodyNotes(song.melodyNotes).filter((event) => event.startTick < end && event.durationTicks > 0).map((event) => {
      const endTick = Math.min(getMelodyNoteEndTick(event), end); const startMs = tickToPlaybackMilliseconds(song, event.startTick); const endMs = tickToPlaybackMilliseconds(song, endTick);
      return { startMs, endMs, play: () => synths.melody.triggerAttackRelease(getNoteName(event), (endMs - startMs) / 1000, undefined, event.velocity) };
    }),
  ];
  if (scheduled.length === 0) return;
  const timers = scheduled.map((event) => window.setTimeout(event.play, event.startMs));
  try { await wait(Math.max(...scheduled.map((event) => event.endMs)) + 120); }
  finally { timers.forEach((timer) => window.clearTimeout(timer)); synths.releaseAll(); }
};
