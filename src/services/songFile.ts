import { isChordQuality, isNoteName, isSongKeyMode } from '../domain/music/chords';
import { normalizeSong } from '../domain/music/migration';
import { MAX_TOTAL_MEASURES } from '../domain/music/timeline';
import type { Song } from '../domain/music/types';

export const SONG_EXPORT_FORMAT = 'web-chord';
export const SONG_EXPORT_SCHEMA_VERSION = 1;
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

  return (
    isNonEmptyString(value.id) &&
    isNoteName(value.root) &&
    isChordQuality(value.quality) &&
    (value.bass === undefined || isNoteName(value.bass)) &&
    isNonNegativeNumber(value.startBeat) &&
    isPositiveNumber(value.durationBeats)
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
    isNonNegativeNumber(value.startBeat) &&
    isPositiveNumber(value.durationBeats) &&
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

const hasValidSongShape = (value: unknown) => {
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
    (hasCurrentModel || hasLegacyModel)
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

  if (schemaVersion !== SONG_EXPORT_SCHEMA_VERSION) {
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

  if (!parsed.songs.every(hasValidSongShape)) {
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
