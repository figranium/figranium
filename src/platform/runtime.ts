// The default remains self-hosted. Cloud must opt in at build time.
export const isCloud = import.meta.env.VITE_FIGRANIUM_DEPLOYMENT === 'cloud';
export type CloudIdentity = { id: string; name: string; email: string };
export interface CloudAuthAdapter {
  getIdentity(): Promise<CloudIdentity | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}
declare global { interface Window { __FIGRANIUM_CLOUD_AUTH__?: CloudAuthAdapter } }
export function cloudAuth(): CloudAuthAdapter {
  const provider = window.__FIGRANIUM_CLOUD_AUTH__;
  if (!isCloud || !provider) throw new Error('CLOUD_AUTH_NOT_CONFIGURED');
  return provider;
}
