import { isCloud, cloudAuth } from './runtime';
// Self-hosted requests are unchanged. Cloud requests never send local session cookies.
export async function authorizedCloudFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isCloud) throw new Error('CLOUD_ONLY');
  const token = await cloudAuth().getAccessToken();
  if (!token) throw new Error('CLOUD_AUTH_REQUIRED');
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + token);
  return fetch(path, { ...init, headers, credentials: 'omit', redirect: 'error' });
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
