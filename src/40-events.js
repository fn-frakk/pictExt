  /* ============================================================
   * 12.1 统一事件委托
   * ------------------------------------------------------------
   * 站点是 Vue，会频繁重建我们插进去的节点。监听器挂在按钮自己身上时，
   * 一旦 mousedown 与 click 之间节点被换掉，click 就派发不到那颗按钮上，
   * 表现就是「点一次没反应，点两次才生效」。所以这里统一改成 document 级
   * 委托，并且只读 data-* 状态，节点被重建也不影响。
   * ============================================================ */
  /**
   * 扩展所有按钮的唯一入口。返回 true 表示「这个点击是我的，已处理」。
   * 只读 data-* 状态，不依赖闭包，节点被 Vue 重建也照样能用。
   */
  function runPxAction(target, ev) {
    if (!target || !target.closest) return false;
    const t = target;

    // 楼中楼：单楼展开 / 收起
    const th = t.closest('[data-px-thread-toggle]');
    if (th) {
      ev.preventDefault();
      const article = th.closest(THREAD_SEL);
      if (!article) return true;
      const key = th.dataset.key || threadKeyOf(article);
      const expanded = th.dataset.expanded === '1';
      detailGlobal = null; // 手动操作优先
      threadState.set(key, !expanded);
      refreshThreads(article);
      return true;
    }

    // 折叠 / 展开全部回复
    const gl = t.closest('[data-px-global-toggle]');
    if (gl) {
      ev.preventDefault();
      detailGlobal = detailGlobal === 'all' ? 'none' : 'all';
      threadState.clear();
      refreshThreads();
      return true;
    }

    // 长评论「展开全文」
    const ex = t.closest('[data-px-expand]');
    if (ex) {
      ev.preventDefault();
      expandComment(ex);
      return true;
    }

    // 评论区翻页
    const pg = t.closest('[data-px-page]');
    if (pg) {
      if (pg.disabled) return true;
      ev.preventDefault();
      const v = pg.dataset.pxPage;
      commentPage.page = v === 'prev' ? commentPage.page - 1 : v === 'next' ? commentPage.page + 1 : Number(v);
      const sec = document.querySelector(COMMENT_SECTION);
      if (sec) applyCommentPaging(sec);
      return true;
    }

    // 楼中楼翻页
    const tp = t.closest('[data-px-tpage]');
    if (tp) {
      if (tp.disabled) return true;
      ev.preventDefault();
      const article = tp.closest(THREAD_SEL);
      if (!article) return true;
      const box = article.querySelector('.post-comment-replies');
      const nodes = threadReplyNodes(box);
      const total = Math.max(1, Math.ceil(nodes.length / THREAD_PAGE_SIZE));
      const key = threadKeyOf(article);
      const cur = threadPage.get(key) || 1;
      const v = tp.dataset.pxTpage;
      const next = v === 'prev' ? cur - 1 : v === 'next' ? cur + 1 : Number(v);
      threadPage.set(key, Math.min(total, Math.max(1, next)));
      applyThreadPaging(article);
      return true;
    }

    // 右侧栏合集：排序 / 展开详情
    const cs = t.closest('[data-px-colsort]');
    if (cs) {
      ev.preventDefault();
      colState.sort = cs.dataset.pxColsort;
      renderCollectionBox();
      return true;
    }
    const ct = t.closest('[data-px-coltoggle]');
    if (ct) {
      ev.preventDefault();
      colState.expanded = !colState.expanded;
      renderCollectionBox();
      return true;
    }

    // 个人资料合集：排序
    const ps = t.closest('[data-px-profsort]');
    if (ps) {
      ev.preventDefault();
      profColState.sort = ps.dataset.pxProfsort;
      const bar = document.getElementById(PROFCOL_BAR_ID);
      if (bar) {
        bar.querySelectorAll('[data-px-profsort]').forEach((b) => {
          b.dataset.active = b.dataset.pxProfsort === profColState.sort ? 'true' : 'false';
        });
      }
      applyProfileCollectionView();
      return true;
    }
    return false;
  }

  function bindDelegatedUI() {
    if (bindDelegatedUI.bound) return;
    bindDelegatedUI.bound = true;

    /**
     * 为什么不是只监听 click：
     * 站点（Vue）每 200ms 左右会 patch 一次评论区，我们插的按钮经常在
     * mousedown 与 click 之间被换掉 —— click 就派发不到那颗按钮，表现为
     * 「点一次没反应、要点好几下」。所以在 pointerdown 就先把动作做掉
     * （手指/鼠标一按下立即响应），随后那次 click 直接吞掉，避免重复执行。
     */
    let handledAt = 0;

    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        if (runPxAction(e.target, e)) {
          handledAt = Date.now();
          // 按下就算数：阻止后续 click 的默认行为（也避免触发站点对这段文本的选择/跳转）
          e.preventDefault();
        }
      },
      true
    );

    // 键盘（Enter/Space）与不支持 pointer 的环境仍然走 click
    document.addEventListener(
      'click',
      (e) => {
        if (Date.now() - handledAt < 600) return; // 这次点击刚在 pointerdown 处理过
        runPxAction(e.target, e);
      },
      true
    );

    // 个人资料合集搜索：输入即筛（180ms 防抖）
    let qTimer = null;
    document.addEventListener('input', (e) => {
      const inp = e.target && e.target.closest ? e.target.closest('[data-px-colq]') : null;
      if (!inp) return;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => {
        profColState.q = inp.value || '';
        applyProfileCollectionView();
      }, 180);
    });
  }
