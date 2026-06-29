const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const ws = require('ws');
require('dotenv').config();

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://svcdloiiorqrcngfznnc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
let supabaseAdmin = null;
let supabaseReady = false;

async function checkSchema() {
  try {
    const db = supabaseAdmin || supabase;
    const { error } = await db.from('advertisers').select('upi_id').limit(1);
    if (error && error.message && error.message.includes('upi_id')) {
      console.log('Schema check: upi_id column MISSING');
    } else {
      console.log('Schema check: upi_id column exists');
    }
  } catch (e) {
    console.error('Schema check error:', e.message);
  }
}

if (!SUPABASE_ANON_KEY) {
  console.error('ERROR: SUPABASE_ANON_KEY not set. API routes will return 503.');
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { transport: ws }
  });
  if (SUPABASE_SERVICE_KEY) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      realtime: { transport: ws }
    });
  }
  supabaseReady = true;
  checkSchema();
}

function requireSupabase(req, res, next) {
  if (!supabaseReady) {
    return res.status(503).json({ error: 'Database not configured. Server environment variables missing.' });
  }
  next();
}
router.use('/api', requireSupabase);

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', supabase: supabaseReady ? 'connected' : 'disconnected', env: !!process.env.SUPABASE_ANON_KEY });
});

function generateCoupon() {
  return 'ADV-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

router.post('/api/preregister', async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const couponCode = req.body.coupon_code?.trim().toUpperCase();

    if (!email || !email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    if (!couponCode) {
      return res.status(400).json({ error: 'Advertiser coupon code is required' });
    }

    const { data: existing, error: existingErr } = await supabase.from('preregistrations').select('id').eq('email', email).maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) return res.json({ message: 'Already registered' });

    const { data: advertiser, error: advErr } = await supabase.from('advertisers').select('id,ad_volume').eq('coupon_code', couponCode).maybeSingle();
    if (advErr) throw advErr;
    if (!advertiser) {
      return res.status(400).json({ error: 'Invalid coupon code. Please check with the advertiser.' });
    }

    const writeClient = supabaseAdmin || supabase;
    const { error: insertError } = await writeClient.from('preregistrations').insert({ email, coupon_code: couponCode });
    if (insertError) {
      console.error('Prereg insert error:', insertError);
      if (insertError.code === 'PGRST205') return res.status(500).json({ error: 'Database table not set up. Run the SQL from supabase-schema.sql in your Supabase SQL editor.' });
      throw insertError;
    }
    // Tokens awarded automatically by database trigger "trg_award_tokens"

    res.json({ message: 'Pre-registration successful!' });
  } catch (e) {
    console.error('Preregister error:', e);
    res.status(500).json({ error: 'Server error: ' + (e.message || e) });
  }
});

router.post('/api/advertise', async (req, res) => {
  try {
    const { name, email, password, mobile, location, address, upi_id } = req.body;
    if (!name || !email || !password || !mobile || !location || !address || !upi_id) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const { data: existing, error: checkError } = await supabase.from('advertisers').select('id').eq('email', cleanEmail).maybeSingle();
    if (checkError) throw checkError;
    if (existing) return res.json({ message: 'Already registered' });

    const couponCode = generateCoupon();
    console.log('Generated coupon:', couponCode);

    const writeClient = supabaseAdmin || supabase;
    const insertData = {
      name,
      email: cleanEmail,
      password,
      mobile,
      location,
      address,
      coupon_code: couponCode
    };
    insertData.upi_id = upi_id;
    const { data: newAdvertiser, error } = await writeClient.from('advertisers').insert(insertData).select();

    if (error) {
      console.error('Insert error:', error);
      if (error.code === 'PGRST205') return res.status(500).json({ error: 'Database table not set up. Run the SQL from supabase-schema.sql in your Supabase SQL editor.' });
      if (error.code === '23505') return res.status(409).json({ error: 'This email or mobile number is already registered.' });
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
    console.error('Advertise error:', e);
    res.status(500).json({ error: 'Server error: ' + (e.message || e) });
  }
});

router.post('/api/advertise/login', async (req, res) => {
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
    res.status(500).json({ error: 'Server error: ' + (e.message || e) });
  }
});

