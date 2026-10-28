export async function apiFetch<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';
  const { json, ...request } = options;
  const headers = new Headers(request.headers); headers.set('x-user-id', 'local-user');
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${base}${path}`, { ...request, headers, body: json === undefined ? request.body : JSON.stringify(json), signal: request.signal ?? AbortSignal.timeout(10000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Sincronizzazione non disponibile (${response.status})`);
  return response.status === 204 ? undefined as T : response.json();
}
