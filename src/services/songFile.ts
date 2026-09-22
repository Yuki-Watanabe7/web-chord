import { isChordQuality, isNoteName, isSongKeyMode } from '../domain/music/chords';
import { isChordSymbol } from '../domain/music/chordSymbol';
import { normalizeSong } from '../domain/music/migration';
import { isNonNegativeInteger, isPositiveInteger, validateSongTiming } from '../domain/music/timing';
import { MAX_TOTAL_MEASURES } from '../domain/music/timeline';
import type { Song } from '../domain/music/types';

export const SONG_EXPORT_FORMAT = 'web-chord';
export const SONG_EXPORT_SCHEMA_VERSION = 3;
export const MAX_SONG_EXPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SONG_EXPORT_SONGS = 200;

const MAX_EVENTS_PER_SONG = 5_000;

export interface SongExportFile {
  format: typeof SONG_EXPORT_FORMAT;
  schemaVersion: typeof SONG_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  songs: Song[];
}

export type SongExportParseErrorCode =
  | 'file-too-large'
  | 'invalid-json'
  | 'invalid-envelope'
  | 'invalid-format'
  | 'unsupported-schema-version'
  | 'newer-schema-version'
  | 'invalid-songs'
  | 'too-many-songs'
  | 'invalid-song';

export type SongExportParseResult =
  | { ok: true; songs: Song[]; exportedAt: string }
  | { ok: false; code: SongExportParseErrorCode; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPositiveNumber = (value: unknown): value is number => isFiniteNumber(value) && value > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidTimeSignature = (value: unknown) => {
  if (typeof value === 'string') {
    const match = /^(\d+)\/(\d+)$/.exec(value);

    return Boolean(match && Number(match[1]) > 0 && Number(match[2]) > 0);
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    Number.isInteger(value.beatsPerMeasure) &&
    Number(value.beatsPerMeasure) > 0 &&
    Number.isInteger(value.beatUnit) &&
    Number(value.beatUnit) > 0
  );
};

const isValidSongKey = (value: unknown) =>
  isRecord(value) && isNoteName(value.tonic) && isSongKeyMode(value.mode);

const isValidChordEvent = (value: unknown) => {
  if (!isRecord(value)) {
    return false;
  }

  const hasLegacyChord = isNoteName(value.root) && isChordQuality(value.quality);
  const hasStructuredChord = isChordSymbol(value.chordSymbol ?? value.symbol) || isNonEmptyString(value.chordSymbol ?? value.symbol);

  return (
    isNonEmptyString(value.id) &&
    (hasLegacyChord || hasStructuredChord) &&
    (value.bass === undefined || isNoteName(value.bass)) &&
    (value.chordSymbol === undefined || isChordSymbol(value.chordSymbol) || isNonEmptyString(value.chordSymbol)) &&
    (
      (isNonNegativeInteger(value.startTick) && isPositiveInteger(value.durationTicks)) ||
      (isNonNegativeNumber(value.startBeat) && isPositiveNumber(value.durationBeats))
    ) &&
    (value.tie === undefined || (
      isRecord(value.tie) &&
      isNonEmptyString(value.tie.id) &&
      (value.tie.type === 'start' || value.tie.type === 'continue' || value.tie.type === 'stop')
    ))
  );
};

const isValidMelodyNote = (value: unknown) => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNoteName(value.pitch) &&
    isPositiveNumber(value.octave) &&
    (
      (isNonNegativeInteger(value.startTick) && isPositiveInteger(value.durationTicks)) ||
      (isNonNegativeNumber(value.startBeat) && isPositiveNumber(value.durationBeats))
    ) &&
    isNonNegativeNumber(value.velocity) &&
    value.velocity <= 1
  );
};

const hasValidLegacyGrid = (value: unknown) => Array.isArray(value) && value.length <= MAX_EVENTS_PER_SONG;

const hasValidEventModel = (value: Record<string, unknown>) => {
  if (!Array.isArray(value.chords) || !Array.isArray(value.melodyNotes)) {
    return false;
  }

  return (
    value.chords.length <= MAX_EVENTS_PER_SONG &&
    value.melodyNotes.length <= MAX_EVENTS_PER_SONG &&
    value.chords.every(isValidChordEvent) &&
    value.melodyNotes.every(isValidMelodyNote)
  );
};

const isValidMeasure = (value: unknown) =>
  isRecord(value) && isNonNegativeInteger(value.startTick) && isPositiveInteger(value.durationTicks);

const isValidTimeSignatureEvent = (value: unknown) =>
  isRecord(value) && isNonNegativeInteger(value.tick) && isValidTimeSignature(value.timeSignature);

const isValidKeySignatureEvent = (value: unknown) =>
  isRecord(value) && isNonNegativeInteger(value.tick) && isValidSongKey(value.key);

const isValidTempoEvent = (value: unknown) =>
  isRecord(value) && isNonNegativeInteger(value.tick) && isPositiveNumber(value.bpm);

