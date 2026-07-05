import { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { useParams, useNavigate } from 'react-router-dom';
import type { Song } from '../types/song';
import { chords } from '../data/chords';
import type { Chord } from '../types/chord';
import * as Tone from 'tone';
import {
  createEmptySong,
  formatTimeSignature,
  gridToChordEvents,
  parseTimeSignature,
  songToGrid,
} from '../domain/music/timeline';
import { loadSong, saveSong } from '../services/songStorage';

const AppContainer = styled.div`
  display: flex;
  height: 100vh;
  padding: 20px;
  gap: 20px;
`;

const ChordList = styled.div`
  width: 300px;
  overflow-y: auto;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
`;

const ChordGrid = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const GridContainer = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
`;

const BpmControl = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
`;

const BpmInput = styled.input`
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const TimeSignatureControl = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
`;

const TimeSignatureSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
`;

const TitleControl = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
`;

const TitleInput = styled.input`
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1.2rem;
  width: 200px;
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const ChordButton = styled.button`
  width: 100%;
  padding: 8px;
  margin: 4px 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  &:hover {
    background: #f0f0f0;
  }
`;

const MeasureCell = styled.div`
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const BeatCell = styled.div<{ isSelected: boolean; isInRange: boolean }>`
  flex: 1;
  border: 1px solid #ccc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => {
    if (props.isSelected) return '#e0e0e0';
    if (props.isInRange) return '#f0f0f0';
    return 'white';
  }};
  cursor: pointer;
  min-height: 40px;
  font-size: 0.9em;
  transition: background-color 0.2s;
`;

const ControlPanel = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  gap: 10px;
`;

function Editor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [song, setSong] = useState<Song>(() => createEmptySong({ id }));
  const [selectedChord, setSelectedChord] = useState<Chord | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [synth, setSynth] = useState<Tone.PolySynth | null>(null);
  const grid = songToGrid(song);

  useEffect(() => {
    const newSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    setSynth(newSynth);

    return () => {
      newSynth.dispose();
    };
  }, []);

  useEffect(() => {
    if (id) {
      const loadedSong = loadSong(id);
      if (loadedSong) {
        setSong(loadedSong);
      }
    }
  }, [id]);

  const handleChordClick = (chord: Chord) => {
    setSelectedChord(chord);
  };

  const handleTimeSignatureChange = (timeSignatureValue: string) => {
    const nextTimeSignature = parseTimeSignature(timeSignatureValue);

    setSong(prev => {
      const currentGrid = songToGrid(prev);
      const nextGrid = currentGrid.map(measure => ({
        ...measure,
        beats: Array.from({ length: nextTimeSignature.beatsPerMeasure }, (_, i) => ({
          chord: measure.beats[i]?.chord ?? null,
          position: i,
          duration: 1
        }))
      }));

      return {
        ...prev,
        timeSignature: nextTimeSignature,
        chords: gridToChordEvents(nextGrid, nextTimeSignature)
      };
    });
  };

  const handleBeatCellClick = (measurePosition: number, beatPosition: number) => {
    if (!selectedChord) return;

    setSong(prev => {
      const currentGrid = songToGrid(prev);
      const nextGrid = currentGrid.map(measure => {
        if (measure.position === measurePosition) {
          const updatedBeats = measure.beats.map((beat, i) => {
            if (i < beatPosition && beat.chord !== null) {
              let duration = 1;
              for (let j = i + 1; j < beatPosition; j++) {
                if (measure.beats[j]?.chord === null) {
                  duration++;
                } else {
                  break;
                }
              }
              return { ...beat, duration };
            }
            return beat;
          });

          // 新しいコードの長さを計算
          let duration = 1;
          for (let i = beatPosition + 1; i < measure.beats.length; i++) {
            if (updatedBeats[i]?.chord === null) {
              duration++;
            } else {
              break;
            }
          }

          // 新しいコードを追加
          return {
            ...measure,
            beats: updatedBeats.map((beat, i) => {
              if (i === beatPosition) {
                return { ...beat, chord: selectedChord, duration };
              } else if (i > beatPosition && i < beatPosition + duration) {
                return { ...beat, chord: null, duration: 1 };
              }
              return beat;
            })
          };
        }
        return measure;
      });

      return {
        ...prev,
        chords: gridToChordEvents(nextGrid, prev.timeSignature)
      };
    });
  };

  const playChord = async (chord: Chord, duration: number) => {
    if (!synth) return;
    const notes = chord.notes.map(note => `${note}4`);
    
    // 前の和音を確実に停止
    synth.releaseAll();
    
    // 新しい和音を再生
    synth.triggerAttack(notes);
    
    // BPMに応じた遅延時間を計算（指定された拍数分）
    const quarterNoteDuration = (60 / song.bpm) * 1000;
    const totalDuration = quarterNoteDuration * duration;
    
    // 和音を保持（指定された拍数分）
    await new Promise(resolve => setTimeout(resolve, totalDuration));
    
    // 和音を停止
    synth.triggerRelease(notes);
    
    // 完全に停止するまで待機
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  const playProgression = async () => {
    if (!synth) return;
    setIsPlaying(true);

    // 再生開始前に全ての音を停止
    synth.releaseAll();

    // コードが指定されている最後の小節を探す
    const playbackGrid = songToGrid(song);
    let lastMeasureWithChord = -1;
    for (let i = playbackGrid.length - 1; i >= 0; i--) {
      if (playbackGrid[i]?.beats.some(beat => beat.chord !== null)) {
        lastMeasureWithChord = i;
        break;
      }
    }

    // 最後の小節まで再生
    for (let i = 0; i <= lastMeasureWithChord; i++) {
      const measure = playbackGrid[i];
      if (!measure) continue;
      for (let j = 0; j < measure.beats.length; j++) {
        const beat = measure.beats[j];
        if (beat?.chord) {
          await playChord(beat.chord, beat.duration);
          // 次の拍にスキップ（duration分）
          j += beat.duration - 1;
        } else {
          // コードが指定されていない場合は1拍分待機
          await new Promise(resolve => setTimeout(resolve, (60 / song.bpm) * 1000));
        }
      }
    }

    setIsPlaying(false);
  };

  const clearGrid = () => {
    setSong(prev => ({
      ...prev,
      chords: []
    }));
  };

  const handleSave = () => {
    saveSong(song);
    navigate('/');
  };

  return (
    <AppContainer>
      <ChordList>
        {chords.map((chord, index) => (
          <ChordButton
            key={index}
            onClick={() => handleChordClick(chord)}
            style={{
              background: selectedChord === chord ? '#e0e0e0' : 'white'
            }}
          >
            {chord.root} {chord.type}
          </ChordButton>
        ))}
      </ChordList>

      <ChordGrid>
        <ControlsContainer>
          <TitleControl>
            <label>タイトル:</label>
            <TitleInput
              type="text"
              value={song.title}
              onChange={(e) => setSong(prev => ({
                ...prev,
                title: e.target.value
              }))}
              placeholder="曲のタイトル"
            />
          </TitleControl>
          <BpmControl>
            <label>BPM:</label>
            <BpmInput
              type="number"
              min="40"
              max="240"
              value={song.bpm}
              onChange={(e) => setSong(prev => ({
                ...prev,
                bpm: Math.max(40, Math.min(240, parseInt(e.target.value) || 120))
              }))}
            />
          </BpmControl>
          <TimeSignatureControl>
            <label>拍子:</label>
            <TimeSignatureSelect
              value={formatTimeSignature(song.timeSignature)}
              onChange={(e) => handleTimeSignatureChange(e.target.value)}
            >
              <option value="2/4">2/4</option>
              <option value="3/4">3/4</option>
              <option value="4/4">4/4</option>
              <option value="5/4">5/4</option>
              <option value="6/8">6/8</option>
            </TimeSignatureSelect>
          </TimeSignatureControl>
        </ControlsContainer>
        <GridContainer>
          {grid.map((measure) => (
            <MeasureCell key={measure.position}>
              {measure.beats.map((beat) => (
                <BeatCell
                  key={beat.position}
                  isSelected={beat.chord !== null}
                  isInRange={false}
                  onClick={() => handleBeatCellClick(measure.position, beat.position)}
                >
                  {beat.chord ? `${beat.chord.root} ${beat.chord.type}${beat.duration > 1 ? ` (${beat.duration}拍)` : ''}` : ''}
                </BeatCell>
              ))}
            </MeasureCell>
          ))}
        </GridContainer>
      </ChordGrid>

      <ControlPanel>
        <button onClick={playProgression} disabled={isPlaying}>
          {isPlaying ? '再生中...' : '再生'}
        </button>
        <button onClick={clearGrid}>クリア</button>
        <button onClick={handleSave}>保存</button>
      </ControlPanel>
    </AppContainer>
  );
}

export default Editor; 
