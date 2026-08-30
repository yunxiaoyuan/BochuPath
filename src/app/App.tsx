import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GalleryPage } from '../features/diagrams/GalleryPage';
import { WorkspacePage } from '../features/workspace/WorkspacePage';
import { getBrowserStorage } from '../persistence/browser-storage';

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storage = getBrowserStorage();
    const stored = storage.getItem('bochupath:theme') ?? storage.getItem('pathway:theme');
    if (stored) storage.setItem('bochupath:theme', stored);
    return stored === 'dark' ? 'dark' : 'light';
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; getBrowserStorage().setItem('bochupath:theme', theme); }, [theme]);
  return <Routes>
    <Route path="/diagrams" element={<GalleryPage theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
    <Route path="/diagrams/:diagramId/edit" element={<WorkspacePage mode="edit" theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
    <Route path="/diagrams/:diagramId/view" element={<WorkspacePage mode="view" theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
    <Route path="*" element={<Navigate to="/diagrams" replace />} />
  </Routes>;
}
