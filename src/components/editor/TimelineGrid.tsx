import styled from '@emotion/styled';
import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatSlashChordLabel, getChordNotes, NOTE_NAMES } from '../../domain/music/chords';
import { formatChordAsRomanNumeralLabel } from '../../domain/music/chordProgressionTemplates';
import {
  normalizeMeasureRange,
  getChordEndBeat,
  getChordMaxDurationBeats,
  getMelodyNoteEndBeat,
  getMelodyNoteMaxDurationBeats,
  getTotalBeats,
  sortChordEvents,
  sortMelodyNotes,
} from '../../domain/music/timeline';
import type { ChordDisplayMode, ChordEvent, MelodyNote, NoteName, Song } from '../../domain/music/types';
import type { MeasureRange } from '../../domain/music/timeline';

const BEAT_WIDTH = 56;
const PITCH_LABEL_WIDTH = 44;
const MELODY_ROW_HEIGHT = 24;
const MELODY_LOW_OCTAVE = 3;
const MELODY_HIGH_OCTAVE = 6;
const MELODY_LANE_MAX_HEIGHT = 360;

interface MelodyPitch {
  pitch: NoteName;
  octave: number;
}

const getPitchIndex = (pitch: NoteName, octave: number) => octave * NOTE_NAMES.length + NOTE_NAMES.indexOf(pitch);

const createMelodyPitches = (lowOctave: number, highOctave: number): MelodyPitch[] => {
  const lowIndex = getPitchIndex('C', lowOctave);
  const highIndex = getPitchIndex('C', highOctave);

  return Array.from({ length: highIndex - lowIndex + 1 }, (_, offset) => {
    const pitchIndex = highIndex - offset;
    const noteIndex = pitchIndex % NOTE_NAMES.length;

    return {
      pitch: NOTE_NAMES[noteIndex],
      octave: Math.floor(pitchIndex / NOTE_NAMES.length),
    };
  });
};

const MELODY_PITCHES = createMelodyPitches(MELODY_LOW_OCTAVE, MELODY_HIGH_OCTAVE);

const TimelineContainer = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #ccd3dc;
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
`;

const SelectionToolbar = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #d6dde6;
  background: #ffffff;
`;

const SelectionSummary = styled.div`
  color: #334155;
  font-size: 0.82rem;
  font-weight: 800;
`;

const RangeActionGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
`;

const RangeActionButton = styled.button`
  padding: 6px 10px;
  border: 1px solid #256d5a;
  border-radius: 6px;
  background: #dff5eb;
  color: #12382f;
  font-size: 0.82rem;
  font-weight: 800;

  &:hover:not(:disabled) {
    background: #c9ecd9;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const TimelineScroller = styled.div`
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: auto;
`;

const TimelineRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  min-width: max-content;
`;

const TimelineRowSurface = styled.div`
  position: relative;
  flex: none;
`;

const MeasureGuideRow = styled.div`
  display: grid;
  height: 28px;
  color: #4b5563;
  font-size: 0.78rem;
  font-weight: 700;
`;

const MeasureGuide = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isSelected',
})<{ isSelected: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 0 0 8px;
  border: 0;
  border-left: 2px solid #8aa0b8;
  border-radius: 0;
  background: ${(props) =>
    props.isSelected
      ? 'linear-gradient(to right, rgba(37, 109, 90, 0.22), rgba(37, 109, 90, 0.08))'
      : 'linear-gradient(to right, rgba(138, 160, 184, 0.14), transparent)'};
  color: ${(props) => (props.isSelected ? '#12382f' : '#4b5563')};
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  user-select: none;
  touch-action: none;

  &:last-of-type {
    border-right: 2px solid #8aa0b8;
  }

  &:hover {
    background: ${(props) =>
      props.isSelected
        ? 'linear-gradient(to right, rgba(37, 109, 90, 0.28), rgba(37, 109, 90, 0.12))'
        : 'linear-gradient(to right, rgba(138, 160, 184, 0.24), rgba(138, 160, 184, 0.06))'};
  }
`;

const ChordLane = styled.div`
  position: relative;
  height: 78px;
  border: 1px solid #d6dde6;
  border-radius: 6px;
  background:
    repeating-linear-gradient(
      to right,
      rgba(148, 163, 184, 0.36) 0,
      rgba(148, 163, 184, 0.36) 1px,
      transparent 1px,
      transparent ${BEAT_WIDTH}px
    ),
    #ffffff;
`;

const ChordBlock = styled('div', {
  shouldForwardProp: (prop) => prop !== 'isCompact',
})<{ isCompact: boolean }>`
  position: absolute;
  top: 10px;
  height: 56px;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 3px;
  padding: ${(props) => (props.isCompact ? '5px 3px' : '6px 8px')};
  border: 1px solid #256d5a;
  border-radius: 6px;
  background: #dff5eb;
  color: #12382f;
  box-shadow: 0 2px 6px rgba(25, 72, 60, 0.14);
  overflow: hidden;
`;

const ChordName = styled.div`
  min-width: 0;
  align-self: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
  font-weight: 700;
`;

const ChordMeta = styled.span`
  color: #315f52;
  font-size: 0.72rem;
  font-weight: 600;
`;

const ChordInfo = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
`;

const ChordActions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 15px);
  justify-content: center;
  gap: 1px;
