-- Add platform_id to creator profile for social media links
-- This field stores the username/channel ID for generating platform URLs

-- Note: Since profile is a JSONB column, no schema change is needed
-- This migration is for documentation purposes only
-- The platform_id field will be stored as: profile->>'platform_id'

-- Example values:
-- TikTok: @username or username
-- Instagram: username
-- YouTube: @username or UC... (channel ID)
-- Twitch: username
