import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Çevrimdışı kullanım ve "Uygulamayı yükle" için service worker (önizleme çerçevesinde atlanır)
if ('serviceWorker' in navigator && window.self === window.top && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
