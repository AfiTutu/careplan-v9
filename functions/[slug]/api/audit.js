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
    if (access?.source === 'invite') {
      const workspace = await context.env.CAREPLAN_DB.prepare('SELECT slug FROM workspaces WHERE slug=?1').bind(slug).first();
      if (workspace) access = await activateInvite(context.env.CAREPLAN_DB, slug, identity.email, access.role);
    }
    if (!access || access.role !== 'owner') return json({ error: 'Owner role required.' }, 403);
    const result = await context.env.CAREPLAN_DB.prepare(
      'SELECT actor_email, action, occurred_at, etag, metadata_json FROM audit_log WHERE workspace_slug=?1 ORDER BY occurred_at DESC LIMIT 200'
    ).bind(slug).all();
    return json({ workspace: slug, events: result.results || [] });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return json({ error: error.message || 'Audit log unavailable.' }, status);
  }
}
