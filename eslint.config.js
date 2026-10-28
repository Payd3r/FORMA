import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default ts.config(
  { ignores: ['dist/**', 'server/dist/**', 'node_modules/**', 'server/node_modules/**', 'artifacts/**', 'test-results/**', '.portfolio-export/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } }, plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules, '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], 'no-empty': ['error', { allowEmptyCatch: true }] } },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } }
);
