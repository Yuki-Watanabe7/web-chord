import { useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { CHORD_QUALITIES } from '../../domain/music/chords';
import { chordMatchesQuery } from '../../domain/music/chordSearch';
import { chords } from '../../data/chords';
import type { Chord } from '../../types/chord';
import type { ChordQuality } from '../../domain/music/types';

type QualityFilter = ChordQuality | 'all';

const QUALITY_LABELS: Record<QualityFilter, string> = {
  all: 'すべて',
  major: 'major',
  minor: 'minor',
  diminished: 'diminished',
  augmented: 'augmented',
  dominant7: 'dominant7',
  major7: 'major7',
  minor7: 'minor7',
};

const qualityFilters: QualityFilter[] = ['all', ...CHORD_QUALITIES];

const PalettePanel = styled.aside`
  width: 300px;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  @media (max-width: 900px) {
    width: 100%;
    max-height: 220px;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #bbb;
  border-radius: 6px;
  font: inherit;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const QualityButton = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive: boolean }>`
  padding: 5px 8px;
  border: 1px solid ${(props) => (props.isActive ? '#315f52' : '#ccc')};
  border-radius: 999px;
  background: ${(props) => (props.isActive ? '#e5f4ef' : 'white')};
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;

  &:hover {
    background: #f0f0f0;
  }
`;

const ChordList = styled.div`
  overflow-y: auto;
  min-height: 0;
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

const EmptyState = styled.p`
  margin: 12px 0 4px;
  color: #666;
  font-size: 0.9rem;
`;

interface ChordPaletteProps {
  selectedChord: Chord | null;
  onChordSelect: (chord: Chord) => void;
}

export function ChordPalette({ selectedChord, onChordSelect }: ChordPaletteProps) {
  const [searchText, setSearchText] = useState('');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');

  const filteredChords = useMemo(
    () =>
      chords.filter((chord) => {
        const matchesQuality = qualityFilter === 'all' || chord.type === qualityFilter;
        const matchesSearch = chordMatchesQuery(chord, searchText);

        return matchesQuality && matchesSearch;
      }),
    [searchText, qualityFilter],
  );

  return (
    <PalettePanel aria-label="コードパレット">
      <SearchInput
        aria-label="コード検索"
        placeholder="コードを検索"
        type="search"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      <FilterGroup aria-label="コードの種類">
        {qualityFilters.map((quality) => (
          <QualityButton
            key={quality}
            isActive={qualityFilter === quality}
            type="button"
            onClick={() => setQualityFilter(quality)}
          >
            {QUALITY_LABELS[quality]}
          </QualityButton>
        ))}
      </FilterGroup>

      <ChordList>
        {filteredChords.map((chord) => (
          <ChordButton
            key={`${chord.root}-${chord.type}`}
            isActive={selectedChord?.root === chord.root && selectedChord.type === chord.type}
            type="button"
            onClick={() => onChordSelect(chord)}
          >
            {chord.root} {chord.type}
          </ChordButton>
        ))}
        {filteredChords.length === 0 && <EmptyState>見つかりません</EmptyState>}
      </ChordList>
    </PalettePanel>
  );
}
