const API_BASE = '/api';

const sqlListeners = new Set();

function decodeSqlHeader(value) {
  if (!value) return '';
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function notifySqlListeners(query) {
  if (!query) return;
  sqlListeners.forEach((listener) => listener(query));
}

export function subscribeToLastSql(listener) {
  sqlListeners.add(listener);
  return () => sqlListeners.delete(listener);
}

async function request(path, options = {}, config = {}) {
  const { exposeSql = true } = config;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (exposeSql) {
    notifySqlListeners(decodeSqlHeader(response.headers.get('X-Last-SQL-Query-B64')));
  }

  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function get(path, config) {
  return request(path, {}, config);
}

export function post(path, body, config) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  }, config);
}

export function put(path, body, config) {
  return request(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  }, config);
}

export function patch(path, body = {}, config) {
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }, config);
}

export function del(path, config) {
  return request(path, { method: 'DELETE' }, config);
}
