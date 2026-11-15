  /* ============================================================
   * 10.4 回复区格式工具栏：默认展开站内自带的那一排
   * ------------------------------------------------------------
   * 站点的回复框（ForumPostCommentEditor）其实内置了和发帖页同一个
   * ForumEditorToolbar，只是收在底部「格式工具」按钮里，默认折叠。
   * 这里不自己画按钮、不注入样式、不碰 Vue 的数据模型：只在回复框已经
   * 可交互时替用户点一下那个按钮，站点的表情 / 图片 / 预览 / 字数校验
   * 逻辑全部原样保留。用户自己点过「格式工具」的回复框不再由扩展接管。
   * 站点若改掉这个按钮，本功能自动失效（不报错、不弄坏页面）。
   * ============================================================ */
  const REPLY_TOGGLE_SEL = 'button[aria-label="格式工具"]';
  const REPLY_COMPOSER_SEL = '.reply-composer';
  const REPLY_INPUT_SEL = 'textarea.reply-composer-input';
  /** 用户手动操作过的回复框：尊重用户选择，不再自动展开 / 收起 */
  const manualReplyComposers = new WeakSet();
  /** 由扩展展开过的回复框：关掉开关时只收起这些，不碰用户自己展开的 */
  const autoReplyComposers = new Set();

  /** 真实用户点按钮前一定有 pointerdown / keydown；程序 .click() 没有，用它区分 */
  function markManualReplyToggle(e) {
    const btn = e.target && e.target.closest ? e.target.closest(REPLY_TOGGLE_SEL) : null;
    if (!btn) return;
    const composer = btn.closest(REPLY_COMPOSER_SEL);
    if (composer) manualReplyComposers.add(composer);
  }

  function bindReplyToolbarEvents() {
    document.addEventListener('pointerdown', markManualReplyToggle, true);
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') markManualReplyToggle(e);
      },
      true
    );
    document.addEventListener(
      'focusin',
      (e) => {
        if (e.target && e.target.matches && e.target.matches(REPLY_INPUT_SEL)) scheduleReplyToolbar();
      },
      true
    );
  }

  function expandReplyToolbars() {
    const on = !!settings.replyToolbar;
    for (const el of [...autoReplyComposers]) if (!el.isConnected) autoReplyComposers.delete(el);

    document.querySelectorAll(REPLY_TOGGLE_SEL).forEach((btn) => {
      const composer = btn.closest(REPLY_COMPOSER_SEL);
      if (!composer || manualReplyComposers.has(composer)) return;
      // 回复框收起时站内给工具行加了 inert，此时点按钮不会响应；
      // 而且站内的展开处理会把焦点移进输入框，所以只在用户已经点进这个框时才动手
      const tools = btn.closest('.reply-composer-tools');
      if ((tools && tools.hasAttribute('inert')) || !composer.contains(document.activeElement)) return;

      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (on && !expanded && !btn.disabled) {
        btn.click();
        autoReplyComposers.add(composer);
      } else if (!on && expanded && autoReplyComposers.has(composer)) {
        btn.click();
        autoReplyComposers.delete(composer);
      }
    });
  }

  const scheduleReplyToolbar = debounce(() => {
    try {
      expandReplyToolbars();
    } catch (err) {
      log('reply toolbar failed', err);
    }
  }, 120);
