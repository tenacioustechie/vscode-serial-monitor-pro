// ESLint legacy config (v8) with the type-aware strict ruleset.

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  env: {
    node: true,
    es2021: true,
  },
  ignorePatterns: ['dist/', 'media/', 'tests/', 'node_modules/', '*.js', '*.mjs'],
};
