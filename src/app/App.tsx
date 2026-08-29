import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GalleryPage } from '../features/diagrams/GalleryPage';
import { WorkspacePage } from '../features/workspace/WorkspacePage';

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('pathway:theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('pathway:theme', theme); }, [theme]);
  return <Routes>
    <Route path="/diagrams" element={<GalleryPage theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
    <Route path="/diagrams/:diagramId/edit" element={<WorkspacePage mode="edit" theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
    <Route path="/diagrams/:diagramId/view" element={<WorkspacePage mode="view" theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
    <Route path="*" element={<Navigate to="/diagrams" replace />} />
  </Routes>;
}
