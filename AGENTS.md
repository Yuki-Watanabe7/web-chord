# AGENTS.md

This file gives future coding agents the project-specific context needed to work safely in this repository.

## Project Context

`web-chord` is the source of truth for this app. Do not use sibling repositories such as `my-chord` for implementation work.

The product is a beginner-friendly MIDI creation tool centered on chord progressions. Keep the scope focused on:

- chord editing
- melody editing
- playback
- save/load
- MIDI export
- lightweight music-theory guidance inside the UI

Avoid drifting toward a full DAW. Features such as mixing, audio recording, automation, plugins, and advanced arrangement workflows are out of scope unless the user explicitly asks for them.

## Current Architecture

The app is a Vite + React + TypeScript app using Emotion, React Router, Tone.js, and `localStorage`.

Important directories:

- `src/domain/music/`: music types, chord helpers, timeline editing logic, migration helpers
- `src/components/editor/`: editor UI components
- `src/pages/`: route-level pages
- `src/services/`: persistence, playback, MIDI export

The core song model is event-based. Prefer `Song`, `ChordEvent`, and `MelodyNote` from `src/domain/music/types.ts` over rebuilding UI-grid-specific data structures.

## Editing Guidelines

- Keep changes small and aligned with the existing structure.
- Put music-domain behavior in `src/domain/music/`.
- Put browser-side persistence, playback, and export behavior in `src/services/`.
- Keep `src/pages/Editor.tsx` as page composition and state wiring, not a dumping ground for domain logic.
- Preserve compatibility with old saved data. If stored song shape changes, update `src/domain/music/migration.ts`.
- Do not silently discard `localStorage` songs when adding new model fields.
- MIDI export should continue to consume the event-based `Song` model.
- Playback should continue to consume the event-based `Song` model, not rendered UI state.
- Keep UI copy concise and beginner-friendly.
- Keep the app focused and simple before adding new abstractions.

## Development Commands

Install dependencies:

```sh
npm install
```

Run the dev server:

```sh
npm run dev
```

Lint:

```sh
npm run lint
```

Build:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Verification

For code changes, run at least:

```sh
npm run lint
npm run build
```

For documentation-only changes, lint/build are optional unless the user requests full verification.

When starting a dev server for manual testing, report the URL and stop the server when it is no longer needed.

## Product Direction

The intended workflow is:

1. choose or edit a chord progression
2. add a melody that fits the chords
3. preview playback
4. save locally or export MIDI

Music-theory assistance should be embedded in the editing experience. Current implementation highlights chord tones; likely future improvements include scale-tone highlighting and suggested melody notes.
