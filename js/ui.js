// 各个页面共用的小工具函数
import { icon } from './icons.js';

/** 把用户输入的文字转义，防止歌名里的 < > 被当成 HTML 执行 */
export function escapeHTML(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** 269.5 → "4:29" */
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

/** 封面：有图片就显示图片，没有就显示带音符的色块 */
export function coverHTML(id, { coverURL = null, small = false } = {}) {
  const cls = small ? 'cover sm' : 'cover';
  const inner = coverURL ? `<img src="${escapeHTML(coverURL)}" alt="">` : icon('music');
  return `<span class="${cls}" data-tone="${toneFor(id)}">${inner}</span>`;
}

let toastTimer;
/** 在屏幕下方弹出一条提示，2 秒后消失 */
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2000);
}

/** 阶段 2 里还没做的按钮，先给个提示 */
export function notYet(stage) {
  toast(`这个功能会在阶段 ${stage} 实现`);
}
