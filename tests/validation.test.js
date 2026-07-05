import { describe, expect, it } from 'vitest';
import {
  validSlug, validMediaId, allowedMediaType, matchesMediaSignature, validateWorkspaceEnvelope,
  MAX_BODY_BYTES, MAX_MEDIA_IMAGE_BYTES, MAX_MEDIA_VIDEO_BYTES
} from '../functions/_lib/validation.js';
import { makeEtag } from '../functions/_lib/etag.js';
import { encryptWorkspace, decryptWorkspace, encryptBytes, decryptBytes } from '../functions/_lib/crypto.js';
import { assertSameOrigin } from '../functions/_lib/http.js';

const workspace = {
  patient: {}, caregivers: [], hospitals: [], routines: [], therapies: [],
  meals: { Monday: [], Tuesday: [] }, medications: [], appointments: [], logs: []
};
const valid = { app: 'careplan-pro', schemaVersion: 98, pageSlug: 'family-one', updatedAt: Date.now(), workspace };

describe('v9.8 workspace validation', () => {
  it('accepts the production envelope', () => {
    expect(validateWorkspaceEnvelope(valid, 'family-one')).toEqual({ ok: true, errors: [] });
  });
  it('rejects slug mismatch and malformed workspace arrays', () => {
    const bad = structuredClone(valid);
    bad.pageSlug = 'other';
    bad.workspace.medications = {};
    const result = validateWorkspaceEnvelope(bad, 'family-one');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/slug|medications/i);
  });
  it('rejects unsafe keys', () => {
    const raw = JSON.parse('{"app":"careplan-pro","schemaVersion":98,"workspace":{"__proto__":{},"patient":{},"caregivers":[],"hospitals":[],"routines":[],"therapies":[],"meals":{},"medications":[],"appointments":[],"logs":[]}}');
    expect(validateWorkspaceEnvelope(raw, 'family-one').ok).toBe(false);
  });
  it('validates safe workspace and media identifiers and limits', () => {
    expect(validSlug('family-one')).toBe(true);
    expect(validSlug('../admin')).toBe(false);
    expect(validMediaId('media_123456')).toBe(true);
    expect(validMediaId('../secret')).toBe(false);
    expect(allowedMediaType('image/jpeg', 'image')).toBe(true);
    expect(allowedMediaType('text/html', 'image')).toBe(false);
    expect(matchesMediaSignature(Uint8Array.from([137,80,78,71,13,10,26,10]), 'image/png')).toBe(true);
    expect(matchesMediaSignature(new TextEncoder().encode('<html>'), 'image/png')).toBe(false);
    expect(MAX_BODY_BYTES).toBe(4_000_000);
    expect(MAX_MEDIA_IMAGE_BYTES).toBe(8_000_000);
    expect(MAX_MEDIA_VIDEO_BYTES).toBe(25_000_000);
  });
});

describe('ETag and server encryption', () => {
  const env = { DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), DATA_ENCRYPTION_KEY_ID: 'test-key' };
  it('creates deterministic content ETags', async () => {
    const first = await makeEtag('{"a":1}');
    expect(first).toBe(await makeEtag('{"a":1}'));
    expect(first).not.toBe(await makeEtag('{"a":2}'));
  });
  it('encrypts workspace JSON and binds it to the slug', async () => {
    const plaintext = JSON.stringify(valid);
    const stored = await encryptWorkspace(plaintext, 'family-one', env);
    expect(stored).not.toContain('family-one');
    expect(await decryptWorkspace(stored, 'family-one', env)).toBe(plaintext);
    await expect(decryptWorkspace(stored, 'other-family', env)).rejects.toThrow(/could not be decrypted/i);
  });
  it('encrypts binary media and binds it to workspace, media ID and variant', async () => {
    const source = new TextEncoder().encode('private image bytes');
    const encrypted = await encryptBytes(source, 'family-one:media_123456:original', env);
    expect(new TextDecoder().decode(encrypted.ciphertext)).not.toContain('private image bytes');
    const clear = await decryptBytes(encrypted.ciphertext, 'family-one:media_123456:original', encrypted, env);
    expect(new TextDecoder().decode(clear)).toBe('private image bytes');
    await expect(decryptBytes(encrypted.ciphertext, 'family-one:media_123456:thumbnail', encrypted, env)).rejects.toThrow(/could not be decrypted/i);
  });
});

describe('write-origin protection', () => {
  it('accepts same-origin writes and rejects cross-origin production writes', () => {
    expect(assertSameOrigin(new Request('https://care.example/family/api/data', { headers: { Origin: 'https://care.example', 'Sec-Fetch-Site': 'same-origin' } }), { ALLOW_LOCAL_DEV: 'false' })).toBe(true);
    expect(assertSameOrigin(new Request('https://care.example/family/api/data', { headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' } }), { ALLOW_LOCAL_DEV: 'false' })).toBe(false);
    expect(assertSameOrigin(new Request('https://care.example/family/api/data'), { ALLOW_LOCAL_DEV: 'false' })).toBe(false);
  });
});
