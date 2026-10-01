import {defineConfig} from 'vite';
export default defineConfig({build:{ssr:true,target:'node22',outDir:'companion/dist',rollupOptions:{input:{main:'companion/src/main.ts',mcp:'companion/src/mcp-main.ts'},output:{entryFileNames:'[name].mjs'}}}});
