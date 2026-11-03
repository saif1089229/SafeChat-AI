const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(typeof body.detail === 'string' ? body.detail : 'Request failed. Please try again.');
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
