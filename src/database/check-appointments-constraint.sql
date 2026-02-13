-- Script to check the current appointments_status_check constraint
-- Run this in your Supabase SQL editor or database client

-- Check the constraint definition
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'appointments_status_check'
AND conrelid = 'appointments'::regclass;

-- Alternative: Check all constraints on appointments table
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'appointments'::regclass
AND contype = 'c'; -- 'c' = check constraint


