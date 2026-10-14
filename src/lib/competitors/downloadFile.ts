// src/lib/competitors/downloadFile.ts
// 触发浏览器下载的那一小层。只有这里碰 DOM / fetch，名字派生与打包都在
// shotDownload.ts 和 zip.ts 里，那两个是纯函数、有测试。

/**
 * 把一段字节存成文件。
 *
 * 不能直接 `<a href={远程URL} download>`：`download` 属性对跨源地址是被忽略的，
 * 点下去会变成在新标签页打开图片而不是下载。必须先把内容取回来变成同源 blob。
 */
export function saveBlob(data: Uint8Array<ArrayBuffer>, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 会让部分浏览器来不及开始下载，挪到下一轮事件循环。
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** 取回一张截图的原始字节。Supabase 存储对象带 `access-control-allow-origin: *`。 */
export async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
