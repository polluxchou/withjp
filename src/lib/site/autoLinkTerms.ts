export type AutoLinkTerm = { term: string; url: string }

// 官网文案里第一次出现哪个品牌英文名要自动加粗+链接到对方官网，就在这里登记
// 一条。目前只有 Polyjuice 这一条。
export const AUTO_LINK_TERMS: readonly AutoLinkTerm[] = [
  { term: 'Polyjuice', url: 'https://polyjuiceavatar.com' },
]

export type AutoLinkSplit = { before: string; match: string; url: string; after: string }

// 在 text 里找 AUTO_LINK_TERMS 中第一个命中、且还没处理过（不在 seen 里）的
// 品牌名，按整词边界匹配（大小写敏感，不会匹配到更长单词里的子串），命中后
// 把该品牌名记入 seen 并把文本切成 before/match/after 三段返回；调用方对
// after 段递归调用即可处理同一段文案里出现的其它品牌名。同一个 seen 集合
// 在调用方那边跨多次调用共享，用来实现「同一篇文章/同一处文案只处理第一次
// 出现」——已经处理过的品牌名不会再被切出来。
export function findFirstAutoLink(text: string, seen: Set<string>): AutoLinkSplit | null {
  for (const { term, url } of AUTO_LINK_TERMS) {
    if (seen.has(term)) continue
    const found = text.match(new RegExp(`\\b${term}\\b`))
    if (!found || found.index === undefined) continue
    seen.add(term)
    return {
      before: text.slice(0, found.index),
      match: found[0],
      url,
      after: text.slice(found.index + found[0].length),
    }
  }
  return null
}
