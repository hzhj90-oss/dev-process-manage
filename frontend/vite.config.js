import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  base: '/',
  build: {
    outDir: resolve(currentDir, '../backend/src/main/resources/static'),
    emptyOutDir: true
  }
})