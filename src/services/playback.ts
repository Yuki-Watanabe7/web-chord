import * as Tone from 'tone';
import {
  chordEventToChordDefinition,
  getTotalBeats,
  sortChordEvents,
} from '../domain/music/timeline';
import type { ChordDefinition, Song } from '../domain/music/types';

export type ChordPlaybackSynth = Tone.PolySynth;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const getBeatDurationMs = (bpm: number) => (60 / bpm) * 1000;

export const createChordPlaybackSynth = (): ChordPlaybackSynth =>
  new Tone.PolySynth(Tone.Synth).toDestination();

export const playChord = async (
  synth: ChordPlaybackSynth,
  chord: ChordDefinition,
  durationBeats: number,
  bpm: number,
) => {
  const notes = chord.notes.map((note) => `${note}4`);

  synth.releaseAll();
  synth.triggerAttack(notes);

  await wait(getBeatDurationMs(bpm) * durationBeats);

  synth.triggerRelease(notes);
  await wait(100);
};

export const playChordProgression = async (song: Song, synth: ChordPlaybackSynth) => {
  synth.releaseAll();

  const totalBeats = getTotalBeats(song);
  const chordEvents = sortChordEvents(song.chords).filter(
    (chord) => chord.startBeat < totalBeats && chord.durationBeats > 0,
  );

  if (chordEvents.length === 0) {
    return;
  }

  let currentBeat = 0;

  for (const chordEvent of chordEvents) {
    if (chordEvent.startBeat > currentBeat) {
      await wait(getBeatDurationMs(song.bpm) * (chordEvent.startBeat - currentBeat));
      currentBeat = chordEvent.startBeat;
    }

    if (chordEvent.startBeat < currentBeat) {
      continue;
    }

    const durationBeats = Math.min(chordEvent.durationBeats, totalBeats - chordEvent.startBeat);

    await playChord(synth, chordEventToChordDefinition(chordEvent), durationBeats, song.bpm);
    currentBeat = chordEvent.startBeat + durationBeats;
  }
};
