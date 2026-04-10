-- Create lead_emails table for multi-email support
CREATE TABLE IF NOT EXISTS lead_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, email)
);

-- Seed from existing leads that have an email
INSERT INTO lead_emails (lead_id, email, verified_at, is_primary, created_at)
SELECT id, email, COALESCE(saved_at, now()), true, COALESCE(saved_at, now())
FROM leads
WHERE email IS NOT NULL AND email != ''
ON CONFLICT (lead_id, email) DO NOTHING;

-- Index for fast lookups by email (used by proposals/by-email)
CREATE INDEX IF NOT EXISTS idx_lead_emails_email ON lead_emails(email);

-- Index for fast lookups by lead_id
CREATE INDEX IF NOT EXISTS idx_lead_emails_lead_id ON lead_emails(lead_id);
