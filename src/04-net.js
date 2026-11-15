  /* ============================================================
   * 2. 网络层 —— 只读；登录态可选，Cookie 只在内存里过一手
   * ============================================================ */

  /**
   * Cookie 快照：仅仅把 document.cookie 读进这个对象，用来判断「现在是不是登录状态」。
   * 不写 localStorage / sessionStorage / IndexedDB，不上传，不手动拼请求头
   * （真正的 Cookie 由浏览器在 credentials:'include' 时自己带上）。
   * 页面卸载、切到后台、路由切换都会 wipe()，变量直接清空。
   */
  const authState = {
    cookie: '',
    capturedAt: 0,
    read() {
      if (!settings.useSession) {
        this.cookie = '';
        return '';
      }
      try {
        this.cookie = typeof document !== 'undefined' ? document.cookie || '' : '';
      } catch {
        this.cookie = '';
      }
      this.capturedAt = Date.now();
      return this.cookie;
    },
    get hasCookie() {
      return !!this.cookie;
    },
    /** 抹掉内存里的快照（不是删站点的 Cookie，那会把用户登出） */
    wipe() {
      this.cookie = '';
      this.capturedAt = 0;
      detailCache.clear();
      poolCache.clear();
      commentIndexCache.clear();
      followingCache = null;
    },
  };

  function buildUrl(path, params) {
    const url = new URL(API_BASE + path, location.origin);
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
      else url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  /**
   * @param {string} path
   * @param {object} [params]
   * @param {{auth?: boolean}} [opts] auth=true 才带登录态；默认按设置决定
   */
  async function apiGet(path, params, opts) {
    const wantAuth = opts && opts.auth === true;
    const useAuth = wantAuth && !!settings.useSession;
    if (useAuth && !authState.capturedAt) authState.read();
    const res = await fetch(buildUrl(path, params), {
      method: 'GET',
      // 未登录 / 关闭登录态时固定 omit：浏览器层面就不会把 Cookie 发出去
      credentials: useAuth ? 'include' : 'omit',
      mode: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      // 站点错误体是 {statusCode, code, message, details}，推荐流的游标错误要靠 code 分辨
      try {
        const body = await res.json();
        if (body) {
          err.code = body.code || '';
          err.message = body.message || err.message;
          err.details = body.details;
        }
      } catch {
        /* 没有 JSON 体就算了 */
      }
      throw err;
    }
    return res.json();
  }
