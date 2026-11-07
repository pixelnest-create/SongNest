// hash 路由：根据地址栏 # 后面的部分决定显示哪个页面。
// 例如 "#/playlist/abc" 会匹配 "/playlist/:id"，得到 { id: "abc" }。

/**
 * @param {Record<string, (params: Record<string,string>) => void>} routes
 * @param {string} fallback 匹配不到时跳转的地址
 */
export function startRouter(routes, fallback) {
  function handle() {
    const path = location.hash.slice(1) || fallback;

    for (const [pattern, render] of Object.entries(routes)) {
      const params = match(pattern, path);
      if (params) {
        render(params);
        return;
      }
    }
    location.replace('#' + fallback); // 没有匹配的页面 → 回到默认页
  }

  window.addEventListener('hashchange', handle);
  handle();
}

/** 把 "/playlist/:id" 和 "/playlist/abc" 对比，成功返回参数对象，失败返回 null */
function match(pattern, path) {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;

  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      params[a[i].slice(1)] = decodeURIComponent(b[i]);
    } else if (a[i] !== b[i]) {
      return null;
    }
  }
  return params;
}
