// 官网新闻 / 成员的一次性搬迁 fixture（Task 8）。
//
// 自包含：不 import `src/lib/site/news.ts` 的 NEWS_IMAGES、也不 import
// `src/lib/site/content.ts` 的 MEMBER_IMAGES —— 这两个都是未导出的私有常量，
// Task 10 / Task 12 会把它们删掉。本文件把当时需要的值抄成自己的字面量，
// 之后那两个任务怎么改 UI 层的私有常量，都不影响这份 fixture 和已经跑过的 seed。
//
// 初始值来源：
//   - news: messages/{ja,zh,en}.json 的 site.news.articles[]（标题/导语/正文），
//     加上 src/lib/site/news.ts 里 NEWS_IMAGES / NEWS_CATEGORIES 的当前取值。
//   - members: messages/{ja,zh,en}.json 的 site.members.list[]（罗马字 name +
//     原始 role），加上 src/lib/site/content.ts 里 MEMBER_IMAGES 的当前取值。
//
// role 的分隔符两套规则并存，写库前必须按 locale 分别拆分：
//   - ja / zh 用全角 `／`（例："花乃／儚い微笑みの罠"）
//   - en    用 ASCII " / "（例："Kano / The trap of a fragile smile"）
// 用同一套规则处理三语会让 specialty_en 整列错乱——这是本文件最容易做错的地方，
// 拆分规则的验证见 scripts/seed-site-content.mjs 的 assertSplitsCleanly()。

/**
 * 新闻 fixture。
 *
 * - published_on 沿用 i18n 里 "2026.08.12" 这种点分格式，写库前由
 *   seed-site-content.mjs 用 `.replaceAll('.', '-')` 转成 "2026-08-12"。
 * - body 是段落数组，写库前用 "\n\n" 连接成一段纯文本。
 * - category 控制官网文末「去应募」CTA 是否显示（recruit 才显示），
 *   取值来自 src/lib/site/news.ts 的 NEWS_CATEGORIES，不能凭 tag 猜。
 */
