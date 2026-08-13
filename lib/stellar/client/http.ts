/** Shared fetch-and-parse helper for all client-side calls into Ferry's own `/api/*` routes. */
export async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}
