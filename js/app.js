// 应用入口：渲染底部固定区域，启动路由
import { startRouter } from './router.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { mountPlayerBar } from './player-bar.js';
import { getState } from './player.js';
import { setupMediaSession } from './media-session.js';
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

// ---------- 播放状态 ----------
mountPlayerBar(document.getElementById('player-bar'));
setupMediaSession();

/** 在当前页面的列表里高亮正在播放的歌 */
function markCurrent() {
  const id = getState().song?.id;
  for (const el of view.querySelectorAll('[data-action="play"][data-id]')) {
    el.classList.toggle('is-current', el.dataset.id === id);
  }
}
window.addEventListener('player:change', markCurrent);

window.addEventListener('player:error', (e) => {
  const title = e.detail.song?.title;
  toast(title ? `无法播放「${title}」` : '无法播放这首歌', { duration: 4000 });
});

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
    markCurrent();
    if (!scroll) window.scrollTo(0, 0);
  };
}

const router = startRouter(
  {
    '/library': page('library', renderLibrary),
    '/playlists': page('playlists', renderPlaylists),
    '/playlist/:id': page('playlists', renderPlaylistDetail),
  },
  '/library',
);

// ---------- 离线支持（Service Worker） ----------
// 本地开发时（localhost）默认不启用，否则改了代码刷新页面还是旧的缓存。
// 想在本地测试离线功能，就在地址后面加 ?sw
const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocalDev || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('离线功能启用失败：', err));
}

// 导入新歌后，刷新当前页面，但保持滚动位置
window.addEventListener('library:change', () => {
  keepScroll = true;
  router.refresh();
});
