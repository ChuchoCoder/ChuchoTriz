import tsParser from '@typescript-eslint/parser';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import timers from './scripts/security/timer-rule.mjs';
import codeSources from './scripts/security/code-source-rules.mjs';

// AST-based checks: test fixtures may build HTML, shipped extension code may not.
export default [
  { ignores: ['**/*.test.{ts,tsx,js,jsx,mjs,cjs}', '**/node_modules/**', 'dist/**'] },
  {
    files: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}', 'public/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'no-unsanitized': noUnsanitized, timers, 'code-sources': codeSources },
    rules: {
      'code-sources/local-imports': 'error',
      'code-sources/document-html': 'error',
      'timers/function-callback': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'no-restricted-syntax': ['error',
        { selector: 'AssignmentExpression:matches([left.property.name="src"], [left.property.value="src"]):not([right.callee.object.object.name="chrome"][right.callee.object.property.name="runtime"][right.callee.property.name="getURL"])', message: 'Load extension code from a chrome.runtime.getURL path; other src assignments need security review.' },
        { selector: 'AssignmentExpression > MemberExpression.left[property.value=/^(innerHTML|outerHTML)$/]', message: 'Do not assign raw HTML through a computed property.' },
        { selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]', message: 'Render untrusted values as React text; raw HTML needs a reviewed security policy change.' },
      ],
    },
  },
];
