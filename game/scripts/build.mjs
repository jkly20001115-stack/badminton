import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const vendorDir = resolve(publicDir, 'vendor');
const threeSource = resolve(root, 'node_modules/three/build/three.module.js');
const threeTarget = resolve(vendorDir, 'three.module.js');
const envTarget = resolve(publicDir, 'env.js');

const defaultSupabaseUrl = 'https://hsasqrbdodluijskxvyu.supabase.co';
const defaultPublishableKey = 'sb_publishable_WFXiEOdn7IDiRslVJTcaZQ_n3psfI8_';

const supabaseUrl = process.env.SUPABASE_URL || defaultSupabaseUrl;
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  defaultPublishableKey;

await mkdir(vendorDir, { recursive: true });
await copyFile(threeSource, threeTarget);

await writeFile(
  envTarget,
  `window.BADMINTON_SUPABASE = ${JSON.stringify(
    {
      url: supabaseUrl,
      publishableKey,
    },
    null,
    2,
  )};\n`,
  'utf8',
);

if (!supabaseUrl || !publishableKey) {
  console.warn(
    'Supabase env vars are not fully configured. Multiplayer on Vercel and match result uploads will be disabled.',
  );
}

console.log('Build complete: public/vendor/three.module.js and public/env.js are ready.');
