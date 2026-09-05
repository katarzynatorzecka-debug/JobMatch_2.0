import { createGmailRuntimeHandler } from '../_shared/gmail/runtime.ts'

Deno.serve(createGmailRuntimeHandler('gmail-disconnect', Deno.env.toObject()))