const hasValidPreciseTiming = (value: Record<string, unknown>) =>
  isPositiveInteger(value.ticksPerQuarter) &&
  isNonNegativeInteger(value.pickupTicks) &&
  Array.isArray(value.measures) &&
  value.measures.length >= 1 &&
  value.measures.length <= MAX_TOTAL_MEASURES &&
  value.measures.every(isValidMeasure) &&
  Array.isArray(value.timeSignatureEvents) &&
  value.timeSignatureEvents.some((event) => isRecord(event) && event.tick === 0) &&
  value.timeSignatureEvents.every(isValidTimeSignatureEvent) &&
  Array.isArray(value.keySignatureEvents) &&
  value.keySignatureEvents.some((event) => isRecord(event) && event.tick === 0) &&
  value.keySignatureEvents.every(isValidKeySignatureEvent) &&
  Array.isArray(value.tempoEvents) &&
  value.tempoEvents.some((event) => isRecord(event) && event.tick === 0) &&
  value.tempoEvents.every(isValidTempoEvent);

const hasValidSongShape = (value: unknown, schemaVersion: number) => {
  if (!isRecord(value)) {
    return false;
  }

  const hasCurrentModel = hasValidEventModel(value);
  const hasLegacyModel = hasValidLegacyGrid(value.grid);

  return (
    isNonEmptyString(value.id) &&
    typeof value.title === 'string' &&
    isPositiveNumber(value.bpm) &&
    isValidTimeSignature(value.timeSignature) &&
    Number.isInteger(value.totalMeasures) &&
    Number(value.totalMeasures) >= 1 &&
    Number(value.totalMeasures) <= MAX_TOTAL_MEASURES &&
    (value.key === undefined || isValidSongKey(value.key)) &&
    (hasCurrentModel || hasLegacyModel) &&
    (schemaVersion === 1 || hasValidPreciseTiming(value))
  );
};

const textByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const parseError = (code: SongExportParseErrorCode, message: string): SongExportParseResult => ({
  ok: false,
  code,
  message,
});

export const createSongExportFile = (
  songs: Song[],
  exportedAt = new Date().toISOString(),
): SongExportFile => ({
  format: SONG_EXPORT_FORMAT,
  schemaVersion: SONG_EXPORT_SCHEMA_VERSION,
  exportedAt,
  songs,
});

export const serializeSongExportFile = (songs: Song[], exportedAt?: string) =>
  JSON.stringify(createSongExportFile(songs, exportedAt), null, 2);

export const parseSongExportFile = (value: string): SongExportParseResult => {
  if (textByteLength(value) > MAX_SONG_EXPORT_FILE_BYTES) {
    return parseError('file-too-large', 'ファイルサイズが大きすぎます。2 MB以下のJSONを選択してください。');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return parseError('invalid-json', 'JSONファイルとして読み取れませんでした。');
  }

  if (!isRecord(parsed)) {
    return parseError('invalid-envelope', 'web-chordのJSONファイルではありません。');
  }

  if (parsed.format !== SONG_EXPORT_FORMAT) {
    return parseError('invalid-format', 'web-chord用のJSONファイルを選択してください。');
  }

  const schemaVersion = parsed.schemaVersion;

  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return parseError('unsupported-schema-version', '対応していないファイル形式のバージョンです。');
  }

  if (schemaVersion > SONG_EXPORT_SCHEMA_VERSION) {
    return parseError(
      'newer-schema-version',
      'このファイルは新しいバージョンのweb-chordで作成されています。',
    );
  }

  if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== SONG_EXPORT_SCHEMA_VERSION) {
    return parseError('unsupported-schema-version', '対応していないファイル形式のバージョンです。');
  }

  if (typeof parsed.exportedAt !== 'string') {
    return parseError('invalid-envelope', '書き出し日時を含むweb-chordのJSONファイルを選択してください。');
  }

  if (!Array.isArray(parsed.songs)) {
    return parseError('invalid-songs', '楽曲データが正しい配列形式ではありません。');
  }

  if (parsed.songs.length > MAX_SONG_EXPORT_SONGS) {
    return parseError('too-many-songs', `一度に読み込める楽曲は${MAX_SONG_EXPORT_SONGS}件までです。`);
  }

  if (!parsed.songs.every((song) => hasValidSongShape(song, schemaVersion))) {
    return parseError('invalid-song', '楽曲データに不足または不正な項目があるため、読み込みを中止しました。');
  }

  const songs = parsed.songs.map((song) => normalizeSong(song)).filter((song): song is Song => song !== null);

  if (songs.length !== parsed.songs.length) {
    return parseError('invalid-song', '楽曲データを安全に読み込めなかったため、読み込みを中止しました。');
  }

  return {
    ok: true,
    songs,
    exportedAt: parsed.exportedAt,
  };
};

/** Non-destructive timing diagnostics for imported or stored songs. */
export const getSongTimingWarnings = (song: Song) => validateSongTiming(song);

export const sanitizeSongFileName = (title: string, fallback = 'song') => {
  const sanitized = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[-.\s]+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
};

export const createSongJsonFileName = (song: Pick<Song, 'title'>) =>
  `${sanitizeSongFileName(song.title)}.web-chord.json`;

export const createSongsBackupFileName = (date = new Date()) =>
  `web-chord-backup-${date.toISOString().slice(0, 10)}.json`;

export const downloadSongExportFile = (songs: Song[], fileName: string) => {
  const blob = new Blob([serializeSongExportFile(songs)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
