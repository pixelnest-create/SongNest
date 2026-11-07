// 应用入口：渲染底部固定区域，启动路由
import { startRouter } from './router.js';
import { icon } from './icons.js';
import { coverHTML, notYet, toast } from './ui.js';
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
  bar.classList.add('is-idle');
  bar.innerHTML = `
    ${coverHTML('idle', { small: true })}
    <span class="row-text"><span class="row-title">未在播放</span></span>
    <button class="icon-btn" data-action="toggle" aria-label="播放">${icon('play')}</button>
    <button class="icon-btn" data-action="next" aria-label="下一首">${icon('next')}</button>
  `;
  bar.onclick = (e) => {
    if (e.target.closest('[data-action]')) notYet(4);
  };
}

// ---------- 路由 ----------
let renderCount = 0;
let keepScroll = false;

/**
 * 包装一个页面的渲染函数：
 * - 点亮对应的标签
 * - 页面是异步渲染的（要读数据库），先画到一个新容器里，读完再一次性换上去
 * - 如果渲染期间用户又切换了页面，丢弃这次过期的结果
 */
function page(tab, render) {
  return async (params) => {
    const token = ++renderCount;
    const scroll = keepScroll;
    keepScroll = false;
    setActiveTab(tab);

    const next = document.createElement('div');
    try {
      await render(next, params);
    } catch (err) {
      console.error(err);
      toast('页面加载失败，请刷新重试');
      return;
    }
    if (token !== renderCount) return;

    view.replaceChildren(...next.childNodes);
    view.onclick = next.onclick; // 页面的点击处理挂在容器上，一起搬过来
    if (!scroll) window.scrollTo(0, 0);
  };
}

renderPlayerBar();
const router = startRouter(
  {
    '/library': page('library', renderLibrary),
    '/playlists': page('playlists', renderPlaylists),
    '/playlist/:id': page('playlists', renderPlaylistDetail),
  },
  '/library',
);

// 导入新歌后，刷新当前页面，但保持滚动位置
window.addEventListener('library:change', () => {
  keepScroll = true;
  router.refresh();
});
