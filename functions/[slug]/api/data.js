import { requireIdentity, AuthError } from '../../_lib/auth.js';
import { json, empty, assertSameOrigin, normalizeEtag } from '../../_lib/http.js';
import { makeEtag } from '../../_lib/etag.js';
import { encryptWorkspace, decryptWorkspace } from '../../_lib/crypto.js';
import { MAX_BODY_BYTES, validSlug, validateWorkspaceEnvelope, safeAuditMetadata } from '../../_lib/validation.js';
import { authorizeWorkspace, activateInvite } from '../../_lib/workspace.js';

function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

async function contextFor(context) {
  const slug = String(context.params.slug || '').toLowerCase();
  if (!validSlug(slug)) throw Object.assign(new Error('Invalid workspace slug.'), { status: 400 });
  const identity = await requireIdentity(context.request, context.env);
  const access = await authorizeWorkspace(context.env.CAREPLAN_DB, slug, identity.email);
  if (!access) throw Object.assign(new Error('You are not a member of this workspace.'), { status: 403 });
  return { slug, identity, access };
}

function errorResponse(error) {
  const status = Number(error?.status || (error instanceof AuthError ? error.status : 500));
  const requestId = crypto.randomUUID();
  if (status >= 500) console.error('careplan_api_error', { requestId, name: error?.name || 'Error', message: error?.message || 'Unknown error' });
  const message = status >= 500 ? 'Service unavailable. Retry later or contact support with the request ID.' : (error?.message || 'Request rejected.');
  return json({ error: message, requestId }, status, { 'X-Request-ID': requestId });
}

export async function onRequestGet(context) {
  try {
    const { slug, identity, access } = await contextFor(context);
    const row = await context.env.CAREPLAN_DB.prepare(
      'SELECT data_json, etag, updated_at FROM workspaces WHERE slug = ?1'
    ).bind(slug).first();
    if (!row) return json({ error: 'Workspace has not been initialized.' }, 404, { 'X-CarePlan-Role': access.role });
    if (access.source === 'invite') await activateInvite(context.env.CAREPLAN_DB, slug, identity.email, access.role);
    const plaintext = await decryptWorkspace(row.data_json, slug, context.env);
    return new Response(plaintext, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'ETag': row.etag,
        'Last-Modified': new Date(row.updated_at).toUTCString(),
        'X-CarePlan-Role': access.role,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    });
  } catch (error) { return errorResponse(error); }
}

export async function onRequestHead(context) {
  try {
    const { slug, access } = await contextFor(context);
    const row = await context.env.CAREPLAN_DB.prepare('SELECT etag, updated_at FROM workspaces WHERE slug = ?1').bind(slug).first();
    if (!row) return empty(404, { 'X-CarePlan-Role': access.role });
    return empty(200, { 'ETag': row.etag, 'Last-Modified': new Date(row.updated_at).toUTCString(), 'X-CarePlan-Role': access.role });
  } catch (error) { return errorResponse(error); }
}

export async function onRequestPut(context) {
  try {
    if (!assertSameOrigin(context.request, context.env)) return json({ error: 'Cross-origin writes are not allowed.' }, 403);
    if (!String(context.request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Content-Type must be application/json.' }, 415);
    if (!String(context.request.headers.get('x-careplan-client') || '').startsWith('web-')) return json({ error: 'Missing CarePlan client header.' }, 400);

    const { slug, identity, access } = await contextFor(context);
    if (!['owner', 'editor'].includes(access.role)) return json({ error: 'This workspace role is read-only.' }, 403, { 'X-CarePlan-Role': access.role });

    const declared = Number(context.request.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) return json({ error: 'Workspace payload is too large.' }, 413);
    const text = await context.request.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > MAX_BODY_BYTES) return json({ error: 'Workspace payload is too large.' }, 413);

    let data;
    try { data = JSON.parse(text); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const validation = validateWorkspaceEnvelope(data, slug);
    if (!validation.ok) return json({ error: 'Workspace validation failed.', details: validation.errors }, 422);

    data.pageSlug = slug;
    data.updatedAt = Date.now();
    const normalized = JSON.stringify(data);
    const etag = await makeEtag(normalized);
    const encrypted = await encryptWorkspace(normalized, slug, context.env);
    const timestamp = now();
    const existing = await context.env.CAREPLAN_DB.prepare('SELECT etag FROM workspaces WHERE slug = ?1').bind(slug).first();
    if (existing && access.source === 'invite') await activateInvite(context.env.CAREPLAN_DB, slug, identity.email, access.role);

    if (!existing) {
      if (access.source !== 'invite') return json({ error: 'Workspace is not initialized and no valid invitation exists.' }, 409);
      await context.env.CAREPLAN_DB.batch([
        context.env.CAREPLAN_DB.prepare('INSERT INTO workspaces(slug,data_json,etag,schema_version,created_at,updated_at,updated_by) VALUES(?1,?2,?3,?4,?5,?5,?6)')
          .bind(slug, encrypted, etag, Number(data.schemaVersion), timestamp, identity.email),
        context.env.CAREPLAN_DB.prepare('INSERT INTO workspace_members(workspace_slug,email,role,created_at) VALUES(?1,?2,?3,?4)')
          .bind(slug, identity.email, access.role, timestamp),
        context.env.CAREPLAN_DB.prepare('DELETE FROM workspace_invites WHERE workspace_slug = ?1 AND email = ?2 COLLATE NOCASE')
          .bind(slug, identity.email),
        context.env.CAREPLAN_DB.prepare('INSERT INTO audit_log(id,workspace_slug,actor_email,action,occurred_at,etag,metadata_json) VALUES(?1,?2,?3,?4,?5,?6,?7)')
          .bind(id(), slug, identity.email, 'workspace.create', timestamp, etag, safeAuditMetadata(context.request, access.role, bytes))
      ]);
      return json({ ok: true, created: true, updatedAt: data.updatedAt }, 201, { 'ETag': etag, 'X-CarePlan-Role': access.role });
    }

    const ifMatch = normalizeEtag(context.request.headers.get('if-match'));
    if (!ifMatch) return json({ error: 'If-Match is required for updates. Refresh the workspace and try again.' }, 428, { 'ETag': existing.etag });
    if (ifMatch !== existing.etag) return json({ error: 'A newer cloud version exists.' }, 412, { 'ETag': existing.etag });

    const results = await context.env.CAREPLAN_DB.batch([
      context.env.CAREPLAN_DB.prepare(
        'UPDATE workspaces SET data_json=?1, etag=?2, schema_version=?3, updated_at=?4, updated_by=?5 WHERE slug=?6 AND etag=?7'
      ).bind(encrypted, etag, Number(data.schemaVersion), timestamp, identity.email, slug, ifMatch),
      context.env.CAREPLAN_DB.prepare(
        'INSERT INTO audit_log(id,workspace_slug,actor_email,action,occurred_at,etag,metadata_json) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM workspaces WHERE slug=?2 AND etag=?6)'
      ).bind(id(), slug, identity.email, 'workspace.update', timestamp, etag, safeAuditMetadata(context.request, access.role, bytes))
    ]);
    const result = results?.[0];
    if (!result?.success || Number(result.meta?.changes || 0) !== 1) return json({ error: 'A newer cloud version exists.' }, 412, { 'ETag': existing.etag });
    return json({ ok: true, updatedAt: data.updatedAt }, 200, { 'ETag': etag, 'X-CarePlan-Role': access.role });
  } catch (error) { return errorResponse(error); }
}
