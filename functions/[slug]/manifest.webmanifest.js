import { validSlug } from '../_lib/validation.js';

export async function onRequestGet(context) {
  const slug = String(context.params.slug || '').toLowerCase();
  if (!validSlug(slug)) {
    return new Response(JSON.stringify({ error: 'Invalid workspace.' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
  const manifest = {
    name: 'CarePlan · Specialcare',
    short_name: 'CarePlan',
    id: `/${slug}`,
    start_url: `/${slug}`,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#FAF6EF',
    theme_color: '#7B1C30',
    description: 'Private mobile-first care planning, records, media and emergency handover workspace.',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
  };
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
    }
  });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response(null, { status: 405, headers: { Allow: 'GET' } });
}
