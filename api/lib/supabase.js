const { createClient } = require('@supabase/supabase-js');

// Service role client — full DB access for backend
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verify a user JWT token
async function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }
  const token = authHeader.replace('Bearer ', '');

  const userClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) throw new Error('Invalid or expired token');
  return user;
}

// Get user profile
async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw new Error('Profile not found');
  return data;
}

// Get current month usage
async function getUsage(userId) {
  const month = new Date().toISOString().slice(0, 7);
  const { data, error } = await supabase
    .from('usage')
    .select('count')
    .eq('user_id', userId)
    .eq('month', month)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.count || 0;
}

// Increment usage count atomically
async function incrementUsage(userId) {
  const month = new Date().toISOString().slice(0, 7);
  const current = await getUsage(userId);
  await supabase
    .from('usage')
    .upsert({
      user_id: userId,
      month,
      count: current + 1,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,month' });
}

module.exports = { supabase, verifyToken, getProfile, getUsage, incrementUsage };
