const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://svcdloiiorqrcngfznnc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
let supabase = null;
let supabaseReady = false;

if (!SUPABASE_ANON_KEY) {
  console.error('ERROR: SUPABASE_ANON_KEY not set. API routes will return 503.');
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  supabaseReady = true;
}

function requireSupabase(req, res, next) {
  if (!supabaseReady) {
    return res.status(503).json({ error: 'Database not configured. Server environment variables missing.' });
  }
  next();
}
app.use('/api', requireSupabase);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', supabase: supabaseReady ? 'connected' : 'disconnected', env: !!process.env.SUPABASE_ANON_KEY });
});

function generateCoupon() {
  return 'ADV-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

app.post('/api/preregister', async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const couponCode = req.body.coupon_code?.trim().toUpperCase();

    if (!email || !email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    if (!couponCode) {
      return res.status(400).json({ error: 'Advertiser coupon code is required' });
    }

    const { data: existing } = await supabase.from('preregistrations').select('id').eq('email', email).maybeSingle();
    if (existing) return res.json({ message: 'Already registered' });

    const { data: advertiser } = await supabase.from('advertisers').select('id,ad_volume').eq('coupon_code', couponCode).maybeSingle();
    if (!advertiser) {
      return res.status(400).json({ error: 'Invalid coupon code. Please check with the advertiser.' });
    }

    const { error } = await supabase.from('preregistrations').insert({ email, coupon_code: couponCode });
    if (error) {
      if (error.code === 'PGRST205') return res.status(500).json({ error: 'Database table not set up. Run the SQL from supabase-schema.sql in your Supabase SQL editor.' });
      throw error;
    }

    const currentVolume = advertiser.ad_volume || 0;
    const { error: updateError } = await supabase.from('advertisers').update({ ad_volume: currentVolume + 10 }).eq('id', advertiser.id);
    if (updateError) {
      console.error('Token update error:', updateError);
      return res.status(500).json({ error: 'Failed to update tokens. Make sure the UPDATE RLS policy is added (see supabase-schema.sql).' });
    }

    res.json({ message: 'Pre-registration successful!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/advertise', async (req, res) => {
  try {
    const { name, email, password, mobile, location, address, bank_details } = req.body;
    if (!name || !email || !password || !mobile || !location || !address || !bank_details) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const { data: existing } = await supabase.from('advertisers').select('id').eq('email', cleanEmail).maybeSingle();
    if (existing) return res.json({ message: 'Already registered' });

    const couponCode = generateCoupon();

    const { data: newAdvertiser, error } = await supabase.from('advertisers').insert({
      name,
      email: cleanEmail,
      password,
      mobile,
      location,
      address,
      bank_details,
      coupon_code: couponCode
    }).select();

    if (error) {
      if (error.code === 'PGRST205') return res.status(500).json({ error: 'Database table not set up. Run the SQL from supabase-schema.sql in your Supabase SQL editor.' });
      throw error;
    }

    res.json({
      message: 'Advertiser registration successful!',
      advertiser: {
        id: newAdvertiser[0].id,
        name: newAdvertiser[0].name,
        email: newAdvertiser[0].email,
        coupon_code: newAdvertiser[0].coupon_code
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/advertise/login', async (req, res) => {
  try {
    const { email, mobile, password } = req.body;
    if ((!email && !mobile) || !password) {
      return res.status(400).json({ error: 'Email or Mobile, and Password are required' });
    }

    let query = supabase.from('advertisers').select('*');
    if (email) {
      query = query.eq('email', email.trim().toLowerCase());
    } else {
      query = query.eq('mobile', mobile.trim());
    }

    const { data: advertiser, error } = await query.maybeSingle();
    if (error) throw error;
    if (!advertiser || advertiser.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      message: 'Login successful',
      advertiser: {
        id: advertiser.id,
        name: advertiser.name,
        email: advertiser.email,
        coupon_code: advertiser.coupon_code
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const email = req.query.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: advertiser, error: fetchError } = await supabase.from('advertisers').select('*').eq('email', email).maybeSingle();
    if (fetchError) throw fetchError;
    if (!advertiser) return res.status(404).json({ error: 'Advertiser not found' });

    let preregCount = 0;
    try {
      const { count, error: countError } = await supabase.from('preregistrations')
        .select('*', { count: 'exact', head: true })
        .eq('coupon_code', advertiser.coupon_code);
      if (!countError) preregCount = count || 0;
    } catch (e) {
      console.error('Count query error (non-fatal):', e);
    }

    const volume = advertiser.ad_volume || 0;

    let profitShareTier, tierLabel, nextTierVolume, nextTierPercent;
    if (volume >= 1000) { profitShareTier = 50; tierLabel = 'Platinum'; nextTierVolume = null; nextTierPercent = null }
    else if (volume >= 500) { profitShareTier = 40; tierLabel = 'Gold'; nextTierVolume = 1000; nextTierPercent = 50 }
    else if (volume >= 200) { profitShareTier = 30; tierLabel = 'Silver'; nextTierVolume = 500; nextTierPercent = 40 }
    else if (volume >= 50) { profitShareTier = 20; tierLabel = 'Bronze'; nextTierVolume = 200; nextTierPercent = 30 }
    else { profitShareTier = 10; tierLabel = 'Entry'; nextTierVolume = 50; nextTierPercent = 20 }

    res.json({
      name: advertiser.name,
      email: advertiser.email,
      coupon_code: advertiser.coupon_code,
      ad_volume: volume,
      preregistrations_via_coupon: preregCount,
      profit_share_percentage: profitShareTier,
      profit_share_tier: tierLabel,
      next_tier_volume: nextTierVolume,
      next_tier_percent: nextTierPercent
    });
  } catch (e) {
    console.error('Portfolio API error:', e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

module.exports = { app, supabase };
