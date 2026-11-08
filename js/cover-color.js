// 从封面图里取一个「主色调」，用来给全屏播放页的背景上色。
// 只取色相（H）和饱和度（S），亮度由 CSS 根据浅色/深色模式决定，
// 这样不管封面多暗多亮，背景上的文字都看得清。
import { toneFor } from './ui.js';

// 没有封面时，用占位色块对应的颜色（和 --cover-1/2/3 同一色系）
const TONE_HS = {
  1: { h: 32, s: 50 },
  2: { h: 24, s: 35 },
  3: { h: 93, s: 25 },
};
const MAX_SATURATION = 50; // 太鲜艳的颜色做背景会刺眼，限制一下

const cache = new Map(); // 歌曲 id → { h, s }，每首歌只算一次
window.addEventListener('cover:change', (e) => cache.delete(e.detail.songId)); // 封面换了，重新取色

/** 返回 { h: 0~360, s: 0~50 } */
export async function coverHue(song) {
  if (cache.has(song.id)) return cache.get(song.id);
  let hs = TONE_HS[toneFor(song.id)];
  if (song.cover instanceof Blob) {
    try {
      hs = await averageHueSat(song.cover);
    } catch {
      // 图片解码失败就用占位色
    }
  }
  cache.set(song.id, hs);
  return hs;
}

/** 把图片缩到 24×24，求平均颜色。越鲜艳的像素权重越大，避免被大片灰白背景冲淡 */
async function averageHueSat(blob) {
  const bitmap = await createImageBitmap(blob);
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close?.();

  const data = ctx.getImageData(0, 0, size, size).data;
  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const weight = 0.15 + (max ? (max - min) / max : 0);
    r += data[i] * weight;
    g += data[i + 1] * weight;
    b += data[i + 2] * weight;
    total += weight;
  }
  return toHueSat(r / total, g / total, b / total);
}

/** RGB → 色相、饱和度（HSL） */
function toHueSat(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 30, s: 0 }; // 纯灰色
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round((h * 60 + 360) % 360);
  const s = d / (1 - Math.abs(2 * l - 1));
  return { h, s: Math.round(Math.min(MAX_SATURATION, s * 100)) };
}
