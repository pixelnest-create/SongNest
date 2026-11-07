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
  chevron: '<path d="M9 6l6 6l-6 6"/>',
  dots:
    '<path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
};

/** 返回一个 SVG 图标的 HTML 字符串，例如 icon('play') */
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}
