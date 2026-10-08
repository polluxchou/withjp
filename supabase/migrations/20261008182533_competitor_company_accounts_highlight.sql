-- competitor_company_accounts.highlight：竞品公司页方块左上角的战绩角标（如「Diamond #1」）。
-- 单独一列而不是从 note 里正则抽：note 是给人读的长句，措辞随时会改，角标要稳定、短。
-- 可空；没有角标的团不显示。页面在本迁移执行前也能正常打开（列缺失按 null 处理）。
--
-- 回填只覆盖仍为 null 的行，重复执行不会冲掉之后人工改过的角标。

alter table competitor_company_accounts add column if not exists highlight text;

update competitor_company_accounts a
set highlight = v.highlight
from (values
  ('GGTK', '1MB Girls',   'LIVE FEST 世界 5 位'),
  ('GGTK', '1MB DEAR',    'Diamond #1'),
  ('GGTK', '1MB Twinkle', 'Diamond #2'),
  ('GGTK', '1TB Boiz',    'Diamond #3'),
  ('GGTK', '1MB Rizz',    'Diamond #4'),
  ('GGTK', '1MB Fiora',   'Diamond #5'),
  ('GGTK', 'UNi Chuuu',   'Diamond #9'),
  ('GGTK', 'K Dreams',    'Gold #1'),
  ('TOST', 'Solulune',    'LIVE FEST 世界 6 位')
) as v(company_name, group_name, highlight)
join competitor_companies co on co.name = v.company_name
where a.company_id = co.id
  and a.group_name = v.group_name
  and a.highlight is null;
