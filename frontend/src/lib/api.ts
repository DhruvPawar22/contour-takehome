import { API_BASE_URL } from './firebase';

export async function postJson<T>(path: string, idToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request to ${path} failed (${res.status})`);
  }
  return data;
}
