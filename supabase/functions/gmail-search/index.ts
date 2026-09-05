import { createGmailRuntimeHandler } from '../_shared/gmail/runtime.ts'

Deno.serve(createGmailRuntimeHandler('gmail-search', Deno.env.toObject()))
