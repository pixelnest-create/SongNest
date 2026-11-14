// 每首歌的「颜色」：决定全屏播放页的背景渐变，以及没有封面时色块的颜色。
// 在歌曲的「⋯ → 设置颜色」里选。歌曲信息里存的是下面的 id（比如 'blue'），
// 没选（null）就是「自动」：有封面跟随封面的颜色，没封面用随机分到的暖色。
//
// 只记色相 h（0~360）和饱和度 s（0~50），亮度由 CSS 根据浅色/深色模式决定，
// 和 cover-color.js 从封面取色的做法一样，所以不管选哪种颜色，文字都看得清。

export const SONG_COLORS = [
  { id: 'orange', label: '暖橙', h: 32, s: 50 },
  { id: 'coral', label: '珊瑚', h: 8, s: 50 },
  { id: 'pink', label: '樱花', h: 340, s: 45 },
  { id: 'purple', label: '薰衣草', h: 265, s: 40 },
  { id: 'blue', label: '晴空', h: 210, s: 50 },
  { id: 'teal', label: '湖水', h: 175, s: 35 },
  { id: 'green', label: '抹茶', h: 95, s: 35 },
  { id: 'gray', label: '奶灰', h: 30, s: 10 },
];

/** 这首歌选的颜色；没选或者不认识的 id 返回 null（= 自动） */
export function songColor(song) {
  return SONG_COLORS.find((c) => c.id === song?.color) ?? null;
}

/** 色块用的 CSS 变量，配合 main.css 里的 [data-color] 规则 */
export function colorStyle({ h, s }) {
  return `--cover-h:${h};--cover-s:${s}`;
}

/** 锁屏封面（画在 canvas 上）用的浅色，和 main.css 浅色模式下的色块一致 */
export function placeholderFill({ h, s }) {
  return `hsl(${h} ${Math.min(80, s * 1.5)}% 84%)`;
}
