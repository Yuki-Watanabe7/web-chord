import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { useNavigate, useParams } from 'react-router-dom';
import { ChordPalette } from '../components/editor/ChordPalette';
import { SongControls } from '../components/editor/SongControls';
import { TimelineGrid } from '../components/editor/TimelineGrid';
import { TransportControls } from '../components/editor/TransportControls';
import {
  changeSongTimeSignature,
  canPasteMeasureRangeClipboard,
  copyMeasureRangeFromSong,
  createMusicId,
  createEmptySong,
  deleteChordFromSong,
  deleteMelodyNoteFromSong,
  duplicateMeasureRangeToNext,
  insertChordInSong,
  insertMelodyNoteInSong,
  canDuplicateMeasureRangeToNext,
  normalizeMeasureRange,
  pasteMeasureRangeClipboard,
  parseTimeSignature,
  resizeChordInSong,
  resizeMelodyNoteInSong,
} from '../domain/music/timeline';
import {
  createSongPlaybackSynths,
  playSong,
  previewMelodyNote,
} from '../services/playback';
import type { SongPlaybackSynths } from '../services/playback';
import { createMidiBlob, createMidiFileName } from '../services/midiExport';
import { loadSong, saveSong } from '../services/songStorage';
import type { MeasureRange, MeasureRangeClipboard } from '../domain/music/timeline';
import type { NoteName } from '../domain/music/types';
import type { Chord } from '../types/chord';
import type { Song } from '../types/song';

const AppContainer = styled.div`
  display: flex;
  width: 100%;
  min-height: 100vh;
  padding: 20px;
  gap: 20px;

  @media (max-width: 900px) {
    flex-direction: column;
    padding: 12px;
  }
`;

