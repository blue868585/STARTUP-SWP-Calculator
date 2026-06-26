-- ============================================================
-- STARTUP SWP Calculator — Complete Database Schema
-- Run this entire block in your Supabase SQL Editor
-- ============================================================

-- --------------------------------------------------
-- 1. PRE-REGISTRATIONS TABLE
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS preregistrations (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  coupon_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preregistrations_coupon
  ON preregistrations (coupon_code);

ALTER TABLE preregistrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert preregistrations" ON preregistrations;
CREATE POLICY "Anyone can insert preregistrations"
  ON preregistrations FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can check existing email" ON preregistrations;
CREATE POLICY "Anyone can check existing email"
  ON preregistrations FOR SELECT
  TO anon
  USING (true);

-- --------------------------------------------------
-- 2. ADVERTISERS TABLE  (core user table)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS advertisers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mobile TEXT NOT NULL,
  password TEXT NOT NULL,
  location TEXT NOT NULL,
  address TEXT NOT NULL,
  bank_details TEXT NOT NULL,
  coupon_code TEXT UNIQUE,
  ad_volume NUMERIC DEFAULT 0,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure new columns exist (safe to run if already added)
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS coupon_code TEXT UNIQUE;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS ad_volume NUMERIC DEFAULT 0;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Add unique constraint on mobile for login by mobile number
-- (Drops existing constraint first if re-running, then re-creates)
ALTER TABLE advertisers DROP CONSTRAINT IF EXISTS advertisers_mobile_key;
ALTER TABLE advertisers ADD CONSTRAINT advertisers_mobile_key UNIQUE (mobile);

-- Indexes for fast login lookups
CREATE INDEX IF NOT EXISTS idx_advertisers_email ON advertisers (email);
CREATE INDEX IF NOT EXISTS idx_advertisers_mobile ON advertisers (mobile);
CREATE INDEX IF NOT EXISTS idx_advertisers_coupon ON advertisers (coupon_code);

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;

-- Allow anonymous registration (INSERT)
DROP POLICY IF EXISTS "Anyone can insert advertisers" ON advertisers;
CREATE POLICY "Anyone can insert advertisers"
  ON advertisers FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous login lookup (SELECT by email or mobile)
DROP POLICY IF EXISTS "Anyone can check existing advertiser email" ON advertisers;
CREATE POLICY "Anyone can check existing advertiser email"
  ON advertisers FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous update (for token increments on preregistration)
DROP POLICY IF EXISTS "Anyone can update advertisers" ON advertisers;
CREATE POLICY "Anyone can update advertisers"
  ON advertisers FOR UPDATE
  TO anon
  WITH CHECK (true);

-- --------------------------------------------------
-- 3. ADVERTISER SESSIONS TABLE  (tracks login sessions)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS advertiser_sessions (
  id BIGSERIAL PRIMARY KEY,
  advertiser_id BIGINT NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  logged_in_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON advertiser_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_advertiser ON advertiser_sessions (advertiser_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON advertiser_sessions (advertiser_id, is_active);

ALTER TABLE advertiser_sessions ENABLE ROW LEVEL SECURITY;

-- Allow inserting new sessions (during login)
DROP POLICY IF EXISTS "Anyone can insert sessions" ON advertiser_sessions;
CREATE POLICY "Anyone can insert sessions"
  ON advertiser_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow reading own session (by token)
DROP POLICY IF EXISTS "Anyone can read sessions" ON advertiser_sessions;
CREATE POLICY "Anyone can read sessions"
  ON advertiser_sessions FOR SELECT
  TO anon
  USING (true);

-- --------------------------------------------------
-- 4. HELPER: Update last_login on login
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION update_last_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE advertisers SET last_login = NOW() WHERE id = NEW.advertiser_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_last_login ON advertiser_sessions;
CREATE TRIGGER trg_update_last_login
  AFTER INSERT ON advertiser_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_last_login();
