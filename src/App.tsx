import { useState, useEffect } from 'react';
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

const GridCell = styled.div<{ isSelected: boolean }>`
  aspect-ratio: 1;
  border: 1px solid #ccc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.isSelected ? '#e0e0e0' : 'white'};
  cursor: pointer;
`;

const ControlPanel = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  gap: 10px;
`;

function App() {
  const [grid, setGrid] = useState<ChordGridCell[]>(Array(16).fill(null).map((_, i) => ({ chord: null, position: i })));
  const [selectedChord, setSelectedChord] = useState<Chord | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [synth, setSynth] = useState<Tone.PolySynth | null>(null);
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState('4/4');

  useEffect(() => {
    const newSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    setSynth(newSynth);

    return () => {
      newSynth.dispose();
    };
  }, []);

  const handleChordClick = (chord: Chord) => {
    setSelectedChord(chord);
  };

  const handleGridCellClick = (position: number) => {
    if (!selectedChord) return;

    setGrid(prev => prev.map(cell =>
      cell.position === position
        ? { ...cell, chord: selectedChord }
        : cell
    ));
  };

  const playChord = async (chord: Chord) => {
    if (!synth) return;
    const notes = chord.notes.map(note => `${note}4`);
    
    // 前の和音を確実に停止
    synth.releaseAll();
    
    // 新しい和音を再生
    synth.triggerAttack(notes);
    
    // BPMに応じた遅延時間を計算
    const quarterNoteDuration = (60 / bpm) * 1000;
    const [beatsPerMeasure] = timeSignature.split('/').map(Number);
    const measureDuration = quarterNoteDuration * beatsPerMeasure;
    
    // 和音を保持（1小節分）
    await new Promise(resolve => setTimeout(resolve, measureDuration));
    
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

    for (const cell of grid) {
      if (cell.chord) {
        await playChord(cell.chord);
      }
    }

    setIsPlaying(false);
  };

  const clearGrid = () => {
    setGrid(prev => prev.map(cell => ({ ...cell, chord: null })));
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
          {grid.map((cell) => (
            <GridCell
              key={cell.position}
              isSelected={cell.chord !== null}
              onClick={() => handleGridCellClick(cell.position)}
            >
              {cell.chord ? `${cell.chord.root} ${cell.chord.type}` : ''}
            </GridCell>
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
