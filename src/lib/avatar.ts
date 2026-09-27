/** 头像调色板。长度必须与 worker 端的 AVATAR_COLOR_COUNT 一致，
 *  服务端只校验下标范围，具体颜色在这里定义，改配色不用动数据库。 */
export const AVATAR_PALETTES: Array<{ from: string; to: string }> = [
  { from: '#7c5cff', to: '#00e5ff' },
  { from: '#ff5ca8', to: '#ffd166' },
  { from: '#3ddc97', to: '#00b4d8' },
  { from: '#ff9f43', to: '#ee5253' },
  { from: '#5f3dc4', to: '#a855f7' },
  { from: '#0ea0c0', to: '#22d3ee' },
  { from: '#e84393', to: '#fd79a8' },
  { from: '#2d3436', to: '#636e72' },
]

/** 资料选择器里可选的 emoji。上限 8 个字符，超过的服务端会 400 */
export const AVATAR_EMOJIS = [
  '🎮', '🚀', '🤖', '👾', '👻',
  '🐱', '🐶', '🦊', '🐼', '🐨',
  '🦁', '🐯', '🐸', '🐵', '🦄',
  '🦖', '🦉', '🐳', '🐙', '🦋',
  '🌸', '🌻', '🌊', '🔥', '⚡',
  '🌙', '⭐', '✨', '🍀', '🌈',
  '🎯', '🎲', '🎸', '🃏', '⚽',
  '🏀', '🏆', '🥇', '🍕', '🍩',
] as const

/** 把接口返回的下标收敛到调色板范围内，非法/越界一律回落到第 0 项 */
export function paletteIndex(value: number | string | undefined): number {
  const n = Number(value ?? 0)
  if (!Number.isInteger(n) || n < 0 || n >= AVATAR_PALETTES.length) return 0
  return n
}

export function avatarGradient(value: number | string | undefined): string {
  const p = AVATAR_PALETTES[paletteIndex(value)]
  return `linear-gradient(135deg, ${p.from}, ${p.to})`
}
