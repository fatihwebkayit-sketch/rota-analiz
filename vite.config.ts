import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Rota Analiz',
        short_name: 'Rota Analiz',
        description: 'GPS rotalarını analiz etme, arşivleme ve raporlama',
        lang: 'tr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#121314',
        theme_color: '#121314',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [
          { action: './', accept: { 'application/gpx+xml': ['.gpx'], 'application/vnd.google-earth.kml+xml': ['.kml'], 'application/vnd.google-earth.kmz': ['.kmz'] } },
        ],
      } as any,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  test: { environment: 'node' },
} as any);
