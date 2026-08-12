const SERVICE_MEDIA = [
  { src: '/site/services-character.webp', objectPosition: '50% 24%' },
  { src: '/site/services-expression.webp', objectPosition: '50% 28%' },
] as const

export interface SiteServiceMedia {
  src: (typeof SERVICE_MEDIA)[number]['src']
  alt: string
  objectPosition: (typeof SERVICE_MEDIA)[number]['objectPosition']
}

export function buildServiceMedia(placeholders: string[]): SiteServiceMedia[] {
  return SERVICE_MEDIA.map((media, index) => ({
    ...media,
    alt: placeholders[index] ?? '',
  }))
}
