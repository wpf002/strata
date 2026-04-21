import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react': '/Users/willfoti/Documents/GitHub/strata/web/node_modules/react',
      'react-dom': '/Users/willfoti/Documents/GitHub/strata/web/node_modules/react-dom',
      'react-router': '/Users/willfoti/Documents/GitHub/strata/web/node_modules/react-router',
      'react-router-dom': '/Users/willfoti/Documents/GitHub/strata/web/node_modules/react-router-dom',
    },
  },
  define: {
    'import.meta.env.VITE_USE_MOCK': '"true"',
    'import.meta.env.VITE_API_URL': '""',
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
