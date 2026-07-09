import { useMemo, useState, type FormEvent } from 'react';
import styled from '@emotion/styled';
import {
  CHORD_QUALITIES,
  formatChordSymbol,
  getChordNotes,
  NOTE_NAMES,
} from '../../domain/music/chords';
import {
  chordMatchesQuery,
  chordMatchesQueryExactly,
  parseChordSearchQuery,
  QUALITY_ALIASES,
} from '../../domain/music/chordSearch';
import { chords } from '../../data/chords';
import { addRecentChord, loadRecentChords } from '../../services/recentChordsStorage';
import type { RecentChordEntry } from '../../services/recentChordsStorage';
import type { Chord } from '../../types/chord';
import type { ChordQuality, NoteName } from '../../domain/music/types';

const MAX_SEARCH_RESULTS = 8;

const QUALITY_LABELS: Record<ChordQuality, string> = {
  major: QUALITY_ALIASES.major[0],
  minor: QUALITY_ALIASES.minor[0],
  diminished: QUALITY_ALIASES.diminished[0],
  augmented: QUALITY_ALIASES.augmented[0],
  dominant7: QUALITY_ALIASES.dominant7[0],
  major7: QUALITY_ALIASES.major7[0],
  minor7: QUALITY_ALIASES.minor7[0],
};

const recentChordKey = (entry: RecentChordEntry): string =>
  `${entry.root}-${entry.quality}-${entry.bass ?? ''}`;

const PalettePanel = styled.aside`
  width: 300px;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  @media (max-width: 900px) {
    width: 100%;
    max-height: 60vh;
    overflow-y: auto;
  }
`;

const SectionLabel = styled.p`
  margin: 0 0 6px;
  font-size: 0.8rem;
  color: #666;
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const ChordChip = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive: boolean }>`
  padding: 6px 10px;
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

const SearchForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #bbb;
  border-radius: 6px;
  font: inherit;
`;

const BassRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #333;
`;

const BassSelect = styled.select`
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #bbb;
  border-radius: 6px;
  font: inherit;
`;

const RootGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
`;

const RootButton = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive: boolean }>`
  padding: 10px 4px;
  border: 1px solid ${(props) => (props.isActive ? '#315f52' : '#ccc')};
  border-radius: 6px;
  background: ${(props) => (props.isActive ? '#e5f4ef' : 'white')};
  color: #333;
  cursor: pointer;
  font: inherit;
  font-weight: 600;

  &:hover {
    background: #f0f0f0;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const QualityButton = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})<{ isActive: boolean }>`
  padding: 6px 10px;
  border: 1px solid ${(props) => (props.isActive ? '#315f52' : '#ccc')};
  border-radius: 999px;
  background: ${(props) => (props.isActive ? '#e5f4ef' : 'white')};
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  min-width: 2.4em;

  &:hover {
    background: #f0f0f0;
  }
`;

const ChordList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
`;

const ChordButton = styled.button`
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: #f0f0f0;
  }
`;

const EmptyState = styled.p`
  margin: 4px 0;
  color: #666;
  font-size: 0.9rem;
`;

const SelectedSummary = styled.p`
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f5f5f5;
  font-size: 0.9rem;
  color: #333;
`;

interface ChordPaletteProps {
  selectedChord: Chord | null;
  selectedBass: NoteName | null;
  onChordSelect: (chord: Chord) => void;
  onBassChange: (bass: NoteName | null) => void;
}

export function ChordPalette({
  selectedChord,
  selectedBass,
  onChordSelect,
  onBassChange,
}: ChordPaletteProps) {
  const [searchText, setSearchText] = useState('');
  const [recentChords, setRecentChords] = useState<RecentChordEntry[]>(() => loadRecentChords());

  const parsedQuery = useMemo(() => parseChordSearchQuery(searchText), [searchText]);
  const trimmedChordQuery = parsedQuery.chordQuery.trim();

  const matchingChords = useMemo(() => {
    if (trimmedChordQuery.length === 0) {
      return [];
    }

    return chords.filter((chord) => chordMatchesQuery(chord, parsedQuery.chordQuery));
  }, [parsedQuery.chordQuery, trimmedChordQuery]);

  const searchResults = matchingChords.slice(0, MAX_SEARCH_RESULTS);
  const hiddenResultCount = matchingChords.length - searchResults.length;

  const recordRecentChord = (entry: RecentChordEntry) => {
    setRecentChords(addRecentChord(entry));
  };

  const commitChordSelection = (root: NoteName, quality: ChordQuality, bass: NoteName | null) => {
    const chord: Chord = { root, type: quality, notes: getChordNotes(root, quality) };
    onChordSelect(chord);
    recordRecentChord({ root, quality, bass: bass ?? undefined });
  };

  const handleRootSelect = (root: NoteName) => {
    commitChordSelection(root, selectedChord?.type ?? 'major', selectedBass);
  };

  const handleQualitySelect = (quality: ChordQuality) => {
    commitChordSelection(selectedChord?.root ?? 'C', quality, selectedBass);
  };

  const handleBassChange = (bass: NoteName | null) => {
    onBassChange(bass);

    if (selectedChord) {
      recordRecentChord({ root: selectedChord.root, quality: selectedChord.type, bass: bass ?? undefined });
    }
  };

  const selectSearchResult = (chord: Chord) => {
    const bass =
      parsedQuery.hasBassQuery && parsedQuery.bass ? parsedQuery.bass : selectedBass;

    if (parsedQuery.hasBassQuery && parsedQuery.bass) {
      onBassChange(parsedQuery.bass);
    }

    onChordSelect(chord);
    recordRecentChord({ root: chord.root, quality: chord.type, bass: bass ?? undefined });
    setSearchText('');
  };

  const selectRecentChord = (entry: RecentChordEntry) => {
    onChordSelect({ root: entry.root, type: entry.quality, notes: getChordNotes(entry.root, entry.quality) });
    onBassChange(entry.bass ?? null);
    recordRecentChord(entry);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (trimmedChordQuery.length === 0) {
      return;
    }

    const exactMatch = chords.find((chord) => chordMatchesQueryExactly(chord, parsedQuery.chordQuery));
    if (exactMatch) {
      selectSearchResult(exactMatch);
      return;
    }

    if (searchResults.length === 1) {
      selectSearchResult(searchResults[0]);
    }
  };

  return (
    <PalettePanel aria-label="コードパレット">
      {recentChords.length > 0 && (
        <div aria-label="最近使ったコード">
          <SectionLabel>最近使ったコード</SectionLabel>
          <ChipRow>
            {recentChords.map((entry) => (
              <ChordChip
                key={recentChordKey(entry)}
                isActive={
                  selectedChord?.root === entry.root &&
                  selectedChord.type === entry.quality &&
                  (selectedBass ?? undefined) === entry.bass
                }
                type="button"
                onClick={() => selectRecentChord(entry)}
              >
                {formatChordSymbol(entry.root, entry.quality, entry.bass)}
              </ChordChip>
            ))}
          </ChipRow>
        </div>
      )}

      <SearchForm onSubmit={handleSearchSubmit} role="search">
        <SearchInput
          aria-label="コード検索"
          placeholder="例: C, Cm7, F#m7, C/E"
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </SearchForm>

      {trimmedChordQuery.length > 0 && (
        <ChordList aria-label="検索結果">
          {searchResults.map((chord) => (
            <ChordButton
              key={`${chord.root}-${chord.type}`}
              type="button"
              onClick={() => selectSearchResult(chord)}
            >
              {formatChordSymbol(
                chord.root,
                chord.type,
                parsedQuery.hasBassQuery ? (parsedQuery.bass ?? undefined) : undefined,
              )}
            </ChordButton>
          ))}
          {searchResults.length === 0 && <EmptyState>見つかりません</EmptyState>}
          {hiddenResultCount > 0 && (
            <EmptyState>他{hiddenResultCount}件あります。絞り込むには入力を続けてください</EmptyState>
          )}
        </ChordList>
      )}

      <div aria-label="ルート音">
        <SectionLabel>ルート音</SectionLabel>
        <RootGrid>
          {NOTE_NAMES.map((note) => (
            <RootButton
              key={note}
              isActive={selectedChord?.root === note}
              type="button"
              onClick={() => handleRootSelect(note)}
            >
              {note}
            </RootButton>
          ))}
        </RootGrid>
      </div>

      <div aria-label="コードの種類">
        <SectionLabel>コード種別</SectionLabel>
        <FilterGroup>
          {CHORD_QUALITIES.map((quality) => (
            <QualityButton
              key={quality}
              isActive={selectedChord?.type === quality}
              type="button"
              onClick={() => handleQualitySelect(quality)}
            >
              {QUALITY_LABELS[quality]}
            </QualityButton>
          ))}
        </FilterGroup>
      </div>

      <BassRow>
        ベース音（分数コード）
        <BassSelect
          aria-label="ベース音（分数コード）"
          value={selectedBass ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            handleBassChange(value === '' ? null : (value as NoteName));
          }}
        >
          <option value="">なし</option>
          {NOTE_NAMES.map((note) => (
            <option key={note} value={note}>
              {note}
            </option>
          ))}
        </BassSelect>
      </BassRow>

      {selectedChord && (
        <SelectedSummary>
          選択中: {formatChordSymbol(selectedChord.root, selectedChord.type, selectedBass ?? undefined)}
        </SelectedSummary>
      )}
    </PalettePanel>
  );
}
