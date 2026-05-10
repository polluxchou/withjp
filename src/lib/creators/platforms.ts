export const CREATOR_PLATFORMS = [
  'Douyin',
  'Bilibili',
  'YouTube',
  'TikTok',
  'Instagram',
  'Kuaishou',
  'Xiaohongshu',
  'Twitch',
  'Other',
] as const

const PLATFORM_ALIASES: Record<string, (typeof CREATOR_PLATFORMS)[number]> = {
  douyin: 'Douyin',
  bilibili: 'Bilibili',
  youtube: 'YouTube',
  'you tube': 'YouTube',
  tiktok: 'TikTok',
  'tik tok': 'TikTok',
  instagram: 'Instagram',
  insta: 'Instagram',
  kuaishou: 'Kuaishou',
  xiaohongshu: 'Xiaohongshu',
  'xiao hong shu': 'Xiaohongshu',
  twitch: 'Twitch',
  other: 'Other',
}

function normalizePlatformKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

export function normalizeCreatorPlatform(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  return PLATFORM_ALIASES[normalizePlatformKey(trimmed)] ?? trimmed
}

/**
 * Generate platform profile URL from platform name and user ID
 * Returns null if platform doesn't support direct URL generation
 *
 * Supported platforms:
 * - Douyin (抖音): https://www.douyin.com/user/{MS4wLjABAAAA...}
 * - Bilibili (B站): https://space.bilibili.com/{uid}
 * - Kuaishou (快手): https://www.kuaishou.com/profile/{user_id}
 * - Xiaohongshu (小红书): https://www.xiaohongshu.com/user/profile/{user_id}
 * - TikTok: https://www.tiktok.com/@{username}
 * - Instagram: https://www.instagram.com/{username}
 * - YouTube: https://www.youtube.com/@{username} or /channel/{channelId}
 * - Twitch: https://www.twitch.tv/{username}
 */
export function getPlatformUrl(platform: string, userId: string | undefined): string | null {
  if (!userId) return null

  const normalizedPlatform = normalizeCreatorPlatform(platform)
  const cleanId = userId.trim().replace(/^@/, '') // Remove @ prefix if present

  switch (normalizedPlatform) {
    // 国际平台
    case 'TikTok':
      return `https://www.tiktok.com/@${cleanId}`

    case 'Instagram':
      return `https://www.instagram.com/${cleanId}`

    case 'YouTube':
      // Support both @username and channel ID formats
      if (cleanId.startsWith('UC') && cleanId.length === 24) {
        return `https://www.youtube.com/channel/${cleanId}`
      }
      return `https://www.youtube.com/@${cleanId}`

    case 'Twitch':
      return `https://www.twitch.tv/${cleanId}`

    // 中国平台
    case 'Douyin':
      // 抖音用户ID格式: MS4wLjABAAAA... (sec_uid)
      // 也支持短链接格式的数字ID
      if (cleanId.startsWith('MS4w')) {
        return `https://www.douyin.com/user/${cleanId}`
      }
      // 如果是纯数字，可能是短链接ID
      return `https://www.douyin.com/user/${cleanId}`

    case 'Bilibili':
      // B站用户ID是纯数字 UID
      return `https://space.bilibili.com/${cleanId}`

    case 'Kuaishou':
      // 快手用户ID
      return `https://www.kuaishou.com/profile/${cleanId}`

    case 'Xiaohongshu':
      // 小红书用户ID (通常是24位十六进制字符串)
      return `https://www.xiaohongshu.com/user/profile/${cleanId}`

    default:
      return null
  }
}