router.get('/api/portfolio', async (req, res) => {
  try {
    const email = req.query.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: advertiser, error: fetchError } = await supabase.from('advertisers').select('*').eq('email', email).maybeSingle();
    if (fetchError) throw fetchError;
    if (!advertiser) return res.status(404).json({ error: 'Advertiser not found' });

    let preregCount = 0;
    try {
      const countClient = supabaseAdmin || supabase;
      const { count, error: countError } = await countClient.from('preregistrations')
        .select('*', { count: 'exact', head: true })
        .eq('coupon_code', advertiser.coupon_code);
      if (!countError) preregCount = count || 0;
      else console.error('Count query error:', countError);
    } catch (e) {
      console.error('Count query error (non-fatal):', e);
    }

    const volume = preregCount * 10;

    let profitShareTier, tierLabel, nextTierVolume, nextTierPercent;
    if (volume >= 1000) { profitShareTier = 50; tierLabel = 'Platinum'; nextTierVolume = null; nextTierPercent = null }
    else if (volume >= 500) { profitShareTier = 40; tierLabel = 'Gold'; nextTierVolume = 1000; nextTierPercent = 50 }
    else if (volume >= 200) { profitShareTier = 30; tierLabel = 'Silver'; nextTierVolume = 500; nextTierPercent = 40 }
    else if (volume >= 50) { profitShareTier = 20; tierLabel = 'Bronze'; nextTierVolume = 200; nextTierPercent = 30 }
    else { profitShareTier = 10; tierLabel = 'Entry'; nextTierVolume = 50; nextTierPercent = 20 }

    console.log('Portfolio for', email, '- volume:', volume, 'tier:', tierLabel, 'preregCount:', preregCount);

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

// ── Admin Routes ──

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ai@6300';
const ADMIN_TOKEN = 'startup-admin-' + crypto.createHash('md5').update(ADMIN_PASSWORD).digest('hex').slice(0, 8);

router.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    res.json({ message: 'Admin login successful', token: ADMIN_TOKEN });
  } catch (e) {
    console.error('Admin login error:', e);
    res.status(500).json({ error: 'Server error: ' + (e.message || e) });
  }
});

function requireAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token === ADMIN_TOKEN) return next();
  res.status(403).json({ error: 'Unauthorized' });
}

router.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    let totalAdvertisers = 0, totalPreregistrations = 0;
    let advertisers = [], preregistrations = [];

    try {
      const { count } = await db.from('advertisers').select('*', { count: 'exact', head: true });
      totalAdvertisers = count || 0;
    } catch (e) { console.error('Count advertisers error:', e); }

    try {
      const { count } = await db.from('preregistrations').select('*', { count: 'exact', head: true });
      totalPreregistrations = count || 0;
    } catch (e) { console.error('Count preregistrations error:', e); }

    try {
      const { data } = await db.from('advertisers').select('*').order('created_at', { ascending: false });
      advertisers = data || [];
    } catch (e) { console.error('Fetch advertisers error:', e); }

    try {
      const { data } = await db.from('preregistrations').select('*').order('created_at', { ascending: false });
      preregistrations = data || [];
    } catch (e) { console.error('Fetch preregistrations error:', e); }

    const advertisersWithRefs = advertisers.map(adv => {
      const refCount = preregistrations.filter(p => p.coupon_code === adv.coupon_code).length;
      return {
        id: adv.id, name: adv.name, email: adv.email, mobile: adv.mobile,
        location: adv.location, coupon_code: adv.coupon_code,
        ad_volume: refCount * 10, preregistrations_count: refCount,
        upi_id: adv.upi_id, created_at: adv.created_at
      };
    });

    res.json({
      stats: {
        total_advertisers: totalAdvertisers,
        total_preregistrations: totalPreregistrations,
        total_tokens_awarded: advertisersWithRefs.reduce((s, a) => s + a.ad_volume, 0)
      },
      advertisers: advertisersWithRefs,
      preregistrations
    });
  } catch (e) {
    console.error('Admin dashboard error:', e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

router.post('/api/admin/delete-advertiser', async (req, res) => {
  try {
    const { token, id } = req.body;
    if (token !== ADMIN_TOKEN) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!id) {
      return res.status(400).json({ error: 'Advertiser ID required' });
    }
    const db = supabaseAdmin || supabase;
    const { data: adv } = await db.from('advertisers').select('coupon_code').eq('id', id).maybeSingle();
    if (adv?.coupon_code) {
      await db.from('preregistrations').delete().eq('coupon_code', adv.coupon_code);
    }
    const { error } = await db.from('advertisers').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Advertiser deleted.' });
  } catch (e) {
    console.error('Delete advertiser error:', e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

router.post('/api/admin/delete-prereg', async (req, res) => {
  try {
    const { token, id } = req.body;
    if (token !== ADMIN_TOKEN) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!id) {
      return res.status(400).json({ error: 'Pre-registration ID required' });
    }
    const db = supabaseAdmin || supabase;
    const { count } = await db.from('preregistrations').delete().eq('id', id).select('', { count: 'exact', head: true });
    if (count === 0) {
      return res.status(404).json({ error: 'Pre-registration not found' });
    }
    res.json({ message: 'Pre-registration deleted.' });
  } catch (e) {
    console.error('Delete prereg error:', e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

module.exports = { router, supabase };
