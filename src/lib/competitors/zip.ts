// src/lib/competitors/zip.ts
// 最小 ZIP 打包器（存储法，不压缩）。
//
// 为什么自己写而不是引一个 jszip：
//   1. 要打的全是 webp/jpeg/png，已经压过了，再 deflate 一遍基本不省体积却要多跑
//      一轮 CPU —— 存储法(method 0)才是这个场景的正解，而存储法的 ZIP 只是
//      「头 + 原始字节 + 中央目录」，不需要压缩库。
//   2. 只为这一个下载按钮往前端 bundle 里塞一个通用压缩库不划算。
//
// 为什么打包放在浏览器而不是服务端：Vercel 的函数响应体上限约 4.5MB，
// 单张截图上限就有 5MB，一天六张能到 30MB，走服务端必然被截断。
// Supabase 存储对象带 `access-control-allow-origin: *`，前端直接 fetch 得到。
//
// 不支持也不需要支持的：目录项、Zip64（单文件或总量超 4GB）、加密、注释。
// 一天的截图撑死几十 MB，离 Zip64 的门槛很远。

/** CRC-32/ISO-HDLC。ZIP 每个条目都要带它，解压端靠它校验。 */
const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** 语言编码标志位(bit 11)：文件名按 UTF-8 解。不置的话 Windows 上中文名是乱码。 */
const FLAG_UTF8 = 0x0800
/** 压缩方法 0 = 存储(不压缩)。 */
const METHOD_STORE = 0
/**
 * DOS 日期 1980-01-01：(年-1980)<<9 | 月<<5 | 日。
 *
 * 不带真实时间戳（截图的时间信息在库里，不靠文件属性传），但也不能填 0 ——
 * 0 是「0 月 0 日」，unzip -l 会列出 `00-00-1980` 这种非法日期，部分解压工具
 * 会因此告警。1980-01-01 是 DOS 时间戳能表示的最小合法值。
 */
const DOS_DATE_1980 = (1 << 5) | 1

export function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const prepared = entries.map((e) => {
    const name = enc.encode(e.name)
    return { name, data: e.data, crc: crc32(e.data) }
  })

  // 本地头 30 + 名字 + 数据；中央目录记录 46 + 名字；EOCD 22。先算总长再一次分配，
  // 免得反复扩容拷贝几十 MB。
  const localSize = prepared.reduce((n, p) => n + 30 + p.name.length + p.data.length, 0)
  const centralSize = prepared.reduce((n, p) => n + 46 + p.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let at = 0

  const offsets: number[] = []
  for (const p of prepared) {
    offsets.push(at)
    view.setUint32(at, 0x04034b50, true)      // 本地文件头签名 PK\3\4
    view.setUint16(at + 4, 20, true)          // 解压所需版本 2.0
    view.setUint16(at + 6, FLAG_UTF8, true)
    view.setUint16(at + 8, METHOD_STORE, true)
    view.setUint16(at + 10, 0, true)          // 修改时间 00:00:00
    view.setUint16(at + 12, DOS_DATE_1980, true)
    view.setUint32(at + 14, p.crc, true)
    view.setUint32(at + 18, p.data.length, true)  // 压缩后大小(存储法 = 原始大小)
    view.setUint32(at + 22, p.data.length, true)  // 原始大小
    view.setUint16(at + 26, p.name.length, true)
    view.setUint16(at + 28, 0, true)          // 扩展字段长度
    at += 30
    out.set(p.name, at); at += p.name.length
    out.set(p.data, at); at += p.data.length
  }

  const centralStart = at
  prepared.forEach((p, i) => {
    view.setUint32(at, 0x02014b50, true)      // 中央目录头签名 PK\1\2
    view.setUint16(at + 4, 20, true)          // 生成方版本
    view.setUint16(at + 6, 20, true)          // 解压所需版本
    view.setUint16(at + 8, FLAG_UTF8, true)
    view.setUint16(at + 10, METHOD_STORE, true)
    view.setUint16(at + 12, 0, true)          // 修改时间
    view.setUint16(at + 14, DOS_DATE_1980, true)
    view.setUint32(at + 16, p.crc, true)
    view.setUint32(at + 20, p.data.length, true)
    view.setUint32(at + 24, p.data.length, true)
    view.setUint16(at + 28, p.name.length, true)
    view.setUint16(at + 30, 0, true)          // 扩展字段
    view.setUint16(at + 32, 0, true)          // 注释
    view.setUint16(at + 34, 0, true)          // 起始盘号
    view.setUint16(at + 36, 0, true)          // 内部属性
    view.setUint32(at + 38, 0, true)          // 外部属性
    view.setUint32(at + 42, offsets[i], true) // 对应本地头的偏移
    at += 46
    out.set(p.name, at); at += p.name.length
  })

  view.setUint32(at, 0x06054b50, true)        // EOCD 签名 PK\5\6
  view.setUint16(at + 4, 0, true)             // 本盘号
  view.setUint16(at + 6, 0, true)             // 中央目录起始盘号
  view.setUint16(at + 8, prepared.length, true)
  view.setUint16(at + 10, prepared.length, true)
  view.setUint32(at + 12, centralSize, true)
  view.setUint32(at + 16, centralStart, true)
  view.setUint16(at + 20, 0, true)            // 注释长度
  return out
}
