-- Add repeat_interval to pet_reminders for daily/weekly/monthly/annually.
-- Run this in Supabase SQL editor if your schema is managed there.
ALTER TABLE pet_reminders
ADD COLUMN IF NOT EXISTS repeat_interval text CHECK (repeat_interval IN ('daily', 'weekly', 'monthly', 'annually'));
