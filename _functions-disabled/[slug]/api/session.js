import { requireIdentity, AuthError } from '../../_lib/auth.js';
import { json } from '../../_lib/http.js';
import { validSlug } from '../../_lib/validation.js';
import { authorizeWorkspace, activateInvite } from '../../_lib/workspace.js';

export async function onRequestGet(context) {
  try {
    const slug = String(context.params.slug || '').toLowerCase();
    if (!validSlug(slug)) return json({ error: 'Invalid workspace slug.' }, 400);
    const identity = await requireIdentity(context.request, context.env);
    let access = await authorizeWorkspace(context.env.CAREPLAN_DB, slug, identity.email);
    if (!access) return json({ error: 'You are not a member of this workspace.' }, 403);
    const workspace = await context.env.CAREPLAN_DB.prepare('SELECT slug FROM workspaces WHERE slug=?1').bind(slug).first();
    if (workspace && access.source === 'invite') access = await activateInvite(context.env.CAREPLAN_DB, slug, identity.email, access.role);
    return json({ authenticated: true, email: identity.email, role: access.role, workspace: slug, initialized: Boolean(workspace) });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return json({ error: error.message || 'Session unavailable.' }, status);
  }
}