const ChordGrid = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 60px;
`;

function Editor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [song, setSong] = useState<Song>(() => createEmptySong({ id }));
  const [selectedChord, setSelectedChord] = useState<Chord | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [synth, setSynth] = useState<SongPlaybackSynths | null>(null);
  const [measuresPerRow, setMeasuresPerRow] = useState(4);
  const [selectedMelodyNoteId, setSelectedMelodyNoteId] = useState<string | null>(null);
  const [measureClipboard, setMeasureClipboard] = useState<MeasureRangeClipboard | null>(null);
  const [selectedMeasureRange, setSelectedMeasureRange] = useState<MeasureRange>({
    startMeasure: 0,
    measureCount: 1,
  });

  useEffect(() => {
    const newSynth = createSongPlaybackSynths();
    setSynth(newSynth);

    return () => {
      newSynth.dispose();
    };
  }, []);

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadedSong = loadSong(id);
    if (loadedSong) {
      setSong(loadedSong);
    }
  }, [id]);

  useEffect(() => {
    setMeasureClipboard(null);
  }, [id]);

  useEffect(() => {
    setSelectedMeasureRange((prev) =>
      normalizeMeasureRange({ totalMeasures: song.totalMeasures }, prev),
    );
  }, [song.totalMeasures]);

  const handleTimeSignatureChange = (timeSignatureValue: string) => {
    const nextTimeSignature = parseTimeSignature(timeSignatureValue);
    setSong((prev) => changeSongTimeSignature(prev, nextTimeSignature));
  };

  const handleBeatClick = (startBeat: number) => {
    if (!selectedChord) {
      return;
    }

    setSong((prev) => insertChordInSong(prev, startBeat, selectedChord));
  };

  const handleChordDelete = (chordId: string) => {
    setSong((prev) => deleteChordFromSong(prev, chordId));
  };

  const handleChordResize = (chordId: string, durationBeats: number) => {
    setSong((prev) => resizeChordInSong(prev, chordId, durationBeats));
  };

  const previewNote = (pitch: NoteName, octave: number, velocity = 0.8) => {
    if (!synth) {
      return;
    }

    void previewMelodyNote(synth.melody, { pitch, octave, velocity });
  };

  const handleMelodyCellClick = (startBeat: number, pitch: NoteName, octave: number) => {
    const noteId = createMusicId('melody');

    setSong((prev) => insertMelodyNoteInSong(prev, startBeat, pitch, octave, noteId));
    setSelectedMelodyNoteId(noteId);
    previewNote(pitch, octave);
  };

  const handleMelodyNoteSelect = (noteId: string) => {
    setSelectedMelodyNoteId(noteId);

    const note = song.melodyNotes.find((melodyNote) => melodyNote.id === noteId);
    if (note) {
      previewNote(note.pitch, note.octave, note.velocity);
    }
  };

  const handleMelodyNoteDelete = (noteId: string) => {
    setSong((prev) => deleteMelodyNoteFromSong(prev, noteId));
    setSelectedMelodyNoteId((prev) => (prev === noteId ? null : prev));
  };

  const handleMelodyNoteResize = (noteId: string, durationBeats: number) => {
    setSong((prev) => resizeMelodyNoteInSong(prev, noteId, durationBeats));
  };

  const handleMeasureRangeChange = (range: MeasureRange) => {
    setSelectedMeasureRange(normalizeMeasureRange(song, range));
  };

  const handleCopyMeasureRange = () => {
    setMeasureClipboard(copyMeasureRangeFromSong(song, selectedMeasureRange));
  };

  const handlePasteMeasureRange = () => {
    setSong((prev) =>
      pasteMeasureRangeClipboard(prev, measureClipboard, selectedMeasureRange.startMeasure),
    );
    setSelectedMelodyNoteId(null);
  };

  const handleDuplicateMeasureRange = () => {
    setSong((prev) => duplicateMeasureRangeToNext(prev, selectedMeasureRange));
    setSelectedMelodyNoteId(null);
  };

  const playProgression = async () => {
    if (!synth) {
      return;
    }

    setIsPlaying(true);

    try {
      await playSong(song, synth);
    } finally {
      setIsPlaying(false);
    }
  };

  const clearGrid = () => {
    setSong((prev) => ({
      ...prev,
      chords: [],
      melodyNotes: [],
    }));
    setSelectedMelodyNoteId(null);
  };

  const handleSave = () => {
    saveSong(song);
    navigate('/');
  };

  const handleMidiExport = () => {
    const midiBlob = createMidiBlob(song);
    const url = URL.createObjectURL(midiBlob);
    const link = document.createElement('a');

    link.href = url;
    link.download = createMidiFileName(song);
    link.click();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  return (
    <AppContainer>
      <ChordPalette selectedChord={selectedChord} onChordSelect={setSelectedChord} />

      <ChordGrid>
        <SongControls
          title={song.title}
          bpm={song.bpm}
          timeSignature={song.timeSignature}
          measuresPerRow={measuresPerRow}
          onTitleChange={(title) => setSong((prev) => ({ ...prev, title }))}
          onBpmChange={(bpm) => setSong((prev) => ({ ...prev, bpm }))}
          onTimeSignatureChange={handleTimeSignatureChange}
          onMeasuresPerRowChange={setMeasuresPerRow}
        />
        <TimelineGrid
          song={song}
          measuresPerRow={measuresPerRow}
          selectedMelodyNoteId={selectedMelodyNoteId}
          selectedMeasureRange={selectedMeasureRange}
          canDuplicateMeasureRange={canDuplicateMeasureRangeToNext(song, selectedMeasureRange)}
          canPasteMeasureRange={canPasteMeasureRangeClipboard(
            song,
            measureClipboard,
            selectedMeasureRange.startMeasure,
          )}
          onBeatClick={handleBeatClick}
          onChordDelete={handleChordDelete}
          onChordResize={handleChordResize}
          onMeasureRangeChange={handleMeasureRangeChange}
          onCopyMeasureRange={handleCopyMeasureRange}
          onPasteMeasureRange={handlePasteMeasureRange}
          onDuplicateMeasureRange={handleDuplicateMeasureRange}
          onMelodyCellClick={handleMelodyCellClick}
          onMelodyNoteSelect={handleMelodyNoteSelect}
          onMelodyNoteDelete={handleMelodyNoteDelete}
          onMelodyNoteResize={handleMelodyNoteResize}
        />
      </ChordGrid>

      <TransportControls
        isPlaying={isPlaying}
        onPlay={playProgression}
        onClear={clearGrid}
        onSave={handleSave}
        onExportMidi={handleMidiExport}
      />
    </AppContainer>
  );
}

export default Editor;
