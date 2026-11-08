// 生成应用图标（PNG）。不依赖任何第三方库：
// 用「距离场」的方法逐像素判断是否落在图形里，再自己编码成 PNG。
// 用法：node scripts/make-icons.mjs   → 输出到 icons/
//
// 图标设计：暖橙色底 + 奶油色音符（和应用里的音符图标同一个形状，但是实心、加粗）

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
const BG = [0xe8, 0x91, 0x3a];   // --accent
const FG = [0xff, 0xf8, 0xee];   // 奶油色
const SAMPLES = 4;               // 每个像素 4×4 次采样，边缘平滑（抗锯齿）

// 音符的形状，坐标基于 24×24 的网格（和 Tabler 的 music 图标一致）
const SHAPES = [
  { type: 'circle', x: 6, y: 17, r: 3.2 },          // 左边的符头
  { type: 'circle', x: 16, y: 17, r: 3.2 },         // 右边的符头
  { type: 'line', x1: 8.1, y1: 16.2, x2: 8.1, y2: 4.4, w: 2.2 },   // 左符干
  { type: 'line', x1: 18.1, y1: 16.2, x2: 18.1, y2: 4.4, w: 2.2 }, // 右符干
  { type: 'line', x1: 8.1, y1: 4.4, x2: 18.1, y2: 4.4, w: 2.6 }, // 上横梁
  { type: 'line', x1: 8.1, y1: 8.6, x2: 18.1, y2: 8.6, w: 2.2 }, // 下横梁
];
const CENTER = { x: 12.1, y: 11.4 }; // 音符的视觉中心

/** 点 (px, py) 是否在音符里面 */
function inside(px, py) {
  for (const s of SHAPES) {
    if (s.type === 'circle') {
      if ((px - s.x) ** 2 + (py - s.y) ** 2 <= s.r ** 2) return true;
    } else {
      // 到线段的距离 ≤ 线宽的一半（两端是圆头）
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy)));
      const cx = s.x1 + t * dx, cy = s.y1 + t * dy;
      if ((px - cx) ** 2 + (py - cy) ** 2 <= (s.w / 2) ** 2) return true;
    }
  }
  return false;
}

/**
 * 画一张 size×size 的图标。
 * noteScale：音符（24 网格）占图标边长的比例。「可遮罩」图标要更小，因为四周会被裁掉
 */
function render(size, noteScale) {
  const pixels = Buffer.alloc(size * size * 4);
  const unit = (size * noteScale) / 24; // 网格里的 1 = 多少像素
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const gx = (x + (sx + 0.5) / SAMPLES - size / 2) / unit + CENTER.x;
          const gy = (y + (sy + 0.5) / SAMPLES - size / 2) / unit + CENTER.y;
          if (inside(gx, gy)) hits++;
        }
      }
      const a = hits / (SAMPLES * SAMPLES); // 这个像素有多少被音符覆盖
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
      pixels[i + 3] = 255;
    }
  }
  return encodePNG(size, size, pixels);
}

// ---------- PNG 编码 ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // 每个通道 8 位
  ihdr[9] = 6;  // RGBA
  // 每一行前面加一个字节 0（表示这一行不做过滤）
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 输出 ----------

mkdirSync(OUT, { recursive: true });
const icons = [
  ['apple-touch-icon.png', 180, 0.62], // iPhone 主屏幕图标（系统会自动加圆角）
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['icon-maskable-512.png', 512, 0.5], // 安卓「可遮罩」图标：四周可能被裁成圆形，音符要更小
];
for (const [name, size, scale] of icons) {
  const png = render(size, scale);
  writeFileSync(OUT + name, png);
  console.log(`icons/${name}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
