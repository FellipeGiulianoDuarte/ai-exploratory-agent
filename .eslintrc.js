module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/', 'node_modules/', 'coverage/'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off', // Too noisy, TypeScript infers return types
    '@typescript-eslint/explicit-module-boundary-types': 'off', // Same as above
    '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error for gradual improvement
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/require-await': 'off', // Interface implementations often have async without await
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'warn', // Common in dynamic code, warn to allow gradual fix
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/restrict-template-expressions': 'warn',
    'prettier/prettier': 'error',
    'no-console': 'off',
  },
  overrides: [
    {
      // Fully relax rules for test files - mocking requires flexibility
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        'no-useless-escape': 'off',
      },
    },
  ],
};
