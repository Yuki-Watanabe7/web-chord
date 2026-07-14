import styled from '@emotion/styled';
import { MAX_TOTAL_MEASURES, MIN_TOTAL_MEASURES, formatTimeSignature } from '../../domain/music/timeline';
import { NOTE_NAMES } from '../../domain/music/chords';
import { formatKeyTonicName } from '../../domain/music/pitchClass';
import type { ChordDisplayMode, SongKey, TimeSignature } from '../../domain/music/types';

const ControlsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
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

const TotalMeasuresControl = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
`;

const TotalMeasuresInput = styled.input`
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const WrapControl = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
`;

const WrapSelect = styled.select`
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
  width: min(220px, 52vw);
`;

const TIME_SIGNATURE_OPTIONS = ['2/4', '3/4', '4/4', '5/4', '6/8'] as const;
const MEASURES_PER_ROW_OPTIONS = [1, 2, 4, 8, 16] as const;
const SONG_KEY_MODE_OPTIONS = [
  { value: 'major', label: 'メジャー' },
  { value: 'minor', label: 'マイナー' },
] as const;
const CHORD_DISPLAY_MODE_OPTIONS: ReadonlyArray<{ value: ChordDisplayMode; label: string }> = [
  { value: 'symbol', label: 'コード名' },
  { value: 'roman', label: 'ローマ数字' },
];

const KeyControl = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
`;

const KeySelect = styled.select`
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
`;

interface SongControlsProps {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  totalMeasures: number;
  measuresPerRow: number;
  songKey: SongKey;
  chordDisplayMode: ChordDisplayMode;
  onTitleChange: (title: string) => void;
  onBpmChange: (bpm: number) => void;
  onTimeSignatureChange: (timeSignature: string) => void;
  onTotalMeasuresChange: (totalMeasures: number) => void;
  onMeasuresPerRowChange: (measuresPerRow: number) => void;
  onKeyChange: (key: SongKey) => void;
  onChordDisplayModeChange: (mode: ChordDisplayMode) => void;
}

export function SongControls({
  title,
  bpm,
  timeSignature,
  totalMeasures,
  measuresPerRow,
  songKey,
  chordDisplayMode,
  onTitleChange,
  onBpmChange,
  onTimeSignatureChange,
  onTotalMeasuresChange,
  onMeasuresPerRowChange,
  onKeyChange,
  onChordDisplayModeChange,
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

      <TotalMeasuresControl title="曲全体の小節数（1画面あたりの折り返し小節数とは別の設定です）">
        <label htmlFor="total-measures-input">曲の小節数:</label>
        <TotalMeasuresInput
          id="total-measures-input"
          type="number"
          min={MIN_TOTAL_MEASURES}
          max={MAX_TOTAL_MEASURES}
          value={totalMeasures}
          onChange={(event) => {
            const parsed = parseInt(event.target.value, 10);
            if (Number.isNaN(parsed)) {
              return;
            }
            onTotalMeasuresChange(parsed);
          }}
        />
      </TotalMeasuresControl>

      <KeyControl>
        <label>キー:</label>
        <KeySelect
          value={songKey.tonic}
          onChange={(event) =>
            onKeyChange({ ...songKey, tonic: event.target.value as SongKey['tonic'] })
          }
        >
          {NOTE_NAMES.map((tonic) => (
            <option key={tonic} value={tonic}>
              {formatKeyTonicName(tonic, songKey.mode)}
            </option>
          ))}
        </KeySelect>
        <KeySelect
          value={songKey.mode}
          onChange={(event) =>
            onKeyChange({ ...songKey, mode: event.target.value as SongKey['mode'] })
          }
        >
          {SONG_KEY_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </KeySelect>
      </KeyControl>

      <KeyControl>
        <label>コード表示:</label>
        <KeySelect
          aria-label="コード表示形式"
          value={chordDisplayMode}
          onChange={(event) => onChordDisplayModeChange(event.target.value as ChordDisplayMode)}
        >
          {CHORD_DISPLAY_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </KeySelect>
      </KeyControl>

      <WrapControl>
        <label>折り返し:</label>
        <WrapSelect
          value={measuresPerRow}
          onChange={(event) => onMeasuresPerRowChange(parseInt(event.target.value, 10))}
        >
          {MEASURES_PER_ROW_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}小節
            </option>
          ))}
        </WrapSelect>
      </WrapControl>
    </ControlsContainer>
  );
}
