module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
  rules: {
    // Existing unused declarations are reported while features migrate.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [{
    files: ['**/*.ts'],
    parser: '@typescript-eslint/parser',
    rules: {
      // TypeScript resolves type names and Node globals in `npm run typecheck`.
      'no-undef': 'off',
    },
  }],
};
