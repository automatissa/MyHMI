import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // accessible sur tout le réseau (navigateur tablette/PC sur hotspot RPi)
    port: 5173,
  },
})
