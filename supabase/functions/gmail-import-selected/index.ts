import { createGmailRuntimeHandler } from '../_shared/gmail/runtime.ts'

Deno.serve(createGmailRuntimeHandler('gmail-import-selected', Deno.env.toObject()))
