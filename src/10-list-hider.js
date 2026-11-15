  /* ============================================================
   * 8. 原生列表隐藏器
   * ============================================================ */
  const nativeHider = {
    hidden: new Map(),
    hide(nodes) {
      nodes.forEach((el) => {
        if (!el || el.id === PANEL_ID || el.contains(document.getElementById(PANEL_ID))) return;
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
