export function formatFileSize(bytes: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })

  if (bytes < 1024) {
    return `${formatter.format(bytes)} B`
  }

  if (bytes < 1024 * 1024) {
    return `${formatter.format(bytes / 1024)} KB`
  }

  return `${formatter.format(bytes / (1024 * 1024))} MB`
}
