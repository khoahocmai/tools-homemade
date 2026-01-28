import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig(({ mode }) => {
  const isDev = mode !== 'production';

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          { src: "manifest.json", dest: "." } // => dist/manifest.json
        ]
      }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,

      // ✅ debug tốt hơn
      sourcemap: isDev ? true : false,
      minify: isDev ? false : 'esbuild',
      target: 'es2020', // chrome ext ok

      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/popup.html'),
          content: resolve(__dirname, 'src/content/index.ts'),
          background: resolve(__dirname, 'src/background/service-worker.ts'),
        },
        output: {
          // ✅ giữ tên cố định cho manifest MV3
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]',

          // ✅ hạn chế split chunk khó debug / khó load trong MV3
          manualChunks: undefined,
        },
      },
    },
  };
});
