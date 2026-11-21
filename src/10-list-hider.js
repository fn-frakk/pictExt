  /* ============================================================
   * 8. 原生列表隐藏器
   * ============================================================ */
  const nativeHider = {
    hidden: new Map(),
    hide(nodes) {
      nodes.forEach((el) => {
        // 排序面板与首页统计卡片都是扩展自己的独立 UI，绝不进原生隐藏清单
        // （统计卡片 #pictExt-stats 与排序栏同在 feed 父容器里，曾被一起 display:none）
        if (!el || el.id === PANEL_ID || el.id === STATS_ID || el.contains(document.getElementById(PANEL_ID))) return;
        if (!this.hidden.has(el)) this.hidden.set(el, el.style.display);
        if (el.style.display !== 'none') el.style.display = 'none';
      });
    },
    show() {
      this.hidden.forEach((prev, el) => {
        if (el.isConnected) el.style.display = prev;
      });
      this.hidden.clear();
    },
    prune() {
      for (const el of [...this.hidden.keys()]) if (!el.isConnected) this.hidden.delete(el);
    },
  };
