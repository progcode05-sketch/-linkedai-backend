const { verifyToken, getProfile, getUsage } = require('./lib/supabase');

const MONTHLY_LIMIT = 300;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req.headers.authorization);
    const profile = await getProfile(user.id);
    const usage = await getUsage(user.id);

    return res.status(200).json({
      subscription_status: profile.subscription_status,
      subscription_end_date: profile.subscription_end_date,
      usage,
      limit: MONTHLY_LIMIT,
      remaining: Math.max(0, MONTHLY_LIMIT - usage)
    });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
};
