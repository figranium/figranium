/**
 * Figpick editor bridge. The extension must acknowledge the request before the
 * editor switches away from the existing browser. This keeps stable and
 * unsupported browsers on the existing headful path.
 *
 * No cookies, API keys or browser state are sent through window messages.
 */
export type FigpickAction = 'open' | 'pick';
export interface FigpickRequest {
  kind: FigpickAction;
  requestId: string;
  taskId: string;
  targetUrl: string;
  fieldId?: string;
}
export async function requestFigpick(input: Omit<FigpickRequest, 'requestId'>, timeoutMs = 900): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  const requestId = crypto.randomUUID().replace(/-/g, '');
  const request: FigpickRequest = { ...input, requestId };
  return new Promise(resolve => {
    let settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(accepted);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.type !== 'figpick:ack' || event.data?.requestId !== requestId) return;
      finish(event.data.accepted === true);
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'figpick:request', ...request }, window.location.origin);
  });
}
