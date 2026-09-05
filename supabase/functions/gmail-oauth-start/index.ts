import { createGmailRuntimeHandler } from '../_shared/gmail/runtime.ts'

Deno.serve(createGmailRuntimeHandler('gmail-oauth-start', Deno.env.toObject()))
