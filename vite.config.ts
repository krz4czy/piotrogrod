import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the same dist/ works at /jazz2-web/piotrogrod/ and any other subfolder.
  base: './',
  server: { host: '0.0.0.0', port: 4738, strictPort: true },
  preview: { host: '0.0.0.0', port: 4738, strictPort: true },
  build: { target: 'es2020' },
});
