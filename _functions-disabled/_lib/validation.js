export const MAX_BODY_BYTES = 4_000_000;
export const MAX_MEDIA_IMAGE_BYTES = 8_000_000;
export const MAX_MEDIA_VIDEO_BYTES = 25_000_000;
export const MAX_MEDIA_THUMBNAIL_BYTES = 1_500_000;
export const MAX_PATIENTS = 25;

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export function validSlug(value) {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(value || ''));
}

export function validMediaId(value) {
  return /^[A-Za-z0-9_-]{6,80}$/.test(String(value || ''));
}

export function allowedMediaType(type, kind) {
  const mime = String(type || '').toLowerCase();
  if (kind === 'image') return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime);
  if (kind === 'video') return ['video/mp4', 'video/webm', 'video/quicktime'].includes(mime);
  return false;
}

export function matchesMediaSignature(bytes, type) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const mime = String(type || '').toLowerCase();
  const ascii = (start, length) => String.fromCharCode(...b.slice(start, start + length));
  if (mime === 'image/png') return b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v);
  if (mime === 'image/jpeg') return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/gif') return b.length >= 6 && ['GIF87a','GIF89a'].includes(ascii(0,6));
  if (mime === 'image/webp') return b.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP';
  if (mime === 'video/webm') return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  if (mime === 'video/mp4' || mime === 'video/quicktime') return b.length >= 12 && ascii(4,4) === 'ftyp';
  return false;
}

function hasForbiddenKey(value, depth = 0) {
  if (depth > 40 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => hasForbiddenKey(item, depth + 1));
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key) || hasForbiddenKey(child, depth + 1)) return true;
  }
  return false;
}

function validateV98(data, slug, errors) {
  if (Number(data.schemaVersion) < 90 || Number(data.schemaVersion) > 150) errors.push('Unsupported schema version.');
  if (data.pageSlug && data.pageSlug !== slug) errors.push('Workspace slug does not match the requested URL.');
  if (!data.workspace || typeof data.workspace !== 'object' || Array.isArray(data.workspace)) {
    errors.push('workspace must be an object.');
    return;
  }
  const workspace = data.workspace;
  if (!workspace.patient || typeof workspace.patient !== 'object' || Array.isArray(workspace.patient)) errors.push('workspace.patient must be an object.');
  if (!Array.isArray(workspace.caregivers)) errors.push('workspace.caregivers must be an array.');
  if (!Array.isArray(workspace.hospitals)) errors.push('workspace.hospitals must be an array.');
  if (!Array.isArray(workspace.routines)) errors.push('workspace.routines must be an array.');
  if (!Array.isArray(workspace.therapies)) errors.push('workspace.therapies must be an array.');
  if ((!workspace.meals || typeof workspace.meals !== 'object' || Array.isArray(workspace.meals)) && !Array.isArray(workspace.mealAssignments)) errors.push('workspace meals schedule is invalid.');
  if (!Array.isArray(workspace.medications)) errors.push('workspace.medications must be an array.');
  if (!Array.isArray(workspace.appointments)) errors.push('workspace.appointments must be an array.');
  if (!Array.isArray(workspace.logs)) errors.push('workspace.logs must be an array.');
  if (Array.isArray(workspace.caregivers) && workspace.caregivers.length > 100) errors.push('Too many caregiver records.');
  if (Array.isArray(workspace.hospitals) && workspace.hospitals.length > 100) errors.push('Too many hospital records.');
  for (const key of ['routines', 'therapies', 'medications', 'appointments', 'logs']) {
    if (Array.isArray(workspace[key]) && workspace[key].length > 20_000) errors.push(`Too many ${key} records.`);
  }
}

function validateLegacy(data, slug, errors) {
  if (!Number.isInteger(Number(data?.schemaVersion)) || Number(data.schemaVersion) < 1 || Number(data.schemaVersion) > 50) errors.push('Unsupported schema version.');
  if (!Array.isArray(data?.patients) || data.patients.length < 1 || data.patients.length > MAX_PATIENTS) errors.push(`patients must contain 1-${MAX_PATIENTS} records.`);
  if (!data?.caregiver || typeof data.caregiver !== 'object' || Array.isArray(data.caregiver)) errors.push('caregiver must be an object.');
  if (data?.pageSlug && data.pageSlug !== slug) errors.push('Workspace slug does not match the requested URL.');
  if (Array.isArray(data?.patients)) {
    for (const patient of data.patients) {
      if (!patient || typeof patient !== 'object' || Array.isArray(patient)) { errors.push('Each patient must be an object.'); break; }
      if (!patient.childProfile || typeof patient.childProfile !== 'object') { errors.push('Each patient requires childProfile.'); break; }
      if (!patient.tasks || typeof patient.tasks !== 'object') { errors.push('Each patient requires tasks.'); break; }
    }
  }
}

export function validateWorkspaceEnvelope(data, slug) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['Payload must be a JSON object.'] };
  if (data.app !== 'careplan-pro') errors.push('Unsupported app identifier.');
  if (hasForbiddenKey(data)) errors.push('Payload contains forbidden object keys.');
  if (Object.prototype.hasOwnProperty.call(data, 'workspace')) validateV98(data, slug, errors);
  else validateLegacy(data, slug, errors);
  return { ok: errors.length === 0, errors };
}

export function safeAuditMetadata(request, role, bytes, extra = {}) {
  const ua = String(request.headers.get('user-agent') || '').slice(0, 180);
  return JSON.stringify({ role, bytes, userAgent: ua, ...extra });
}
