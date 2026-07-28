import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksByIssuer = new Map();

function getJwks(issuer) {
  if (!jwksByIssuer.has(issuer)) {
    jwksByIssuer.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, '')}/cdn-cgi/access/certs`))
    );
  }
  return jwksByIssuer.get(issuer);
}

export async function requireIdentity(request, env) {
  const host = new URL(request.url).hostname;
  if (env.ALLOW_LOCAL_DEV === 'true' && ['localhost', '127.0.0.1'].includes(host)) {
    return { email: String(env.LOCAL_DEV_EMAIL || 'developer@local.invalid').toLowerCase(), subject: 'local-dev' };
  }

  const issuer = String(env.TEAM_DOMAIN || '').replace(/\/$/, '');
  const audience = String(env.POLICY_AUD || '');
  if (!issuer || !audience || issuer.includes('REPLACE_WITH_') || audience.includes('REPLACE_WITH_')) {
    throw new AuthError(503, 'Cloudflare Access is not configured.');
  }

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new AuthError(401, 'Authentication required.');

  try {
    const { payload } = await jwtVerify(token, getJwks(issuer), {
      issuer,
      audience,
      algorithms: ['RS256']
    });
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) throw new AuthError(403, 'Authenticated identity has no usable email claim.');
    return { email, subject: String(payload.sub || ''), payload };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, 'Invalid or expired Cloudflare Access session.');
  }
}

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
