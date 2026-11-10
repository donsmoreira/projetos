import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Versão do package.json, exibida no rodapé do menu
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
})