`;

const ChordActionButton = styled.button`
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(37, 109, 90, 0.42);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.82);
  color: #12382f;
  font-size: 0.72rem;
  line-height: 1;

  &:hover {
    background: #ffffff;
  }
`;

const BeatRow = styled.div`
  display: grid;
  height: 34px;
  margin-top: 8px;
`;

const BeatButton = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isMeasureStart' && prop !== 'isOccupied',
})<{ isMeasureStart: boolean; isOccupied: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${BEAT_WIDTH}px;
  height: 34px;
  padding: 0;
  border: 0;
  border-left: ${(props) => (props.isMeasureStart ? '2px solid #8aa0b8' : '1px solid #d6dde6')};
  border-radius: 0;
  background: ${(props) => (props.isOccupied ? '#eef8f4' : '#ffffff')};
  color: #475569;
  font-size: 0.75rem;
  font-weight: ${(props) => (props.isMeasureStart ? 700 : 500)};

  &:hover {
    background: #e7eef7;
  }

  &:last-of-type {
    border-right: 2px solid #8aa0b8;
  }
`;

const MelodyHeader = styled.div`
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
`;

const MelodyTitle = styled.div`
  color: #334155;
  font-size: 0.78rem;
  font-weight: 800;
`;

const MelodySelectionControls = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
`;

const MelodySelectionLabel = styled.span`
  color: #334155;
  font-size: 0.76rem;
  font-weight: 700;
`;

const MelodyActionButton = styled.button`
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #9aa9bd;
  border-radius: 5px;
  background: #ffffff;
  color: #1f2937;
  font-size: 0.78rem;
  line-height: 1;

  &:hover:not(:disabled) {
    background: #e7eef7;
  }
`;

const MelodyLane = styled.div`
  position: relative;
  border: 1px solid #d6dde6;
  border-radius: 6px;
  background: #ffffff;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
`;

const PitchLabels = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  width: ${PITCH_LABEL_WIDTH}px;
  display: grid;
  grid-template-rows: repeat(${MELODY_PITCHES.length}, ${MELODY_ROW_HEIGHT}px);
  border-right: 1px solid #cbd5e1;
  background: #f8fafc;
`;

const PitchLabel = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #e2e8f0;
  color: #475569;
  font-size: 0.7rem;
  font-weight: 700;
`;

const MelodyCells = styled.div`
  display: grid;
  margin-left: ${PITCH_LABEL_WIDTH}px;
`;

const MelodyCell = styled('button', {
  shouldForwardProp: (prop) =>
    prop !== 'isChordTone' && prop !== 'isOccupied' && prop !== 'isMeasureStart',
})<{ isChordTone: boolean; isOccupied: boolean; isMeasureStart: boolean }>`
  width: ${BEAT_WIDTH}px;
  height: ${MELODY_ROW_HEIGHT}px;
  padding: 0;
  border: 0;
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  border-left: ${(props) => (props.isMeasureStart ? '2px solid #8aa0b8' : '0')};
  border-radius: 0;
  background: ${(props) => {
    if (props.isOccupied) {
      return '#eef8f4';
    }

    if (props.isChordTone) {
      return '#fff7d6';
    }

    return '#ffffff';
  }};

  &:hover {
    background: ${(props) => (props.isChordTone ? '#ffefad' : '#e7eef7')};
  }
