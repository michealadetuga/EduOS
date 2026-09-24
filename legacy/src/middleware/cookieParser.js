/**
 * Cookie parsing middleware for Express
 * Extracts cookies from request headers and makes them available in req.cookies
 */

const SESSION_COOKIE = 'eduos_session';

/**
 * Parse cookies from the Cookie header
 * @param {string} header - The Cookie header value
 * @returns {Object} Parsed cookies as key-value pairs
 */
function parseCookies(header) {
  if (!header) return {};
  
  const cookies = {};
  const parts = header.split(';');
  
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const key = part.slice(0, idx).trim();
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      cookies[key] = value;
    }
  }
  
  return cookies;
}

/**
 * Set up cookie parsing middleware for the Express app
 * @param {import('express').Express} app - The Express application
 */
function setupCookieParser(app) {
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    next();
  });
}

/**
 * Set a session cookie with appropriate security flags
 * @param {import('express').Response} res - The response object
 * @param {string} token - The session token
 */
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
  );
}

/**
 * Clear the session cookie
 * @param {import('express').Response} res - The response object
 */
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}

// Session configuration
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

module.exports = {
  parseCookies,
  setupCookieParser,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  SESSION_TTL_MS,
};
