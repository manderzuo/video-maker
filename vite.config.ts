import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',strictPort:true},preview:{host:'127.0.0.1',strictPort:true},build:{sourcemap:false,rollupOptions:{output:{manualChunks(id){if(!id.includes('node_modules'))return;if(/[/\\](react|react-dom|scheduler)[/\\]/.test(id))return 'react-vendor';if(id.includes('/zod/'))return 'schema-vendor';if(id.includes('/fflate/'))return 'zip-vendor';}}}}});
