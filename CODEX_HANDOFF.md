# Codex Handoff: web-chord

## Recommended Working Setup

Open `/Users/watanabeyuuki/Documents/web-chord` as the VSCode workspace and start a fresh Codex session there. Treat `web-chord` as the source of truth for this project. The sibling `my-chord` repo was opened by mistake and should not be used for the next implementation steps.

## Current Evaluation

`web-chord` is the correct project. It is a Vite + React + TypeScript web app with Emotion for styling, React Router for pages, Tone.js for audio playback, and `localStorage` for simple song persistence.

The current app already has:

- Song list page
- Editor page
- Chord palette
- Beat/measure grid
- BPM control
- Time signature selector
- Local save/load
- Basic Tone.js chord playback

Validation already performed:

- `npm run lint` passed
- `tsc -p tsconfig.app.json --noEmit` passed
- `tsc -p tsconfig.node.json --noEmit` passed
- `npm run build` passed
- Git worktree was clean after evaluation

## Product Context From The User

The user wants to build a simple MIDI creation tool inspired by GarageBand, but easier to learn and use. GarageBand is powerful, but its feature set and workflow can feel too complex for quickly making simple music. This project should avoid becoming a full DAW clone.

The current user problem:

- Existing music production tools are too feature-rich for beginners or casual composing.
- The user wants to make music by starting from simple chord progressions.
- The next major capability should be melody editing, but it should build naturally on the chord editor instead of introducing a complicated DAW-style workflow.

The desired TO-BE state:

- A beginner-friendly tool where users can quickly create a short song idea.
- The core workflow should be: choose or edit a chord progression, add a melody that fits the chords, preview playback, then export MIDI.
- Music theory assistance should be embedded in the UI: chord tones, scale tones, and suggested melody notes should guide the user without requiring them to understand all theory upfront.
- The UI should prioritize clarity and speed over professional DAW completeness.
- Features should stay focused: chord editing, melody editing, playback, save/load, and MIDI export before anything like mixing, audio recording, automation, or plugin support.

## Strategic Direction

Continue from `web-chord`. Do not restart from scratch.

Before adding melody editing, refactor the app so that music data, storage, playback, and UI are separated. The current `src/pages/Editor.tsx` contains nearly all behavior: styling, song state, chord placement, playback, saving, and rendering. Adding a piano roll directly into this file would make the code difficult to evolve.

## Main Risks In The Current Code

- `Editor.tsx` is too large and owns too many concerns.
- The song model is measure/beat-grid oriented, but melody editing and MIDI export will be easier with timeline events using `startBeat` and `durationBeats`.
- Chord duration is currently local to a measure and does not naturally span measures.
- Time signature changes rebuild beats and reset duration information.
- `6/8` is selectable, but playback timing is still essentially quarter-note based.
- `localStorage` parsing has no schema validation or migration path.

## Recommended Implementation Plan

### Phase 1: Stabilize The Domain Model

Create a music-domain layer under something like `src/domain/music/`.

Suggested types:

```ts
export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'dominant7'
  | 'major7'
  | 'minor7';

export interface ChordEvent {
  id: string;
  root: NoteName;
  quality: ChordQuality;
  startBeat: number;
  durationBeats: number;
}

export interface MelodyNote {
  id: string;
  pitch: NoteName;
  octave: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  timeSignature: {
    beatsPerMeasure: number;
    beatUnit: number;
  };
  totalMeasures: number;
  chords: ChordEvent[];
  melodyNotes: MelodyNote[];
  createdAt: string;
  updatedAt: string;
}
```

Keep compatibility with existing saved songs by adding a converter from the old `grid` model to the new event model. Do not silently discard old saved data.

### Phase 2: Split Editor Responsibilities

Suggested file split:

- `src/pages/Editor.tsx`: page composition only
- `src/components/editor/ChordPalette.tsx`
- `src/components/editor/TimelineGrid.tsx`
- `src/components/editor/TransportControls.tsx`
- `src/components/editor/SongControls.tsx`
- `src/domain/music/chords.ts`
- `src/domain/music/timeline.ts`
- `src/services/songStorage.ts`
- `src/services/playback.ts`

Keep the first refactor behavior-preserving. Avoid changing UX and data model in the same commit unless necessary.

### Phase 3: Improve Chord Editing

After the model is event-based:

- Add chord insertion by beat position
- Add delete chord
- Add resize duration
- Allow chord spans across measure boundaries
- Show active chord blocks on a horizontal timeline
- Keep measure markers as visual guides only

### Phase 4: Add Melody Editing

Start simple:

- Add a piano-roll lane under the chord timeline
- Horizontal axis: beats
- Vertical axis: pitch
- Click empty cell to add a short note
- Click note to select
- Delete selected note
- Resize note duration after basic add/select works

Then add:

- Highlight current chord tones
- Highlight key/scale tones
- Suggest melody notes based on selected chord
- Preview selected note or chord-tone on click

### Phase 5: Playback And MIDI Export

Playback should consume the event-based `Song` model, not UI grid state.

Later MIDI export should map:

- `Song.bpm` to tempo
- `Song.timeSignature` to meter
- `ChordEvent[]` to an accompaniment track
- `MelodyNote[]` to a melody track

## Suggested First Task For The New Session

Ask Codex in the new `web-chord` workspace:

> `CODEX_HANDOFF.md` を読んで、まず Phase 1 と Phase 2 の最小リファクタを実装してください。既存のコード進行編集・保存・再生の挙動は維持し、lint/typecheck/build まで確認してください。

## Notes

Keep changes small and verifiable. The project is still early, so a careful domain-model refactor now will save a lot of friction when melody editing and MIDI export arrive.
