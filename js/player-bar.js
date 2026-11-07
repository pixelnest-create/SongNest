// 底部播放条：显示当前歌曲、播放/暂停、下一首、进度条
import { icon } from './icons.js';
import { coverHTML, escapeHTML, formatDuration } from './ui.js';
import { getState, next, seek, toggle } from './player.js';

export function mountPlayerBar(bar) {
  bar.innerHTML = `
    <div class="pb-main">
      <span data-role="cover"></span>
      <span class="row-text">
        <span class="row-title" data-role="title"></span>
        <span class="row-sub" data-role="artist"></span>
      </span>
      <button class="icon-btn" data-action="toggle"></button>
      <button class="icon-btn" data-action="next" aria-label="下一首">${icon('next')}</button>
    </div>
    <div class="pb-progress">
      <span class="pb-time" data-role="elapsed">0:00</span>
      <input class="seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="播放进度">
      <span class="pb-time" data-role="remaining">0:00</span>
    </div>
  `;

  const $ = (role) => bar.querySelector(`[data-role="${role}"]`);
  const toggleBtn = bar.querySelector('[data-action="toggle"]');
  const nextBtn = bar.querySelector('[data-action="next"]');
  const range = bar.querySelector('.seek');

  let shownSongId; // 当前显示的是哪首歌。封面只在换歌时重画，避免图片闪烁
  let dragging = false;

  function render(state) {
    const { song, playing, hasNext } = state;
    bar.classList.toggle('is-idle', !song);

    const songId = song?.id ?? null; // 没有歌时是 null，和初始的 undefined 不同，保证第一次一定会画
    if (songId !== shownSongId) {
      shownSongId = songId;
      $('cover').innerHTML = coverHTML(song?.id ?? 'idle', { cover: song?.cover, small: true });
      $('title').textContent = song ? song.title : '未在播放';
      $('artist').textContent = song ? song.artist ?? '未知歌手' : '';
    }

    toggleBtn.innerHTML = icon(playing ? 'pause' : 'play');
    toggleBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    toggleBtn.disabled = !song;
    nextBtn.disabled = !hasNext;
    range.disabled = !song;
    renderTime(state);
  }

  function renderTime({ currentTime, duration }) {
    if (dragging) return; // 用户正在拖动时，不要把滑块抢回去
    range.max = String(duration || 0);
    range.value = String(currentTime);
    paintProgress(currentTime, duration);
  }

  function paintProgress(current, duration) {
    const percent = duration > 0 ? (current / duration) * 100 : 0;
    range.style.setProperty('--p', `${percent}%`);
    $('elapsed').textContent = formatDuration(current);
    $('remaining').textContent = duration > 0 ? `-${formatDuration(Math.max(0, duration - current))}` : '0:00';
  }

  // 按钮
  toggleBtn.addEventListener('click', toggle);
  nextBtn.addEventListener('click', next);

  // 进度条：拖动时只更新数字，松手（change）时才真正跳转
  range.addEventListener('input', () => {
    dragging = true;
    paintProgress(Number(range.value), Number(range.max));
  });
  range.addEventListener('change', () => {
    seek(Number(range.value));
    dragging = false;
  });

  window.addEventListener('player:change', (e) => render(e.detail));
  window.addEventListener('player:time', (e) => renderTime(e.detail));
  render(getState());
}
