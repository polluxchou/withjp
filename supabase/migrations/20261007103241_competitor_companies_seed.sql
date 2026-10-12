-- 竞品公司首批数据：来自 2026-10 的日本 TikTok LIVE 团播公司调研
-- （报告《日本 TikTok LIVE 团播公司》，信息截至 2026-10-06）。
-- 幂等：公司按 name、关联按 (company_id, group_name) 冲突即跳过，重复执行不会叠数据，
-- 也不会覆盖之后人工改过的内容。
-- competitor_id 按 handle 匹配追踪清单里的主账号；没匹配上的团照样入库，只是显示为未追踪。

insert into competitor_companies
  (name, legal_name, website, location, group_format, scale, capital_background, capital_note, recruit_note, note, sources, info_as_of, sort_order)
values
(
  'GGTK', '株式会社Global Growth', 'https://ggtk.jp/',
  '总部：東京都品川区；演播室：赤坂、東京ベイ、品川、川崎',
  '自营演播室多团矩阵：唱跳、纯舞蹈、男团等，团播品牌「1MB Project」',
  '2026-08 运营 7 个团；所属创作者 5,800+、累计打赏 250 億円+（自报，含个人主播）；2026 年两场 TikTok 官方团体赛（GGG S1、StageX Global GroupLIVE Glory）均称拿下「团体＋机构」双冠',
  'unknown', '合作 MCN anyStarr 国籍未核实',
  '男性数字偶像团：固定月薪 24 万＋提成，每天约 8h，月 20 天以上（赤坂演播室，2026-09）',
  '',
  '[{"label":"PR TIMES 2026-08-22","url":"https://prtimes.jp/main/html/rd/p/000000029.000149054.html"},{"label":"公司概要","url":"https://globalgrowth.jp/company/"},{"label":"narrow 招聘","url":"https://narrow.jp/audition/14490"}]'::jsonb,
  '2026-10-06', 10
),
(
  'TOST', null, 'https://tostost.com/',
  '公司地址：東京都板橋区大山町（演播室位置未公开）',
  '舞蹈团体直播：5 人女团 Solulune、6 人男团 ZENSE，另有个人主播；自称「舞蹈专业选角公司出身的 TikTok 专门直播事务所」',
  'Solulune 粉丝约 2.77 万（自报 LIVE FEST2025 パフォーマンス部門世界 6 位）；ZENSE 粉丝约 6,080；两团都在渋谷 BUZZ 办过售票线下活动',
  'unknown', '法人全称、代表人、母公司都没查到',
  '18 岁以上、不要求直播经验、不收入会费；薪资未公开',
  '',
  '[{"label":"TOST 官网","url":"https://tostost.com/"},{"label":"katoeri 首播公告（X）","url":"https://x.com/katoeri2653/status/1930208136742481972"},{"label":"Solulune 首场专场（LivePocket）","url":"https://livepocket.jp/e/9cpyv"}]'::jsonb,
  '2026-10-06', 20
),
(
  'MaGo', 'MaGo株式会社', 'https://www.mago-audition.com/',
  '大阪市中央区北浜（北浜站附近）',
  'MC 主持的「TikTok グループダンス番組」：团舞、solo、トーク、游戏',
  '称线上主播 3,000+；称东京已有团体月流水突破 4,500 万日元；2022 年成立（均为自报）',
  'unknown', '官网有中文，自称「TikTok直営会社」、海外模式的「日本版モデル」；代表人与股东未查到',
  '全职月薪 30 万＋提成（周 5 天 14:00–23:00）或 ¥3,000/直播小时；研修日薪 ¥6,000（2 周）；18 岁以上，高中生除外；narrow 招聘截止 2026-11-04',
  '',
  '[{"label":"MaGo 官网","url":"https://www.mago-audition.com/"},{"label":"narrow 招聘","url":"https://narrow.jp/audition/14795"},{"label":"オーディションプラス","url":"https://audition.nerim.info/audition-202608/audition-2025102615.html"}]'::jsonb,
  '2026-10-06', 30
),
(
  'JA（Japanese Angel）', '火山田株式会社', 'https://jamcn.live/?lang=ja',
  '東京都練馬区富士見台；埼玉入間规划新设施',
  'Group LIVE 固定团队（舞蹈、对话、角色表现）＋ Solo LIVE；东京 6 个团播位',
  '練馬约 1,000㎡，入間规划约 5,000㎡；称「公会」累计流水 4,000 万人民币',
  'unknown', '日英中三语官网；业绩按人民币计',
  '时薪 ¥1,500 起；业务委托底薪 25 万起；研修 ¥1,280/h（约 1 个月）；周 3～5 天每天 5～8h；招聘截止 2026-11-30',
  '',
  '[{"label":"JA 官网","url":"https://jamcn.live/?lang=ja"},{"label":"オーディションプラス","url":"https://audition.nerim.info/audition-202610/audition-2026072817.html"}]'::jsonb,
  '2026-10-06', 40
),
(
  'SEI STUDIO', null, 'https://sei-studio.live/',
  '東京都中央区八丁堀',
  '「MEGA Produce TikTok-POP」：5～6 人舞蹈团，观众用点赞、礼物、投票决定 C 位；计划同时培养 5～10 个团（仅见于搜索摘要）',
  '未披露',
  'unknown', '自述「日中双语公司」（仅见于搜索摘要）',
  '保底 ¥1,500～2,000/h（仅见于搜索摘要）',
  '官网 2026-10-06 实测返回 410 已下线，可能停业或改名；运营法人未查到',
  '[{"label":"招聘页","url":"https://sei-studio.live/recruit/"},{"label":"オーディションプラス","url":"https://audition.nerim.info/audition-202512/audition-2025091844.html"}]'::jsonb,
  '2026-10-06', 50
),
(
  'PIGEON', 'PIGEON.LLC', 'https://pigeon-japan.com/',
  '未写明',
  '团体配信；固定薪随「团体流水」浮动，月底 PK 时可能播 10h 以上',
  '未披露',
  'unknown', '招聘与官网没有中文痕迹（未查登记），但 PK 冲榜节奏与国内团播一致',
  '月 18～22 天固定 15～35 万（随团体流水）；不足 18 天 ¥1,300/h；每天 4～5h；招聘截止 2026-10-31',
  '官网未能打开',
  '[{"label":"オーディションプラス","url":"https://audition.nerim.info/audition-202610/audition-2026062598.html"}]'::jsonb,
  '2026-10-06', 60
),
(
  'IMPACT', '合同会社IMPACT', 'https://rshsfm.readdy.co/',
  '東京都内',
  'TikTok LIVE 偶像频道，配一档 MC 节目；男女成员同时招',
  '未披露',
  'unknown', '',
  '日薪最低保证 ¥10,500（7h 以上），15:00–22:30，周 5～6 天',
  '',
  '[{"label":"audition-match","url":"https://www.audition-match.com/260610-6/"}]'::jsonb,
  '2026-10-06', 70
),
(
  'LLC SECOND', 'LLC SECOND', 'https://second-tokyo.live/',
  '東京都中野区',
  '以 TikTok LIVE 为主阵地的女团',
  '未披露',
  'unknown', '',
  '18～27 岁女性；有最低保证，金额未公开；招聘截止 2026-10-20',
  '',
  '[{"label":"オーディションプラス","url":"https://audition.nerim.info/audition-202610/audition-2026093084.html"}]'::jsonb,
  '2026-10-06', 80
),
(
  'IDOL DRAFT STUDIO', 'Hiromeru Inc.（日文社名未核实）', null,
  '未核实',
  'TikTok LIVE 节目型选秀：观众参与选人，每月组一个新团，一年后决定是否正式出道',
  '未披露',
  'unknown', '',
  '18 岁以上女性；固定薪＋提成，示例月收入 52.4～204.38 万日元',
  '',
  '[{"label":"audition-debut.com","url":"https://www.audition-debut.com/audition/list/detail/id=14958"}]'::jsonb,
  '2026-10-06', 90
),
(
  'TimeTicket Production', '株式会社タイムチケット', 'https://timeticketproduction.com/',
  '東京都渋谷区；舞蹈团项目在名古屋',
  '支援女团 TiiiMO 开播（是否多人同屏未写明）；在名古屋从零招募舞蹈团',
  '所属主播 850～2,000+（各篇稿件数字矛盾）；TikTok 優良 LIVE Agency 2025 年 9 月度第 1',
  'unknown', '母公司グローバルウェイ',
  '名古屋舞蹈团项目招募中（Green）',
  '大型代理里团播味道最重的一家',
  '[{"label":"PR TIMES","url":"https://prtimes.jp/main/html/rd/p/000000040.000059760.html"},{"label":"Green 招聘","url":"https://www.green-japan.com/company/6835/job/311963"},{"label":"ASCII","url":"https://ascii.jp/elem/000/004/335/4335753/"}]'::jsonb,
  '2026-10-06', 100
),
(
  'STPR', '株式会社STPR', null,
  '東京都渋谷区',
  '旗下すとぷり等 6 个 2.5 次元团体，2026-03-19 与 TikTok LIVE 签提携代理；是否以团体同屏开播未写明',
  '未披露',
  'unknown', '',
  '',
  '以团体形式签约的大型事务所，和「演播室雇人做团播」不是同一种模式',
  '[{"label":"TikTok Japan note","url":"https://note.com/tiktok/n/n5557abf332e9"},{"label":"AppBank","url":"https://www.appbank.net/2026/03/22/youtubernews/2953999.php"}]'::jsonb,
  '2026-10-06', 110
),
(
  '帅库网络（SK）日本分公司', '杭州帅库网络科技有限公司（母公司）', 'https://skwlmcn.com/',
  '城市未知',
  '中国女团团播头部；日本据点做什么，没有任何细节',
  '日本规模未知',
  'unknown', '母公司为杭州帅库网络科技',
  '',
  '两篇报道措辞几乎一致，很可能同出一源；日本法人名、地址、账号都查不到；官网未能打开',
  '[{"label":"娱乐资本论（澎湃）","url":"https://m.thepaper.cn/newsDetail_forward_32240267"},{"label":"华源证券研报","url":"https://pdf.dfcfw.com/pdf/H301_AP202509301753272982_1.pdf"}]'::jsonb,
  '2026-10-06', 120
)
on conflict (name) do nothing;

