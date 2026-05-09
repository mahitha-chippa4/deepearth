import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @mapbox/mapbox-gl-draw imports 'mapbox-gl' internally.
      // Redirect it to maplibre-gl so we don't need to ship both.
      'mapbox-gl': fileURLToPath(
        new URL('./node_modules/maplibre-gl/dist/maplibre-gl.js', import.meta.url)
      ),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
