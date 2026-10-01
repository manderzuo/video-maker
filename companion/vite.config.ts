import {defineConfig} from 'vite';
export default defineConfig({build:{ssr:'companion/src/main.ts',target:'node22',outDir:'companion/dist',rollupOptions:{output:{entryFileNames:'main.mjs'}}}});
