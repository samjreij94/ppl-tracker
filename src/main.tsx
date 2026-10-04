import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CoreProvider, getCore } from './core';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CoreProvider core={getCore()}>
      <App />
    </CoreProvider>
  </StrictMode>,
);
