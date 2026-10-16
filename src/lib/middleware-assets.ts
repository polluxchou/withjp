// 静态资源直接放行，不走 next-intl 改写与 Supabase 会话检查。
//
// 以前的判据是「路径里有 . 就放行」，那样 /zh/creators/x.y 这种落在动态路由上的
// 页面请求也会整个跳过登录门。现在只认最后一段带下面这些扩展名的：public/ 里
// 实际放的类型（webp、mp4）、Next 元数据路由（/icon.svg、/robots.txt、
// /sitemap.xml）、浏览器默认会要的 favicon.ico，外加几种常见图片。
// 往 public/ 放新类型的文件要在这里加扩展名，middleware-assets.test.ts 会逐个核对。
const STATIC_ASSET_EXT_RE = /\.(?:avif|gif|ico|jpe?g|mp4|png|svg|txt|webm|webp|xml)$/i

// 扩展名里没有 /，锚在结尾就等于只看最后一段：/zh/a.png/team 不放行。
export function shouldBypassMiddlewareAsset(pathname: string) {
  return STATIC_ASSET_EXT_RE.test(pathname)
}
