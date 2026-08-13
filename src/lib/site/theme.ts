/**
 * 官网的深/浅主题。深色是默认（设计稿的基调），浅色是等价的第二套皮肤。
 *
 * 值只落在 <html data-theme>，CSS 变量在 globals.css 的
 * `:root[data-theme='light']` 里覆盖 —— 后台不读 site-* 变量，所以这个属性
 * 对内部页面完全无副作用。
 */
export type SiteTheme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'echoamp-site-theme'

export function isSiteTheme(value: unknown): value is SiteTheme {
  return value === 'dark' || value === 'light'
}

/**
 * 首屏防闪脚本：在 CSS 之后、绘制之前把 data-theme 打上，否则选了浅色的访客
 * 每次进站都会先闪一帧纯黑。逻辑刻意写得短小——它是内联脚本。
 *
 * 优先级：本地选择 > 系统偏好 > 深色。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',s=localStorage.getItem(k);if(s!=='dark'&&s!=='light'){s=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',s)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`

/** 读取当前生效的主题（客户端）。与上面的内联脚本保持同一套优先级。 */
export function resolveTheme(): SiteTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isSiteTheme(stored)) return stored
  } catch {
    // localStorage 被禁用（隐私模式）时按系统偏好走，不报错
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: SiteTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 存不下就只在本次会话生效
  }
}
