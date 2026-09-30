import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['dist/**','node_modules/**','work/**','docs/**','third-party/**','test-results/**']},...tseslint.configs.recommended,{files:['**/*.ts','**/*.tsx'],rules:{'@typescript-eslint/no-explicit-any':'error'}});
