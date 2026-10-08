import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts'],environment:'node',clearMocks:true,restoreMocks:true,testTimeout:10000,hookTimeout:10000}});
