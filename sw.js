// Service Worker：把应用自己的文件（页面、样式、代码、图标）缓存在手机上，
// 这样没有网络时也能打开应用。歌曲本身存在 IndexedDB 里，不归它管。
//
// 更新方式：每次发布新版本时，把下面的 VERSION 加 1。
// 手机打开应用时浏览器会发现 sw.js 变了，在后台下载新文件，下次打开就是新版本。

const VERSION = 1;
const CACHE = `songnest-v${VERSION}`;

// 应用的全部文件。新增或删除文件时要同步修改这里（npm test 会检查有没有漏掉）
const FILES = [
  './',
  'index.html',
  'manifest.json',
  'styles/main.css',
  'js/app.js',
  'js/cover-color.js',
  'js/db.js',
  'js/dialogs.js',
  'js/icons.js',
  'js/importer.js',
  'js/install-hint.js',
  'js/media-session.js',
  'js/metadata.js',
  'js/now-playing.js',
  'js/player-bar.js',
  'js/player.js',
  'js/playlist-actions.js',
  'js/progress.js',
  'js/router.js',
  'js/ui.js',
  'js/views/library.js',
  'js/views/playlist-detail.js',
  'js/views/playlists.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

// 安装：把所有文件下载到新缓存里
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()), // 不用等旧版本的页面全部关闭
  );
});

// 激活：删掉旧版本的缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('songnest-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 请求：先用缓存（快、离线可用），缓存里没有再走网络
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 打开应用（导航请求）时，不管地址后面带了什么（?xxx），都返回 index.html
    const key = request.mode === 'navigate' ? 'index.html' : request;
    const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch {
      return new Response('离线状态下无法加载这个文件', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
