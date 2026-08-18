-- 竞品直播截图补充"当时"的直播态指标：在线人数 + 本场开播时间 + 截图时刻。
-- 时长 = captured_at - stream_started_at（用捕获时刻而非 created_at，避免入库延迟误差）。
alter table competitor_shots
  add column if not exists viewer_count       integer,
  add column if not exists stream_started_at  timestamptz,
  add column if not exists captured_at        timestamptz;

comment on column competitor_shots.viewer_count      is '截图那一刻直播间在线人数（room-header person-count）';
comment on column competitor_shots.stream_started_at is '本场直播开播时间（页面 startTime）';
comment on column competitor_shots.captured_at       is '截图捕获时刻；时长=captured_at-stream_started_at';
