const WORKSPACE_FORMAT = 'careplan-server-encrypted';
const BINARY_FORMAT = 'careplan-binary-encrypted';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes) {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(text);
}

export function base64ToBytes(value) {
  const raw = atob(String(value || '').trim());
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function importAesKey(secret) {
  if (!secret) throw Object.assign(new Error('Data encryption key is not configured.'), { status: 503 });
  let raw;
  try { raw = base64ToBytes(secret); } catch { throw Object.assign(new Error('Data encryption key is invalid.'), { status: 503 }); }
  if (raw.byteLength !== 32) throw Object.assign(new Error('Data encryption key must decode to 32 bytes.'), { status: 503 });
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function secretForKid(kid, env) {
  const currentId = String(env.DATA_ENCRYPTION_KEY_ID || 'primary');
  if (kid === currentId) return env.DATA_ENCRYPTION_KEY;
  const previousId = String(env.DATA_ENCRYPTION_KEY_PREVIOUS_ID || '');
  if (previousId && kid === previousId) return env.DATA_ENCRYPTION_KEY_PREVIOUS;
  throw Object.assign(new Error('No decryption key is available for this record.'), { status: 503 });
}

export async function encryptWorkspace(plaintext, slug, env) {
  const key = await importAesKey(env.DATA_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(String(slug)) },
    key,
    encoder.encode(String(plaintext))
  ));
  return JSON.stringify({
    format: WORKSPACE_FORMAT,
    version: 1,
    kid: String(env.DATA_ENCRYPTION_KEY_ID || 'primary'),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(encrypted)
  });
}

export async function decryptWorkspace(stored, slug, env) {
  let envelope;
  try { envelope = JSON.parse(String(stored)); } catch { throw Object.assign(new Error('Stored workspace is unreadable.'), { status: 500 }); }
  if (envelope?.app === 'careplan-pro') return String(stored);
  if (envelope?.format !== WORKSPACE_FORMAT || envelope?.version !== 1) throw Object.assign(new Error('Stored workspace encryption format is unsupported.'), { status: 500 });
  const key = await importAesKey(secretForKid(envelope.kid, env));
  const iv = base64ToBytes(envelope.iv);
  if (iv.byteLength !== 12) throw Object.assign(new Error('Stored workspace encryption metadata is invalid.'), { status: 500 });
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(String(slug)) },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return decoder.decode(decrypted);
  } catch {
    throw Object.assign(new Error('Stored workspace could not be decrypted.'), { status: 500 });
  }
}

export async function encryptBytes(input, aad, env) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const key = await importAesKey(env.DATA_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(String(aad)) },
    key,
    bytes
  ));
  return {
    format: BINARY_FORMAT,
    version: 1,
    kid: String(env.DATA_ENCRYPTION_KEY_ID || 'primary'),
    iv: bytesToBase64(iv),
    ciphertext
  };
}

export async function decryptBytes(ciphertext, aad, metadata, env) {
  if (metadata?.format && metadata.format !== BINARY_FORMAT) throw Object.assign(new Error('Stored media encryption format is unsupported.'), { status: 500 });
  const iv = base64ToBytes(metadata?.iv);
  if (iv.byteLength !== 12) throw Object.assign(new Error('Stored media encryption metadata is invalid.'), { status: 500 });
  const key = await importAesKey(secretForKid(String(metadata?.kid || ''), env));
  try {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(String(aad)) },
      key,
      ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext)
    ));
  } catch {
    throw Object.assign(new Error('Stored media could not be decrypted.'), { status: 500 });
  }
}
