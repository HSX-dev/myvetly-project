-- Migration: Add settings JSONB column to clinics table
-- This column allows storing arbitrary key-value settings for each clinic

BEGIN;

-- Add the settings JSONB column if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clinics' AND column_name = 'settings') THEN
        ALTER TABLE clinics
        ADD COLUMN settings JSONB DEFAULT '{}'::jsonb;
        COMMENT ON COLUMN clinics.settings IS 'Arbitrary key-value settings stored as JSONB for clinic configuration';
        
        -- Create an index on the settings column for better query performance
        CREATE INDEX IF NOT EXISTS idx_clinics_settings ON clinics USING GIN (settings);
    END IF;
END
$$;

COMMIT;

-- Verification (optional): Check if the column was added
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'clinics' AND column_name = 'settings';

