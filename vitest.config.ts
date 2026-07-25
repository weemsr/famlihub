import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Mirrors the `@/*` -> `src/*` alias from tsconfig so tests can import app
// modules the same way application code does.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
