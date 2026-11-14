// 图标来自 Tabler Icons（MIT 许可，https://tabler.io/icons），线条风格。
// 直接写在代码里，不从网上加载，离线也能显示。

const PATHS = {
  music:
    '<path d="M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M9 17v-13h10v13"/><path d="M9 8h10"/>',
  playlist:
    '<path d="M11 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17 17v-13h4"/><path d="M13 5h-10"/><path d="M3 9h10"/><path d="M9 13h-6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  play: '<path d="M7 4v16l13 -8z"/>',
  pause:
    '<path d="M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/><path d="M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z"/>',
  next: '<path d="M4 5v14l12 -7z"/><path d="M20 5v14"/>',
  prev: '<path d="M20 5v14l-12 -7z"/><path d="M4 5v14"/>',
  shuffle:
    '<path d="M18 4l3 3l-3 3"/><path d="M18 20l3 -3l-3 -3"/><path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5"/><path d="M21 7h-5a4.978 4.978 0 0 0 -3 1m-4 8a4.984 4.984 0 0 1 -3 1h-3"/>',
  back: '<path d="M15 6l-6 6l6 6"/>',
  'chevron-down': '<path d="M6 9l6 6l6 -6"/>',
  share: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4v12"/>',
  info: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 9h.01"/><path d="M11 12h1v4h1"/>',
  x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  search: '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
  repeat:
    '<path d="M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3"/><path d="M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3"/>',
  'repeat-once':
    '<path d="M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3"/><path d="M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3"/><path d="M11 11l1 -1v4"/>',
  order: '<path d="M14 12h-10"/><path d="M14 12l-4 4"/><path d="M14 12l-4 -4"/><path d="M20 4v16"/>',
  edit: '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
  trash:
    '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
  up: '<path d="M12 5v14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>',
  down: '<path d="M12 5v14"/><path d="M18 13l-6 6"/><path d="M6 13l6 6"/>',
  sort: '<path d="M3 9l4 -4l4 4m-4 -4v14"/><path d="M21 15l-4 4l-4 -4m4 4v-14"/>',
  replace:
    '<path d="M3 4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M15 16a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M21 11v-3a2 2 0 0 0 -2 -2h-6l3 3m0 -6l-3 3"/><path d="M3 13v3a2 2 0 0 0 2 2h6l-3 -3m0 6l3 -3"/>',
  'playlist-add': '<path d="M19 8h-14"/><path d="M5 12h9"/><path d="M11 16h-6"/><path d="M15 16h6"/><path d="M18 13v6"/>',
  remove: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 12h6"/>',
  chevron: '<path d="M9 6l6 6l-6 6"/>',
  photo:
    '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>',
  check: '<path d="M5 12l5 5l10 -10"/>',
  dots:
    '<path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
};

// 实心图标：全屏播放页的大按钮用，比线条图标更醒目、更精致
const FILLED = {
  'play-filled': '<path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z"/>',
  'pause-filled':
    '<path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z"/><path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z"/>',
  'next-filled':
    '<path d="M3 5v14a1 1 0 0 0 1.504 .864l12 -7a1 1 0 0 0 0 -1.728l-12 -7a1 1 0 0 0 -1.504 .864z"/><path d="M20 4a1 1 0 0 1 1 1v14a1 1 0 0 1 -2 0v-14a1 1 0 0 1 1 -1z"/>',
  'prev-filled':
    '<path d="M19.496 4.136l-12 7a1 1 0 0 0 0 1.728l12 7a1 1 0 0 0 1.504 -.864v-14a1 1 0 0 0 -1.504 -.864z"/><path d="M4 4a1 1 0 0 1 1 1v14a1 1 0 0 1 -2 0v-14a1 1 0 0 1 1 -1z"/>',
};

/** 返回一个 SVG 图标的 HTML 字符串，例如 icon('play') */
export function icon(name) {
  if (FILLED[name]) {
    return `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FILLED[name]}</svg>`;
  }
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}
