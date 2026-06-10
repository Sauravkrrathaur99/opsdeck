const SESSION_KEY = 'opsdeck_session';

export function getSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

export function setSessionToken(token) {
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function clearSession() {
  setSessionToken('');
}
