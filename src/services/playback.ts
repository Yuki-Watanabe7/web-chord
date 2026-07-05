import * as Tone from 'tone';
import { songToGrid } from '../domain/music/timeline';
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

  const playbackGrid = songToGrid(song);
  let lastMeasureWithChord = -1;

  for (let i = playbackGrid.length - 1; i >= 0; i--) {
    if (playbackGrid[i]?.beats.some((beat) => beat.chord !== null)) {
      lastMeasureWithChord = i;
      break;
    }
  }

  for (let i = 0; i <= lastMeasureWithChord; i++) {
    const measure = playbackGrid[i];
    if (!measure) continue;

    for (let j = 0; j < measure.beats.length; j++) {
      const beat = measure.beats[j];

      if (beat?.chord) {
        await playChord(synth, beat.chord, beat.duration, song.bpm);
        j += beat.duration - 1;
      } else {
        await wait(getBeatDurationMs(song.bpm));
      }
    }
  }
};
