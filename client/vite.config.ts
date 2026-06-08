import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Generates the full icon set (favicon, PWA icons, maskable, apple-touch)
      // from a single SVG and injects them into the manifest + <head>.
      pwaAssets: {
        image: 'public/logo.svg',
        overrideManifestIcons: true,
      },
      manifest: {
        name: 'mTodo',
        short_name: 'mTodo',
        description: 'A simple, modern TODO app with lists, tags, recurring tasks and Markdown.',
        theme_color: '#0d6efd',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Cache GET API responses so previously loaded data is available offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mtodo-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});
