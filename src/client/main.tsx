import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bai-jamjuree/500.css';
import '@fontsource/bai-jamjuree/700.css';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import './styles.css';
import { App, ErrorBoundary } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
