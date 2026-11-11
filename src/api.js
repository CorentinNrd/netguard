async function request(path, options) {
  let res;
  try {
    res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  } catch {
    throw new Error('Serveur injoignable. Vérifiez que « npm run dev » tourne toujours.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  del: (path) => request(path, { method: 'DELETE' }),
};
