  /* ============================================================
   * 10. 帖子详情页：折叠楼中楼 + 补全信息
   * ============================================================ */
  const COMMENT_SECTION = 'section#comments';
  const THREAD_SEL = 'article[aria-label$="的评论"]';
  /** null = 跟随默认策略；'all' = 全部折叠；'none' = 全部展开 */
  let detailGlobal = null;
  const topicInfoCache = new Map();

  /** 详情请求去重：帖子信息条 / 合集区块会同时要这份数据，只发一次 */
  const detailReq = new Map();
  function getTopicDetail(id) {
    if (topicInfoCache.has(id)) return Promise.resolve(topicInfoCache.get(id));
    const running = detailReq.get(id);
    if (running) return running;
    const p = apiGet('/topics/' + encodeURIComponent(id))
      .then((d) => {
        topicInfoCache.set(id, d);
        detailReq.delete(id);
        return d;
      })
      .catch((err) => {
        detailReq.delete(id);
        throw err;
      });
    detailReq.set(id, p);
    return p;
  }

  function detailTopicId() {
    const m = location.pathname.match(/^\/forum\/post\/([^/?#]+)/u);
    return m ? m[1] : '';
  }

  /** 折叠开关按钮，样式对齐站点回复行上的小按钮 */
  function makeThreadToggle() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.px = '1';
    btn.dataset.pxThreadToggle = '1';
    btn.className =
      'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:text-primary ' +
      'focus-visible:outline-2 focus-visible:outline-primary transition-colors';
    return btn;
  }

  /* 每楼的手动状态：key -> true(展开) / false(折叠)；没记录就走默认策略 */
  const threadState = new Map();

  /** 数一数这楼到底有多少条回复：站点的容器里可能还套了一层 wrapper，不能只数直接子节点 */
  function countReplies(box) {
    let n = box.querySelectorAll('[data-post-id]').length;
    if (!n) n = box.querySelectorAll('[id^="post-"]').length;
    if (!n) {
      n = [...box.children].filter((el) => el.tagName === 'DIV' || el.tagName === 'ARTICLE').length;
    }
    // 再兜一层：容器里只有一个 wrapper 时，按 wrapper 的子元素算
    if (n <= 1) {
      const grand = [...box.querySelectorAll(':scope > *')].reduce((a, el) => a + el.children.length, 0);
      if (grand > n) n = grand;
    }
    return n;
  }

  function applyThreadState(article, box, btn, count, key) {
    let expanded;
    if (threadState.has(key)) expanded = threadState.get(key);
    else if (detailGlobal === 'all') expanded = false;
    else if (detailGlobal === 'none') expanded = true;
    else expanded = count < (Number(settings.collapseMin) || 2); // 默认策略：回复很少就不折

    box.style.display = expanded ? '' : 'none';
    const tPager = article.querySelector('[data-px-thread-pager]');
    if (tPager) tPager.style.display = expanded ? '' : 'none';
    if (!btn) return;
    btn.dataset.expanded = expanded ? '1' : '0';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.innerHTML = `${icon('chat', 13)}<span>${expanded ? `收起 ${count} 条回复` : `展开 ${count} 条回复`}</span>`;
    btn.title = expanded ? '折叠这一楼的回复' : '展开这一楼的全部回复';
  }

  function setupThread(article) {
    const box = article.querySelector('.post-comment-replies');
    let btn = article.querySelector('[data-px-thread-toggle]');
    if (!box) {
      if (btn) btn.remove();
      return;
    }
    // 功能总开关关掉：全部展开，也不放按钮
    if (!settings.collapse) {
      if (btn) btn.remove();
      box.style.display = '';
      applyThreadPaging(article);
      return;
    }
    const count = countReplies(box);
    const min = Number(settings.collapseMin) || 2;

    // 只有 1 条回复的楼不折腾：既不放按钮，也不折叠（除非用户点了「折叠全部」）
    if (count < min) {
      if (btn) btn.remove();
      applyThreadState(article, box, null, count, threadKeyOf(article));
      applyThreadPaging(article);
      return;
    }

    const key = threadKeyOf(article);
    if (!btn) {
      btn = makeThreadToggle();
      btn.style.marginLeft = '46px';
      btn.style.marginTop = '4px';
      // 挂在回复块之后（而不是插在楼与回复之间），尽量不扰动 Vue 对这两个子节点的 diff
      box.insertAdjacentElement('afterend', btn);
    } else if (btn.previousElementSibling !== box) {
      box.insertAdjacentElement('afterend', btn);
    }
    btn.dataset.key = key;
    btn.dataset.count = String(count);
    applyThreadState(article, box, btn, count, key);
    applyThreadPaging(article);
  }

  /* ------------------------------------------------------------
   * 楼中楼分页：一层楼里的回复 ≥10 条才给页码（不足 10 条不显示）
   * ------------------------------------------------------------ */
  const THREAD_PAGE_SIZE = 10;
  const THREAD_PAGE_MIN = 10;
  const threadPage = new Map();

  /** 这层楼里真正的「一条回复」（排除嵌套在别的回复里的） */
  function threadReplyNodes(box) {
    if (!box) return [];
    let nodes = [...box.querySelectorAll('[data-post-id]')].filter((el) => el.closest('[data-post-id]') === el);
    if (!nodes.length) nodes = [...box.querySelectorAll('[id^="post-"]')];
    return nodes;
  }

  function applyThreadPaging(article) {
    const box = article.querySelector('.post-comment-replies');
    let pager = article.querySelector('[data-px-thread-pager]');
    if (!box) {
      if (pager) pager.remove();
      return;
    }
    const nodes = threadReplyNodes(box);
    if (!settings.commentPaging || nodes.length < THREAD_PAGE_MIN) {
      if (pager) pager.remove();
      nodes.forEach((el) => {
        if (el.dataset.pxTpage) {
          el.style.display = '';
          delete el.dataset.pxTpage;
        }
      });
      return;
    }

    const key = threadKeyOf(article);
    const total = Math.max(1, Math.ceil(nodes.length / THREAD_PAGE_SIZE));
    let cur = threadPage.get(key) || 1;
    cur = Math.min(total, Math.max(1, cur));
    threadPage.set(key, cur);
    const start = (cur - 1) * THREAD_PAGE_SIZE;
    const end = start + THREAD_PAGE_SIZE;
    nodes.forEach((el, i) => {
      const show = i >= start && i < end;
      if (show) {
        if (el.dataset.pxTpage) {
          el.style.display = '';
          delete el.dataset.pxTpage;
        }
      } else if (!el.dataset.pxTpage) {
        el.style.display = 'none';
        el.dataset.pxTpage = '1';
      }
    });

    if (!pager) {
      pager = document.createElement('div');
      pager.dataset.px = '1';
      pager.dataset.pxThreadPager = '1';
      pager.className = 'pxc-tpager';
      box.insertAdjacentElement('afterend', pager);
    } else if (pager.previousElementSibling !== box) {
      box.insertAdjacentElement('afterend', pager);
    }
    const html =
      `<span class="pxc-tpager-sum">${cur}/${total} 页 · 共 ${nodes.length} 条</span>` +
      `<button type="button" data-px-tpage="prev"${cur <= 1 ? ' disabled' : ''}>上一页</button>` +
      `<button type="button" data-px-tpage="next"${cur >= total ? ' disabled' : ''}>下一页</button>`;
    if (pager.dataset.html !== html) {
      pager.innerHTML = html;
      pager.dataset.html = html;
    }
    pager.style.display = box.style.display === 'none' ? 'none' : '';
  }

  /* ------------------------------------------------------------
   * 长评论折叠：超过 300 字 → 只留前 200 字 + 「展开全文」
   * ------------------------------------------------------------ */
  const TRUNC_LIMIT = 300;
  const TRUNC_KEEP = 200;
  const truncState = new WeakMap();

  /** 找一条评论的正文容器：优先所有 <p> 的共同父节点，兜底取文本最多的 div */
  function bodyBlockOf(row) {
    const ps = [...row.querySelectorAll('p')];
    if (ps.length) {
      let el = ps[0].parentElement;
      while (el && el !== row && !ps.every((p) => el.contains(p))) el = el.parentElement;
      return el && el !== row ? el : ps[0].parentElement;
    }
    let best = null;
    let len = 0;
    row.querySelectorAll('div').forEach((d) => {
      const t = (d.textContent || '').trim().length;
      if (t > len) {
        len = t;
        best = d;
      }
    });
    return best;
  }

  function applyCommentTruncate(row) {
    if (!row || row.dataset.pxExpanded === '1') return;
    // 已经截断过（按钮还在）就别重复做；Vue 把正文整块重置后按钮会消失，这里会自动补回来
    if (row.querySelector('[data-px-expand]')) return;
    if ((row.textContent || '').trim().length <= TRUNC_LIMIT) return;

    const el = bodyBlockOf(row);
    if (!el) return;
    const total = (el.textContent || '').trim().length;
    if (total <= TRUNC_LIMIT) return;

    // 按文本节点累进到 TRUNC_KEEP，只在最后一个节点上截（保留原有行内格式）
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const saved = [];
    let left = TRUNC_KEEP;
    let cutNode = null;
    let n;
    while ((n = walker.nextNode())) {
      const v = n.nodeValue || '';
      if (!v.trim()) continue;
      if (v.length <= left) {
        left -= v.length;
        continue;
      }
      saved.push([n, v]);
      n.nodeValue = v.slice(0, left).replace(/\s+$/, '') + '…';
      cutNode = n;
      break;
    }
    if (!cutNode) return;

    // 截断点之后的块级兄弟整个藏掉：不留空项目符号，也不留大段空白
    let cur = cutNode.parentElement;
    while (cur && cur !== el) {
      let sib = cur.nextElementSibling;
      while (sib) {
        if (sib.dataset.pxTruncHidden !== '1') {
          sib.dataset.pxTruncHidden = '1';
          sib.style.display = 'none';
        }
        sib = sib.nextElementSibling;
      }
      cur = cur.parentElement;
    }
    // 同一段里截断点之后的节点也收掉
    let sibNode = cutNode.nextSibling;
    while (sibNode) {
      const next = sibNode.nextSibling;
      if (sibNode.nodeType === 1) {
        sibNode.dataset.pxTruncHidden = '1';
        sibNode.style.display = 'none';
      } else if (sibNode.nodeType === 3 && sibNode.nodeValue.trim()) {
        saved.push([sibNode, sibNode.nodeValue]);
        sibNode.nodeValue = '';
      }
      sibNode = next;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.px = '1';
    btn.dataset.pxExpand = '1';
    btn.textContent = '展开全文';
    btn.title = `共 ${total} 字`;
    btn._pxSaved = saved;
    btn._pxHost = row;
    // 紧跟在省略号后面，不另起一行
    cutNode.parentNode.insertBefore(btn, cutNode.nextSibling);
  }

  function expandComment(btn) {
    const host = btn._pxHost;
    if (!host) {
      btn.remove();
      return;
    }
    (btn._pxSaved || []).forEach(([node, v]) => {
      node.nodeValue = v;
    });
    host.querySelectorAll('[data-px-trunc-hidden]').forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxTruncHidden;
    });
    host.dataset.pxExpanded = '1';
    btn.remove();
  }

  /** 楼的稳定标识：优先用首楼的 postId，退化用楼层号/位置 */
  function threadKeyOf(article) {
    const row = article.querySelector('[data-post-id]');
    if (row && row.getAttribute('data-post-id')) return row.getAttribute('data-post-id');
    const anchored = article.querySelector('[id^="post-"]');
    if (anchored) return anchored.id;
    const n = [...document.querySelectorAll(`${COMMENT_SECTION} ${THREAD_SEL}`)].indexOf(article);
    return 'idx-' + n;
  }

  function refreshThreads(scope) {
    const roots = scope ? [scope] : [...document.querySelectorAll(`${COMMENT_SECTION} ${THREAD_SEL}`)];
    roots.forEach((article) => {
      setupThread(article);
      const floor = article.querySelector('[data-post-id]');
      if (floor) applyCommentTruncate(floor);
      threadReplyNodes(article.querySelector('.post-comment-replies')).forEach(applyCommentTruncate);
    });
    syncGlobalToggle();
  }

  function syncGlobalToggle() {
    const btn = document.querySelector('[data-px-global-toggle]');
    if (!btn) return;
    const collapsed = detailGlobal === 'all';
    btn.textContent = collapsed ? '展开全部回复' : '折叠全部回复';
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
  }

  function injectGlobalToggle(section) {
    const nativeTabs = section.querySelector('[aria-label="评论排序"]');
    const anchorEl = commentSortBarEl() || nativeTabs;
    const exist = section.querySelector('[data-px-global-toggle]');
    if (!settings.globalToggle) {
      if (exist) exist.remove();
      return;
    }
    if (!anchorEl) return;
    let btn = exist;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.px = '1';
      btn.dataset.pxGlobalToggle = '1';
      btn.className =
        'text-xs font-medium text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ' +
        'rounded-lg px-2 py-1 transition-colors';
      anchorEl.insertAdjacentElement('afterend', btn);
    } else if (btn.previousElementSibling !== anchorEl) {
      anchorEl.insertAdjacentElement('afterend', btn);
    }
    syncGlobalToggle();
  }
