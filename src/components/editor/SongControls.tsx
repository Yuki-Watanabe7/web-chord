import styled from '@emotion/styled';
import { formatTimeSignature } from '../../domain/music/timeline';
import type { TimeSignature } from '../../domain/music/types';

const ControlsContainer = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
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

const TIME_SIGNATURE_OPTIONS = ['2/4', '3/4', '4/4', '5/4', '6/8'] as const;

interface SongControlsProps {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  onTitleChange: (title: string) => void;
  onBpmChange: (bpm: number) => void;
  onTimeSignatureChange: (timeSignature: string) => void;
}

export function SongControls({
  title,
  bpm,
  timeSignature,
  onTitleChange,
  onBpmChange,
  onTimeSignatureChange,
}: SongControlsProps) {
  return (
    <ControlsContainer>
      <TitleControl>
        <label>タイトル:</label>
        <TitleInput
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="曲のタイトル"
        />
      </TitleControl>

      <BpmControl>
        <label>BPM:</label>
        <BpmInput
          type="number"
          min="40"
          max="240"
          value={bpm}
          onChange={(event) => {
            const nextBpm = Math.max(40, Math.min(240, parseInt(event.target.value) || 120));
            onBpmChange(nextBpm);
          }}
        />
      </BpmControl>

      <TimeSignatureControl>
        <label>拍子:</label>
        <TimeSignatureSelect
          value={formatTimeSignature(timeSignature)}
          onChange={(event) => onTimeSignatureChange(event.target.value)}
        >
          {TIME_SIGNATURE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </TimeSignatureSelect>
      </TimeSignatureControl>
    </ControlsContainer>
  );
}
