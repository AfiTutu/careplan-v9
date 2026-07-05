import fs from 'node:fs';

function fail(message) {
  console.error(`DEPLOY CONFIG ERROR: ${message}`);
  process.exitCode = 1;
}

const requiredEnv = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_PAGES_PROJECT',
  'CAREPLAN_D1_DATABASE_NAME',
  'CAREPLAN_R2_BUCKET_NAME'
];

for (const name of requiredEnv) {
  if (!String(process.env[name] || '').trim()) fail(`${name} is missing.`);
}

const config = JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const db = config.d1_databases?.find((item) => item.binding === 'CAREPLAN_DB');
if (!db) fail('CAREPLAN_DB binding is missing from wrangler.jsonc.');
if (!db?.database_id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(db.database_id)) {
  fail('Replace the placeholder D1 database_id in wrangler.jsonc.');
}
if (db?.database_name !== process.env.CAREPLAN_D1_DATABASE_NAME) {
  fail('CAREPLAN_D1_DATABASE_NAME does not match wrangler.jsonc.');
}

const bucket = config.r2_buckets?.find((item) => item.binding === 'CAREPLAN_MEDIA');
if (!bucket) fail('CAREPLAN_MEDIA binding is missing from wrangler.jsonc.');
if (!bucket?.bucket_name || String(bucket.bucket_name).includes('replace-with-')) fail('Replace the placeholder R2 bucket_name in wrangler.jsonc.');
if (bucket?.bucket_name !== process.env.CAREPLAN_R2_BUCKET_NAME) fail('CAREPLAN_R2_BUCKET_NAME does not match wrangler.jsonc.');

const vars = config.vars || {};
if (vars.APP_ENV !== 'production') fail('APP_ENV must be production.');
if (String(vars.ALLOW_LOCAL_DEV) !== 'false') fail('ALLOW_LOCAL_DEV must be false.');
if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(String(vars.TEAM_DOMAIN || ''))) {
  fail('TEAM_DOMAIN must be the real Cloudflare Access team domain.');
}
if (!vars.POLICY_AUD || String(vars.POLICY_AUD).includes('REPLACE_WITH_')) {
  fail('POLICY_AUD must be the real Cloudflare Access application audience tag.');
}
if (!/^[a-z0-9][a-z0-9-]{0,57}$/i.test(String(process.env.CLOUDFLARE_PAGES_PROJECT || ''))) {
  fail('CLOUDFLARE_PAGES_PROJECT has an invalid project name.');
}

if (!process.exitCode) console.log('Deployment configuration verified without printing secrets.');
