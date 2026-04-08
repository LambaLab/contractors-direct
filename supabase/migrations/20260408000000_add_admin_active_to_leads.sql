-- Add admin_active flag so intake clients can poll for admin chat takeover
ALTER TABLE leads ADD COLUMN IF NOT EXISTS admin_active boolean NOT NULL DEFAULT false;
