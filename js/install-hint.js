// 歌曲库顶部的提示卡片：
//   1. 在 iPhone 的 Safari 里打开时 → 教用户「添加到主屏幕」
//   2. 已经从主屏幕打开时 → 第一次提醒「删除应用会删除歌曲」
// 用户点 × 或「知道了」后不再显示（记在 localStorage 里）。
// 地址后面加 ?hint 可以强制显示第 1 种，方便在电脑上预览。
import { icon } from './icons.js';

const KEYS = { install: 'songnest.hint.install', data: 'songnest.hint.data' };

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad 的桌面模式
}

/** 是否是从主屏幕图标打开的（独立应用模式） */
export function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

function dismissed(key) {
  try { return localStorage.getItem(KEYS[key]) === '1'; } catch { return false; }
}

export function dismissHint(key) {
  try { localStorage.setItem(KEYS[key], '1'); } catch { /* 存不了就算了，下次还会显示 */ }
}

/** 返回要显示的提示卡片 HTML；不需要提示时返回空字符串 */
export function hintHTML() {
  const forced = new URLSearchParams(location.search).has('hint');

  if (forced || (isIOS() && !isStandalone() && !dismissed('install'))) {
    return `
      <aside class="hint">
        ${icon('share')}
        <div class="hint-text">
          <p class="hint-title">把 SongNest 添加到主屏幕</p>
          <p>点 Safari 下方的「分享」按钮，再选「添加到主屏幕」。这样用起来就像普通应用，歌曲也不会被系统自动清理。</p>
        </div>
        <button class="icon-btn" data-action="dismiss-hint" data-hint="install" aria-label="不再提示">${icon('x')}</button>
      </aside>
    `;
  }

  if (isStandalone() && !dismissed('data')) {
    return `
      <aside class="hint">
        ${icon('info')}
        <div class="hint-text">
          <p class="hint-title">歌曲只保存在这台手机上</p>
          <p>从主屏幕删除 SongNest，会同时删除里面所有的歌曲和歌单。</p>
          <button class="btn btn-soft hint-ok" data-action="dismiss-hint" data-hint="data">知道了</button>
        </div>
      </aside>
    `;
  }

  return '';
}
