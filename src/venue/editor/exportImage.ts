// 场地布置的导出:JSON 文件、2D 平面图 PNG、3D 视图 PNG。只在浏览器里调用。

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadFile(filename: string, content: string, type: string) {
  downloadBlob(filename, new Blob([content], { type }))
}

// In 3D, grab the WebGL canvas directly (preserveDrawingBuffer is enabled).
export function exportCanvasAsPng(
  canvasEl: HTMLCanvasElement | null | undefined,
  filename: string,
  onError: () => void,
) {
  if (!canvasEl) {
    onError()
    return
  }
  try {
    canvasEl.toBlob((blob) => {
      if (!blob) {
        onError()
        return
      }
      downloadBlob(filename, blob)
    }, 'image/png')
  } catch {
    onError()
  }
}

// Rasterize the canvas SVG to a PNG at the floor's native resolution
// (2x for retina sharpness). The selection chrome is stripped from a clone
// first, and a white backdrop is painted so transparent regions don't turn
// black in the PNG.
export function exportSvgAsPng(
  svg: SVGSVGElement | null,
  size: { width: number; height: number },
  filename: string,
  onError: () => void,
) {
  if (!svg) {
    onError()
    return
  }
  try {
    const width = size.width
    const height = size.height
    const scale = 2

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.querySelectorAll('[data-venue-selection]').forEach((node) => node.remove())
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(height))

    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`
    const svgUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))

    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          onError()
          return
        }
        ctx.fillStyle = '#ffffff' // style-tokens-ignore：canvas 2D 导出底色，非 UI 样式
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (!blob) {
            onError()
            return
          }
          downloadBlob(filename, blob)
        }, 'image/png')
      } catch {
        onError()
      } finally {
        URL.revokeObjectURL(svgUrl)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      onError()
    }
    image.src = svgUrl
  } catch {
    onError()
  }
}
