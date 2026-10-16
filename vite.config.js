import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tanstack/react-query': path.resolve(__dirname, 'node_modules/@tanstack/react-query'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom')
    },
    dedupe: ['@tanstack/react-query', 'react', 'react-dom']
  },
  server: {
    port: 5175,
    strictPort: false,
    proxy: {
      '/cal-api': {
        target: 'https://api.cal.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cal-api/, '')
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
