import { useState, useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import * as Tone from 'tone';
import { chords } from './data/chords';
import type { Chord, ChordGridCell } from './types/chord';

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

const ControlsContainer = styled.div`
  display: flex;
  gap: 10px;
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

interface BeatCell {
  chord: Chord | null;
  position: number;
  duration: number; // 拍数を保持
}

interface MeasureCell {
  beats: BeatCell[];
  position: number;
}

function App() {
  const [grid, setGrid] = useState<MeasureCell[]>(Array(16).fill(null).map((_, i) => ({
    position: i,
    beats: Array(4).fill(null).map((_, j) => ({ chord: null, position: j, duration: 1 }))
  })));
  const [selectedChord, setSelectedChord] = useState<Chord | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [synth, setSynth] = useState<Tone.PolySynth | null>(null);
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [selectionStart, setSelectionStart] = useState<{ measure: number; beat: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ measure: number; beat: number } | null>(null);

  useEffect(() => {
    const newSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    setSynth(newSynth);

    return () => {
      newSynth.dispose();
    };
  }, []);

  useEffect(() => {
    const [beatsPerMeasure] = timeSignature.split('/').map(Number);
    setGrid(prev => prev.map(measure => ({
      ...measure,
      beats: Array(beatsPerMeasure).fill(null).map((_, i) => ({
        chord: measure.beats[i]?.chord || null,
        position: i,
        duration: 1
      }))
    })));
  }, [timeSignature]);

  const handleChordClick = (chord: Chord) => {
    setSelectedChord(chord);
  };

  const handleBeatCellClick = (measurePosition: number, beatPosition: number) => {
    if (!selectedChord) return;

    setGrid(prev => prev.map(measure => {
      if (measure.position === measurePosition) {
        // 次のコードが指定されるまでの拍数を計算
        let duration = 1;
        // 同じ小節内で次のコードを探す
        for (let i = beatPosition + 1; i < measure.beats.length; i++) {
          if (measure.beats[i].chord === null) {
            duration++;
          } else {
            break;
          }
        }

        return {
          ...measure,
          beats: measure.beats.map((beat, i) => {
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
    }));
  };

  const isInSelectionRange = (measurePosition: number, beatPosition: number) => {
    if (!selectionStart || !selectionEnd) return false;

    const minMeasure = Math.min(selectionStart.measure, selectionEnd.measure);
    const maxMeasure = Math.max(selectionStart.measure, selectionEnd.measure);
    const minBeat = Math.min(selectionStart.beat, selectionEnd.beat);
    const maxBeat = Math.max(selectionStart.beat, selectionEnd.beat);

    if (measurePosition < minMeasure || measurePosition > maxMeasure) return false;
    if (measurePosition === minMeasure && beatPosition < minBeat) return false;
    if (measurePosition === maxMeasure && beatPosition > maxBeat) return false;

    return true;
  };

  const playChord = async (chord: Chord, duration: number) => {
    if (!synth) return;
    const notes = chord.notes.map(note => `${note}4`);
    
    // 前の和音を確実に停止
    synth.releaseAll();
    
    // 新しい和音を再生
    synth.triggerAttack(notes);
    
    // BPMに応じた遅延時間を計算（指定された拍数分）
    const quarterNoteDuration = (60 / bpm) * 1000;
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

    for (const measure of grid) {
      for (let i = 0; i < measure.beats.length; i++) {
        const beat = measure.beats[i];
        if (beat.chord) {
          await playChord(beat.chord, beat.duration);
          // 次の拍にスキップ（duration分）
          i += beat.duration - 1;
        } else {
          // コードが指定されていない場合は1拍分待機
          await new Promise(resolve => setTimeout(resolve, (60 / bpm) * 1000));
        }
      }
    }

    setIsPlaying(false);
  };

  const clearGrid = () => {
    setGrid(prev => prev.map(measure => ({
      ...measure,
      beats: measure.beats.map(beat => ({ ...beat, chord: null, duration: 1 }))
    })));
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
          <BpmControl>
            <label>BPM:</label>
            <BpmInput
              type="number"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => setBpm(Math.max(40, Math.min(240, parseInt(e.target.value) || 120)))}
            />
          </BpmControl>
          <TimeSignatureControl>
            <label>拍子:</label>
            <TimeSignatureSelect
              value={timeSignature}
              onChange={(e) => setTimeSignature(e.target.value)}
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
                  isInRange={isInSelectionRange(measure.position, beat.position)}
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
      </ControlPanel>
    </AppContainer>
  );
}

export default App;
