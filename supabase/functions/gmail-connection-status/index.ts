import { createGmailRuntimeHandler } from '../_shared/gmail/runtime.ts'

Deno.serve(createGmailRuntimeHandler('gmail-connection-status', Deno.env.toObject()))