export const NEWS_SEED = [
  {
    slug: 'mc-character-tech-partnership',
    publishedOn: '2026.08.12',
    tag: 'PROJECT',
    category: 'project',
    imageUrl: '/site/mc-character-expressions.webp',
    title: {
      ja: '3Dキャラクター技術チーム、EchoAmpのMC向け専用キャラクターを開発へ',
      zh: '3D 皮套人技术团队将为 EchoAmp MC 岗位打造专属角色服务',
      en: '3D Avatar Technology Team to Create Dedicated MC Characters for EchoAmp',
    },
    lead: {
      ja: 'EchoAmpは、中国のライブ配信領域で豊富な実績を持つ3Dキャラクター技術チームと協業し、MCポジション向けの専用キャラクターと配信システムを開発します。',
      zh: 'EchoAmp 将与具备丰富抖音直播项目经验的 3D 皮套人技术团队展开合作，为团队 MC 岗位开发专属角色与直播方案。',
      en: 'EchoAmp will work with an experienced 3D avatar technology team from China’s live-streaming industry to develop dedicated character solutions for its MC roles.',
    },
    body: {
      ja: [
        'キャラクターデザイン、リアルタイムモーション、音声表現、ライブインタラクションを統合し、MCが一貫したキャラクターとして継続的に配信へ参加できる環境を構築します。今後は、リアルなパフォーマンスとバーチャルキャラクターを組み合わせた新しいライブ表現も検証していきます。',
      ],
      zh: [
        '双方将围绕角色造型、实时动作、声音表现与直播互动进行整合，让 MC 能够以稳定的角色形象持续参与团队直播。未来，该能力也将用于探索真人表演、虚拟角色与实时直播结合的新内容形式。',
      ],
      en: [
        'The collaboration will integrate character design, real-time motion, voice performance, and live interaction, enabling MCs to appear consistently through distinctive virtual identities. The project will also explore new formats that combine live performers, virtual characters, and real-time streaming.',
      ],
    },
  },
  {
    slug: 'operations-partner-announced',
    publishedOn: '2026.08.10',
    tag: 'PROJECT',
    category: 'project',
    imageUrl: '/site/operations-partner-lockup.webp',
    title: {
      ja: 'EchoAmp、初の運営パートナーを発表。吉光片羽株式会社と本格的な協業へ',
      zh: 'EchoAmp 公布首批运营合作伙伴，将与吉光片羽株式会社展开深度合作',
      en: 'EchoAmp Announces Its First Operations Partner, 吉光片羽株式会社',
    },
    lead: {
      ja: 'EchoAmpは、MCN運営およびクリエイターマネジメントの経験を持つ吉光片羽株式会社と本格的な協業を開始します。',
      zh: 'EchoAmp 将与具备成熟 MCN 运营及创作者管理经验的吉光片羽株式会社展开深度合作。',
      en: 'EchoAmp will enter into a close partnership with 吉光片羽株式会社, a media company with established experience in MCN operations and creator management.',
    },
    body: {
      ja: [
        'メンバー管理、コンテンツ運営、現場オペレーション、クリエイター育成などの領域で連携し、募集・トレーニングから本格的なライブ配信まで、一貫した運営体制を構築していきます。両社の強みを活かしながら、大阪でのチームづくりを進めます。',
      ],
      zh: [
        '双方将围绕成员管理、内容运营、现场执行及创作者成长体系进行协作，共同完善从招募、训练到正式直播的线下运营体系。EchoAmp 将负责团队整体品牌与发展方向，并结合吉光片羽株式会社的本地运营经验，推动大阪唱跳直播团队的长期建设。',
      ],
      en: [
        'The two companies will collaborate across talent management, content operations, on-site execution, and creator development. EchoAmp will lead the team’s overall brand and direction while combining its capabilities with its partner’s local operational experience in Japan.',
      ],
    },
  },
  {
    slug: 'first-recruitment-round',
    publishedOn: '2026.08.01',
    tag: 'RECRUIT',
    category: 'recruit',
    imageUrl: '/site/shin-osaka-station.webp',
    title: {
      ja: 'EchoAmp、9月中旬より第1期メンバー募集を開始。6名を採用予定',
      zh: 'EchoAmp 将于9月中旬启动首轮团队招募，计划招募6名成员',
      en: 'EchoAmp to Begin Its First Recruitment Round in Mid-September, Seeking Six Members',
    },
    lead: {
      ja: 'EchoAmpは2026年9月中旬より、大阪で第1期メンバーの募集を開始します。初回は6名の女性クリエイターを採用予定です。',
      zh: 'EchoAmp 计划于 2026 年 9 月中旬在大阪正式启动第一轮成员招募，首期计划招募 6 名女性创作者。',
      en: 'EchoAmp will begin its first team recruitment round in Osaka in mid-September 2026, with six female creators planned for the initial lineup.',
    },
    body: {
      ja: [
        '歌やダンスのスキルに加え、カメラの前での表現力や、継続してライブ配信に取り組む意欲を重視します。選ばれたメンバーは、トレーニング、振付、ライブ配信の実践を重ねながら、最初のチームのスタイルとカルチャーを一緒につくっていきます。',
      ],
      zh: [
        '招募将重点关注唱歌、舞蹈、镜头表现力以及持续参与直播的意愿。入选成员将参与统一训练、排舞与直播实践，并作为 EchoAmp 首支唱跳直播团队的核心成员，共同建立团队早期的表演风格与文化。',
      ],
      en: [
        'Recruitment will focus on singing, dance, on-camera presence, and a strong commitment to live performance. Selected members will take part in training, choreography, and live-streaming practice while helping shape the style and culture of EchoAmp’s first performance team.',
      ],
    },
  },
  {
    slug: 'echoamp-launch',
    publishedOn: '2026.07.21',
    tag: 'PROJECT',
    category: 'project',
    imageUrl: '/site/moondollz-silhouettes.webp',
    title: {
      ja: 'EchoAmp、大阪で始動。歌とダンスを軸とした女性ライブ配信チームを結成へ',
      zh: 'EchoAmp 项目正式启动，计划在大阪打造唱跳型女子直播团体',
      en: 'EchoAmp Launches in Osaka with Plans to Build a Female Singing and Dancing Live Team',
    },
    lead: {
      ja: 'EchoAmpは、大阪でCreator Networkの運営プロジェクトを正式にスタートしました。',
      zh: 'EchoAmp 正式启动大阪地区的 Creator Network 运营计划。',
      en: 'EchoAmp has officially launched its Creator Network project in Osaka.',
    },
    body: {
      ja: [
        '歌、ダンス、ライブパフォーマンスを軸に、表現力と可能性を持つ女性クリエイターを発掘し、ひとつのライブ配信チームとして育てていきます。トレーニング、コンテンツ制作、継続的なライブ配信を通じて、チーム独自のスタイル、カルチャー、ファンコミュニティを築いていきます。',
      ],
      zh: [
        '项目将以唱歌、舞蹈与直播表演为核心，寻找具有表现力与成长潜力的女性创作者，并逐步组建稳定的女子直播团队。EchoAmp 希望把直播本身作为一种持续发生的舞台，通过训练、内容制作与长期直播，共同形成属于团队的表演风格、文化与粉丝群体。',
      ],
      en: [
        'Centered on singing, dance, and live performance, the project will discover female creators with strong potential and bring them together as a dedicated live-streaming team. Through training, content production, and continuous live shows, EchoAmp aims to build a distinctive team style, culture, and fan community around live streaming as a stage of its own.',
      ],
    },
  },
  {
    slug: 'moondollz-launch',
    publishedOn: '2026.05.01',
    tag: 'PROJECT',
    category: 'project',
    imageUrl: '/site/moondollz-key.webp',
    title: {
      ja: 'EchoAmp、ダブルキャプテン制の歌唱＆ダンスグループ企画始動を発表',
      zh: 'EchoAmp 宣布双队长制歌唱与舞蹈团体企划启动',
      en: 'EchoAmp Announces New Dual-Captain Singing and Dance Group',
    },
    lead: {
      ja: 'ダブルキャプテン制の歌唱＆ダンスグループ「MOONDOLLZ」の始動を発表しました。',
      zh: '我们宣布双队长制的歌唱与舞蹈团体「MOONDOLLZ」正式启动。',
      en: 'We announced MOONDOLLZ, a dual-captain singing and dance group.',
    },
    body: {
      ja: [
        'MOON は夢幻・夜・神秘、DOLLZ はひとりひとり異なるスタイルを持つ「団体感」、語尾の Z は Y2K とストリートの温度。三つの語を重ねたグループ名です。',
        '小ユニットごとに人物設定を分けて運営しながら、大グループとして共同でデビューします。キャプテンは綾月（MOON SIDE）と雪羽（DOLLZ SIDE）の二名。',
        'メンバーは 10 月・12 月に順次公開予定です。',
      ],
      zh: [
        'MOON 是梦幻、夜与神秘；DOLLZ 是每个人各有风格的「团体感」；结尾的 Z 是 Y2K 与街头的温度。团名由这三个词叠成。',
        '按小单元区分人物设定分别运营，同时作为大团体共同出道。两位队长是绫月（MOON SIDE）与雪羽（DOLLZ SIDE）。',
        '成员将于 10 月、12 月陆续公开。',
      ],
      en: [
        'MOON is the dreamlike, nocturnal and mysterious; DOLLZ is the sense of a troupe where every member carries her own style; the closing Z is the temperature of Y2K and streetwear. The name stacks all three.',
        'Sub-units are run with distinct character settings while debuting together as one group. The captains are Ayatsuki (MOON SIDE) and Yukiha (DOLLZ SIDE).',
        'Members will be revealed progressively in October and December.',
      ],
    },
  },
]

