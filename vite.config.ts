import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icons/forma-mark.svg',
        'icons/forma-v4-maskable-192.png',
        'icons/forma-v4-maskable-512.png',
        'icons/forma-v4-16.png',
        'icons/forma-v4-32.png',
        'icons/forma-v4-48.png',
        'icons/forma-v4-64.png',
        'icons/forma-v4-72.png',
        'icons/forma-v4-96.png',
        'icons/forma-v4-180.png',
        'icons/forma-v4-192.png',
        'icons/forma-v4-512.png'
      ],
      manifest: {
        name: 'FORMA',
        short_name: 'FORMA',
        start_url: '/',
        display: 'standalone',
        background_color: '#f7f9f5',
        theme_color: '#f7f9f5',
        icons: [
          { src: '/icons/forma-v4-16.png', sizes: '16x16', type: 'image/png' },
          { src: '/icons/forma-v4-32.png', sizes: '32x32', type: 'image/png' },
          { src: '/icons/forma-v4-48.png', sizes: '48x48', type: 'image/png' },
          { src: '/icons/forma-v4-64.png', sizes: '64x64', type: 'image/png' },
          { src: '/icons/forma-v4-72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icons/forma-v4-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icons/forma-v4-180.png', sizes: '180x180', type: 'image/png' },
          { src: '/icons/forma-v4-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/forma-v4-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/forma-v4-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/forma-v4-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 3
            }
          },
          {
            urlPattern: ({ request }) => ['style', 'script', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets-cache'
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /\/([a-z]+)?\.template\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'templates-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: { '/api': process.env.FITNESS_DEV_API_TARGET ?? 'http://127.0.0.1:3001' }
  }
});
