import styled from '@emotion/styled';
import {
  getChordEndBeat,
  getChordMaxDurationBeats,
  getTotalBeats,
  sortChordEvents,
} from '../../domain/music/timeline';
import type { ChordEvent, Song } from '../../domain/music/types';

const BEAT_WIDTH = 56;

const TimelineContainer = styled.div`
  flex: 1;
  min-height: 0;
  border: 1px solid #ccd3dc;
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
`;

const TimelineScroller = styled.div`
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

const MeasureGuide = styled.div`
  display: flex;
  align-items: center;
  padding-left: 8px;
  border-left: 2px solid #8aa0b8;
  background: linear-gradient(to right, rgba(138, 160, 184, 0.14), transparent);

  &:last-of-type {
    border-right: 2px solid #8aa0b8;
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

interface TimelineGridProps {
  song: Song;
  measuresPerRow: number;
  onBeatClick: (startBeat: number) => void;
  onChordDelete: (chordId: string) => void;
  onChordResize: (chordId: string, durationBeats: number) => void;
}

interface TimelineRow {
  startMeasure: number;
  measureCount: number;
  startBeat: number;
  beatCount: number;
}

const getDisplayDuration = (chord: ChordEvent, totalBeats: number) =>
  Math.max(1, Math.min(chord.durationBeats, totalBeats - chord.startBeat));

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
  onBeatClick,
  onChordDelete,
  onChordResize,
}: TimelineGridProps) {
  const totalBeats = getTotalBeats(song);
  const measureWidth = song.timeSignature.beatsPerMeasure * BEAT_WIDTH;
  const rows = createTimelineRows(song, measuresPerRow);
  const visibleChords = sortChordEvents(song.chords).filter(
    (chord) => chord.startBeat >= 0 && chord.startBeat < totalBeats,
  );

  return (
    <TimelineContainer>
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

            return (
              <TimelineRowSurface key={row.startMeasure} style={{ width: row.beatCount * BEAT_WIDTH }}>
                <MeasureGuideRow
                  style={{
                    gridTemplateColumns: `repeat(${row.measureCount}, ${measureWidth}px)`,
                  }}
                >
                  {measureIndexes.map((measureIndex) => (
                    <MeasureGuide key={measureIndex}>{measureIndex + 1}</MeasureGuide>
                  ))}
                </MeasureGuideRow>

                <ChordLane>
                  {chordSegments.map(({ chord, segmentStartBeat, segmentDurationBeats }) => {
                    const displayDuration = getDisplayDuration(chord, totalBeats);
                    const maxDuration = getChordMaxDurationBeats(song, chord.id);
                    const isCompact = segmentDurationBeats === 1;

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
                          <ChordName title={`${chord.root} ${chord.quality}`}>
                            {isCompact ? chord.root : `${chord.root} ${chord.quality}`}
                          </ChordName>
                          {!isCompact && <ChordMeta>{displayDuration}拍</ChordMeta>}
                        </ChordInfo>

                        <ChordActions>
                          <ChordActionButton
                            type="button"
                            title="1拍短く"
                            aria-label={`${chord.root} ${chord.quality}を1拍短く`}
                            disabled={chord.durationBeats <= 1}
                            onClick={() => onChordResize(chord.id, chord.durationBeats - 1)}
                          >
                            -
                          </ChordActionButton>
                          <ChordActionButton
                            type="button"
                            title="1拍長く"
                            aria-label={`${chord.root} ${chord.quality}を1拍長く`}
                            disabled={chord.durationBeats >= maxDuration}
                            onClick={() => onChordResize(chord.id, chord.durationBeats + 1)}
                          >
                            +
                          </ChordActionButton>
                          <ChordActionButton
                            type="button"
                            title="削除"
                            aria-label={`${chord.root} ${chord.quality}を削除`}
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
              </TimelineRowSurface>
            );
          })}
        </TimelineRows>
      </TimelineScroller>
    </TimelineContainer>
  );
}
