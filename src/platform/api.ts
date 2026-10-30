import { isCloud, cloudAuth } from './runtime';
// Self-hosted requests are unchanged. Cloud requests never send local session cookies.

export type TaskEditorResourceKind = 'cookie-states' | 'cabinets';

// The Cloud Worker exposes tenant-scoped resource collections under /api/v1.
// Self-hosted Figranium keeps its existing /api routes and response shapes.
export function taskEditorResourcePath(kind: TaskEditorResourceKind, cloudMode: boolean = isCloud): string {
  return `${cloudMode ? '/api/v1' : '/api'}/${kind}`;
}

export function taskEditorResourceItems<T>(kind: TaskEditorResourceKind, payload: unknown, cloudMode: boolean = isCloud): T[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  const items = data[cloudMode ? 'items' : kind === 'cookie-states' ? 'states' : 'cabinets'];
  return Array.isArray(items) ? items as T[] : [];
}

// Normalize Cloud API requests to a relative, tenant-scoped path before a
// bearer token is obtained. An external or legacy URL must never receive it.
export function cloudApiRequestPath(path: string, origin: string): string {
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/v1/'))
    throw new Error('UNSUPPORTED_CLOUD_API');
  return url.pathname + url.search;
}

export async function authorizedCloudFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isCloud) throw new Error('CLOUD_ONLY');
  const safePath = cloudApiRequestPath(path, window.location.origin);
  const token = await cloudAuth().getAccessToken();
  if (!token) throw new Error('CLOUD_AUTH_REQUIRED');
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + token);
  return fetch(safePath, { ...init, headers, credentials: 'same-origin', redirect: 'error' });
}

/** Install once from the Cloud entry point. Existing shared screens deliberately
 * use ordinary relative fetches; this boundary supplies a short-lived bearer
 * token without changing self-hosted cookies or permitting cross-origin calls. */
export function installCloudApiAdapter(): void {
  if (!isCloud || (window as any).__figraniumCloudFetchInstalled) return;
  (window as any).__figraniumCloudFetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    const token = await cloudAuth().getAccessToken();
    if (!token) throw new Error('CLOUD_AUTH_REQUIRED');
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('Authorization', `Bearer ${token}`);
    // Keep this a same-origin credentialed request. Besides allowing the Neon
    // session cookie to be refreshed, the Cloud Worker uses an HttpOnly,
    // same-origin cookie to select the user's public Stable/Edge bundle.
    // `omit` silently discards Set-Cookie, so an otherwise successful channel
    // update was lost on the reload that immediately follows it. The bearer
    // token remains mandatory server-side; cookies are not authorization.
    return nativeFetch(input, { ...init, headers, credentials: 'same-origin', redirect: 'error' });
  };
}
// A failed delete must not be treated as a successful Task removal by the UI.
export async function deleteTaskRequest(id: string): Promise<void> {
  const response = await taskFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (response.ok) return;
  const payload = await response.json().catch(() => null);
  const detail = payload && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
  throw new Error(`Failed to delete task: ${detail}`);
}

export async function taskFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isCloud) return fetch(path, init);
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('UNSUPPORTED_CLOUD_API');
  const method = (init.method || 'GET').toUpperCase();
  if (url.pathname === '/api/tasks') {
    if (method === 'GET') return authorizedCloudFetch('/api/v1/tasks', init);
    if (method === 'POST' && url.searchParams.get('create') === 'true')
      return authorizedCloudFetch('/api/v1/tasks', init);
    if (method === 'POST' && url.searchParams.get('update') === 'true') {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      if (typeof body?.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(body.id)) throw new Error('INVALID_TASK_ID');
      return authorizedCloudFetch('/api/v1/tasks/' + encodeURIComponent(body.id), { ...init, method: 'PUT' });
    }
  }
  const match = /^\/api\/tasks\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
  if (match && method === 'DELETE')
    return authorizedCloudFetch('/api/v1/tasks/' + encodeURIComponent(match[1]), init);
  throw new Error('UNSUPPORTED_CLOUD_TASK_API');
}
// The legacy EventSource endpoint authenticates with self-hosted cookies.
// Cloud has no tenant-scoped Task stream yet and must never open it.
export function localTaskStreamUrl(taskId: string | undefined, cloudMode: boolean = isCloud): string | null {
  if (cloudMode || !taskId || taskId.startsWith('new_')) return null;
  return `/api/tasks/${encodeURIComponent(taskId)}/stream`;
}
export function requireLocalExecution(): void {
  if (isCloud) throw new Error('CLOUD_EXECUTIONS_NOT_AVAILABLE');
}

/** Self-hosted Baserow credential management must not pretend a rejected write succeeded.
 * Cloud's credential API has a different secret contract and is not wired to this editor yet. */
export async function createBaserowCredentialRequest(input: { name: string; baseUrl: string; token: string }): Promise<import('../types').Credential> {
  if (isCloud) throw new Error('Cloud Baserow credential management is not available yet');
  const response = await fetch('/api/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name, provider: 'baserow', config: { baseUrl: input.baseUrl, token: input.token } })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error('Failed to save credential: ' + (typeof data?.error === 'string' ? data.error : 'HTTP ' + response.status));
  if (!data || typeof data.id !== 'string') throw new Error('Invalid credential response');
  return data as import('../types').Credential;
}

export async function deleteBaserowCredentialRequest(id: string): Promise<void> {
  if (isCloud) throw new Error('Cloud Baserow credential management is not available yet');
  const response = await fetch('/api/credentials/' + encodeURIComponent(id), { method: 'DELETE' });
  if (response.ok) return;
  const data = await response.json().catch(() => null);
  throw new Error('Failed to delete credential: ' + (typeof data?.error === 'string' ? data.error : 'HTTP ' + response.status));
}
