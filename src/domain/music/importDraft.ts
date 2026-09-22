import { chordSymbolToLegacyFields } from './chordSymbol';
import { createEmptySong, MAX_TOTAL_MEASURES } from './timeline';
import { validateSongTiming } from './timing';
import type {
  ChordSymbol,
  KeySignatureEvent,
  NoteName,
  Song,
  SongKey,
  SongMeasure,
  TempoEvent,
  TieRelation,
  TimeSignature,
  TimeSignatureEvent,
} from './types';

/** The stable shape emitted by a score importer before it is allowed to create a Song. */
export const IMPORT_DRAFT_VERSION = 1;

export type ImportReviewStatus = 'unselected' | 'auto-selected' | 'user-confirmed' | 'edited';

/** A location in the source score which remains useful even after repeats are expanded. */
export interface ImportSourceLocation {
  partId: string;
  partName?: string;
  measureIndex: number;
  measureNumber: string;
  staff?: number;
  voice?: string;
  element: string;
  occurrence?: number;
}

export interface ImportIssue {
  severity: 'warning' | 'error';
  /** A stable, machine-readable reason. It is intentionally not localized. */
  code: string;
  message: string;
  source?: ImportSourceLocation;
}

export interface ImportSource {
  fileName: string;
  /** Deterministic content hash used to identify the exact input, not a security digest. */
  hash: string;
  musicXmlVersion?: string;
  generators: string[];
  /** Populated when the generator text identifies a known OMR engine. */
  omrEngine?: string;
}

export interface ImportCandidate<T> {
  id: string;
  normalized: T;
  /** Score spelling or source value, retained independently from normalized data. */
  raw: string;
  source: ImportSourceLocation;
  confidence?: number;
  reviewStatus: ImportReviewStatus;
}

export interface ImportedMelodyNote {
  pitch: NoteName;
  octave: number;
  startTick: number;
  /** Grace notes are anchored at a tick and deliberately retain duration 0 in a draft. */
  durationTicks: number;
  velocity: number;
  tie?: TieRelation;
  isGrace: boolean;
  timeModification?: { actualNotes: number; normalNotes: number };
}

export interface ImportedChord {
  root: NoteName;
  quality: ReturnType<typeof chordSymbolToLegacyFields>['quality'];
  bass?: NoteName;
  chordSymbol: ChordSymbol;
  startTick: number;
  durationTicks: number;
}

export interface ImportedKeySignature {
  tick: number;
  key: SongKey;
}

export interface ImportedTimeSignature {
  tick: number;
  timeSignature: TimeSignature;
}

export interface ImportedTempo {
  tick: number;
  bpm: number;
}

export interface ImportScorePart {
  id: string;
  name: string;
  measureCount: number;
  staves: Array<{ staff: number; voices: string[] }>;
}

export interface ImportLinearMeasure extends SongMeasure {
  index: number;
  sourceMeasureIndex: number;
  sourceMeasureNumber: string;
  occurrence: number;
}

/** Original score navigation metadata, retained alongside the expanded timeline. */
export interface ImportScoreMeasureStructure {
  partId: string;
  measureIndex: number;
  measureNumber: string;
  durationTicks: number;
  repeat: { forward: boolean; backwardTimes?: number };
  endings: Array<{ type: string; numbers: number[] }>;
  directions: {
    segno?: string;
    coda?: string;
    dacapo: boolean;
    dalsegno?: string;
    tocoda?: string;
    fine: boolean;
  };
}

export interface MelodyCandidateGroup {
  partId: string;
  partName: string;
  staff: number;
  voice: string;
  noteCount: number;
  confidence: number;
}

export interface MelodySelection {
  selected?: Pick<MelodyCandidateGroup, 'partId' | 'staff' | 'voice'>;
  alternatives: MelodyCandidateGroup[];
  status: ImportReviewStatus;
}

