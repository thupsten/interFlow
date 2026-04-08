/**
 * Create demo CSM in Auth + profiles (trigger sets role from user_metadata.role).
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 *   node scripts/seed-demo-csm.mjs
 */
import { createClient } from '@supabase/supabase-js';

const DEMO_EMAIL = 'demo.csm@intraflow.local';
const DEMO_PASSWORD = 'CsmDemo2026!';
const DEMO_NAME = 'Demo CSM';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: DEMO_NAME, role: 'csm' },
});

if (error) {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered')) {
    console.log('User already exists:', DEMO_EMAIL);
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
}

const id = data.user?.id;
if (id) {
  await admin.from('profiles').update({ department: 'Customer Success', role: 'csm' }).eq('id', id);
}

console.log('Created:', DEMO_EMAIL, '(id:', id + ')');
