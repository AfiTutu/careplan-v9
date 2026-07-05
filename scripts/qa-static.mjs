import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('public/index.html');
const css = read('public/app.css');
const js = read('public/app.js');
const failures = [];
const pass = (condition, message) => { if (!condition) failures.push(message); };

pass(html.includes('<title>CarePlan · Specialcare</title>'), 'Approved CarePlan · Specialcare title is missing.');
pass(html.includes('data-app-version="9.8.0"'), 'Frontend version is not 9.8.0.');
pass(!html.includes('Standalone preview'), 'Standalone preview ribbon remains in production HTML.');
pass(html.includes('href="/app.css"'), 'External app.css reference is missing.');
pass(/src="\/app\.js"/.test(html), 'External app.js reference is missing.');
pass(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html), 'Unexpected inline script found.');
pass(!/(src|href)=["']https?:\/\//i.test(html), 'External asset URL found in app HTML.');

// Five explicitly approved final fixes.
pass(css.includes('.v98-meal-date'), 'Meal day-card date layout fix is missing.');
pass(css.includes('#sosScroll .contact-row'), 'Emergency-contact card styling is missing.');
pass(js.includes('data-v98-delete-link') && js.indexOf('data-v98-delete-link') < js.indexOf('data-v97-edit-link'), 'External-link Delete button is not placed before Edit.');
pass(js.includes('async function v98PrintMediaHtml') && js.includes('await v98PrintMediaHtml(x.attachments||[])'), 'Calendar print-media inclusion is missing.');
pass(js.includes('async function v96PrintCareSchedule') && js.includes('await v98PrintMediaHtml(r.attachments||[])'), 'Care print-media inclusion is missing.');
pass(/function v97PageHead\([^)]*\)\{\s*return `<div class="v94-page-head"><div><h1>/.test(js), 'Repeated CarePlan eyebrow was not removed from page headlines.');

// Production architecture.
for (const required of [
  'public/_headers', 'public/manifest.webmanifest', 'public/sw.js', 'public/icon.svg',
  'functions/[slug]/api/data.js', 'functions/[slug]/api/session.js',
  'functions/[slug]/api/media.js', 'functions/[slug]/api/media/[id].js',
  'functions/[slug]/manifest.webmanifest.js', 'migrations/0001_initial.sql', 'migrations/0002_media.sql',
  'wrangler.jsonc', 'README.md', 'SECURITY.md', 'RELEASE-CHECKLIST.md'
]) pass(fs.existsSync(path.join(root, required)), `Required production file is missing: ${required}`);
pass(js.includes("schemaVersion:98"), 'v9.8 cloud envelope is missing.');
pass(js.includes('careplan-encrypted-backup-v2'), 'Password-encrypted complete backup is missing.');
pass(js.includes("navigator.serviceWorker.register('/sw.js'"), 'PWA service-worker registration is missing.');
pass(read('wrangler.jsonc').includes('CAREPLAN_MEDIA'), 'Private R2 media binding is missing.');
pass(read('migrations/0002_media.sql').includes('media_assets'), 'Media metadata migration is missing.');

const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
pass(duplicates.length === 0, `Duplicate static IDs: ${duplicates.join(', ')}`);

const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'public/app.js')], { encoding: 'utf8' });
pass(syntax.status === 0, `Application JavaScript syntax error: ${syntax.stderr}`);
for (const fn of ['functions/[slug]/api/data.js', 'functions/[slug]/api/media.js', 'functions/[slug]/api/media/[id].js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, fn)], { encoding: 'utf8' });
  pass(result.status === 0, `${fn} syntax error: ${result.stderr}`);
}

if (failures.length) {
  console.error(`Static QA failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Static QA passed: ${ids.length} unique static IDs; approved five-fix scope and production architecture present.`);
