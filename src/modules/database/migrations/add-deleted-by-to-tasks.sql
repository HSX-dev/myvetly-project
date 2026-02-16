-- Migration: Add deleted_by column to tasks table
-- This column is required by the database trigger that logs who deleted a task
-- 
-- The trigger on the tasks table references OLD.deleted_by during DELETE operations,
-- but the column doesn't exist, causing deletion to fail.
--
-- This migration adds the deleted_by column as a nullable UUID that references users(id)
-- Run this migration in your Supabase SQL editor or via migration tool

BEGIN;

-- Add deleted_by column to tasks table
-- Nullable because existing records won't have this value
-- References users(id) to track which user deleted the task
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Add a comment to document the column's purpose
COMMENT ON COLUMN tasks.deleted_by IS 'User ID who deleted this task. Set by database trigger or application before deletion.';

COMMIT;

-- Verify the column was added correctly
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'tasks'
AND column_name = 'deleted_by';

