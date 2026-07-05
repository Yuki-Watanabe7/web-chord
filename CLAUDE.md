# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

`web-chord` is the source of truth for this app. Do not use sibling repositories such as `my-chord` for implementation work.

The product is a beginner-friendly MIDI creation tool centered on chord progressions — simpler than a full DAW like GarageBand. Keep the scope focused on:

- chord editing
- melody editing
- playback
- save/load
- MIDI export
- lightweight music-theory guidance embedded in the UI (chord-tone highlighting is implemented; scale-tone highlighting and suggested melody notes are the next candidates)

Avoid drifting toward a full DAW. Mixing, audio recording, automation, plugins, and advanced arrangement workflows are out of scope unless the user explicitly asks for them.

The intended user workflow: pick/edit a chord progression → add a melody that fits the chords → preview playback → save locally or export MIDI.

## Commands

```sh
npm install       # install dependencies
npm run dev       # start Vite dev server
npm run lint      # eslint .
npm run build     # tsc -b && vite build (runs TypeScript project references, then bundles)
npm run preview   # preview the production build
```

There is no test suite/runner configured in this repo. For any code change, run `npm run lint` and `npm run build` at minimum (build performs the type-check via `tsc -b`, across `tsconfig.app.json` and `tsconfig.node.json`). Documentation-only changes don't require this.

When starting a dev server for manual testing, report the URL and stop the server when it's no longer needed.

## Architecture

Vite + React 19 + TypeScript, styled with Emotion, routed with React Router, audio via Tone.js, persistence via `localStorage`. No backend.

### Data flow

`Editor.tsx` (page) owns all `Song` state via `useState` and passes it down as props; child components are presentational and call back up through handlers. There is no global store — `src/domain/music/timeline.ts` provides pure functions that take a `Song` and return a new `Song` (e.g. `insertChordInSong`, `resizeChordInSong`, `deleteMelodyNoteFromSong`), and `Editor.tsx` wires them into `setSong(prev => ...)` calls. Domain logic and UI state changes should go through these functions rather than mutating `song` fields ad hoc.

- `src/domain/music/types.ts` — core types: `NoteName`, `ChordQuality`, `ChordEvent`, `MelodyNote`, `Song`, `TimeSignature`. This is the canonical model; everything else imports from here.
- `src/domain/music/chords.ts` — chord-tone computation (`getChordNotes`) and type guards (`isNoteName`, `isChordQuality`).
- `src/domain/music/timeline.ts` — beat/measure math and all `Song`-transforming operations (insert/delete/resize chords and melody notes, time-signature changes, sorting, total-beats/end-beat helpers). This is where new chord/melody editing behavior belongs.
- `src/domain/music/migration.ts` — normalizes arbitrary `localStorage` data into valid `Song[]`, including converting the old measure/beat-grid format (`LegacySong`/`grid`) into the current event-based model. **Any change to the `Song` shape must be reflected here** so existing saved songs keep loading — never silently drop old data.
- `src/services/songStorage.ts` — `localStorage` read/write (`loadSongs`, `loadSong`, `saveSong`), delegates normalization to `migration.ts`.
- `src/services/playback.ts` — turns a `Song`'s `chords`/`melodyNotes` into scheduled Tone.js triggers (`playSong`, `playChordProgression`, `previewMelodyNote`). Always consumes the event-based `Song` model directly — never rendered/UI grid state.
- `src/services/midiExport.ts` — converts `Song` into a standard MIDI file (`Song.bpm` → tempo, `Song.timeSignature` → meter event, `chords`/`melodyNotes` → separate tracks).
- `src/components/editor/` — `ChordPalette`, `SongControls`, `TimelineGrid` (the big one: renders the beat timeline, chord blocks spanning measures, and the piano-roll melody lane), `TransportControls`. These take data + callbacks as props; they don't own persistence, playback, or domain logic.
- `src/pages/Editor.tsx` — page composition and state wiring only. Keep domain logic in `src/domain/music/` and side effects (storage/playback/export) in `src/services/`, not here.
- `src/pages/SongList.tsx` — lists/creates/opens saved songs.

### Legacy re-export shims

`src/types/song.ts`, `src/types/chord.ts`, and `src/data/chords.ts` are thin re-export/wrapper layers over `src/domain/music/*` (kept for import-path compatibility from an earlier structure). Prefer importing directly from `src/domain/music/types.ts` and `src/domain/music/chords.ts` in new code rather than deepening the indirection through these shims.

### Time/beat model

The song model is event-based, not grid-based: `ChordEvent` and `MelodyNote` both carry `startBeat`/`durationBeats` (in beats, not measure-cells), which is what lets chords span measure boundaries and keeps melody editing and MIDI export straightforward. Measure markers in the UI are a visual guide only, derived from `timeSignature.beatsPerMeasure` and `totalMeasures` — don't reintroduce a measure/cell-indexed data structure.

## Editing Guidelines

- Keep changes small and aligned with the existing structure.
- Put music-domain behavior in `src/domain/music/`, persistence/playback/export in `src/services/`.
- Preserve compatibility with old saved data — update `migration.ts` if the stored song shape changes.
- Keep UI copy concise, beginner-friendly, and in Japanese (matches existing UI text).
- Favor the current focused feature set over new abstractions; see Product Direction above before adding DAW-like features.
