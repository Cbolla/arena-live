export async function api<T = { message: string }>(path: string, data?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch('/api/' + path, { method: data === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (sessionStorage.getItem('arena-token') ?? '') }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Falha no servidor'); return result;
}
