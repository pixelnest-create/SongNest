// 应用入口：渲染底部固定区域，启动路由
import { startRouter } from './router.js';
import { icon } from './icons.js';
import { coverHTML, notYet } from './ui.js';
import { DEMO, getSongs } from './demo-data.js';
import { renderLibrary } from './views/library.js';
import { renderPlaylists } from './views/playlists.js';
import { renderPlaylistDetail } from './views/playlist-detail.js';

const view = document.getElementById('view');

// ---------- 标签栏 ----------
const tabs = {
  library: { label: '歌曲库', icon: 'music' },
  playlists: { label: '歌单', icon: 'playlist' },
};
for (const el of document.querySelectorAll('.tab')) {
  const t = tabs[el.dataset.tab];
  el.innerHTML = `${icon(t.icon)}<span>${t.label}</span>`;
}

function setActiveTab(name) {
  for (const el of document.querySelectorAll('.tab')) {
    if (el.dataset.tab === name) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

// ---------- 播放条（阶段 4 之前只是静态展示） ----------
function renderPlayerBar() {
  const bar = document.getElementById('player-bar');
  const song = DEMO ? getSongs()[0] : null;

  bar.classList.toggle('is-idle', !song);
  bar.innerHTML = `
    ${coverHTML(song?.id ?? 'idle', { small: true })}
    <span class="row-text">
      <span class="row-title">${song ? song.title : '未在播放'}</span>
    </span>
    <button class="icon-btn" data-action="toggle" aria-label="播放">${icon('play')}</button>
    <button class="icon-btn" data-action="next" aria-label="下一首">${icon('next')}</button>
  `;
  bar.onclick = (e) => {
    if (e.target.closest('[data-action]')) notYet(4);
  };
}

// ---------- 路由 ----------
// 每个页面切换前先回到顶部，并点亮对应的标签
function page(tab, render) {
  return (params) => {
    setActiveTab(tab);
    render(view, params);
    window.scrollTo(0, 0);
  };
}

renderPlayerBar();
startRouter(
  {
    '/library': page('library', renderLibrary),
    '/playlists': page('playlists', renderPlaylists),
    '/playlist/:id': page('playlists', renderPlaylistDetail),
  },
  '/library',
);
