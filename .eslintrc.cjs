/**
 * ESLint - Baikal Console
 * ============================================================================
 * Le script `npm run lint` existait sans config : le voici branche.
 * Perimetre : le front Vite (js/jsx). Les Edge Functions (Deno/TS) sont
 * exclues — leur garde-fou est `deno check supabase/functions/<fn>/index.ts`.
 * ============================================================================
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'supabase', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.3' } },
  plugins: ['react-refresh'],
  rules: {
    // Pas de PropTypes dans ce projet (pas de TypeScript non plus) :
    // la regle ne ferait que du bruit.
    'react/prop-types': 'off',
    // Avertit si un fichier exporte autre chose que des composants,
    // ce qui casse le rechargement a chaud (HMR) de Vite.
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Les apostrophes/guillemets bruts en JSX sont voulus (UI en francais).
    'react/no-unescaped-entities': 'off',
  },
  overrides: [
    {
      files: ['scripts/**/*.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
      env: { node: true },
    },
  ],
};
