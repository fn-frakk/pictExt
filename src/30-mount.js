  /* ============================================================
   * 11. 挂载 / 卸载
   * ============================================================ */
  let view = null;
  let mountedCtxKey = '';
  let observer = null;

  function panelHTML(kind, tabs) {
    const buttons = tabs
      .map(
        (s) =>
          `<button class="px-tab" type="button" role="tab" data-sort="${s.key}" data-active="false" aria-selected="false">${esc(
            s.label
          )}</button>`
      )
      .join('');
    return `<div class="px-bar"><div class="px-tabs" role="tablist" aria-label="pictExt 排序">${buttons}</div></div>
      <p class="px-note" hidden></p>
      <div class="px-list" aria-live="polite"></div>
      <div class="px-foot"></div>`;
  }

  function buildPanel(kind) {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
    }
    panel.classList.toggle('px-align-end', kind === 'home');
    panel.dataset.kind = kind;
    return panel;
  }

  function teardown() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
    nativeHider.show();
    view = null;
    mountedCtxKey = '';
  }

  function mount() {
    // 帖子详情页：走折叠 / 信息补全
    if (detailTopicId()) {
      if (view) teardown();
      processDetail();
      return;
    }

    // 个人资料页：合集列表排序 / 搜索
    if (profileUid()) {
      if (view) teardown();
      mountProfileCollections();
      return;
    }

    // 设置页：注入 PICTEXT 设置板块
    if (location.pathname.startsWith('/settings')) {
      if (view) teardown();
      mountSettingsNav();
      renderSettingsArea();
      return;
    }

    const adapter = currentAdapter();
    if (!adapter) {
      if (view) teardown();
      return;
    }
    const mp = adapter.mountPoint();
    if (!mp || !mp.anchor || !mp.anchor.isConnected) {
      if (document.getElementById(PANEL_ID)) teardown();
      return;
    }

    const kind = adapter.kind;
    // 原版模式 = 插件完全不碰排序（默认）；只有「全部替换」才注入面板
    if (settings.sortMode !== 'replace') {
      if (document.getElementById(PANEL_ID)) teardown();
      return;
    }
    // 替换模式下也允许按页面关掉
    const enabledFor = { home: settings.homeSort, search: settings.searchSort, category: settings.categorySort };
    if (!enabledFor[kind]) {
      if (document.getElementById(PANEL_ID)) teardown();
      return;
    }
    const ctx = adapter.ctx();
    const ctxKey = JSON.stringify([kind, ctx.q || '', ctx.tag || '', ctx.boards || []]);
    const panel = document.getElementById(PANEL_ID);

    if (panel && panel.isConnected && view && mountedCtxKey === ctxKey && panel.dataset.kind === kind) {
      nativeHider.prune();
      nativeHider.hide(adapter.nativeNodes(mp.anchor));
      return;
    }

    nativeHider.show();

    // 每类页面固定 8 项：搜索页把「推荐流」换成「站内搜索」，其余页面相反
    const tabs = sortsFor(kind);

    const fresh = buildPanel(kind);
    fresh.innerHTML = panelHTML(kind, tabs);

    const tabsHost = fresh.querySelector('.px-tabs');

    if (mp.anchor.parentElement && mp.anchor.parentElement.contains(mp.anchor)) {
      mp.anchor.parentElement.insertBefore(fresh, mp.anchor);
    } else {
      mp.anchor.insertAdjacentElement('beforebegin', fresh);
    }

    view = new FeedView(fresh, kind, ctx, () => adapter.nativeNodes(mp.anchor), tabsHost);
    view.syncTabs();
    mountedCtxKey = ctxKey;

    // 记住的那一项 / 设置里的默认项，可能在这个页面不存在（比如搜索页的「推荐流」）
    const allowed = new Set(tabs.map((t) => t.key));
    const pick = (...cands) => cands.find((k) => k && allowed.has(k));
    const keep = pick(lastSortKey[kind], settings.defaultSort, kind === 'search' ? 'search' : 'latest', 'latest', 'hot');
    view.select(keep || tabs[0].key);
  }

  const scheduleMount = debounce(() => {
    try {
      mount();
    } catch (err) {
      log('mount failed', err);
    }
  }, 200);

  function isOwnNode(n) {
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (!el || !el.closest) return false;
    return !!el.closest('#' + PANEL_ID) || !!el.closest('[data-px="1"]') || el.id === 'pictExt-style';
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((records) => {
      const external = records.some((r) => {
        const nodes = [...r.addedNodes, ...r.removedNodes];
        if (!nodes.length) return false;
        return nodes.some((n) => !isOwnNode(n));
      });
      if (external) {
        scheduleMount();
        scheduleReplyToolbar();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /** 点了站内的设置分类 → 退出 PICTEXT 面板 */
  function bindSettingsNavReset() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('nav[aria-label="设置分类"] button');
        if (!btn || btn.hasAttribute('data-px-settings-nav')) return;
        if (!settingsActive) return;
        settingsActive = false;
        setTimeout(renderSettingsArea, 0);
      },
      true
    );
  }

  /** 只在页面主世界有效：manifest.json 里声明了 "world": "MAIN" */
  function bindHashFocus() {
    window.addEventListener('hashchange', () => {
      lastFocusHash = '';
      setTimeout(() => {
        const sec = document.querySelector(COMMENT_SECTION);
        if (sec) processDetail();
      }, 160);
    });
  }

  function hookRouter() {
    const wrap = (fn) =>
      function (...args) {
        const ret = fn.apply(this, args);
        setTimeout(scheduleMount, 80);
        return ret;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', () => setTimeout(scheduleMount, 80));
  }
