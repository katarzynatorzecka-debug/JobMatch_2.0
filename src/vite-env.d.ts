/// <reference types="vite/client" />

declare module 'npm:@supabase/supabase-js@2.111.0' {
  export * from '@supabase/supabase-js'
}

declare module 'npm:postal-mime@2.7.5' {
  import PostalMime from 'postal-mime'
  export default PostalMime
}

declare module 'npm:postgres@3.4.7' {
  import postgres from 'postgres'
  export default postgres
  export * from 'postgres'
}
