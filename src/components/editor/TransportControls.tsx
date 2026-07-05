import styled from '@emotion/styled';

const ControlPanel = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  gap: 10px;
`;

interface TransportControlsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onClear: () => void;
  onSave: () => void;
  onExportMidi: () => void;
}

export function TransportControls({
  isPlaying,
  onPlay,
  onClear,
  onSave,
  onExportMidi,
}: TransportControlsProps) {
  return (
    <ControlPanel>
      <button onClick={onPlay} disabled={isPlaying}>
        {isPlaying ? '再生中...' : '再生'}
      </button>
      <button onClick={onClear}>クリア</button>
      <button onClick={onSave}>保存</button>
      <button onClick={onExportMidi}>MIDI書き出し</button>
    </ControlPanel>
  );
}
