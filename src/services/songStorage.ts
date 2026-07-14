import { normalizeSongs } from '../domain/music/migration';
import { createMusicId } from '../domain/music/timeline';
import type { Song } from '../types/song';

const SONGS_STORAGE_KEY = 'songs';

const readStoredSongs = (): unknown => {
  const savedSongs = localStorage.getItem(SONGS_STORAGE_KEY);

  if (!savedSongs) {
    return [];
  }

  try {
    return JSON.parse(savedSongs);
  } catch {
    return [];
  }
};

export const loadSongs = (): Song[] => normalizeSongs(readStoredSongs());

export const loadSong = (songId: string): Song | null =>
  loadSongs().find((song) => song.id === songId) ?? null;

export const replaceSongs = (songs: Song[]): Song[] => {
  localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));

  return songs;
};

export interface ImportedSongsMergeResult {
  songs: Song[];
  importedCount: number;
  addedCount: number;
  conflictCount: number;
}

export const mergeImportedSongs = (
  existingSongs: Song[],
  importedSongs: Song[],
  importedAt = new Date().toISOString(),
): ImportedSongsMergeResult => {
  const usedIds = new Set(existingSongs.map((song) => song.id));
  let conflictCount = 0;

  const songsToAdd = importedSongs.map((song) => {
    if (!usedIds.has(song.id)) {
      usedIds.add(song.id);
      return song;
    }

    conflictCount += 1;
    let id = createMusicId('song');

    while (usedIds.has(id)) {
      id = createMusicId('song');
    }

    usedIds.add(id);

    return {
      ...song,
      id,
      title: `${song.title || '新規曲'}（インポート）`,
      createdAt: importedAt,
      updatedAt: importedAt,
    };
  });

  return {
    songs: [...existingSongs, ...songsToAdd],
    importedCount: importedSongs.length,
    addedCount: songsToAdd.length,
    conflictCount,
  };
};

export const mergeAndSaveImportedSongs = (importedSongs: Song[]): ImportedSongsMergeResult => {
  const result = mergeImportedSongs(loadSongs(), importedSongs);
  replaceSongs(result.songs);

  return result;
};

export const saveSong = (song: Song): Song => {
  const songs = loadSongs();
  const updatedSong = {
    ...song,
    updatedAt: new Date().toISOString(),
  };
  const existingIndex = songs.findIndex((savedSong) => savedSong.id === song.id);
  const nextSongs =
    existingIndex === -1
      ? [...songs, updatedSong]
      : songs.map((savedSong, index) => (index === existingIndex ? updatedSong : savedSong));

  replaceSongs(nextSongs);

  return updatedSong;
};
