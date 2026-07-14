import { useState, useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import type { Song } from '../types/song';
import { useNavigate } from 'react-router-dom';
import { formatTimeSignature } from '../domain/music/timeline';
import { loadSongs, mergeAndSaveImportedSongs } from '../services/songStorage';
import {
  createSongsBackupFileName,
  downloadSongExportFile,
  MAX_SONG_EXPORT_FILE_BYTES,
  parseSongExportFile,
} from '../services/songFile';

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;

  @media (max-width: 620px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  color: #333;
`;

const SongListContainer = styled.div`
  display: grid;
  gap: 10px;
`;

const SongCard = styled.div`
  padding: 15px;
  border: 1px solid #ccc;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f0f0f0;
  }
`;

const SongTitle = styled.h3`
  margin: 0 0 10px 0;
`;

const SongInfo = styled.div`
  color: #666;
  font-size: 0.9em;
`;

const NewSongButton = styled.button`
  padding: 10px 20px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;

  &:hover {
    background-color: #45a049;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
`;

const FileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const ImportStatus = styled.p<{ $isError: boolean }>`
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 6px;
  color: ${({ $isError }) => ($isError ? '#8a1f11' : '#14532d')};
  background-color: ${({ $isError }) => ($isError ? '#fff1f0' : '#ecfdf3')};
`;

const EmptyMessage = styled.p`
  color: #666;
`;

interface ImportStatusMessage {
  isError: boolean;
  message: string;
}

function SongList() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatusMessage | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setSongs(loadSongs());
  }, []);

  const handleNewSong = () => {
    navigate('/editor');
  };

  const handleSongClick = (songId: string) => {
    navigate(`/editor/${songId}`);
  };

  const handleBackupExport = () => {
    downloadSongExportFile(songs, createSongsBackupFileName());
    setImportStatus({ isError: false, message: `${songs.length}件の楽曲をJSONバックアップとして書き出しました。` });
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!file) {
      return;
    }

    if (file.size > MAX_SONG_EXPORT_FILE_BYTES) {
      setImportStatus({
        isError: true,
        message: 'ファイルサイズが大きすぎます。2 MB以下のJSONを選択してください。',
      });
      return;
    }

    let fileText: string;

    try {
      fileText = await file.text();
    } catch {
      setImportStatus({ isError: true, message: 'ファイルを読み取れませんでした。' });
      return;
    }

    const parsed = parseSongExportFile(fileText);

    if (!parsed.ok) {
      setImportStatus({ isError: true, message: parsed.message });
      return;
    }

    try {
      const result = mergeAndSaveImportedSongs(parsed.songs);
      setSongs(loadSongs());
      setImportStatus({
        isError: false,
        message: `${result.importedCount}件を読み込みました。新規追加: ${result.addedCount}件、ID競合のため複製として追加: ${result.conflictCount}件。`,
      });
    } catch {
      setImportStatus({
        isError: true,
        message: '保存先へ書き込めませんでした。既存の楽曲は変更されていません。',
      });
    }
  };

  return (
    <Container>
      <Header>
        <Title>コード進行エディタ</Title>
        <HeaderActions>
          <button type="button" onClick={handleBackupExport} aria-label="全楽曲をJSONバックアップとして書き出す">
            JSONバックアップ
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()} aria-label="JSONを読み込む">
            JSONを読み込む
          </button>
          <FileInput
            ref={importInputRef}
            type="file"
            accept=".json,.web-chord.json,application/json"
            aria-label="読み込むweb-chord JSONファイルを選択"
            onChange={handleImportFile}
          />
          <NewSongButton onClick={handleNewSong}>新規作成</NewSongButton>
        </HeaderActions>
      </Header>
      {importStatus && (
        <ImportStatus aria-live="polite" role={importStatus.isError ? 'alert' : 'status'} $isError={importStatus.isError}>
          {importStatus.message}
        </ImportStatus>
      )}
      <SongListContainer>
        {songs.map((song) => (
          <SongCard key={song.id} onClick={() => handleSongClick(song.id)}>
            <SongTitle>{song.title}</SongTitle>
            <SongInfo>
              BPM: {song.bpm} | 拍子: {formatTimeSignature(song.timeSignature)} | 
              更新日時: {new Date(song.updatedAt).toLocaleString()}
            </SongInfo>
          </SongCard>
        ))}
        {songs.length === 0 && <EmptyMessage>保存済みの楽曲はありません。</EmptyMessage>}
      </SongListContainer>
    </Container>
  );
}

export default SongList; 
