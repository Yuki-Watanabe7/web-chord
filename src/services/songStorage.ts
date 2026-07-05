import { normalizeSongs } from '../domain/music/migration';
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

  localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(nextSongs));

  return updatedSong;
};
