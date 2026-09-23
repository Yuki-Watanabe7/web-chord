import {
  chordSymbolToLegacyFields,
  parseChordSymbol,
  serializeNormalizedChordSymbol,
} from './chordSymbol';
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

export type ImportReviewStatus = 'unselected' | 'auto-selected' | 'user-confirmed' | 'edited' | 'excluded';

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
  /** Verified local OMR job and exact MusicXML candidate used for this draft. */
  omrJob?: {
    jobId: string;
    pdfFileName: string;
    pdfSha256: string;
    engineVersion: string;
    candidatePath: string;
    candidateSha256: string;
    candidateCount: number;
  };
}

export interface ImportCandidate<T> {
  id: string;
  normalized: T;
  /** Score spelling or source value, retained independently from normalized data. */
  raw: string;
  /** Reviewer-entered source text. `raw` remains the immutable parser output. */
  reviewRaw?: string;
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
  /** Warning acknowledgements made during review. Parser errors remain blocking. */
  resolvedIssueKeys?: string[];
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

/** A stable identifier for tracking a reviewed warning without mutating its source record. */
export const getImportIssueKey = (issue: ImportIssue) => JSON.stringify([
  issue.severity,
  issue.code,
  issue.message,
  issue.source?.partId,
  issue.source?.measureIndex,
  issue.source?.staff,
  issue.source?.voice,
  issue.source?.occurrence,
]);

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
    candidate.reviewStatus !== 'unselected' && candidate.reviewStatus !== 'excluded' &&
    candidate.source.partId === selected?.partId &&
    candidate.source.staff === selected.staff &&
    candidate.source.voice === selected.voice && !candidate.normalized.isGrace && candidate.normalized.durationTicks > 0,
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

  draft.candidates.melodyNotes.forEach((candidate) => {
    const note = candidate.normalized;
    if (!Number.isInteger(note.startTick) || note.startTick < 0 || !Number.isInteger(note.durationTicks) || note.durationTicks < 0 ||
      (!note.isGrace && note.durationTicks === 0) || note.velocity < 0 || note.velocity > 1) {
      issues.push({
        severity: 'error',
        code: 'invalid-melody-note',
        message: '主旋律のpitch、tick、長さ、velocityのいずれかが確定可能な値ではありません。',
        source: candidate.source,
      });
    }
  });
  draft.candidates.chords.forEach((candidate) => {
    const chord = candidate.normalized;
    if (!Number.isInteger(chord.startTick) || chord.startTick < 0 || !Number.isInteger(chord.durationTicks) || chord.durationTicks <= 0) {
      issues.push({
        severity: 'error',
        code: 'invalid-chord-timing',
        message: 'コードの開始tickまたは長さが確定可能な値ではありません。',
        source: candidate.source,
      });
    }
  });
  draft.candidates.keySignatures.forEach((candidate) => {
    if (!Number.isInteger(candidate.normalized.tick) || candidate.normalized.tick < 0) {
      issues.push({ severity: 'error', code: 'invalid-key-tick', message: '調変更のtickが確定可能な値ではありません。', source: candidate.source });
    }
  });
  draft.candidates.timeSignatures.forEach((candidate) => {
    const event = candidate.normalized;
    if (!Number.isInteger(event.tick) || event.tick < 0 || event.timeSignature.beatsPerMeasure <= 0 || event.timeSignature.beatUnit <= 0) {
      issues.push({ severity: 'error', code: 'invalid-time-signature', message: '拍子変更の値が確定可能な値ではありません。', source: candidate.source });
    }
  });
  draft.candidates.tempos.forEach((candidate) => {
    if (!Number.isInteger(candidate.normalized.tick) || candidate.normalized.tick < 0 || candidate.normalized.bpm <= 0) {
      issues.push({ severity: 'error', code: 'invalid-tempo', message: 'テンポ変更の値が確定可能な値ではありません。', source: candidate.source });
    }
  });

  return { valid: !issues.some((issue) => issue.severity === 'error'), issues };
};

/** Returns validation issues that have not been explicitly reviewed by the user. */
export const getUnresolvedImportDraftIssues = (draft: ImportDraft): ImportIssue[] => {
  const resolved = new Set(draft.resolvedIssueKeys);
  return validateImportDraft(draft).issues.filter((issue) =>
    issue.severity === 'error' || !resolved.has(getImportIssueKey(issue)));
};