`;

const MelodyNotesLayer = styled.div`
  position: absolute;
  top: 0;
  left: ${PITCH_LABEL_WIDTH}px;
  z-index: 3;
`;

const MelodyNoteBlock = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isSelected' && prop !== 'isCompact',
})<{ isSelected: boolean; isCompact: boolean }>`
  position: absolute;
  height: ${MELODY_ROW_HEIGHT - 4}px;
  display: flex;
  align-items: center;
  justify-content: ${(props) => (props.isCompact ? 'center' : 'space-between')};
  gap: 4px;
  padding: ${(props) => (props.isCompact ? '0 3px' : '0 6px')};
  border: 1px solid ${(props) => (props.isSelected ? '#1d4ed8' : '#315f52')};
  border-radius: 5px;
  background: ${(props) => (props.isSelected ? '#dbeafe' : '#cceedd')};
  color: #12382f;
  box-shadow: 0 2px 5px rgba(25, 72, 60, 0.12);
  font-size: 0.7rem;
  font-weight: 800;
  overflow: hidden;
`;

const MelodyNoteText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

interface TimelineGridProps {
  song: Song;
  measuresPerRow: number;
  chordDisplayMode: ChordDisplayMode;
  selectedMelodyNoteId: string | null;
  selectedMeasureRange: MeasureRange;
  canDuplicateMeasureRange: boolean;
  canPasteMeasureRange: boolean;
  onBeatClick: (startBeat: number) => void;
  onChordDelete: (chordId: string) => void;
  onChordResize: (chordId: string, durationBeats: number) => void;
  onMeasureRangeChange: (range: MeasureRange) => void;
  onCopyMeasureRange: () => void;
  onPasteMeasureRange: () => void;
  onDuplicateMeasureRange: () => void;
  onMelodyCellClick: (startBeat: number, pitch: NoteName, octave: number) => void;
  onMelodyNoteSelect: (noteId: string) => void;
  onMelodyNoteDelete: (noteId: string) => void;
  onMelodyNoteResize: (noteId: string, durationBeats: number) => void;
}

interface TimelineRow {
  startMeasure: number;
  measureCount: number;
  startBeat: number;
  beatCount: number;
}

const getDisplayDuration = (chord: ChordEvent, totalBeats: number) =>
  Math.max(1, Math.min(chord.durationBeats, totalBeats - chord.startBeat));

const getMelodyDisplayDuration = (note: MelodyNote, totalBeats: number) =>
  Math.max(1, Math.min(note.durationBeats, totalBeats - note.startBeat));

const formatPitch = ({ pitch, octave }: MelodyPitch) => `${pitch}${octave}`;

const isSamePitch = (note: MelodyNote, pitch: MelodyPitch) =>
  note.pitch === pitch.pitch && note.octave === pitch.octave;

const createMeasureRange = (firstMeasure: number, secondMeasure: number): MeasureRange => {
  const startMeasure = Math.min(firstMeasure, secondMeasure);

  return {
    startMeasure,
    measureCount: Math.abs(secondMeasure - firstMeasure) + 1,
  };
};

const isMeasureInRange = (measureIndex: number, range: MeasureRange) =>
  measureIndex >= range.startMeasure &&
  measureIndex < range.startMeasure + range.measureCount;

const formatMeasureRange = (range: MeasureRange) => {
  const startMeasureLabel = range.startMeasure + 1;
  const endMeasureLabel = range.startMeasure + range.measureCount;

  if (range.measureCount === 1) {
    return `${startMeasureLabel}小節目`;
  }

  return `${startMeasureLabel}-${endMeasureLabel}小節目`;
};

const isTextEditingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
};

const createTimelineRows = (song: Song, measuresPerRow: number): TimelineRow[] => {
  const safeMeasuresPerRow = Math.max(1, Math.floor(measuresPerRow) || 4);
  const rowCount = Math.ceil(song.totalMeasures / safeMeasuresPerRow);

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const startMeasure = rowIndex * safeMeasuresPerRow;
    const measureCount = Math.min(safeMeasuresPerRow, song.totalMeasures - startMeasure);

    return {
      startMeasure,
      measureCount,
      startBeat: startMeasure * song.timeSignature.beatsPerMeasure,
      beatCount: measureCount * song.timeSignature.beatsPerMeasure,
    };
  });
};

export function TimelineGrid({
  song,
  measuresPerRow,
  chordDisplayMode,
  selectedMelodyNoteId,
  selectedMeasureRange,
  canDuplicateMeasureRange,
  canPasteMeasureRange,
  onBeatClick,
  onChordDelete,
  onChordResize,
  onMeasureRangeChange,
  onCopyMeasureRange,
  onPasteMeasureRange,
  onDuplicateMeasureRange,
  onMelodyCellClick,
  onMelodyNoteSelect,
  onMelodyNoteDelete,
  onMelodyNoteResize,
}: TimelineGridProps) {
  const [dragStartMeasure, setDragStartMeasure] = useState<number | null>(null);
  const totalBeats = getTotalBeats(song);
  const measureWidth = song.timeSignature.beatsPerMeasure * BEAT_WIDTH;
  const rows = createTimelineRows(song, measuresPerRow);
  const activeMeasureRange = normalizeMeasureRange(song, selectedMeasureRange);
  const visibleChords = sortChordEvents(song.chords).filter(
    (chord) => chord.startBeat >= 0 && chord.startBeat < totalBeats,
  );
  const visibleMelodyNotes = sortMelodyNotes(song.melodyNotes).filter(
    (note) => note.startBeat >= 0 && note.startBeat < totalBeats,
  );
  const selectedMelodyNote =
    selectedMelodyNoteId
      ? visibleMelodyNotes.find((note) => note.id === selectedMelodyNoteId) ?? null
      : null;
  const selectedMelodyMaxDuration =
    selectedMelodyNote ? getMelodyNoteMaxDurationBeats(song, selectedMelodyNote.id) : 1;

  useEffect(() => {
    if (dragStartMeasure === null) {
      return undefined;
    }

    const stopDragging = () => setDragStartMeasure(null);

    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [dragStartMeasure]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isTextEditingTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    const isMenuShortcut = event.metaKey || event.ctrlKey;

    if (isMenuShortcut && !event.altKey) {
      if (key === 'c') {
        event.preventDefault();
        onCopyMeasureRange();
        return;
      }

      if (key === 'v') {
        if (canPasteMeasureRange) {
          event.preventDefault();
          onPasteMeasureRange();
        }
        return;
      }

      if (key === 'd') {
        if (canDuplicateMeasureRange) {
          event.preventDefault();
          onDuplicateMeasureRange();
        }
        return;
      }
    }

    if (!selectedMelodyNoteId || (event.key !== 'Delete' && event.key !== 'Backspace')) {
      return;
    }

    event.preventDefault();
    onMelodyNoteDelete(selectedMelodyNoteId);
  };

  const handleMeasurePointerDown = (
    measureIndex: number,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    if (event.shiftKey) {
      onMeasureRangeChange(createMeasureRange(activeMeasureRange.startMeasure, measureIndex));
      return;
    }

    setDragStartMeasure(measureIndex);
    onMeasureRangeChange({ startMeasure: measureIndex, measureCount: 1 });
  };

  const handleMeasurePointerEnter = (measureIndex: number) => {
    if (dragStartMeasure === null) {
      return;
    }

    onMeasureRangeChange(createMeasureRange(dragStartMeasure, measureIndex));
  };

  return (
    <TimelineContainer tabIndex={0} onKeyDown={handleKeyDown}>
      <SelectionToolbar>
        <SelectionSummary>小節選択: {formatMeasureRange(activeMeasureRange)}</SelectionSummary>
        <RangeActionGroup>
          <RangeActionButton
            type="button"
            title="選んだ小節をコピー (Cmd/Ctrl+C)"
            onClick={onCopyMeasureRange}
          >
            コピー
          </RangeActionButton>
          <RangeActionButton
            type="button"
            title="コピーした小節を選択範囲の先頭へ貼り付け (Cmd/Ctrl+V)"
            disabled={!canPasteMeasureRange}
            onClick={onPasteMeasureRange}
          >
            貼り付け
          </RangeActionButton>
          <RangeActionButton
            type="button"
            title="選んだ小節を次の位置へ複製 (Cmd/Ctrl+D)"
            disabled={!canDuplicateMeasureRange}
            onClick={onDuplicateMeasureRange}
          >
            次へ複製
          </RangeActionButton>
        </RangeActionGroup>
      </SelectionToolbar>
      <TimelineScroller>
        <TimelineRows>
          {rows.map((row) => {
            const rowEndBeat = row.startBeat + row.beatCount;
            const beats = Array.from(
              { length: row.beatCount },
              (_, beatOffset) => row.startBeat + beatOffset,
            );
            const measureIndexes = Array.from(
              { length: row.measureCount },
              (_, measureOffset) => row.startMeasure + measureOffset,
            );
            const chordSegments = visibleChords.flatMap((chord) => {
              const chordEndBeat = Math.min(getChordEndBeat(chord), totalBeats);
              const segmentStartBeat = Math.max(chord.startBeat, row.startBeat);
              const segmentEndBeat = Math.min(chordEndBeat, rowEndBeat);

              if (segmentEndBeat <= segmentStartBeat) {
                return [];
              }

              return [{
                chord,
                segmentStartBeat,
                segmentDurationBeats: segmentEndBeat - segmentStartBeat,
              }];
            });
            const melodySegments = visibleMelodyNotes.flatMap((note) => {
              const pitchIndex = MELODY_PITCHES.findIndex((pitch) => isSamePitch(note, pitch));

              if (pitchIndex === -1) {
                return [];
              }

              const noteEndBeat = Math.min(getMelodyNoteEndBeat(note), totalBeats);
              const segmentStartBeat = Math.max(note.startBeat, row.startBeat);
              const segmentEndBeat = Math.min(noteEndBeat, rowEndBeat);

              if (segmentEndBeat <= segmentStartBeat) {
                return [];
              }

              return [{
                note,
                pitchIndex,
                segmentStartBeat,
                segmentDurationBeats: segmentEndBeat - segmentStartBeat,
              }];
            });
            const selectedNoteInRow =
              selectedMelodyNote &&
              selectedMelodyNote.startBeat < rowEndBeat &&
              getMelodyNoteEndBeat(selectedMelodyNote) > row.startBeat
                ? selectedMelodyNote
                : null;

            return (
              <TimelineRowSurface key={row.startMeasure} style={{ width: row.beatCount * BEAT_WIDTH }}>
                <MeasureGuideRow
                  style={{
                    gridTemplateColumns: `repeat(${row.measureCount}, ${measureWidth}px)`,
                  }}
                >
                  {measureIndexes.map((measureIndex) => (
                    <MeasureGuide
                      key={measureIndex}
                      type="button"
                      isSelected={isMeasureInRange(measureIndex, activeMeasureRange)}
                      aria-label={`${measureIndex + 1}小節目を選択`}
                      title={`${measureIndex + 1}小節目を選択`}
                      onPointerDown={(event) => handleMeasurePointerDown(measureIndex, event)}
                      onPointerEnter={() => handleMeasurePointerEnter(measureIndex)}
                    >
                      {measureIndex + 1}
                    </MeasureGuide>
                  ))}
                </MeasureGuideRow>

                <ChordLane>
                  {chordSegments.map(({ chord, segmentStartBeat, segmentDurationBeats }) => {
                    const displayDuration = getDisplayDuration(chord, totalBeats);
                    const maxDuration = getChordMaxDurationBeats(song, chord.id);
                    const isCompact = segmentDurationBeats === 1;
                    const fullLabel =
                      chordDisplayMode === 'roman'
                        ? formatChordAsRomanNumeralLabel(chord.root, chord.quality, song.key, chord.bass)
                        : formatSlashChordLabel(`${chord.root} ${chord.quality}`, chord.bass);
                    const compactLabel =
                      chordDisplayMode === 'roman'
                        ? fullLabel
                        : formatSlashChordLabel(chord.root, chord.bass);

                    return (
                      <ChordBlock
                        key={`${chord.id}-${segmentStartBeat}`}
                        isCompact={isCompact}
                        style={{
                          left: (segmentStartBeat - row.startBeat) * BEAT_WIDTH,
                          width: segmentDurationBeats * BEAT_WIDTH,
                        }}
                      >
                        <ChordInfo>
                          <ChordName title={fullLabel}>
                            {isCompact ? compactLabel : fullLabel}
                          </ChordName>
                          {!isCompact && <ChordMeta>{displayDuration}拍</ChordMeta>}
                        </ChordInfo>

                        <ChordActions>
                          <ChordActionButton
                            type="button"
                            title="1拍短く"
                            aria-label={`${fullLabel}を1拍短く`}
                            disabled={chord.durationBeats <= 1}
                            onClick={() => onChordResize(chord.id, chord.durationBeats - 1)}
                          >
                            -
                          </ChordActionButton>
                          <ChordActionButton
                            type="button"
                            title="1拍長く"
                            aria-label={`${fullLabel}を1拍長く`}
                            disabled={chord.durationBeats >= maxDuration}
                            onClick={() => onChordResize(chord.id, chord.durationBeats + 1)}
                          >
                            +
                          </ChordActionButton>
                          <ChordActionButton
                            type="button"
                            title="削除"
                            aria-label={`${fullLabel}を削除`}
                            onClick={() => onChordDelete(chord.id)}
                          >
                            x
                          </ChordActionButton>
                        </ChordActions>
                      </ChordBlock>
                    );
                  })}
                </ChordLane>

                <BeatRow style={{ gridTemplateColumns: `repeat(${row.beatCount}, ${BEAT_WIDTH}px)` }}>
                  {beats.map((beat) => {
                    const isMeasureStart = beat % song.timeSignature.beatsPerMeasure === 0;
                    const isOccupied = visibleChords.some(
                      (chord) => beat >= chord.startBeat && beat < getChordEndBeat(chord),
                    );

                    return (
                      <BeatButton
                        key={beat}
                        type="button"
                        isMeasureStart={isMeasureStart}
                        isOccupied={isOccupied}
                        aria-label={`${Math.floor(beat / song.timeSignature.beatsPerMeasure) + 1}小節 ${
                          (beat % song.timeSignature.beatsPerMeasure) + 1
                        }拍目`}
                        onClick={() => onBeatClick(beat)}
                      >
                        {(beat % song.timeSignature.beatsPerMeasure) + 1}
                      </BeatButton>
                    );
                  })}
                </BeatRow>

                <MelodyHeader>
                  <MelodyTitle>メロディ</MelodyTitle>
                  {selectedNoteInRow && (
                    <MelodySelectionControls>
                      <MelodySelectionLabel>
                        {formatPitch(selectedNoteInRow)} / {getMelodyDisplayDuration(selectedNoteInRow, totalBeats)}拍
                      </MelodySelectionLabel>
                      <MelodyActionButton
                        type="button"
                        title="1拍短く"
                        aria-label={`${formatPitch(selectedNoteInRow)}を1拍短く`}
                        disabled={selectedNoteInRow.durationBeats <= 1}
                        onClick={() =>
                          onMelodyNoteResize(
                            selectedNoteInRow.id,
                            selectedNoteInRow.durationBeats - 1,
                          )
                        }
                      >
                        -
                      </MelodyActionButton>
                      <MelodyActionButton
                        type="button"
                        title="1拍長く"
                        aria-label={`${formatPitch(selectedNoteInRow)}を1拍長く`}
                        disabled={selectedNoteInRow.durationBeats >= selectedMelodyMaxDuration}
                        onClick={() =>
                          onMelodyNoteResize(
                            selectedNoteInRow.id,
                            selectedNoteInRow.durationBeats + 1,
                          )
                        }
                      >
                        +
                      </MelodyActionButton>
                      <MelodyActionButton
                        type="button"
                        title="削除"
                        aria-label={`${formatPitch(selectedNoteInRow)}を削除`}
                        onClick={() => onMelodyNoteDelete(selectedNoteInRow.id)}
                      >
                        x
                      </MelodyActionButton>
                    </MelodySelectionControls>
                  )}
                </MelodyHeader>

                <MelodyLane
                  style={{
                    width: PITCH_LABEL_WIDTH + row.beatCount * BEAT_WIDTH,
                    height: Math.min(
                      MELODY_PITCHES.length * MELODY_ROW_HEIGHT,
                      MELODY_LANE_MAX_HEIGHT,
                    ),
                  }}
                >
                  <PitchLabels>
                    {MELODY_PITCHES.map((pitch) => (
                      <PitchLabel key={formatPitch(pitch)}>{formatPitch(pitch)}</PitchLabel>
                    ))}
                  </PitchLabels>

                  <MelodyCells
                    style={{
                      gridTemplateColumns: `repeat(${row.beatCount}, ${BEAT_WIDTH}px)`,
                      gridTemplateRows: `repeat(${MELODY_PITCHES.length}, ${MELODY_ROW_HEIGHT}px)`,
                    }}
                  >
                    {MELODY_PITCHES.flatMap((pitch) =>
                      beats.map((beat) => {
                        const isMeasureStart = beat % song.timeSignature.beatsPerMeasure === 0;
                        const activeChord = visibleChords.find(
                          (chord) => beat >= chord.startBeat && beat < getChordEndBeat(chord),
                        );
                        const isChordTone = activeChord
                          ? getChordNotes(activeChord.root, activeChord.quality).includes(pitch.pitch)
                          : false;
                        const occupiedNote = visibleMelodyNotes.find(
                          (note) =>
                            isSamePitch(note, pitch) &&
                            beat >= note.startBeat &&
                            beat < getMelodyNoteEndBeat(note),
                        );

                        return (
                          <MelodyCell
                            key={`${formatPitch(pitch)}-${beat}`}
                            type="button"
                            isChordTone={isChordTone}
                            isOccupied={Boolean(occupiedNote)}
                            isMeasureStart={isMeasureStart}
                            aria-label={`${Math.floor(beat / song.timeSignature.beatsPerMeasure) + 1}小節 ${
                              (beat % song.timeSignature.beatsPerMeasure) + 1
                            }拍目 ${formatPitch(pitch)}`}
                            onClick={() => {
                              if (occupiedNote) {
                                onMelodyNoteSelect(occupiedNote.id);
                                return;
                              }

                              onMelodyCellClick(beat, pitch.pitch, pitch.octave);
                            }}
                          />
                        );
                      }),
                    )}
                  </MelodyCells>

                  <MelodyNotesLayer>
                    {melodySegments.map(({ note, pitchIndex, segmentStartBeat, segmentDurationBeats }) => {
                      const isCompact = segmentDurationBeats === 1;
                      const isSelected = note.id === selectedMelodyNoteId;

                      return (
                        <MelodyNoteBlock
                          key={`${note.id}-${segmentStartBeat}`}
                          type="button"
                          isSelected={isSelected}
                          isCompact={isCompact}
                          title={`${formatPitch(note)} ${getMelodyDisplayDuration(note, totalBeats)}拍`}
                          aria-label={`${formatPitch(note)}を選択`}
                          style={{
                            left: (segmentStartBeat - row.startBeat) * BEAT_WIDTH + 2,
                            top: pitchIndex * MELODY_ROW_HEIGHT + 2,
                            width: Math.max(28, segmentDurationBeats * BEAT_WIDTH - 4),
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            onMelodyNoteSelect(note.id);
                          }}
                        >
                          <MelodyNoteText>
                            {isCompact ? note.pitch : formatPitch(note)}
                          </MelodyNoteText>
                          {!isCompact && (
                            <MelodyNoteText>
                              {getMelodyDisplayDuration(note, totalBeats)}拍
                            </MelodyNoteText>
                          )}
                        </MelodyNoteBlock>
                      );
                    })}
                  </MelodyNotesLayer>
                </MelodyLane>
              </TimelineRowSurface>
            );
          })}
        </TimelineRows>
      </TimelineScroller>
    </TimelineContainer>
  );
}
