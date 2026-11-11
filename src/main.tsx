import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { useApp } from './state/store';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Çevrimdışı kullanım ve "Uygulamayı yükle" için service worker (önizleme çerçevesinde atlanır)
if ('serviceWorker' in navigator && window.self === window.top && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const update = registerSW({
        immediate: true,
        // Yeni sürüm indirildiğinde üst çubukta "Yeni sürüm hazır" düğmesi çıkar
        onNeedRefresh() {
          useApp.setState({ updateReady: true, applyUpdate: () => update(true) });
        },
        onRegisteredSW(_url, reg) {
          // Uygulama açıkken saatte bir güncelleme kontrolü
          if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        },
      });
    })
    .catch(() => {});
}
