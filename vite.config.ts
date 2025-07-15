import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifestJson from './manifest.json';

const manifest = manifestJson as any;

export default defineConfig(({ mode }) => {
  // 1️⃣ Load all VITE_ env vars from the .env file at project root
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // 2️⃣ Inject the OpenAI key into import.meta.env
    define: {
      'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(
        env.VITE_OPENAI_API_KEY
      )
    },

    plugins: [
      react(),
      crx({ manifest })
    ],

    build: {
      manifest: true,       // so CRX plugin can map your bundles
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: '[name].[hash].js',
          chunkFileNames: '[name].[hash].js',
          assetFileNames: '[name].[hash][extname]'
        }
      }
    }
  };
});
