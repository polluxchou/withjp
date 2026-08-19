-- 主页语言：竞品档案「地区」的辅助参考。
--
-- 背景：competitors.region 是建档时人工填的常量，采集从不刷新它。实测 23 个顶层
-- 竞品全被填成 'JP'，其中 3 个其实是韩国团（_k.queens / the_re_born / blank.s9，
-- 简介里自报 KST 与韩文成员名），错了一个月没人发现。
--
-- user.language 就在每轮采集都要读的那份主页 rehydration JSON 里，顺手能带回来。
-- 但它是**账号的应用语言设置**，是国别的代理指标而非权威值（日本团把语言设成 en
-- 也完全可能），所以：
--   · 存在快照表而非 competitors —— 它是「某次观测到的值」，和 bio/region 同级
--   · 只作展示与交叉校验，**不自动覆盖 competitors.region**（人工值仍是唯一权威）
alter table competitor_snapshots add column if not exists language text;

comment on column competitor_snapshots.language is
  '主页 rehydration JSON 的 user.language（账号应用语言）。地区的辅助参考，不权威、不覆盖 competitors.region。';
