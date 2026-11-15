  /* ============================================================
   * 12. 启动
   * ============================================================ */
  function boot() {
    injectStyle();
    hookRouter();
    bindCookieLifecycle();
    bindSettingsNavReset();
    bindReplyToolbarEvents();
    bindDelegatedUI();
    bindHashFocus();
    startObserver();
    scheduleMount();
    scheduleReplyToolbar();
    console.info(
      '%cpictExt%c v1.7.4 扩展已加载 · 只读 · Cookie 仅在本页内存驻留，离开即清除',
      'background:#3b82f6;color:#fff;border-radius:3px;padding:1px 5px;font-weight:700',
      'color:#6b7280'
    );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
