import { requireIdentity, AuthError } from '../../../_lib/auth.js';
import { json, assertSameOrigin } from '../../../_lib/http.js';
import { decryptBytes } from '../../../_lib/crypto.js';
import { validSlug, validMediaId, safeAuditMetadata } from '../../../_lib/validation.js';
import { authorizeWorkspace, activateInvite } from '../../../_lib/workspace.js';

function now() { return new Date().toISOString(); }
function errorResponse(error) {
  const status = Number(error?.status || (error instanceof AuthError ? error.status : 500));
  const requestId = crypto.randomUUID();
  if (status >= 500) console.error('careplan_media_error', { requestId, name: error?.name || 'Error', message: error?.message || 'Unknown error' });
  const message = status >= 500 ? 'Media service unavailable. Retry later or contact support with the request ID.' : (error?.message || 'Request rejected.');
  return json({ error: message, requestId }, status, { 'X-Request-ID': requestId });
}
async function accessContext(context) {
  const slug = String(context.params.slug || '').toLowerCase();
  const id = String(context.params.id || '');
  if (!validSlug(slug) || !validMediaId(id)) throw Object.assign(new Error('Invalid media request.'), { status: 400 });
  if (!context.env.CAREPLAN_MEDIA) throw Object.assign(new Error('Private media storage is not configured.'), { status: 503 });
  const identity = await requireIdentity(context.request, context.env);
  const access = await authorizeWorkspace(context.env.CAREPLAN_DB, slug, identity.email);
  if (!access) throw Object.assign(new Error('You are not a member of this workspace.'), { status: 403 });
  return { slug, id, identity, access };
}
async function mediaRow(db, slug, id) {
  return db.prepare(`
    SELECT object_key,thumbnail_key,file_name,content_type,kind,size_bytes,thumbnail_content_type,
           encryption_format,key_id,iv_b64,thumbnail_iv_b64,created_at
    FROM media_assets WHERE workspace_slug=?1 AND id=?2
  `).bind(slug, id).first();
}

export async function onRequestGet(context) {
  try {
    const { slug, id, identity, access } = await accessContext(context);
    const row = await mediaRow(context.env.CAREPLAN_DB, slug, id);
    if (!row) return json({ error: 'Media not found.' }, 404, { 'X-CarePlan-Role': access.role });
    if (access.source === 'invite') await activateInvite(context.env.CAREPLAN_DB, slug, identity.email, access.role);
    const thumbnail = new URL(context.request.url).searchParams.get('thumbnail') === '1';
    const key = thumbnail ? row.thumbnail_key : row.object_key;
    if (!key) return json({ error: 'Thumbnail not available.' }, 404, { 'X-CarePlan-Role': access.role });
    const object = await context.env.CAREPLAN_MEDIA.get(key);
    if (!object) throw Object.assign(new Error('Stored media object is missing.'), { status: 500 });
    const ciphertext = new Uint8Array(await object.arrayBuffer());
    const plaintext = await decryptBytes(ciphertext, `${slug}:${id}:${thumbnail ? 'thumbnail' : 'original'}`, {
      format: row.encryption_format,
      kid: row.key_id,
      iv: thumbnail ? row.thumbnail_iv_b64 : row.iv_b64
    }, context.env);
    const type = thumbnail ? row.thumbnail_content_type : row.content_type;
    return new Response(plaintext, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': type || 'application/octet-stream',
        'Content-Length': String(plaintext.byteLength),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(thumbnail ? `${row.file_name}-thumbnail` : row.file_name)}`,
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-CarePlan-Media-Kind': row.kind,
        'X-CarePlan-Media-Name': encodeURIComponent(row.file_name),
        'X-CarePlan-Role': access.role,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
      }
    });
  } catch (error) { return errorResponse(error); }
}

export async function onRequestDelete(context) {
  try {
    if (!assertSameOrigin(context.request, context.env)) return json({ error: 'Cross-origin writes are not allowed.' }, 403);
    if (!String(context.request.headers.get('x-careplan-client') || '').startsWith('web-')) return json({ error: 'Missing CarePlan client header.' }, 400);
    const { slug, id, identity, access } = await accessContext(context);
    if (!['owner', 'editor'].includes(access.role)) return json({ error: 'This workspace role is read-only.' }, 403, { 'X-CarePlan-Role': access.role });
    const row = await mediaRow(context.env.CAREPLAN_DB, slug, id);
    if (!row) return json({ ok: true, deleted: false }, 200, { 'X-CarePlan-Role': access.role });
    if (access.source === 'invite') await activateInvite(context.env.CAREPLAN_DB, slug, identity.email, access.role);
    const timestamp = now();
    await context.env.CAREPLAN_DB.batch([
      context.env.CAREPLAN_DB.prepare('DELETE FROM media_assets WHERE workspace_slug=?1 AND id=?2').bind(slug, id),
      context.env.CAREPLAN_DB.prepare(
        'INSERT INTO audit_log(id,workspace_slug,actor_email,action,occurred_at,etag,metadata_json) VALUES(?1,?2,?3,?4,?5,NULL,?6)'
      ).bind(crypto.randomUUID(), slug, identity.email, 'media.delete', timestamp, safeAuditMetadata(context.request, access.role, 0, { mediaId: id, kind: row.kind }))
    ]);
    await context.env.CAREPLAN_MEDIA.delete(row.object_key);
    if (row.thumbnail_key) await context.env.CAREPLAN_MEDIA.delete(row.thumbnail_key);
    return json({ ok: true, deleted: true }, 200, { 'X-CarePlan-Role': access.role });
  } catch (error) { return errorResponse(error); }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  return new Response(null, { status: 405, headers: { Allow: 'GET, DELETE' } });
}
