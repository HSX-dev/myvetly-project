-- Migration: Fix appointments_status_check constraint to include 'no_show'
-- This ensures the database constraint matches the code expectations
-- 
-- Current database constraint allows:
-- 'requested', 'scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'confirmed'
--
-- Current code expects these statuses:
-- 'requested', 'scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'
--
-- Note: The constraint 'chk_active_appointment_has_time' already references 'no_show',
-- so the database schema expects it, but the main status constraint doesn't allow it.
--
-- This migration will include BOTH 'no_show' (needed by code) and 'confirmed' (already in DB)
--
-- Run this migration in your Supabase SQL editor or via migration tool

BEGIN;

-- Drop the existing constraint
ALTER TABLE appointments 
DROP CONSTRAINT IF EXISTS appointments_status_check;

-- Add the updated constraint with all valid statuses
-- Includes both 'no_show' (for code) and 'confirmed' (already in database)
ALTER TABLE appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status = ANY (ARRAY[
    'requested'::text,
    'scheduled'::text, 
    'checked_in'::text,
    'in_progress'::text,
    'completed'::text,
    'cancelled'::text,
    'confirmed'::text,  -- Keep this as it's already in the database
    'no_show'::text     -- Add this as the code needs it
]));

COMMIT;

-- Verify the constraint was updated correctly
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'appointments_status_check'
AND conrelid = 'appointments'::regclass;