/** Marks or re-opens a warning after the reviewer has checked the source score. */
export const setImportDraftIssueResolved = (
  draft: ImportDraft,
  issue: ImportIssue,
  resolved: boolean,
): ImportDraft => {
  if (issue.severity === 'error') return draft;

  const key = getImportIssueKey(issue);
  const keys = new Set(draft.resolvedIssueKeys);
  if (resolved) keys.add(key);
  else keys.delete(key);

  return { ...draft, resolvedIssueKeys: [...keys] };
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
        reviewStatus: candidate.reviewStatus === 'excluded' ? 'excluded' : candidate.source.partId === selected.partId &&
          candidate.source.staff === selected.staff && candidate.source.voice === selected.voice
          ? 'user-confirmed'
          : 'unselected',
      })),
    },
  };
};

/** Updates one melody candidate while retaining the original source value and provenance. */
export const updateImportDraftMelodyNote = (
  draft: ImportDraft,
  id: string,
  normalized: ImportedMelodyNote,
): ImportDraft => ({
  ...draft,
  candidates: {
    ...draft.candidates,
    melodyNotes: draft.candidates.melodyNotes.map((candidate) => candidate.id === id ? {
      ...candidate,
      normalized: { ...normalized, tie: normalized.tie ? { ...normalized.tie } : undefined },
      reviewStatus: 'edited',
    } : candidate),
  },
});

/** Keeps an OMR note in the draft while excluding it from the confirmed Song. */
export const toggleImportDraftMelodyExcluded = (draft: ImportDraft, id: string): ImportDraft => ({
  ...draft,
  candidates: {
    ...draft.candidates,
    melodyNotes: draft.candidates.melodyNotes.map((candidate) => candidate.id === id ? {
      ...candidate,
      reviewStatus: candidate.reviewStatus === 'excluded' ? 'user-confirmed' : 'excluded',
    } : candidate),
  },
});

const reviewAddedSource = (draft: ImportDraft, linearMeasureIndex: number, element: string) => {
  const measure = draft.score.linearMeasures[linearMeasureIndex];
  const part = draft.score.parts[0];
  if (!measure || !part) return null;
  return {
    measure,
    source: {
      partId: part.id,
      partName: part.name,
      measureIndex: measure.sourceMeasureIndex,
      measureNumber: measure.sourceMeasureNumber,
      occurrence: measure.occurrence,
      element,
    },
  };
};

/** Adds a reviewer-supplied key where MusicXML did not provide a change. */
export const addImportDraftKeySignature = (draft: ImportDraft, linearMeasureIndex: number): ImportDraft => {
  const position = reviewAddedSource(draft, linearMeasureIndex, 'key');
  if (!position) return draft;
  const { measure, source } = position;
  return {
    ...draft,
    candidates: {
      ...draft.candidates,
      keySignatures: [...draft.candidates.keySignatures, {
        id: `key:review:${measure.index}:${draft.candidates.keySignatures.length}`,
        normalized: { tick: measure.startTick, key: { tonic: 'C', mode: 'major' } },
        raw: '未認識', source, reviewStatus: 'edited',
      }],
    },
  };
};

/** Adds a reviewer-supplied tempo where MusicXML did not provide one. */
export const addImportDraftTempo = (draft: ImportDraft, linearMeasureIndex: number): ImportDraft => {
  const position = reviewAddedSource(draft, linearMeasureIndex, 'tempo');
  if (!position) return draft;
  const { measure, source } = position;
  return {
    ...draft,
    candidates: {
      ...draft.candidates,
      tempos: [...draft.candidates.tempos, {
        id: `tempo:review:${measure.index}:${draft.candidates.tempos.length}`,
        normalized: { tick: measure.startTick, bpm: 120 },
        raw: '未認識', source, reviewStatus: 'edited',
      }],
    },
  };
};

/** Updates timing for a chord candidate without changing its score spelling. */
export const updateImportDraftChordTiming = (
  draft: ImportDraft,
  id: string,
  timing: Pick<ImportedChord, 'startTick' | 'durationTicks'>,
): ImportDraft => ({
  ...draft,
  candidates: {
    ...draft.candidates,
    chords: draft.candidates.chords.map((candidate) => candidate.id === id ? {
      ...candidate,
      normalized: { ...candidate.normalized, ...timing },
      reviewStatus: 'edited',
    } : candidate),
  },
});

/**
 * Re-parses a reviewer-entered chord symbol. The score value remains in `raw`
 * and the normalized structure is regenerated together, so the two cannot
 * silently drift apart.
 */
export const updateImportDraftChordSymbol = (
  draft: ImportDraft,
  id: string,
  raw: string,
): ImportDraft => ({
  ...draft,
  candidates: {
    ...draft.candidates,
    chords: draft.candidates.chords.map((candidate) => {
      if (candidate.id !== id) return candidate;
      const chordSymbol = parseChordSymbol(raw);
      const legacy = chordSymbolToLegacyFields(chordSymbol, candidate.normalized.root);
      return {
        ...candidate,
        reviewRaw: raw.trim(),
        normalized: { ...candidate.normalized, ...legacy, chordSymbol },
        reviewStatus: 'edited' as ImportReviewStatus,
      };
    }),
  },
});

