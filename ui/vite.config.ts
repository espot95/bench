import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The UI is a SHELL (MODULE_UI): it imports the pure engine from ../src as a library.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: ['..'] } },
});
