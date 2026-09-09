import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GalleryPage } from '../features/diagrams/GalleryPage';
import { WorkspacePage } from '../features/workspace/WorkspacePage';
import { getBrowserStorage } from '../persistence/browser-storage';
import { AppDialogProvider } from './AppDialog';
import { usesSecureApi } from './runtime';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { LoginGate } from '../auth/components';
import { AccessPage } from '../features/access/AccessPage';
import '../auth.css';
import { preserveEditorDraft, resetEditorSession, suspendEditorSession, useEditorStore } from '../editor/store';

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storage = getBrowserStorage();
    const stored = storage.getItem('bochupath:theme') ?? storage.getItem('pathway:theme');
    if (stored) storage.setItem('bochupath:theme', stored);
    return stored === 'dark' ? 'dark' : 'light';
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; getBrowserStorage().setItem('bochupath:theme', theme); }, [theme]);
  return <AppDialogProvider><AuthProvider enabled={usesSecureApi()}><EditorIdentityBridge /><LoginGate><Routes>
      <Route path="/access" element={<AccessPage />} />
      <Route path="/diagrams" element={<GalleryPage theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
      <Route path="/diagrams/:diagramId/edit" element={<WorkspacePage mode="edit" theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
      <Route path="/diagrams/:diagramId/view" element={<WorkspacePage mode="view" theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />} />
      <Route path="*" element={<Navigate to="/diagrams" replace />} />
    </Routes></LoginGate></AuthProvider></AppDialogProvider>;
}

function EditorIdentityBridge() {
  const { canWrite } = useAuth();
  useEffect(() => { useEditorStore.getState().setWriteAccess(canWrite); }, [canWrite]);
  useEffect(() => {
    const expiring = () => { preserveEditorDraft(); suspendEditorSession(); };
    const changing = (event: Event) => {
      const { previousUserId, userId } = (event as CustomEvent<{ previousUserId: string | null; userId: string | null }>).detail;
      if (previousUserId) preserveEditorDraft();
      if (userId) resetEditorSession();
      else suspendEditorSession();
    };
    window.addEventListener('bochupath:auth-expiring', expiring);
    window.addEventListener('bochupath:auth-user-changing', changing);
    window.addEventListener('pagehide', preserveEditorDraft);
    return () => {
      window.removeEventListener('bochupath:auth-expiring', expiring);
      window.removeEventListener('bochupath:auth-user-changing', changing);
      window.removeEventListener('pagehide', preserveEditorDraft);
    };
  }, []);
  return null;
}
