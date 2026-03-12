const Stripe = require('stripe');
const { supabase } = require('./lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const customerId = session.customer;
        if (userId && customerId) {
          await supabase.from('profiles').update({
            stripe_customer_id: customerId,
            subscription_status: 'pro'
          }).eq('id', userId);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabase.from('profiles')
          .update({ subscription_status: 'cancelled' })
          .eq('stripe_customer_id', sub.customer);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await supabase.from('profiles')
          .update({ subscription_status: 'cancelled' })
          .eq('stripe_customer_id', invoice.customer);
        break;
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Tell Vercel not to parse body for Stripe webhooks
module.exports.config = { api: { bodyParser: false } };
