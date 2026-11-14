// 主题色：保存用户选的颜色，并设置到 <html data-theme="…"> 上，具体颜色写在 main.css 里。
// 存在 localStorage（这台设备的小设置），不放进数据库，也不放进备份。
// index.html 里有一小段代码在页面显示前就读取它，避免打开时先闪一下橙色。

const KEY = 'songnest-theme';

/** 可选的颜色。swatch 是「更多」页面色块显示的颜色，和 main.css 里的 --accent 一致 */
export const THEMES = [
  { id: 'orange', label: '暖橙', swatch: '#E8913A' },
  { id: 'red', label: '珊瑚红', swatch: '#E8786A' },
  { id: 'pink', label: '樱花粉', swatch: '#EC8FAE' },
  { id: 'purple', label: '薰衣草紫', swatch: '#AE92DE' },
  { id: 'blue', label: '晴空蓝', swatch: '#74A8DE' },
  { id: 'green', label: '抹茶绿', swatch: '#82BB7E' },
];

export function getTheme() {
  let id = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    // 无痕模式等情况下读不了，用默认颜色
  }
  return THEMES.some((t) => t.id === id) ? id : 'orange';
}

export function setTheme(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // 存不了也没关系，这次打开期间仍然生效
  }
  applyTheme(id);
}

function applyTheme(id) {
  if (id === 'orange') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
}

applyTheme(getTheme());
