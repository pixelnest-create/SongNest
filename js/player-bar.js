// 底部播放条：显示当前歌曲、播放/暂停、下一首、进度条。点歌名区域打开全屏播放页。
import { icon } from './icons.js';
import { coverHTML } from './ui.js';
import { getState, next, toggle } from './player.js';
import { mountProgress, progressHTML } from './progress.js';
import { openNowPlaying } from './now-playing.js';

export function mountPlayerBar(bar) {
  bar.innerHTML = `
    <div class="pb-main">
      <button class="pb-open" data-action="open" aria-label="打开播放页">
        <span data-role="cover"></span>
        <span class="row-text">
          <span class="row-title" data-role="title"></span>
          <span class="row-sub" data-role="artist"></span>
        </span>
      </button>
      <button class="icon-btn" data-action="toggle"></button>
      <button class="icon-btn" data-action="next" aria-label="下一首">${icon('next')}</button>
    </div>
    ${progressHTML('pb-progress')}
  `;

  const $ = (role) => bar.querySelector(`[data-role="${role}"]`);
  const openBtn = bar.querySelector('[data-action="open"]');
  const toggleBtn = bar.querySelector('[data-action="toggle"]');
  const nextBtn = bar.querySelector('[data-action="next"]');

  let shownCover; // 当前显示的封面（歌曲 id + 有没有封面）。封面只在变了时重画，避免图片闪烁

  function render({ song, playing, hasNext }) {
    bar.classList.toggle('is-idle', !song);

    // 没有歌时是 'idle'，和初始的 undefined 不同，保证第一次一定会画
    const coverKey = song ? `${song.id}|${Boolean(song.cover)}` : 'idle';
    if (coverKey !== shownCover) {
      shownCover = coverKey;
      $('cover').innerHTML = coverHTML(song?.id ?? 'idle', { cover: song?.cover, small: true });
    }
    // 文字每次都更新：歌名、歌手可能被编辑过
    $('title').textContent = song ? song.title : '未在播放';
    $('artist').textContent = song ? song.artist ?? '未知歌手' : '';

    openBtn.disabled = !song;
    toggleBtn.innerHTML = icon(playing ? 'pause' : 'play');
    toggleBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    toggleBtn.disabled = !song;
    nextBtn.disabled = !hasNext;
  }

  openBtn.addEventListener('click', openNowPlaying);
  toggleBtn.addEventListener('click', toggle);
  nextBtn.addEventListener('click', () => next());

  mountProgress(bar);
  window.addEventListener('player:change', (e) => render(e.detail));
  render(getState());
}
