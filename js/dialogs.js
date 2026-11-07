// 弹窗组件：底部菜单、输入框、确认框、选歌列表。
// 都基于浏览器自带的 <dialog> 元素，每个函数返回一个 Promise，
// 所以页面里可以这样写：const name = await promptDialog({ ... });
import { icon } from './icons.js';
import { coverHTML, escapeHTML, formatDuration } from './ui.js';

/**
 * 打开一个 <dialog>，关闭时 resolve(returnValue)。
 * 点击半透明背景、按 Esc 都算取消（返回空字符串）。
 */
function open(className, html, setup) {
  const dialog = document.createElement('dialog');
  dialog.className = className;
  dialog.innerHTML = html;
  document.body.append(dialog);

  return new Promise((resolve) => {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(''); // 点到了面板外面的背景
    });
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue);
      dialog.remove();
    });
    setup?.(dialog);
    dialog.showModal(); // showModal 会自动把焦点放到第一个输入框或按钮上
  });
}

/**
 * 底部菜单。actions: [{ value, label, icon?, meta?, danger? }]
 * 返回被点的那一项的 value，取消返回 null。
 */
export async function actionSheet({ title, subtitle = '', actions }) {
  const value = await open('sheet', `
    <form method="dialog" class="sheet-panel">
      ${title ? `<p class="sheet-title">${escapeHTML(title)}${subtitle ? `<span>${escapeHTML(subtitle)}</span>` : ''}</p>` : ''}
      <div class="sheet-scroll">
        ${actions.map((a, i) => `
          <button class="sheet-item${a.danger ? ' danger' : ''}" value="${i}">
            ${a.icon ? icon(a.icon) : ''}
            <span class="sheet-label">${escapeHTML(a.label)}</span>
            ${a.meta ? `<span class="row-meta">${escapeHTML(a.meta)}</span>` : ''}
          </button>
        `).join('')}
      </div>
      <button class="sheet-item sheet-cancel" value="">取消</button>
    </form>
  `);
  return value === '' ? null : actions[Number(value)].value;
}

/**
 * 输入一行文字（比如歌单名）。返回去掉首尾空格的文字，取消返回 null。
 */
export async function promptDialog({ title, value = '', placeholder = '', confirmLabel = '确定', maxLength = 40 }) {
  let input;
  const result = await open('modal', `
    <form method="dialog" class="modal-panel">
      <h2 class="modal-title">${escapeHTML(title)}</h2>
      <input class="field" type="text" autofocus maxlength="${maxLength}" autocomplete="off" enterkeyhint="done"
             value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}">
      <p class="field-error" hidden>名字不能为空</p>
      <div class="modal-actions">
        <button class="btn btn-soft" type="button" data-role="cancel">取消</button>
        <button class="btn btn-accent" value="ok">${escapeHTML(confirmLabel)}</button>
      </div>
    </form>
  `, (dialog) => {
    input = dialog.querySelector('input');
    const error = dialog.querySelector('.field-error');
    // 「取消」是普通按钮，这样在输入框里按回车时会触发「确定」而不是「取消」
    dialog.querySelector('[data-role="cancel"]').addEventListener('click', () => dialog.close(''));
    // 提交前检查：不能为空
    dialog.querySelector('form').addEventListener('submit', (e) => {
      if (!input.value.trim()) {
        e.preventDefault();
        error.hidden = false;
        input.focus();
      }
    });
    input.addEventListener('input', () => { error.hidden = true; });
  });
  // 对话框关闭后虽然从页面上移除了，但 input 元素还在内存里，可以读到值
  return result === 'ok' ? input.value.trim() : null;
}

/** 确认框，返回 true / false */
export async function confirmDialog({ title, message = '', confirmLabel = '确定', danger = false }) {
  const result = await open('modal', `
    <form method="dialog" class="modal-panel">
      <h2 class="modal-title">${escapeHTML(title)}</h2>
      ${message ? `<p class="modal-text">${escapeHTML(message)}</p>` : ''}
      <div class="modal-actions">
        <button class="btn btn-soft" value="">取消</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" value="ok">${escapeHTML(confirmLabel)}</button>
      </div>
    </form>
  `);
  return result === 'ok';
}

/**
 * 从歌曲库里多选歌曲。返回选中歌曲的 id 数组（保持歌曲库里的顺序），取消返回空数组。
 */
export async function pickSongs({ title, songs }) {
  let picked = [];
  const result = await open('sheet', `
    <form method="dialog" class="sheet-panel">
      <div class="sheet-header">
        <button class="btn btn-soft" value="">取消</button>
        <p class="sheet-heading">${escapeHTML(title)}</p>
        <button class="btn btn-accent" value="ok" data-role="confirm">添加</button>
      </div>
      <div class="sheet-scroll">
        ${songs.map((s) => `
          <label class="row check-row">
            <input type="checkbox" value="${escapeHTML(s.id)}">
            ${coverHTML(s.id, { cover: s.cover })}
            <span class="row-text">
              <span class="row-title">${escapeHTML(s.title)}</span>
              <span class="row-sub">${escapeHTML(s.artist ?? '未知歌手')}</span>
            </span>
            <span class="row-meta">${formatDuration(s.duration)}</span>
          </label>
        `).join('')}
      </div>
    </form>
  `, (dialog) => {
    const confirm = dialog.querySelector('[data-role="confirm"]');
    const boxes = [...dialog.querySelectorAll('input[type="checkbox"]')];
    const refresh = () => {
      picked = boxes.filter((b) => b.checked).map((b) => b.value);
      confirm.textContent = picked.length ? `添加（${picked.length}）` : '添加';
    };
    dialog.addEventListener('change', refresh);
  });
  return result === 'ok' ? picked : [];
}
