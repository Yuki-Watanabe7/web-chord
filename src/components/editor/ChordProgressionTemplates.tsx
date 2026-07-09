import { useState } from 'react';
import styled from '@emotion/styled';
import { formatChordSymbol } from '../../domain/music/chords';
import {
  CHORD_PROGRESSION_TEMPLATES,
  formatChordAsRomanNumeralLabel,
  resolveChordProgressionTemplate,
} from '../../domain/music/chordProgressionTemplates';
import type { ResolvedTemplateChord } from '../../domain/music/chordProgressionTemplates';
import type { ChordDisplayMode, SongKey, TimeSignature } from '../../domain/music/types';

const Panel = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
`;

const Select = styled.select`
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
`;

const Description = styled.p`
  margin: 0;
  flex-basis: 100%;
  font-size: 0.85rem;
  color: #666;
`;

const Preview = styled.p`
  margin: 0;
  flex-basis: 100%;
  font-size: 0.9rem;
  color: #333;
`;

const InsertButton = styled.button`
  padding: 6px 14px;
  border: 1px solid #315f52;
  border-radius: 6px;
  background: #e5f4ef;
  cursor: pointer;

  &:hover {
    background: #d5ece3;
  }
`;

type DurationOptionKey = 'measure' | 'twoBeats' | 'oneBeat';

const DURATION_OPTIONS: Array<{ key: DurationOptionKey; label: string }> = [
  { key: 'measure', label: '1コード = 1小節' },
  { key: 'twoBeats', label: '1コード = 2拍' },
  { key: 'oneBeat', label: '1コード = 1拍' },
];

const resolveBeatsPerChord = (key: DurationOptionKey, timeSignature: TimeSignature): number => {
  switch (key) {
    case 'measure':
      return timeSignature.beatsPerMeasure;
    case 'twoBeats':
      return Math.min(2, timeSignature.beatsPerMeasure);
    case 'oneBeat':
    default:
      return 1;
  }
};

interface ChordProgressionTemplatesProps {
  songKey: SongKey;
  timeSignature: TimeSignature;
  chordDisplayMode: ChordDisplayMode;
  onInsert: (chords: ResolvedTemplateChord[], beatsPerChord: number) => void;
}

export function ChordProgressionTemplates({
  songKey,
  timeSignature,
  chordDisplayMode,
  onInsert,
}: ChordProgressionTemplatesProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(CHORD_PROGRESSION_TEMPLATES[0].id);
  const [durationKey, setDurationKey] = useState<DurationOptionKey>('measure');

  const selectedTemplate =
    CHORD_PROGRESSION_TEMPLATES.find((template) => template.id === selectedTemplateId) ??
    CHORD_PROGRESSION_TEMPLATES[0];

  const resolvedChords = resolveChordProgressionTemplate(selectedTemplate, songKey);
  const beatsPerChord = resolveBeatsPerChord(durationKey, timeSignature);

  const previewText = resolvedChords
    .map((chord) =>
      chordDisplayMode === 'roman'
        ? formatChordAsRomanNumeralLabel(chord.root, chord.quality, songKey)
        : formatChordSymbol(chord.root, chord.quality),
    )
    .join(' - ');

  return (
    <Panel aria-label="コード進行テンプレート">
      <label>進行テンプレート:</label>
      <Select
        aria-label="進行テンプレートを選択"
        value={selectedTemplateId}
        onChange={(event) => setSelectedTemplateId(event.target.value)}
      >
        {CHORD_PROGRESSION_TEMPLATES.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name} ({template.degrees.join('-')})
          </option>
        ))}
      </Select>

      <Select
        aria-label="挿入時の長さ"
        value={durationKey}
        onChange={(event) => setDurationKey(event.target.value as DurationOptionKey)}
      >
        {DURATION_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </Select>

      <InsertButton type="button" onClick={() => onInsert(resolvedChords, beatsPerChord)}>
        選択位置へ挿入
      </InsertButton>

      <Description>{selectedTemplate.description}</Description>
      <Preview>展開結果: {previewText}</Preview>
    </Panel>
  );
}
