const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
};

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extra }
  });
}

export function empty(status = 204, extra = {}) {
  const headers = { ...SECURITY_HEADERS, ...extra };
  delete headers['Content-Type'];
  return new Response(null, { status, headers });
}

export function assertSameOrigin(request, env = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const fetchSite = String(request.headers.get('Sec-Fetch-Site') || '').toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  if (!origin) {
    return env.ALLOW_LOCAL_DEV === 'true' && ['localhost', '127.0.0.1'].includes(url.hostname);
  }
  return origin === url.origin;
}

export function normalizeEtag(value) {
  return String(value || '').trim();
}
