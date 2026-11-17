import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Nach einem neuen Deploy fehlen alte Dateien: Seite einmalig neu laden
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('reloaded')) {
    sessionStorage.setItem('reloaded', '1');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')).render(<App />);
