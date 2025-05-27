import { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import type { Song } from '../types/song';
import { useNavigate } from 'react-router-dom';

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
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

function SongList() {
  const [songs, setSongs] = useState<Song[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // ローカルストレージから曲の一覧を読み込む
    const savedSongs = localStorage.getItem('songs');
    if (savedSongs) {
      setSongs(JSON.parse(savedSongs));
    }
  }, []);

  const handleNewSong = () => {
    navigate('/editor');
  };

  const handleSongClick = (songId: string) => {
    navigate(`/editor/${songId}`);
  };

  return (
    <Container>
      <Header>
        <Title>コード進行エディタ</Title>
        <NewSongButton onClick={handleNewSong}>新規作成</NewSongButton>
      </Header>
      <SongListContainer>
        {songs.map((song) => (
          <SongCard key={song.id} onClick={() => handleSongClick(song.id)}>
            <SongTitle>{song.title}</SongTitle>
            <SongInfo>
              BPM: {song.bpm} | 拍子: {song.timeSignature} | 
              更新日時: {new Date(song.updatedAt).toLocaleString()}
            </SongInfo>
          </SongCard>
        ))}
      </SongListContainer>
    </Container>
  );
}

export default SongList; 