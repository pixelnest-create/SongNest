// 进度条组件：底部播放条和全屏播放页共用。
// 拖动时只更新显示的时间，松手时才真正跳转。
import { formatDuration } from './ui.js';
import { getState, seek } from './player.js';

/** 返回进度条的 HTML，放进页面后再调用 mountProgress */
export function progressHTML(className = '') {
  return `
    <div class="progress ${className}">
      <span class="pb-time" data-role="elapsed">0:00</span>
      <input class="seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="播放进度">
      <span class="pb-time" data-role="remaining">0:00</span>
    </div>
  `;
}

/** 让 root 里的进度条动起来：跟随播放进度，并响应拖动 */
export function mountProgress(root) {
  const range = root.querySelector('.seek');
  const elapsed = root.querySelector('[data-role="elapsed"]');
  const remaining = root.querySelector('[data-role="remaining"]');
  let dragging = false;

  function paint(current, duration) {
    const percent = duration > 0 ? (current / duration) * 100 : 0;
    range.style.setProperty('--p', `${percent}%`);
    elapsed.textContent = formatDuration(current);
    remaining.textContent = duration > 0 ? `-${formatDuration(Math.max(0, duration - current))}` : '0:00';
  }

  function update({ song, currentTime, duration }) {
    range.disabled = !song;
    if (dragging) return; // 用户正在拖动时，不要把滑块抢回去
    range.max = String(duration || 0);
    range.value = String(currentTime);
    paint(currentTime, duration);
  }

  range.addEventListener('input', () => {
    dragging = true;
    paint(Number(range.value), Number(range.max));
  });
  range.addEventListener('change', () => {
    seek(Number(range.value));
    dragging = false;
  });

  window.addEventListener('player:change', (e) => update(e.detail));
  window.addEventListener('player:time', (e) => update(e.detail));
  update(getState());
}
