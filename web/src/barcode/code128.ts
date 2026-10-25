/**
 * Minimal Code-128 generator (subset B, digits) for the standalone barcode
 * label sheet — spec §4: no DB writes, rendering lives in the web app.
 */
const PATTERNS: Record<number, string> = {
  0: '212222', 1: '222122', 2: '222221', 3: '121223', 4: '121322', 5: '131222', 6: '122213',
  7: '122312', 8: '132212', 9: '221213', 10: '221312', 11: '231212', 12: '112232', 13: '122132',
  14: '122231', 15: '113222', 16: '123122', 17: '123221', 18: '223211', 19: '221132', 20: '221231',
  21: '213212', 22: '223112', 23: '312131', 24: '311222', 25: '321122', 26: '321221', 27: '312212',
  28: '322112', 29: '322211', 30: '212123', 31: '212321', 32: '232121', 33: '111323', 34: '131123',
  35: '131321', 36: '132311', 37: '311123', 38: '311321', 39: '112133', 40: '112331', 41: '132131',
  42: '113123', 43: '113321', 44: '133121', 45: '313121', 46: '211331', 47: '231131', 48: '213113',
  49: '213311', 50: '213131', 51: '311123', 52: '311321', 53: '331121', 54: '312113', 55: '312311',
  56: '332111', 57: '314111', 58: '221411', 59: '431111', 60: '111224', 61: '111422', 62: '121124',
  63: '121421', 64: '141122', 65: '141221', 66: '112214', 67: '112412', 68: '122114', 69: '122411',
  70: '142112', 71: '142211', 72: '241211', 73: '221114', 74: '413111', 75: '241112', 76: '134111',
  77: '111242', 78: '121142', 79: '121241', 80: '114212', 81: '124112', 82: '124211', 83: '411212',
  84: '421112', 85: '421211', 86: '212141', 87: '214121', 88: '412121', 89: '111143', 90: '111341',
  91: '131141', 92: '114113', 93: '114311', 94: '411113', 95: '411311', 96: '113141', 97: '114131',
  98: '311141', 99: '411131', 100: '211412', 101: '211214', 102: '211232',
  104: '211214', // START B (shares pattern with 101)
}

const STOP = '2331112'
const QUIET = 10 // quiet zone modules each side

function modulesFromPattern(pattern: string): boolean[] {
  const out: boolean[] = []
  let bar = true
  for (const ch of pattern) {
    const n = Number(ch)
    for (let i = 0; i < n; i++) out.push(bar)
    bar = !bar
  }
  return out
}

/**
 * Returns one boolean bar per x-module (true = ink) for the full symbol.
 */
export function code128BModules(text: string): boolean[] {
  const chars = [...text]
  if (!chars.every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)) {
    throw new Error('Code 128 B supports only letters, digits and punctuation.')
  }
  const values = [104, ...chars.map((c) => c.charCodeAt(0) - 32)]
  let checksum = values[0]
  for (let i = 1; i < values.length; i++) checksum = (checksum + values[i] * i) % 103
  values.push(checksum)

  let mods: boolean[] = []
  for (const v of values) mods = mods.concat(modulesFromPattern(PATTERNS[v]))
  mods = mods.concat(modulesFromPattern(STOP))
  return [...Array(QUIET).fill(false), ...mods, ...Array(QUIET).fill(false)]
}

export function code128BSvg(text: string, opts?: { height?: number; scale?: number }): string {
  const height = opts?.height ?? 44
  const mods = code128BModules(text)
  const rect = (bar: boolean, x: number, mod: number) =>
    bar ? `<rect x="${x * mod}" y="0" width="${mod}" height="${height}" />` : ''
  const mod = opts?.scale ?? 3
  const body = mods.map((bar, i) => rect(bar, i, mod)).join('')
  const width = mods.length * mod
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges"><g fill="#000">${body}</g></svg>`
}
