import styled from '@emotion/styled';
import { chords } from '../../data/chords';
import type { Chord } from '../../types/chord';

const ChordList = styled.div`
  width: 300px;
  overflow-y: auto;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;

  @media (max-width: 900px) {
    width: 100%;
    max-height: 220px;
  }
`;

const ChordButton = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive: boolean }>`
  width: 100%;
  padding: 8px;
  margin: 4px 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: ${(props) => (props.isActive ? '#e0e0e0' : 'white')};
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
`;

interface ChordPaletteProps {
  selectedChord: Chord | null;
  onChordSelect: (chord: Chord) => void;
}

export function ChordPalette({ selectedChord, onChordSelect }: ChordPaletteProps) {
  return (
    <ChordList>
      {chords.map((chord) => (
        <ChordButton
          key={`${chord.root}-${chord.type}`}
          isActive={selectedChord === chord}
          onClick={() => onChordSelect(chord)}
        >
          {chord.root} {chord.type}
        </ChordButton>
      ))}
    </ChordList>
  );
}