export interface ImportDraft {
  version: typeof IMPORT_DRAFT_VERSION;
  source: ImportSource;
  ticksPerQuarter: number;
  score: {
    parts: ImportScorePart[];
    sourceMeasures: ImportScoreMeasureStructure[];
    linearMeasures: ImportLinearMeasure[];
  };
  candidates: {
    melodyNotes: Array<ImportCandidate<ImportedMelodyNote>>;
    chords: Array<ImportCandidate<ImportedChord>>;
    keySignatures: Array<ImportCandidate<ImportedKeySignature>>;
    timeSignatures: Array<ImportCandidate<ImportedTimeSignature>>;
    tempos: Array<ImportCandidate<ImportedTempo>>;
  };
  melodySelection: MelodySelection;
  issues: ImportIssue[];
}

export interface ImportDraftValidation {
  valid: boolean;
  issues: ImportIssue[];
}

export interface ConfirmImportDraftOptions {
  id?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ConfirmImportDraftResult =
  | { ok: true; song: Song; validation: ImportDraftValidation }
  | { ok: false; validation: ImportDraftValidation };

const compareText = (first: string, second: string) => first === second ? 0 : first < second ? -1 : 1;
const compareCandidate = <T extends { startTick: number }>(first: ImportCandidate<T>, second: ImportCandidate<T>) =>
  first.normalized.startTick - second.normalized.startTick || compareText(first.id, second.id);

const dedupeEvents = <T extends { tick: number }>(events: T[]) => {
  const latest = new Map<number, T>();

  events.forEach((event) => latest.set(event.tick, event));
  return [...latest.values()].sort((first, second) => first.tick - second.tick);
};

/**
 * Checks a draft without creating or mutating a Song. Call this to show review
 * problems before the user accepts an import.
 */
export const validateImportDraft = (draft: ImportDraft): ImportDraftValidation => {
  const issues = [...draft.issues];
  const selected = draft.melodySelection.selected;

  if (!selected) {
    issues.push({
      severity: 'error',
      code: 'no-melody-selection',
      message: '主旋律候補を選べませんでした。取り込み前に声部を選択してください。',
    });
  }

  if (draft.score.linearMeasures.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no-linear-measures',
      message: '演奏順へ展開できる小節がありません。',
    });
  }

  if (draft.score.linearMeasures.length > MAX_TOTAL_MEASURES) {
    issues.push({
      severity: 'error',
      code: 'too-many-measures',
      message: `展開後の小節数が上限（${MAX_TOTAL_MEASURES}）を超えています。`,
    });
  }

  draft.score.linearMeasures.forEach((measure, index) => {
    const previous = draft.score.linearMeasures[index - 1];
    if (measure.durationTicks <= 0 || (previous && measure.startTick !== previous.startTick + previous.durationTicks)) {
      issues.push({
        severity: 'error',
        code: 'invalid-linear-measure',
        message: '展開後の小節tickが連続していません。',
      });
    }
  });

  const selectedNotes = draft.candidates.melodyNotes.filter((candidate) =>
    candidate.source.partId === selected?.partId &&
    candidate.source.staff === selected.staff &&
    candidate.source.voice === selected.voice,
  );

  if (selected && selectedNotes.length === 0) {
    issues.push({
      severity: 'error',
      code: 'selected-melody-empty',
      message: '選択された主旋律候補に音符がありません。',
    });
  }

  draft.candidates.melodyNotes.filter((candidate) => candidate.normalized.isGrace).forEach((candidate) => {
    issues.push({
      severity: 'warning',
      code: 'grace-note-not-confirmable',
      message: '装飾音はImportDraftに保持されていますが、現在のSongには確定できません。',
      source: candidate.source,
    });
  });

  return { valid: !issues.some((issue) => issue.severity === 'error'), issues };
};

/**
 * Re-selects one parsed voice without reparsing the source. This keeps the
 * draft as the source of review state and makes the user's choice explicit.
 */
