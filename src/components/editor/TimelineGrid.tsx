import styled from '@emotion/styled';
import type { ChordGridMeasure } from '../../domain/music/timeline';

const GridContainer = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
`;

const MeasureCell = styled.div`
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const BeatCell = styled('div', {
  shouldForwardProp: (prop) => prop !== 'isSelected',
})<{ isSelected: boolean }>`
  flex: 1;
  border: 1px solid #ccc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => (props.isSelected ? '#e0e0e0' : 'white')};
  cursor: pointer;
  min-height: 40px;
  font-size: 0.9em;
  transition: background-color 0.2s;
`;

interface TimelineGridProps {
  grid: ChordGridMeasure[];
  onBeatClick: (measurePosition: number, beatPosition: number) => void;
}

export function TimelineGrid({ grid, onBeatClick }: TimelineGridProps) {
  return (
    <GridContainer>
      {grid.map((measure) => (
        <MeasureCell key={measure.position}>
          {measure.beats.map((beat) => (
            <BeatCell
              key={beat.position}
              isSelected={beat.chord !== null}
              onClick={() => onBeatClick(measure.position, beat.position)}
            >
              {beat.chord
                ? `${beat.chord.root} ${beat.chord.type}${beat.duration > 1 ? ` (${beat.duration}拍)` : ''}`
                : ''}
            </BeatCell>
          ))}
        </MeasureCell>
      ))}
    </GridContainer>
  );
}
