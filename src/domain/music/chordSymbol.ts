import {
  formatNoteNameInKey,
  noteNameToPitchClass,
  normalizePitchClass,
  pitchClassToNoteName,
} from './pitchClass';
import type {
  ChordDefinition,
  ChordDegree,
  ChordEvent,
  ChordExtension,
  ChordKind,
  ChordParseWarning,
  ChordPitch,
  ChordQuality,
  ChordStep,
  ChordSymbol,
  NoteName,
  SongKey,
} from './types';

const NATURAL_PITCH_CLASSES: Record<ChordStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const NOTE_NAME_PITCHES: Record<NoteName, ChordPitch> = {
  C: { step: 'C', alter: 0 },
  'C#': { step: 'C', alter: 1 },
  D: { step: 'D', alter: 0 },
  'D#': { step: 'D', alter: 1 },
  E: { step: 'E', alter: 0 },
  F: { step: 'F', alter: 0 },
  'F#': { step: 'F', alter: 1 },
  G: { step: 'G', alter: 0 },
  'G#': { step: 'G', alter: 1 },
  A: { step: 'A', alter: 0 },
  'A#': { step: 'A', alter: 1 },
  B: { step: 'B', alter: 0 },
};

const EXTENSIONS = new Set<ChordExtension>([6, 7, 9, 11, 13]);
const warning = (code: ChordParseWarning['code'], message: string): ChordParseWarning => ({ code, message });
const normalizeAccidentals = (value: string) => value.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/Δ/g, 'maj').replace(/°/g, 'dim').replace(/ø/g, 'm7b5');
const accidentalText = (alter: number) => alter < 0 ? 'b'.repeat(-alter) : '#'.repeat(alter);
const isChordStep = (value: string): value is ChordStep => ['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(value);
const isAlter = (value: number): value is ChordPitch['alter'] => Number.isInteger(value) && value >= -2 && value <= 2;
const isChordKind = (value: unknown): value is ChordKind => [
  'major', 'minor', 'diminished', 'augmented', 'dominant', 'suspended-second',
  'suspended-fourth', 'half-diminished', 'none', 'other',
].includes(String(value));
const isChordExtension = (value: unknown): value is ChordExtension => typeof value === 'number' && EXTENSIONS.has(value as ChordExtension);

export const normalizeChordSymbolText = (value: string): string => normalizeAccidentals(value).replace(/\s+/g, '');

export const chordPitchToPitchClass = (pitch: ChordPitch) =>
  normalizePitchClass(NATURAL_PITCH_CLASSES[pitch.step] + pitch.alter);

export const chordPitchToNoteName = (pitch: ChordPitch | undefined): NoteName | undefined =>
  pitch ? pitchClassToNoteName(chordPitchToPitchClass(pitch)) : undefined;

export const noteNameToChordPitch = (note: NoteName): ChordPitch => ({ ...NOTE_NAME_PITCHES[note] });

export const formatChordPitch = (pitch: ChordPitch): string => `${pitch.step}${accidentalText(pitch.alter)}`;

const parsePitch = (value: string): ChordPitch | null => {
  const match = /^([A-Ga-g])([#b]{0,2})$/.exec(value);
  if (!match) return null;
  const step = match[1].toUpperCase();
  if (!isChordStep(step)) return null;
  const alter = [...match[2]].reduce((total, token) => total + (token === '#' ? 1 : -1), 0);
  return isAlter(alter) ? { step, alter } : null;
};

const parseDegrees = (value: string, warnings: ChordParseWarning[]): ChordDegree[] => {
  const degrees: ChordDegree[] = [];
  let remaining = value;

  while (remaining.length > 0) {
    remaining = remaining.replace(/^[,;]/, '');
    if (remaining.length === 0) break;

    const omitted = /^(?:omit|no)(\d+)/i.exec(remaining);
    if (omitted) {
      degrees.push({ value: Number(omitted[1]), alter: 0, type: 'subtract' });
      remaining = remaining.slice(omitted[0].length);
      continue;
    }

    const added = /^add([b#]?)(\d+)/i.exec(remaining);
    if (added) {
      degrees.push({
        value: Number(added[2]),
        alter: added[1] === '#' ? 1 : added[1] === 'b' ? -1 : 0,
        type: 'add',
      });
      remaining = remaining.slice(added[0].length);
      continue;
    }

    const altered = /^([b#])(\d+)/.exec(remaining);
    if (altered) {
      degrees.push({ value: Number(altered[2]), alter: altered[1] === '#' ? 1 : -1, type: 'alter' });
      remaining = remaining.slice(altered[0].length);
      continue;
    }

    warnings.push(warning('unsupported-token', `「${remaining}」はこのコード記号の一部として解釈できません。`));
    break;
  }

  return degrees;
};

const parseSuffix = (suffixInput: string, warnings: ChordParseWarning[]) => {
  let suffix = suffixInput.replace(/[()]/g, '');
  let kind: ChordKind = 'major';
  let extension: ChordExtension | undefined;
  let explicitKind = false;

  const halfDiminished = /^(?:m(?:in)?7b5|halfdim(?:inished)?7?)/i.exec(suffix);
  if (halfDiminished) {
    kind = 'half-diminished';
    extension = 7;
    suffix = suffix.slice(halfDiminished[0].length);
    explicitKind = true;
  } else if (/^sus2/i.test(suffix)) {
    kind = 'suspended-second';
    suffix = suffix.slice(4);
    explicitKind = true;
  } else if (/^sus(?:4)?/i.test(suffix)) {
    kind = 'suspended-fourth';
    suffix = suffix.slice(/^sus(?:4)?/i.exec(suffix)?.[0].length ?? 0);
    explicitKind = true;
  } else if (/^dim/i.test(suffix)) {
    kind = 'diminished';
    suffix = suffix.slice(3);
    explicitKind = true;
  } else if (/^(?:aug|\+)/i.test(suffix)) {
    kind = 'augmented';
    suffix = suffix.slice(/^aug/i.test(suffix) ? 3 : 1);
    explicitKind = true;
  } else if (/^maj/i.test(suffix)) {
    kind = 'major';
    suffix = suffix.slice(3);
    explicitKind = true;
  } else if (/^M/.test(suffix)) {
    kind = 'major';
    suffix = suffix.slice(1);
    explicitKind = true;
  } else if (/^(?:min|mi)/i.test(suffix)) {
    kind = 'minor';
    suffix = suffix.slice(/^(?:min|mi)/i.exec(suffix)?.[0].length ?? 0);
    explicitKind = true;
  } else if (/^m/.test(suffix)) {
    kind = 'minor';
    suffix = suffix.slice(1);
    explicitKind = true;
  }

  const extensionMatch = /^(6|7|9|11|13)/.exec(suffix);
  if (extensionMatch) {
    extension = Number(extensionMatch[1]) as ChordExtension;
    suffix = suffix.slice(extensionMatch[0].length);
    if (!explicitKind && extension >= 7) kind = 'dominant';
  }

  const trailingSus = /^sus(?:2|4)?/i.exec(suffix);
  if (trailingSus) {
    kind = trailingSus[0].toLowerCase() === 'sus2' ? 'suspended-second' : 'suspended-fourth';
    suffix = suffix.slice(trailingSus[0].length);
  }

  if (/^alt/i.test(suffix)) {
    warnings.push(warning('ambiguous-symbol', '「alt」は複数のテンションを表し得るため、原表記のみを保持しました。'));
    kind = 'other';
    suffix = suffix.slice(3);
  }

  return { kind, extension, degrees: parseDegrees(suffix, warnings) };
};

/** Parses a score chord symbol without ever discarding the original text. */
export const parseChordSymbol = (input: string): ChordSymbol => {
  const raw = input.trim();
  const normalized = normalizeChordSymbolText(raw);
  const warnings: ChordParseWarning[] = [];

  if (normalized.length === 0) {
    return { raw, normalized, kind: 'other', degrees: [], warnings: [warning('empty-symbol', 'コード記号が空です。')] };
  }

  if (/^(?:N\.?C\.?|NOCHORD)$/i.test(normalized)) {
    return { raw, normalized, kind: 'none', degrees: [], warnings };
  }

  const rootMatch = /^([A-Ga-g](?:#|b){0,2})(.*)$/.exec(normalized);
  if (!rootMatch) {
    return { raw, normalized, kind: 'other', degrees: [], warnings: [warning('missing-root', 'ルート音を読み取れません。')] };
  }

  const root = parsePitch(rootMatch[1]);
  if (!root) {
    return { raw, normalized, kind: 'other', degrees: [], warnings: [warning('missing-root', 'ルート音を読み取れません。')] };
  }

  let suffix = rootMatch[2];
  let bass: ChordPitch | undefined;
  const bassMatch = /\/([A-Ga-g](?:#|b){0,2})$/.exec(suffix);
  if (bassMatch) {
    bass = parsePitch(bassMatch[1]) ?? undefined;
    suffix = suffix.slice(0, -bassMatch[0].length);
    if (!bass) warnings.push(warning('invalid-bass', '分数コードのベース音を読み取れません。'));
  }

  const parsed = parseSuffix(suffix, warnings);
  return { raw, normalized, root, bass, ...parsed, warnings };
};

const isChordPitch = (value: unknown): value is ChordPitch =>
  typeof value === 'object' && value !== null &&
  isChordStep(String((value as ChordPitch).step)) && isAlter(Number((value as ChordPitch).alter));

const isChordDegree = (value: unknown): value is ChordDegree =>
  typeof value === 'object' && value !== null &&
  Number.isInteger((value as ChordDegree).value) &&
  Number.isInteger((value as ChordDegree).alter) &&
  ['add', 'alter', 'subtract'].includes(String((value as ChordDegree).type));

const isChordParseWarning = (value: unknown): value is ChordParseWarning =>
  typeof value === 'object' && value !== null &&
  ['empty-symbol', 'missing-root', 'invalid-bass', 'unsupported-token', 'ambiguous-symbol'].includes(String((value as ChordParseWarning).code)) &&
  typeof (value as ChordParseWarning).message === 'string';

export const isChordSymbol = (value: unknown): value is ChordSymbol =>
  typeof value === 'object' && value !== null &&
  typeof (value as ChordSymbol).raw === 'string' &&
  typeof (value as ChordSymbol).normalized === 'string' &&
  isChordKind((value as ChordSymbol).kind) &&
  ((value as ChordSymbol).root === undefined || isChordPitch((value as ChordSymbol).root)) &&
  ((value as ChordSymbol).bass === undefined || isChordPitch((value as ChordSymbol).bass)) &&
  ((value as ChordSymbol).extension === undefined || isChordExtension((value as ChordSymbol).extension)) &&
  Array.isArray((value as ChordSymbol).degrees) && (value as ChordSymbol).degrees.every(isChordDegree) &&
  Array.isArray((value as ChordSymbol).warnings) && (value as ChordSymbol).warnings.every(isChordParseWarning);

export const normalizeChordSymbol = (value: unknown): ChordSymbol | null => {
  if (typeof value === 'string') return parseChordSymbol(value);
  if (typeof value === 'object' && value !== null && typeof (value as { raw?: unknown }).raw === 'string') {
    const parsed = parseChordSymbol((value as { raw: string }).raw);
    return isChordSymbol(value) ? {
      ...value,
      normalized: normalizeChordSymbolText(value.normalized || value.raw),
      root: value.root ? { ...value.root } : undefined,
      bass: value.bass ? { ...value.bass } : undefined,
      degrees: value.degrees.map((degree) => ({ ...degree })),
      warnings: value.warnings.map((item) => ({ ...item })),
    } : {
      ...parsed,
      warnings: [...parsed.warnings, warning('unsupported-token', '構造化コード情報が不正なため、原表記から再解析しました。')],
    };
  }
  if (!isChordSymbol(value)) return null;
  return {
    ...value,
    normalized: normalizeChordSymbolText(value.normalized || value.raw),
    root: value.root ? { ...value.root } : undefined,
    bass: value.bass ? { ...value.bass } : undefined,
    degrees: value.degrees.map((degree) => ({ ...degree })),
    warnings: value.warnings.map((item) => ({ ...item })),
  };
};

const LEGACY_QUALITY_PARTS: Record<ChordQuality, Pick<ChordSymbol, 'kind' | 'extension'>> = {
  major: { kind: 'major' },
  minor: { kind: 'minor' },
  diminished: { kind: 'diminished' },
  augmented: { kind: 'augmented' },
  dominant7: { kind: 'dominant', extension: 7 },
  major7: { kind: 'major', extension: 7 },
  minor7: { kind: 'minor', extension: 7 },
};

const qualitySuffix = (kind: ChordKind, extension: ChordExtension | undefined): string => {
  if (kind === 'none') return 'N.C.';
  if (kind === 'other') return '';
  if (kind === 'half-diminished') return 'm7b5';
  if (kind === 'suspended-second') return extension ? `${extension}sus2` : 'sus2';
  if (kind === 'suspended-fourth') return extension ? `${extension}sus4` : 'sus4';
  if (kind === 'dominant') return extension ? String(extension) : '';
  if (kind === 'major') {
    if (!extension) return '';
    return extension === 6 ? '6' : `maj${extension}`;
  }
  if (kind === 'minor') return extension ? `m${extension}` : 'm';
  if (kind === 'diminished') return extension ? `dim${extension}` : 'dim';
  return extension ? `aug${extension}` : 'aug';
};

const degreeText = (degree: ChordDegree) => {
  const accidental = accidentalText(degree.alter);
  if (degree.type === 'add') return `add${accidental}${degree.value}`;
  if (degree.type === 'subtract') return `omit${degree.value}`;
  return `${accidental}${degree.value}`;
};

/** A deterministic spelling for transformed symbols; use `raw` to recover the source text. */
export const serializeNormalizedChordSymbol = (symbol: ChordSymbol): string => {
  if (symbol.kind === 'none') return 'N.C.';
  if (!symbol.root) return symbol.raw;
  const body = `${formatChordPitch(symbol.root)}${qualitySuffix(symbol.kind, symbol.extension)}`;
  const degrees = symbol.degrees.map(degreeText).join('');
  return `${body}${degrees}${symbol.bass ? `/${formatChordPitch(symbol.bass)}` : ''}`;
};

/** Returns the source spelling by default, preserving score text across JSON round trips. */
export const serializeChordSymbol = (symbol: ChordSymbol, preferRaw = true): string =>
  preferRaw && symbol.raw.length > 0 ? symbol.raw : serializeNormalizedChordSymbol(symbol);

/**
 * Uses the song key for display spelling without changing the source `raw`
 * text that will be written back to JSON. Unparsed portions stay verbatim so
 * the editor never presents an unknown symbol as a different chord.
 */
export const formatStructuredChordSymbolInKey = (symbol: ChordSymbol, key: SongKey): string => {
  if (!symbol.root || symbol.kind === 'none' || symbol.kind === 'other' || symbol.warnings.length > 0) {
    return serializeChordSymbol(symbol);
  }
  const normalized = serializeNormalizedChordSymbol(symbol);
  const root = chordPitchToNoteName(symbol.root);
  if (!root) return serializeChordSymbol(symbol);
  const writtenRoot = formatChordPitch(symbol.root);
  let formatted = `${formatNoteNameInKey(root, key)}${normalized.slice(writtenRoot.length)}`;
  if (symbol.bass) {
    const bass = chordPitchToNoteName(symbol.bass);
    if (bass) formatted = formatted.replace(`/${formatChordPitch(symbol.bass)}`, `/${formatNoteNameInKey(bass, key)}`);
  }
  return formatted;
};

export const createChordSymbolFromLegacyChord = (
  root: NoteName,
  quality: ChordQuality,
  bass?: NoteName,
): ChordSymbol => {
  const parts = LEGACY_QUALITY_PARTS[quality];
  const symbol: ChordSymbol = {
    raw: '',
    normalized: '',
    root: noteNameToChordPitch(root),
    bass: bass ? noteNameToChordPitch(bass) : undefined,
    kind: parts.kind,
    extension: parts.extension,
    degrees: [],
    warnings: [],
  };
  const raw = serializeNormalizedChordSymbol(symbol);
  return { ...symbol, raw, normalized: normalizeChordSymbolText(raw) };
};

export const chordSymbolToLegacyFields = (symbol: ChordSymbol, fallbackRoot: NoteName = 'C') => {
  const root = chordPitchToNoteName(symbol.root) ?? fallbackRoot;
  const bass = chordPitchToNoteName(symbol.bass);
  let quality: ChordQuality = 'major';
  if (symbol.kind === 'minor') quality = symbol.extension === 7 ? 'minor7' : 'minor';
  else if (symbol.kind === 'diminished' || symbol.kind === 'half-diminished') quality = 'diminished';
  else if (symbol.kind === 'augmented') quality = 'augmented';
  else if (symbol.kind === 'dominant') quality = 'dominant7';
  else if (symbol.kind === 'major' && symbol.extension === 7) quality = 'major7';
  return { root, quality, bass };
};

export const ensureChordEventSymbol = (chord: ChordEvent): ChordEvent => ({
  ...chord,
  chordSymbol: normalizeChordSymbol(chord.chordSymbol) ?? createChordSymbolFromLegacyChord(chord.root, chord.quality, chord.bass),
});

const seventhInterval = (kind: ChordKind) => {
  if (kind === 'major') return 11;
  if (kind === 'diminished') return 9;
  return 10;
};

const degreeBaseInterval = (kind: ChordKind, value: number): number => {
  switch (value) {
    case 1: return 0;
    case 2: return 2;
    case 3: return ['minor', 'diminished', 'half-diminished'].includes(kind) ? 3 : 4;
    case 4: return 5;
    case 5: return ['diminished', 'half-diminished'].includes(kind) ? 6 : kind === 'augmented' ? 8 : 7;
    case 6: return 9;
    case 7: return seventhInterval(kind);
    case 9: return 14;
    case 11: return 17;
    case 13: return 21;
    default: return Math.max(0, value - 1) * 2;
  }
};

const baseIntervals = (kind: ChordKind): number[] => {
  switch (kind) {
    case 'minor': return [0, 3, 7];
    case 'diminished':
    case 'half-diminished': return [0, 3, 6];
    case 'augmented': return [0, 4, 8];
    case 'suspended-second': return [0, 2, 7];
    case 'suspended-fourth': return [0, 5, 7];
    default: return [0, 4, 7];
  }
};

/** Resolves the playable pitch classes while retaining all notation metadata separately. */
export const getChordSymbolNotes = (symbol: ChordSymbol): NoteName[] => {
  if (!symbol.root || symbol.kind === 'none' || symbol.kind === 'other') return [];
  const intervals = baseIntervals(symbol.kind);
  const extension = symbol.extension;
  if (extension === 6) intervals.push(9);
  if (extension && extension >= 7) intervals.push(seventhInterval(symbol.kind));
  if (extension && extension >= 9) intervals.push(14);
  if (extension && extension >= 11) intervals.push(17);
  if (extension && extension >= 13) intervals.push(21);

  symbol.degrees.forEach((degree) => {
    const base = degreeBaseInterval(symbol.kind, degree.value);
    if (degree.type === 'subtract') {
      for (let index = intervals.length - 1; index >= 0; index -= 1) {
        if (normalizePitchClass(intervals[index]) === normalizePitchClass(base)) intervals.splice(index, 1);
      }
      return;
    }
    if (degree.type === 'alter') {
      for (let index = intervals.length - 1; index >= 0; index -= 1) {
        if (normalizePitchClass(intervals[index]) === normalizePitchClass(base)) intervals.splice(index, 1);
      }
    }
    intervals.push(base + degree.alter);
  });

  const root = chordPitchToPitchClass(symbol.root);
  return [...new Set(intervals.map((interval) => normalizePitchClass(root + interval)))].map(pitchClassToNoteName);
};

export const getChordEventNotes = (chord: ChordEvent): NoteName[] =>
  getChordSymbolNotes(ensureChordEventSymbol(chord).chordSymbol!);

export const transposeChordPitch = (pitch: ChordPitch | undefined, semitones: number): ChordPitch | undefined => {
  if (!pitch) return undefined;
  return noteNameToChordPitch(pitchClassToNoteName(normalizePitchClass(chordPitchToPitchClass(pitch) + semitones)));
};

/** Keeps extension and degree data intact while moving only the root and bass. */
export const transposeChordSymbol = (symbol: ChordSymbol, semitones: number): ChordSymbol => {
  const transposed = {
    ...symbol,
    root: transposeChordPitch(symbol.root, semitones),
    bass: transposeChordPitch(symbol.bass, semitones),
    degrees: symbol.degrees.map((degree) => ({ ...degree })),
    warnings: symbol.warnings.map((item) => ({ ...item })),
  };
  const raw = serializeNormalizedChordSymbol(transposed);
  return { ...transposed, raw, normalized: normalizeChordSymbolText(raw) };
};

export const chordDefinitionWithSymbolNotes = (chord: ChordEvent): ChordDefinition => ({
  root: chord.root,
  type: chord.quality,
  bass: chord.bass,
  chordSymbol: ensureChordEventSymbol(chord).chordSymbol,
  notes: getChordEventNotes(chord),
});

/** Useful for importers that begin with a parsed symbol rather than legacy editor fields. */
export const chordSymbolToDefinition = (symbol: ChordSymbol): ChordDefinition => {
  const legacy = chordSymbolToLegacyFields(symbol);
  return { root: legacy.root, type: legacy.quality, bass: legacy.bass, chordSymbol: symbol, notes: getChordSymbolNotes(symbol) };
};

export const chordPitchMatchesNoteName = (pitch: ChordPitch, note: NoteName) =>
  chordPitchToPitchClass(pitch) === noteNameToPitchClass(note);
