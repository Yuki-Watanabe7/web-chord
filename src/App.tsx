import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SongList from './pages/SongList';
import Editor from './pages/Editor';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<SongList />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/editor/:id" element={<Editor />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
