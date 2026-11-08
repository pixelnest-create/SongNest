// 全屏播放页：大封面、歌名、进度条、播放模式、上一首、播放/暂停、下一首。
// 点底部播放条打开，点左上角的 ⌄ 或按 Esc 关闭。
import { icon } from './icons.js';
import { coverHTML, toast } from './ui.js';
import { MODE_LABELS, cycleMode, getState, next, prev, toggle } from './player.js';
import { mountProgress, progressHTML } from './progress.js';

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
        <span class="np-position" data-role="position"></span>
        <span class="icon-btn" aria-hidden="true"></span>
      </header>

      <div class="np-cover" data-role="cover"></div>

      <div class="np-info">
        <h2 class="np-title" data-role="title"></h2>
        <p class="np-artist" data-role="artist"></p>
      </div>

      ${progressHTML('np-progress')}

      <div class="np-controls">
        <button class="icon-btn np-mode" data-action="mode"></button>
        <button class="icon-btn np-skip" data-action="prev" aria-label="上一首">${icon('prev')}</button>
        <button class="np-play" data-action="toggle"></button>
        <button class="icon-btn np-skip" data-action="next" aria-label="下一首">${icon('next')}</button>
        <span class="icon-btn" aria-hidden="true"></span>
      </div>
    </div>
  `;
  document.body.append(dialog);

  const $ = (role) => dialog.querySelector(`[data-role="${role}"]`);
  const modeBtn = dialog.querySelector('[data-action="mode"]');
  const toggleBtn = dialog.querySelector('[data-action="toggle"]');
  const nextBtn = dialog.querySelector('[data-action="next"]');
  let shownSongId;

  function render({ song, playing, mode, hasNext, position, total }) {
    if (!song) {
      if (dialog.open) dialog.close();
      return;
    }
    if (song.id !== shownSongId) {
      shownSongId = song.id;
      $('cover').innerHTML = coverHTML(song.id, { cover: song.cover, size: 'lg' });
      $('title').textContent = song.title;
      $('artist').textContent = song.artist ?? '未知歌手';
    }
    $('position').textContent = total > 1 ? `${position} / ${total}` : '';
    toggleBtn.innerHTML = icon(playing ? 'pause' : 'play');
    toggleBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    modeBtn.innerHTML = icon(MODE_ICONS[mode]);
    modeBtn.setAttribute('aria-label', `播放模式：${MODE_LABELS[mode]}，点击切换`);
    modeBtn.dataset.mode = mode;
    nextBtn.disabled = !hasNext;
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
  window.addEventListener('player:change', (e) => render(e.detail));
  render(getState());
}

export function openNowPlaying() {
  if (!getState().song) return;
  if (!dialog) build();
  dialog.showModal();
}
