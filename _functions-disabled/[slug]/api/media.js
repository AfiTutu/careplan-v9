import { requireIdentity, AuthError } from '../../_lib/auth.js';
import { json, assertSameOrigin } from '../../_lib/http.js';
import { encryptBytes } from '../../_lib/crypto.js';
import {
  MAX_MEDIA_IMAGE_BYTES,
  MAX_MEDIA_VIDEO_BYTES,
  MAX_MEDIA_THUMBNAIL_BYTES,
  validSlug,
  validMediaId,
  allowedMediaType,
  matchesMediaSignature,
  safeAuditMetadata
} from '../../_lib/validation.js';
import { authorizeWorkspace, activateInvite } from '../../_lib/workspace.js';

function now() { return new Date().toISOString(); }
function auditId() { return crypto.randomUUID(); }
function cleanName(value) {
  const name = String(value || 'attachment').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
  return name || 'attachment';
}
function errorResponse(error) {
  const status = Number(error?.status || (error instanceof AuthError ? error.status : 500));
  const requestId = crypto.randomUUID();
  if (status >= 500) console.error('careplan_media_error', { requestId, name: error?.name || 'Error', message: error?.message || 'Unknown error' });
  const message = status >= 500 ? 'Media service unavailable. Retry later or contact support with the request ID.' : (error?.message || 'Request rejected.');
  return json({ error: message, requestId }, status, { 'X-Request-ID': requestId });
}
async function accessContext(context) {
  const slug = String(context.params.slug || '').toLowerCase();
  if (!validSlug(slug)) throw Object.assign(new Error('Invalid workspace slug.'), { status: 400 });
  if (!context.env.CAREPLAN_MEDIA) throw Object.assign(new Error('Private media storage is not configured.'), { status: 503 });
  const identity = await requireIdentity(context.request, context.env);
  const access = await authorizeWorkspace(context.env.CAREPLAN_DB, slug, identity.email);
  if (!access) throw Object.assign(new Error('You are not a member of this workspace.'), { status: 403 });
  return { slug, identity, access };
}

