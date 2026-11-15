  /* ============================================================
   * 11.5 Cookie 快照的生命周期
   * ------------------------------------------------------------
   * 进入页面读一次（只在内存），离开 / 切后台 / 路由切换立刻抹掉。
   * 不写任何存储、不发往任何地方；站点的登录 Cookie 本身不会被改动。
   * ============================================================ */
  function bindCookieLifecycle() {
    if (settings.useSession) authState.read();

    const wipe = () => authState.wipe();
    window.addEventListener('pagehide', wipe);
    window.addEventListener('beforeunload', wipe);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') wipe();
    });

    // 路由切换 = 上一页的会话快照作废，进新页再读一次
    const onRoute = () => {
      authState.wipe();
      if (settings.useSession) authState.read();
    };
    history.pushState = ((orig) =>
      function (...args) {
        const ret = orig.apply(this, args);
        setTimeout(onRoute, 0);
        return ret;
      })(history.pushState);
    history.replaceState = ((orig) =>
      function (...args) {
        const ret = orig.apply(this, args);
        setTimeout(onRoute, 0);
        return ret;
      })(history.replaceState);
  }