export const selectImportDraftMelody = (
  draft: ImportDraft,
  selected: Pick<MelodyCandidateGroup, 'partId' | 'staff' | 'voice'>,
): ImportDraft => {
  const exists = draft.melodySelection.alternatives.some((candidate) =>
    candidate.partId === selected.partId && candidate.staff === selected.staff && candidate.voice === selected.voice,
  );

  if (!exists) {
    return draft;
  }

  return {
    ...draft,
    melodySelection: { ...draft.melodySelection, selected: { ...selected }, status: 'user-confirmed' },
    candidates: {
      ...draft.candidates,
      melodyNotes: draft.candidates.melodyNotes.map((candidate) => ({
        ...candidate,
        reviewStatus: candidate.source.partId === selected.partId &&
          candidate.source.staff === selected.staff && candidate.source.voice === selected.voice
          ? 'user-confirmed'
          : 'unselected',
      })),
    },
  };
};

/** Creates a Song only after validation, keeping the import and editor models separate. */
export const confirmImportDraftToSong = (
  draft: ImportDraft,
  options: ConfirmImportDraftOptions = {},
): ConfirmImportDraftResult => {
  const validation = validateImportDraft(draft);

  if (!validation.valid) {
    return { ok: false, validation };
  }

  const selected = draft.melodySelection.selected!;
  const melodyNotes = draft.candidates.melodyNotes
    .filter((candidate) =>
      candidate.source.partId === selected.partId &&
      candidate.source.staff === selected.staff &&
      candidate.source.voice === selected.voice && !candidate.normalized.isGrace && candidate.normalized.durationTicks > 0,
    )
    .sort(compareCandidate)
    .map((candidate) => ({
      id: candidate.id,
      pitch: candidate.normalized.pitch,
      octave: candidate.normalized.octave,
      velocity: candidate.normalized.velocity,
      startTick: candidate.normalized.startTick,
      durationTicks: candidate.normalized.durationTicks,
      tie: candidate.normalized.tie,
    }));
  const chords = draft.candidates.chords
    .sort(compareCandidate)
    .filter((candidate) => candidate.reviewStatus !== 'unselected' && candidate.normalized.durationTicks > 0)
    .map((candidate) => ({ id: candidate.id, ...candidate.normalized }));
  const timeSignatureEvents = dedupeEvents(draft.candidates.timeSignatures.map((candidate) => ({
    tick: candidate.normalized.tick,
    timeSignature: candidate.normalized.timeSignature,
  } as TimeSignatureEvent)));
  const keySignatureEvents = dedupeEvents(draft.candidates.keySignatures.map((candidate) => ({
    tick: candidate.normalized.tick,
    key: candidate.normalized.key,
  } as KeySignatureEvent)));
  const tempoEvents = dedupeEvents(draft.candidates.tempos.map((candidate) => ({
    tick: candidate.normalized.tick,
    bpm: candidate.normalized.bpm,
  } as TempoEvent)));
  const firstMeasure = draft.score.linearMeasures[0];
  const initialTimeSignature = timeSignatureEvents.find((event) => event.tick === 0)?.timeSignature;
  const expectedFirstMeasureTicks = initialTimeSignature
    ? draft.ticksPerQuarter * 4 * initialTimeSignature.beatsPerMeasure / initialTimeSignature.beatUnit
    : undefined;
  const pickupTicks = firstMeasure && expectedFirstMeasureTicks && firstMeasure.durationTicks < expectedFirstMeasureTicks
    ? firstMeasure.durationTicks
    : 0;
  const song = createEmptySong({
    id: options.id,
    title: options.title ?? (draft.source.fileName.replace(/\.(?:musicxml|xml|mxl)$/i, '') || '読み込み曲'),
    ticksPerQuarter: draft.ticksPerQuarter,
    totalMeasures: draft.score.linearMeasures.length,
    pickupTicks,
    measures: draft.score.linearMeasures.map(({ startTick, durationTicks }) => ({ startTick, durationTicks })),
    timeSignatureEvents,
    keySignatureEvents,
    tempoEvents,
    chords,
    melodyNotes,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
  });
  const songTimingIssues = validateSongTiming(song).map((warning): ImportIssue => ({
    severity: 'warning',
    code: `song-${warning.code}`,
    message: warning.message,
  }));

  return {
    ok: true,
    song,
    validation: { valid: true, issues: [...validation.issues, ...songTimingIssues] },
  };
};