export async function onRequestPost(context) {
  try {
    if (!assertSameOrigin(context.request, context.env)) return json({ error: 'Cross-origin writes are not allowed.' }, 403);
    if (!String(context.request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) return json({ error: 'Content-Type must be multipart/form-data.' }, 415);
    if (!String(context.request.headers.get('x-careplan-client') || '').startsWith('web-')) return json({ error: 'Missing CarePlan client header.' }, 400);

    const { slug, identity, access } = await accessContext(context);
    if (!['owner', 'editor'].includes(access.role)) return json({ error: 'This workspace role is read-only.' }, 403, { 'X-CarePlan-Role': access.role });
    const workspace = await context.env.CAREPLAN_DB.prepare('SELECT slug FROM workspaces WHERE slug=?1').bind(slug).first();
    if (!workspace) return json({ error: 'Initialize the workspace before uploading media.' }, 409);
    if (access.source === 'invite') await activateInvite(context.env.CAREPLAN_DB, slug, identity.email, access.role);

    const replaceAllowed = context.request.headers.get('x-careplan-media-replace') === '1';
    const form = await context.request.formData();
    const id = String(form.get('id') || '');
    const kind = String(form.get('kind') || '').toLowerCase();
    const file = form.get('file');
    const thumbnail = form.get('thumbnail');
    if (!validMediaId(id)) return json({ error: 'Invalid media ID.' }, 422);
    const previous = await context.env.CAREPLAN_DB.prepare('SELECT object_key,thumbnail_key FROM media_assets WHERE workspace_slug=?1 AND id=?2').bind(slug,id).first();
    if (previous && !replaceAllowed) return json({ error: 'A media object with this ID already exists.' }, 409);
    if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'A media file is required.' }, 422);
    if (!['image', 'video'].includes(kind) || !allowedMediaType(file.type, kind)) return json({ error: 'Unsupported media type.' }, 415);
    const limit = kind === 'video' ? MAX_MEDIA_VIDEO_BYTES : MAX_MEDIA_IMAGE_BYTES;
    if (Number(file.size || 0) < 1 || Number(file.size) > limit) return json({ error: `${kind === 'video' ? 'Video' : 'Image'} exceeds the allowed size.` }, 413);

    let thumbBytes = null;
    let thumbType = null;
    if (thumbnail && typeof thumbnail.arrayBuffer === 'function' && Number(thumbnail.size || 0) > 0) {
      thumbType = String(thumbnail.type || '').toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(thumbType)) return json({ error: 'Unsupported thumbnail type.' }, 415);
      if (Number(thumbnail.size) > MAX_MEDIA_THUMBNAIL_BYTES) return json({ error: 'Thumbnail exceeds the allowed size.' }, 413);
      thumbBytes = new Uint8Array(await thumbnail.arrayBuffer());
      if (!matchesMediaSignature(thumbBytes, thumbType)) return json({ error: 'Thumbnail content does not match its declared type.' }, 415);
    }

    const originalBytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesMediaSignature(originalBytes, file.type)) return json({ error: 'File content does not match its declared media type.' }, 415);
    const objectKey = `${slug}/${id}/original.enc`;
    const thumbnailKey = thumbBytes ? `${slug}/${id}/thumbnail.enc` : null;
    const original = await encryptBytes(originalBytes, `${slug}:${id}:original`, context.env);
    const encryptedThumb = thumbBytes ? await encryptBytes(thumbBytes, `${slug}:${id}:thumbnail`, context.env) : null;

    await context.env.CAREPLAN_MEDIA.put(objectKey, original.ciphertext, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { format: original.format, version: String(original.version), kid: original.kid, iv: original.iv }
    });
    if (encryptedThumb) {
      await context.env.CAREPLAN_MEDIA.put(thumbnailKey, encryptedThumb.ciphertext, {
        httpMetadata: { contentType: 'application/octet-stream' },
        customMetadata: { format: encryptedThumb.format, version: String(encryptedThumb.version), kid: encryptedThumb.kid, iv: encryptedThumb.iv }
      });
    }

    const createdAt = now();
    try {
      await context.env.CAREPLAN_DB.batch([
        context.env.CAREPLAN_DB.prepare(`
          INSERT INTO media_assets(
            workspace_slug,id,object_key,thumbnail_key,file_name,content_type,kind,size_bytes,
            thumbnail_content_type,encryption_format,key_id,iv_b64,thumbnail_iv_b64,created_at,created_by
          ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
          ON CONFLICT(workspace_slug,id) DO UPDATE SET
            object_key=excluded.object_key,thumbnail_key=excluded.thumbnail_key,file_name=excluded.file_name,
            content_type=excluded.content_type,kind=excluded.kind,size_bytes=excluded.size_bytes,
            thumbnail_content_type=excluded.thumbnail_content_type,encryption_format=excluded.encryption_format,
            key_id=excluded.key_id,iv_b64=excluded.iv_b64,thumbnail_iv_b64=excluded.thumbnail_iv_b64,
            created_at=excluded.created_at,created_by=excluded.created_by
        `).bind(
          slug, id, objectKey, thumbnailKey, cleanName(form.get('name') || file.name), file.type, kind, Number(file.size),
          thumbType, original.format, original.kid, original.iv, encryptedThumb?.iv || null, createdAt, identity.email
        ),
        context.env.CAREPLAN_DB.prepare(
          'INSERT INTO audit_log(id,workspace_slug,actor_email,action,occurred_at,etag,metadata_json) VALUES(?1,?2,?3,?4,?5,NULL,?6)'
        ).bind(auditId(), slug, identity.email, 'media.upload', createdAt, safeAuditMetadata(context.request, access.role, Number(file.size), { mediaId: id, kind }))
      ]);
    } catch (error) {
      await context.env.CAREPLAN_MEDIA.delete(objectKey);
      if (thumbnailKey) await context.env.CAREPLAN_MEDIA.delete(thumbnailKey);
      throw error;
    }

    if (previous?.thumbnail_key && previous.thumbnail_key !== thumbnailKey) await context.env.CAREPLAN_MEDIA.delete(previous.thumbnail_key);

    return json({
      id,
      name: cleanName(form.get('name') || file.name),
      type: file.type,
      kind,
      size: Number(file.size),
      createdAt,
      url: `/${slug}/api/media/${encodeURIComponent(id)}`,
      thumbnailUrl: thumbnailKey ? `/${slug}/api/media/${encodeURIComponent(id)}?thumbnail=1` : null
    }, 201, { 'X-CarePlan-Role': access.role });
  } catch (error) { return errorResponse(error); }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