/**
 * 已公开成员 fixture（no.1–8）。role 是三语原始字符串，未经拆分；
 * name 是罗马字卡片主标题（不分语言），photoUrl 抄自
 * src/lib/site/content.ts 的 MEMBER_IMAGES（按 no 顺序一一对应）。
 */
export const MEMBER_SEED = [
  {
    no: 1,
    name: 'KANO',
    photoUrl: '/site/card-kano.webp',
    role: {
      ja: '花乃／儚い微笑みの罠',
      zh: '花乃／易碎微笑的陷阱',
      en: 'Kano / The trap of a fragile smile',
    },
  },
  {
    no: 2,
    name: 'MIKOTO',
    photoUrl: '/site/card-mikoto.webp',
    role: {
      ja: '美琴／優雅なる刃',
      zh: '美琴／优雅之刃',
      en: 'Mikoto / The graceful blade',
    },
  },
  {
    no: 3,
    name: 'LULU',
    photoUrl: '/site/card-lulu.webp',
    role: {
      ja: 'ルル／弾けるピンクの閃光',
      zh: '露露／炸开的粉色闪光',
      en: 'Lulu / A burst of pink light',
    },
  },
  {
    no: 4,
    name: 'CHIYO',
    photoUrl: '/site/card-chiyo.webp',
    role: {
      ja: '千夜／千の夜に舞う孤星',
      zh: '千夜／千夜起舞的孤星',
      en: 'Chiyo / Lone star dancing a thousand nights',
    },
  },
  {
    no: 5,
    name: 'AKAYA',
    photoUrl: '/site/card-akaya.webp',
    role: {
      ja: '綾香／宮廷に咲く強き桜',
      zh: '绫香／宫廷里盛放的强樱',
      en: 'Akaya / Strong cherry blossom of the court',
    },
  },
  {
    no: 6,
    name: 'YUMEKI',
    photoUrl: '/site/card-yumeki.webp',
    role: {
      ja: '夢綺／幻を織る声',
      zh: '梦绮／编织幻象的声音',
      en: 'Yumeki / The voice that weaves illusions',
    },
  },
  {
    no: 7,
    name: 'SHINO',
    photoUrl: '/site/card-shino.webp',
    role: {
      ja: '紫乃／高貴で危険な誘惑者',
      zh: '紫乃／高贵而危险的诱惑者',
      en: 'Shino / Noble and dangerous temptress',
    },
  },
  {
    no: 8,
    name: 'HIMENE',
    photoUrl: '/site/card-himene.webp',
    role: {
      ja: '姫音／音のために生まれた姫',
      zh: '姬音／为声音而生的公主',
      en: 'Himene / A princess born for sound',
    },
  },
]

/**
 * 尚未公开的卡位（no.9–12）。site_members 的
 * site_members_unrevealed_schedule 约束要求未公开行必须有 expected_reveal_on，
 * 所以这里不能写 null —— 沿用 messages/*.json 里 site.members.unrevealedRole
 * 传达的「10 月・12 月に順次公開」信息里较晚的一个月份。
 */
export const UNREVEALED_MEMBER_NOS = [9, 10, 11, 12]
export const UNREVEALED_EXPECTED_REVEAL_ON = '2026-12-01'
