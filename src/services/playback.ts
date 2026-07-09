import * as Tone from 'tone';
import {
  chordEventToChordDefinition,
  getMelodyNoteEndBeat,
  getChordEndBeat,
  getTotalBeats,
  sortChordEvents,
  sortMelodyNotes,
} from '../domain/music/timeline';
import type { ChordDefinition, MelodyNote, Song } from '../domain/music/types';

export type ChordPlaybackSynth = Tone.PolySynth;

export interface SongPlaybackSynths {
  chords: ChordPlaybackSynth;
  melody: ChordPlaybackSynth;
  dispose: () => void;
  releaseAll: () => void;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const getBeatDurationMs = (bpm: number) => (60 / Math.max(1, bpm)) * 1000;

const getNoteName = (note: Pick<MelodyNote, 'pitch' | 'octave'>) =>
  `${note.pitch}${note.octave}`;

const BASS_OCTAVE = 2;

const getChordPlaybackNotes = (chord: Pick<ChordDefinition, 'notes' | 'bass'>) => [
  ...chord.notes.map((note) => `${note}4`),
  ...(chord.bass ? [`${chord.bass}${BASS_OCTAVE}`] : []),
];

export const createChordPlaybackSynth = (): ChordPlaybackSynth =>
  new Tone.PolySynth(Tone.Synth).toDestination();

export const createSongPlaybackSynths = (): SongPlaybackSynths => {
  const chords = createChordPlaybackSynth();
  const melody = createChordPlaybackSynth();

  chords.volume.value = -8;
  melody.volume.value = -3;

  return {
    chords,
    melody,
    dispose: () => {
      chords.dispose();
      melody.dispose();
    },
    releaseAll: () => {
      chords.releaseAll();
      melody.releaseAll();
    },
  };
};

export const playChord = async (
  synth: ChordPlaybackSynth,
  chord: ChordDefinition,
  durationBeats: number,
  bpm: number,
) => {
  await Tone.start();

  const notes = getChordPlaybackNotes(chord);

  synth.releaseAll();
  synth.triggerAttack(notes);

  await wait(getBeatDurationMs(bpm) * durationBeats);

  synth.triggerRelease(notes);
  await wait(100);
};

export const previewMelodyNote = async (
  synth: ChordPlaybackSynth,
  note: Pick<MelodyNote, 'pitch' | 'octave' | 'velocity'>,
) => {
  await Tone.start();
  synth.triggerAttackRelease(getNoteName(note), '8n', undefined, note.velocity);
};

export const playChordProgression = async (song: Song, synth: ChordPlaybackSynth) => {
  await Tone.start();
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

export const playSong = async (song: Song, synths: SongPlaybackSynths) => {
  await Tone.start();
  synths.releaseAll();

  const totalBeats = getTotalBeats(song);
  const beatDurationMs = getBeatDurationMs(song.bpm);
  const chordEvents = sortChordEvents(song.chords).filter(
    (chord) => chord.startBeat < totalBeats && chord.durationBeats > 0,
  );
  const melodyNotes = sortMelodyNotes(song.melodyNotes).filter(
    (note) => note.startBeat < totalBeats && note.durationBeats > 0,
  );

  const scheduledEvents = [
    ...chordEvents.map((chord) => {
      const durationBeats = Math.min(getChordEndBeat(chord), totalBeats) - chord.startBeat;
      const chordDefinition = chordEventToChordDefinition(chord);

      return {
        startMs: chord.startBeat * beatDurationMs,
        endMs: (chord.startBeat + durationBeats) * beatDurationMs,
        play: () => {
          synths.chords.triggerAttackRelease(
            getChordPlaybackNotes(chordDefinition),
            durationBeats * (beatDurationMs / 1000),
            undefined,
            0.58,
          );
        },
      };
    }),
    ...melodyNotes.map((note) => {
      const durationBeats = Math.min(getMelodyNoteEndBeat(note), totalBeats) - note.startBeat;

      return {
        startMs: note.startBeat * beatDurationMs,
        endMs: (note.startBeat + durationBeats) * beatDurationMs,
        play: () => {
          synths.melody.triggerAttackRelease(
            getNoteName(note),
            durationBeats * (beatDurationMs / 1000),
            undefined,
            note.velocity,
          );
        },
      };
    }),
  ];

  if (scheduledEvents.length === 0) {
    return;
  }

  const timers = scheduledEvents.map((event) =>
    window.setTimeout(() => {
      event.play();
    }, event.startMs),
  );
  const endMs = Math.max(...scheduledEvents.map((event) => event.endMs));

  try {
    await wait(endMs + 120);
  } finally {
    timers.forEach((timer) => window.clearTimeout(timer));
    synths.releaseAll();
  }
};
