export function shouldBypassMiddlewareAsset(pathname: string) {
  return pathname.includes('.')
}
