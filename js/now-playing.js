// 全屏播放页：大封面、歌名、进度条、播放模式、上一首、播放/暂停、下一首。
// 点底部播放条打开，点左上角的 ⌄ 或按 Esc 关闭。
// 背景颜色：歌曲选了颜色就用它，否则跟随封面的主色调（见 cover-color.js）。
import { icon } from './icons.js';
import { animateIn, songCoverHTML, toast } from './ui.js';
import { MODE_LABELS, cycleMode, getState, next, prev, toggle } from './player.js';
import { mountProgress, progressHTML } from './progress.js';
import { coverHue } from './cover-color.js';

const MODE_ICONS = { loop: 'repeat', one: 'repeat-once', shuffle: 'shuffle', order: 'order' };

let dialog = null;

/** 第一次打开时才创建页面，之后一直复用 */
function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'now-playing';
  dialog.setAttribute('aria-label', '正在播放');
  dialog.innerHTML = `
    <div class="np-panel">
      <header class="np-header">
        <button class="icon-btn" data-action="close" aria-label="收起播放页">${icon('chevron-down')}</button>
        <span class="np-label">正在播放</span>
        <span class="icon-btn" aria-hidden="true"></span>
      </header>

      <div class="np-body">
        <div class="np-cover" data-role="cover"></div>

        <div class="np-info">
          <div class="np-text">
            <h2 class="np-title" data-role="title"></h2>
            <p class="np-artist" data-role="artist"></p>
          </div>
          <button class="icon-btn np-mode" data-action="mode"></button>
        </div>

        ${progressHTML('np-progress', { stacked: true })}

        <div class="np-controls">
          <button class="np-skip" data-action="prev" aria-label="上一首">${icon('prev-filled')}</button>
          <button class="np-play" data-action="toggle"></button>
          <button class="np-skip" data-action="next" aria-label="下一首">${icon('next-filled')}</button>
        </div>
      </div>
    </div>
  `;
  document.body.append(dialog);

  const panel = dialog.querySelector('.np-panel');
  const $ = (role) => dialog.querySelector(`[data-role="${role}"]`);
  const modeBtn = dialog.querySelector('[data-action="mode"]');
  const toggleBtn = dialog.querySelector('[data-action="toggle"]');
  const nextBtn = dialog.querySelector('[data-action="next"]');
  let shownSongId;
  let shownCover;

  function render({ song, playing, mode, hasNext }) {
    if (!song) {
      if (dialog.open) dialog.close();
      return;
    }
    shownSongId = song.id;
    // 封面和背景色只在封面变了时重画；文字每次都更新（歌名、歌手可能被编辑过）
    const coverKey = `${song.id}|${Boolean(song.cover)}|${song.color}`;
    if (coverKey !== shownCover) {
      shownCover = coverKey;
      $('cover').innerHTML = songCoverHTML(song, { size: 'lg' });
      paintBackground(song);
    }
    $('title').textContent = song.title;
    $('artist').textContent = song.artist ?? '未知歌手';
    toggleBtn.innerHTML = icon(playing ? 'pause-filled' : 'play-filled');
    toggleBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    modeBtn.innerHTML = icon(MODE_ICONS[mode]);
    modeBtn.setAttribute('aria-label', `播放模式：${MODE_LABELS[mode]}，点击切换`);
    nextBtn.disabled = !hasNext;
  }

  /** 取封面主色调，设置到 CSS 变量上，由 CSS 画出渐变背景 */
  async function paintBackground(song) {
    const { h, s } = await coverHue(song);
    if (song.id !== shownSongId) return; // 取色期间已经换歌了
    panel.style.setProperty('--np-h', String(h));
    panel.style.setProperty('--np-s', `${s}%`);
  }

  dialog.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    switch (action) {
      case 'close': dialog.close(); break;
      case 'toggle': toggle(); break;
      case 'prev': prev(); break;
      case 'next': next(); break;
      case 'mode': toast(MODE_LABELS[cycleMode()]); break;
    }
  });

  mountProgress(dialog);
  // 封面换成了另一张图（「有没有封面」没变，上面的 coverKey 看不出来）：下次一定重画
  window.addEventListener('cover:change', (e) => {
    if (e.detail.songId === shownSongId) shownCover = null;
  });
  window.addEventListener('player:change', (e) => render(e.detail));
  render(getState());
}

export function openNowPlaying() {
  if (!getState().song) return;
  if (!dialog) build();
  dialog.showModal();
  animateIn(dialog.querySelector('.np-panel'), 'slideUp');
}