-- 公司 ↔ 团。handle 为 null 的是只知道团名、还没找到 TikTok 账号的团。
insert into competitor_company_accounts (company_id, group_name, handle, competitor_id, note, sort_order)
select co.id, v.group_name, v.handle, cp.id, v.note, v.sort_order
from (values
  ('GGTK', '1MB Girls',   null,          '2025-04 出道，1MB Project 的起点；TikTok LIVE Fest 2025 世界决赛舞蹈部门第 5', 10),
  ('GGTK', '1MB DEAR',    '1mb.dear',    '纯舞蹈；StageX Diamond 部门第 1', 20),
  ('GGTK', '1MB Twinkle', '1mb.twinkle', '唱＋跳；GGG S1 团体第 1，StageX Diamond 第 2', 30),
  ('GGTK', '1TB Boiz',    '1tb.boiz',    '男团；StageX Diamond 第 3', 40),
  ('GGTK', '1MB Rizz',    '1mb.rizz',    'StageX Diamond 第 4', 50),
  ('GGTK', '1MB Fiora',   '1mb.fiora',   'StageX Diamond 第 5', 60),
  ('GGTK', 'UNi Chuuu',   'uni.chuuu',   'StageX Diamond 第 9', 70),
  ('GGTK', 'K Dreams',    'kdreams.jp',  '与 KADOKAWA DREAMS 合作；StageX Gold 部门第 1', 80),
  ('TOST', 'Solulune',    'solulune.jp', '5 人女子舞蹈团；2025-06-06 首播；2026-06-13 渋谷 BUZZ 首场专场', 10),
  ('TOST', 'ZENSE',       'zense.jp',    '6 人男子舞蹈团，成员是现役职业舞者', 20),
  ('MaGo', 'Kiwii Girls', null,          '大阪北浜演播室', 10),
  ('LLC SECOND', 'IDX',   null,          '', 10),
  ('TimeTicket Production', 'TiiiMO', null, 'TikTok アイドルデイリーチャート殿堂入り', 10)
) as v(company_name, group_name, handle, note, sort_order)
join competitor_companies co on co.name = v.company_name
left join competitors cp on cp.platform = 'tiktok' and cp.handle = v.handle and cp.parent_id is null
on conflict (company_id, group_name) do nothing;
