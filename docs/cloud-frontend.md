# Shared frontend Cloud boundary

The **same Figranium React application and Task editor** serve both deployments.
By default, self-hosted Figranium continues to use Express and local sessions.

Cloud compilation sets `VITE_FIGRANIUM_DEPLOYMENT=cloud`, and the Cloud shell
registers `window.__FIGRANIUM_CLOUD_AUTH__` before React mounts. The adapter
must use Neon Auth for identity, password sign-in, sign-out and access tokens.
Cloud mode never falls back to Figranium's local session auth.

The shared Task hook adapts the legacy editor API to `/api/v1/tasks`: list,
create, update by ID and delete by ID. Cloud must implement those endpoints
with workspace-scoped authorization and compatible response Task shapes.
Other APIs have not yet been adapted and must not be exposed without review.
Execution/headful actions are explicitly unavailable in Cloud until CU
reservation, dispatcher, security checks, and artifact persistence are ready.

No duplicate frontend, no copy of the editor, no changes to self-hosted defaults.
