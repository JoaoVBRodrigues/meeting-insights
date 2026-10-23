const js = require('@eslint/js');
const ts = require('typescript-eslint');
const globals = require('globals');
module.exports = ts.config({ ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] }, js.configs.recommended, ...ts.configs.recommended, { languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { '@typescript-eslint/no-explicit-any': 'off' } });
