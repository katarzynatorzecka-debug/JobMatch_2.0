import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'npm:@supabase/supabase-js@2.111.0': '@supabase/supabase-js',
      'npm:postal-mime@2.7.5': 'postal-mime',
      'npm:postgres@3.4.7': 'postgres',
    },
  },
  test: {
    exclude: [...configDefaults.exclude, 'private-data/**'],
  },
})
