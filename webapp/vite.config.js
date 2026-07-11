import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for GitHub Pages
  preview: {
    allowedHosts: ['webapp'], // compose e2e reaches preview by service name
  },
})
