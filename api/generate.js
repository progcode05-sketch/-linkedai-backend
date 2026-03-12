const { verifyToken, getUsage, incrementUsage } = require('./lib/supabase');

const MONTHLY_LIMIT = 300;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify token
    const user = await verifyToken(req.headers.authorization);

    // 2. Check usage limit (no Stripe check — manage access manually via Supabase)
    const usage = await getUsage(user.id);
    if (usage >= MONTHLY_LIMIT) {
      return res.status(429).json({
        error: 'limit_reached',
        message: `You've used all ${MONTHLY_LIMIT} generations this month. Resets on the 1st.`,
        usage, limit: MONTHLY_LIMIT
      });
    }

    // 3. Validate body
    const { systemPrompt, userMessage } = req.body;
    if (!systemPrompt || !userMessage) {
      return res.status(400).json({ error: 'Missing systemPrompt or userMessage' });
    }

    // 4. Call Anthropic with YOUR key
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

    const data = await anthropicRes.json();
    const result = data.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '';

    // 5. Increment usage
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
