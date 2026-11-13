import { createSiteContext, createDatabaseClient, errorResponse } from './_qoder/backend.mjs';
import { createApplication } from './router.mjs';

// forwardApplicationCredentials preserves this app's own session cookie. Identity is
// fully application-owned (DB sessions); platform identity is never used or trusted.
// APP_ORIGIN is a fixed HTTPS origin set in Site Settings (non-secret).
const handle = createApplication({ db: createDatabaseClient(), origin: () => Deno.env.get('APP_ORIGIN') });

Deno.serve(async (request) => {
  let context;
  try {
    context = createSiteContext(request, { forwardApplicationCredentials: true });
    return await handle(context);
  } catch (error) {
    return errorResponse(error, context?.requestId);
  }
});