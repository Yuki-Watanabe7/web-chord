import { formatChordNameInKey, formatChordSymbolInKey } from './chords';
import { formatStructuredChordSymbolInKey } from './chordSymbol';
import { formatChordAsRomanNumeralLabel } from './chordProgressionTemplates';
import type { ChordDisplayMode, ChordEvent, SongKey } from './types';

export interface CompactChordLabel {
  primary: string;
  secondary?: string;
}

export interface TimelineChordLabel {
  full: string;
  visible: CompactChordLabel;
}

type TimelineChordLabelSource = Pick<ChordEvent, 'root' | 'quality' | 'bass' | 'chordSymbol'>;

const splitSlashChordLabel = (label: string): CompactChordLabel => {
  const slashIndex = label.indexOf('/');

  if (slashIndex === -1) {
    return { primary: label };
  }

  return {
    primary: label.slice(0, slashIndex),
    secondary: label.slice(slashIndex),
  };
};

const formatFullChordLabel = (
  chord: TimelineChordLabelSource,
  chordDisplayMode: ChordDisplayMode,
  key: SongKey,
) => {
  if (chord.chordSymbol && (chord.chordSymbol.kind === 'none' || chord.chordSymbol.kind === 'other' || chord.chordSymbol.degrees.length > 0 || chord.chordSymbol.extension === 6 || chord.chordSymbol.kind.startsWith('suspended') || chord.chordSymbol.kind === 'half-diminished')) {
    return formatStructuredChordSymbolInKey(chord.chordSymbol, key);
  }

  if (chordDisplayMode === 'roman') {
    return formatChordAsRomanNumeralLabel(chord.root, chord.quality, key, chord.bass);
  }

  return formatChordNameInKey(chord.root, chord.quality, key, chord.bass);
};

const formatCompactChordLabel = (
  chord: TimelineChordLabelSource,
  chordDisplayMode: ChordDisplayMode,
  key: SongKey,
) => {
  if (chord.chordSymbol) {
    return formatStructuredChordSymbolInKey(chord.chordSymbol, key);
  }

  if (chordDisplayMode === 'roman') {
    return formatChordAsRomanNumeralLabel(chord.root, chord.quality, key, chord.bass);
  }

  return formatChordSymbolInKey(chord.root, chord.quality, key, chord.bass);
};

export const formatTimelineChordLabel = (
  chord: TimelineChordLabelSource,
  chordDisplayMode: ChordDisplayMode,
  key: SongKey,
  segmentDurationBeats: number,
): TimelineChordLabel => {
  const full = formatFullChordLabel(chord, chordDisplayMode, key);

  if (segmentDurationBeats !== 1) {
    return {
      full,
      visible: { primary: full },
    };
  }

  return {
    full,
    visible: splitSlashChordLabel(formatCompactChordLabel(chord, chordDisplayMode, key)),
  };
};
