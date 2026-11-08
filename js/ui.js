// 各个页面共用的小工具函数
import { icon } from './icons.js';

/** 把用户输入的文字转义，防止歌名里的 < > 被当成 HTML 执行 */
export function escapeHTML(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** 269.5 → "4:29"；没有时长时显示 "--:--" */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 1536000 → "1.5 MB" */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 根据 id 算出 1~3 中的一个数字，同一首歌每次得到的占位颜色都一样 */
export function toneFor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 3) + 1;
}

// 封面图片的临时网址（object URL）。每首歌只生成一次，反复渲染时复用。
// 以「歌曲 id」为键，因为一首歌的封面不会变。
const coverURLs = new Map();
// 封面换了（比如替换音频时用上了新文件的封面）：丢掉旧网址
window.addEventListener('cover:change', (e) => {
  const url = coverURLs.get(e.detail.songId);
  if (url) URL.revokeObjectURL(url);
  coverURLs.delete(e.detail.songId);
});

/**
 * 封面：有封面图就显示图片，没有就显示带音符的色块。
 * id 决定占位色块的颜色；coverSongId 是封面图来自哪首歌（默认就是 id）。
 * 歌单用第一首有封面的歌做封面，所以两者会不同。
 */
export function coverHTML(id, { cover = null, coverSongId = id, small = false, size = small ? 'sm' : '' } = {}) {
  const cls = size ? `cover ${size}` : 'cover';
  let inner = icon('music');
  if (cover instanceof Blob) {
    if (!coverURLs.has(coverSongId)) coverURLs.set(coverSongId, URL.createObjectURL(cover));
    inner = `<img src="${coverURLs.get(coverSongId)}" alt="">`;
  }
  return `<span class="${cls}" data-tone="${toneFor(id)}">${inner}</span>`;
}

/**
 * 弹窗出现时的动画。要在 showModal() 之后「立刻」调用（同一段代码里，中间不要 await）。
 *
 * 为什么不用 CSS 动画：CSS 动画挂在 [open] 状态上时，iPhone 的 Safari 会先把弹窗在
 * 最终位置画一帧，下一帧才开始动画，看起来就是「出现 → 消失 → 再滑上来」。
 * 用 JavaScript 的 element.animate() 在打开的同时启动，第一帧就是动画的起点。
 */
export function animateIn(el, kind) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const presets = {
    slideUp: { keyframes: [{ transform: 'translateY(100%)' }, { transform: 'none' }], duration: 220 },
    pop: { keyframes: [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], duration: 180 },
  };
  const { keyframes, duration } = presets[kind];
  el.animate(keyframes, { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
}

let toastTimer;
let toastEl = null;
/**
 * 在屏幕下方弹出一条提示。
 * sticky: true 时一直显示，直到下一条提示替换它。
 */
export function toast(message, { duration = 2500, sticky = false } = {}) {
  // 记住提示条元素本身：它可能被临时放进某个弹窗里，弹窗关闭删除后，
  // 用 getElementById 就找不到它了，但这个变量还指着它
  toastEl ??= document.getElementById('toast');
  const el = toastEl;
  // 弹窗（<dialog>）显示在最上层，会盖住页面上的提示条。
  // 所以有弹窗打开时，把提示条临时放进弹窗里。
  const host = [...document.querySelectorAll('dialog[open]')].pop() ?? document.body;
  if (el.parentElement !== host) host.append(el);
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => el.classList.remove('is-visible'), duration);
}
