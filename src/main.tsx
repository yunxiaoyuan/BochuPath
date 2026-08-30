import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './app/App';
import { isPageDropRuntime } from './app/runtime';

const router = isPageDropRuntime()
  ? <HashRouter><App /></HashRouter>
  : <BrowserRouter><App /></BrowserRouter>;

createRoot(document.getElementById('root')!).render(<StrictMode>{router}</StrictMode>);