/** Applies a structured chord edit and regenerates a deterministic score symbol. */
export const updateImportDraftChordStructure = (
  draft: ImportDraft,
  id: string,
  chordSymbol: ChordSymbol,
): ImportDraft => ({
  ...draft,
  candidates: {
    ...draft.candidates,
    chords: draft.candidates.chords.map((candidate) => {
      if (candidate.id !== id) return candidate;
      const raw = serializeNormalizedChordSymbol(chordSymbol);
      const normalizedSymbol = { ...chordSymbol, raw, normalized: raw.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '') };
      const legacy = chordSymbolToLegacyFields(normalizedSymbol, candidate.normalized.root);
      return {
        ...candidate,
        reviewRaw: raw,
        normalized: { ...candidate.normalized, ...legacy, chordSymbol: normalizedSymbol },
        reviewStatus: 'edited' as ImportReviewStatus,
      };
    }),
  },
});

/** Changes a key, time-signature, or tempo event in the review draft. */
export const updateImportDraftChange = <T extends ImportedKeySignature | ImportedTimeSignature | ImportedTempo>(
  draft: ImportDraft,
  collection: 'keySignatures' | 'timeSignatures' | 'tempos',
  id: string,
  normalized: T,
): ImportDraft => ({
  ...draft,
  candidates: {
    ...draft.candidates,
    [collection]: draft.candidates[collection].map((candidate) => candidate.id === id ? {
      ...candidate,
      normalized,
      reviewStatus: 'edited' as ImportReviewStatus,
    } : candidate),
  },
});

/**
 * Moves one expanded measure in the playback order and rebases every imported
 * event from that measure. This is intentionally limited to reordering already
 * parsed measures; it does not invent repeat notation or discard source data.
 */
export const moveImportDraftLinearMeasure = (
  draft: ImportDraft,
  fromIndex: number,
  toIndex: number,
): ImportDraft => {
  const original = draft.score.linearMeasures;
  if (
    fromIndex < 0 || fromIndex >= original.length || toIndex < 0 || toIndex >= original.length || fromIndex === toIndex
  ) return draft;

  const reordered = [...original];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  let nextStartTick = 0;
  const linearMeasures = reordered.map((measure, index) => {
    const next = { ...measure, index, startTick: nextStartTick };
    nextStartTick += measure.durationTicks;
    return next;
  });
  const oldStarts = new Map(original.map((measure) => [`${measure.sourceMeasureIndex}:${measure.occurrence}`, measure.startTick]));
  const newStarts = new Map(linearMeasures.map((measure) => [`${measure.sourceMeasureIndex}:${measure.occurrence}`, measure.startTick]));
  const rebaseTick = <T extends { startTick: number }>(candidate: ImportCandidate<T>) => {
    const key = `${candidate.source.measureIndex}:${candidate.source.occurrence ?? 0}`;
    const oldStart = oldStarts.get(key);
    const newStart = newStarts.get(key);
    if (oldStart === undefined || newStart === undefined) return candidate;
    return {
      ...candidate,
      normalized: { ...candidate.normalized, startTick: newStart + candidate.normalized.startTick - oldStart },
      reviewStatus: 'edited' as ImportReviewStatus,
    };
  };
  const rebaseChangeTick = <T extends { tick: number }>(candidate: ImportCandidate<T>) => {
    const key = `${candidate.source.measureIndex}:${candidate.source.occurrence ?? 0}`;
    const oldStart = oldStarts.get(key);
    const newStart = newStarts.get(key);
    if (oldStart === undefined || newStart === undefined) return candidate;
    return {
      ...candidate,
      normalized: { ...candidate.normalized, tick: newStart + candidate.normalized.tick - oldStart },
      reviewStatus: 'edited' as ImportReviewStatus,
    };
  };

  return {
    ...draft,
    score: { ...draft.score, linearMeasures },
    candidates: {
      melodyNotes: draft.candidates.melodyNotes.map(rebaseTick),
      chords: draft.candidates.chords.map(rebaseTick),
      keySignatures: draft.candidates.keySignatures.map(rebaseChangeTick),
      timeSignatures: draft.candidates.timeSignatures.map(rebaseChangeTick),
      tempos: draft.candidates.tempos.map(rebaseChangeTick),
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
      candidate.reviewStatus !== 'unselected' && candidate.reviewStatus !== 'excluded' &&
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
  const chords = [...draft.candidates.chords]
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
    title: options.title ?? ((draft.source.omrJob?.pdfFileName ?? draft.source.fileName)
      .replace(/\.(?:pdf|musicxml|xml|mxl)$/i, '') || '読み込み曲'),
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
