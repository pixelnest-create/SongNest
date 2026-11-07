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

/** 根据 id 算出 1~3 中的一个数字，同一首歌每次得到的占位颜色都一样 */
function toneFor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 3) + 1;
}

// 封面图片的临时网址（object URL）。每首歌只生成一次，反复渲染时复用。
const coverURLs = new Map();

/** 封面：歌曲有封面图就显示图片，没有就显示带音符的色块 */
export function coverHTML(id, { cover = null, small = false } = {}) {
  const cls = small ? 'cover sm' : 'cover';
  let inner = icon('music');
  if (cover instanceof Blob) {
    if (!coverURLs.has(id)) coverURLs.set(id, URL.createObjectURL(cover));
    inner = `<img src="${coverURLs.get(id)}" alt="">`;
  }
  return `<span class="${cls}" data-tone="${toneFor(id)}">${inner}</span>`;
}

let toastTimer;
/**
 * 在屏幕下方弹出一条提示。
 * sticky: true 时一直显示，直到下一条提示替换它。
 */
export function toast(message, { duration = 2500, sticky = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => el.classList.remove('is-visible'), duration);
}

/** 还没做的按钮，先给个提示 */
export function notYet(stage) {
  toast(`这个功能会在阶段 ${stage} 实现`);
}
