-- Add placement column to venue_items.
-- 'ground' items physically occupy floor area and are excluded from the
-- usable area calculation. 'aerial' items (hung trusses, ceiling lights, etc.)
-- do not consume floor space.
alter table venue_items
  add column if not exists placement text not null default 'ground'
    check (placement in ('ground', 'aerial'));
