import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/unit/**/*.test.ts','tests/security/**/*.test.ts'],setupFiles:['tests/helpers/unit-setup.ts'],environment:'node',clearMocks:true,restoreMocks:true}});
