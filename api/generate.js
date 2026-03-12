const { verifyToken, getProfile, getUsage, incrementUsage } = require('./lib/supabase');

const MONTHLY_LIMIT = 300;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req.headers.authorization);
    const profile = await getProfile(user.id);

    if (profile.subscription_status !== 'pro') {
      return res.status(403).json({
        error: 'subscription_required',
        message: 'Please upgrade to Pro to use LinkedAI.'
      });
    }

    const usage = await getUsage(user.id);
    if (usage >= MONTHLY_LIMIT) {
      return res.status(429).json({
        error: 'limit_reached',
        message: `You've used all ${MONTHLY_LIMIT} generations this month. Resets on the 1st.`,
        usage, limit: MONTHLY_LIMIT
      });
    }

    const { systemPrompt, userMessage } = req.body;
    if (!systemPrompt || !userMessage) {
      return res.status(400).json({ error: 'Missing systemPrompt or userMessage' });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Anthropic error: ${anthropicRes.status}`);
    }

    const anthropicData = await anthropicRes.json();
    const result = anthropicData.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '';

    await incrementUsage(user.id);

    return res.status(200).json({ result, usage: usage + 1, limit: MONTHLY_LIMIT });

  } catch (err) {
    console.error('Generate error:', err.message);
    if (err.message.includes('token') || err.message.includes('authorization')) {
      return res.status(401).json({ error: 'unauthorized', message: err.message });
    }
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
};
