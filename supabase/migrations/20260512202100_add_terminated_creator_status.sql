-- Add 'terminated' to creator_status enum
alter type creator_status add value if not exists 'terminated';
