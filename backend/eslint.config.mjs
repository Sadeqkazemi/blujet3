// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // Published migrations are immutable, including formatting (expand-only gate).
    // Exact historical files only; type/safety rules and future migrations stay checked.
    files: [
      'src/database/migrations/1786435200000-AirportCatalogPresentation.ts',
      'src/database/migrations/1787644800000-SeniorManagerPermissionCatalog.ts',
      'src/database/migrations/1788604800000-AgencyClassAllotments.ts',
      'src/database/migrations/1788691200000-CustomerAddressAndFixedAncillaries.ts',
      'src/database/migrations/1788787200000-GranularEmployeePermissionCatalog.ts',
      'src/database/migrations/1789046400000-FlightCancellationWorkflow.ts',
      'src/database/migrations/1789824000000-TravelExtraLocalizedDescriptions.ts',
      'src/database/migrations/1789827600000-EnsureImamKhomeiniAirport.ts',
    ],
    rules: { 'prettier/prettier': 'off' },
  },
  {
    // supertest's `res.body` is untyped `any` by design — asserting into it
    // is the normal shape of an e2e test, not a real type-safety gap.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
