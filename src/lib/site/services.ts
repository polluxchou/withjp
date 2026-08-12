const SERVICE_MEDIA_PATHS = [
  '/site/services-character.webp',
  '/site/services-expression.webp',
] as const

export interface SiteServiceMedia {
  src: (typeof SERVICE_MEDIA_PATHS)[number]
  alt: string
}

export function buildServiceMedia(placeholders: string[]): SiteServiceMedia[] {
  return SERVICE_MEDIA_PATHS.map((src, index) => ({
    src,
    alt: placeholders[index] ?? '',
  }))
}
