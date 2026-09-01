import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  format: ['esm'],
  dts: true,
  splitting: false,
  noExternal: ['react', 'react-dom', 'zustand'],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.js': 'jsx',
    }
  },
})
