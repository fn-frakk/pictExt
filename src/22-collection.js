  /* ============================================================
   * 10.6 帖子右侧栏：所属合集 + 合集内切换
   * ------------------------------------------------------------
   * 数据：GET /topics/{id} → collection{id,name}（匿名可读）
   *       GET /topic-collections/{id}/topics（匿名可读，游标分页）
   * 站点自己只在侧栏放「文章目录」，这里把合集接在下面。
   * 「最早」= 接口原始顺序（就是合集目录顺序）；其余在本地按字段排。
   * 「最热」站点没暴露热度分，用互动加权估算并在状态里写明。
   * ============================================================ */
  const COLLECTION_BOX_ID = 'pictExt-collection';
  const COL_SORTS = [
    { key: 'earliest', label: '最早' },
    { key: 'views', label: '最多浏览' },
    { key: 'likes', label: '最多点赞' },
    { key: 'replies', label: '最多回复' },
    { key: 'bookmarks', label: '最多收藏' },
    { key: 'hot', label: '最热' },
  ];
  const COL_PAGES_MAX = 10; // 一个合集最多拉 10 页 × 50 = 500 篇
  const colState = { sort: 'earliest', expanded: false };
  const collectionListCache = new Map(); // collectionId -> {at, items}

  function hotScoreOf(t) {
    return (t.likeCount || 0) * 4 + (t.replyCount || 0) * 3 + Math.min(t.viewCount || 0, 5000) / 50;
  }

  async function loadCollectionTopics(colId) {
    const hit = collectionListCache.get(colId);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;
    const items = [];
    const seen = new Set();
    let cursor = null;
    for (let i = 0; i < COL_PAGES_MAX; i++) {
      const page = await apiGet('/topic-collections/' + encodeURIComponent(colId) + '/topics', {
        limit: PAGE_LIMIT,
        cursor,
      });
      for (const it of page.items || []) {
        if (!it || !it.id || seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(normalize(it));
      }
      const next = page.pageInfo && page.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    collectionListCache.set(colId, { at: Date.now(), items });
    return items;
  }

  function collectionBoxHTML(col, items, currentId) {
    const idx = items.findIndex((i) => i.id === currentId);
    const pos = idx >= 0 ? `${idx + 1}/${items.length}` : `—/${items.length}`;

    const list = items.slice();
    if (colState.sort !== 'earliest') {
      const key = colState.sort;
      list.sort((a, b) => {
        const va = key === 'hot' ? hotScoreOf(a) : Number(a[`${key === 'views' ? 'viewCount' : key === 'likes' ? 'likeCount' : key === 'replies' ? 'replyCount' : 'bookmarkCount'}`] || 0);
        const vb = key === 'hot' ? hotScoreOf(b) : Number(b[`${key === 'views' ? 'viewCount' : key === 'likes' ? 'likeCount' : key === 'replies' ? 'replyCount' : 'bookmarkCount'}`] || 0);
        if (vb !== va) return vb - va;
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });
    }

    const sortHTML = COL_SORTS.map(
      (s) =>
        `<button type="button" data-px-colsort="${s.key}" data-active="${s.key === colState.sort}">${esc(s.label)}</button>`
    ).join('');

    const rows = list
      .map((t) => {
        const meta = colState.expanded
          ? `<span class="pxcol-meta">${[
              `<span>${icon('chat', 11)} ${fmtNum(t.replyCount)}</span>`,
              `<span>${icon('eye', 11)} ${fmtNum(t.viewCount)}</span>`,
              `<span>${icon('heart', 11)} ${fmtNum(t.likeCount ?? 0)}</span>`,
              `<span>${icon('bookmark', 11)} ${fmtNum(t.bookmarkCount ?? 0)}</span>`,
            ].join('')}</span>${
              t.excerpt ? `<span class="pxcol-excerpt">${esc(t.excerpt)}</span>` : ''
            }`
          : '';
        return `<li><a class="pxcol-item" href="/forum/post/${esc(t.id)}"${t.id === currentId ? ' data-current="true" aria-current="page"' : ''} data-px-coltopic="${esc(
          t.id
        )}"><span class="pxcol-title">${esc(t.title || '（无标题）')}</span>${meta}</a></li>`;
      })
      .join('');

    return `<div class="pxcol-head"><span class="pxcol-name" title="${esc(col.name)}">${esc(
      col.name
    )}</span><span class="pxcol-idx">${pos}</span></div>
      <div class="pxcol-sort" role="tablist" aria-label="合集排序">${sortHTML}</div>
      <ol class="min-w-0" role="list">${rows}</ol>
      <button type="button" class="pxcol-toggle" data-px-coltoggle="1">${
        colState.expanded ? '收起统计与简介' : '显示统计与简介'
      }</button>`;
  }

  async function mountCollectionBox(topicId) {
    const aside = document.querySelector('aside[aria-label="帖子信息"]');
    let box = document.getElementById(COLLECTION_BOX_ID);
    if (!aside) {
      if (box) box.remove();
      return;
    }
    if (!topicId) {
      if (box) box.remove();
      return;
    }

    let data = null;
    try {
      data = await getTopicDetail(topicId);
    } catch {
      if (box) box.remove();
      return;
    }
    const col = data && data.collection;
    if (!col || !col.id) {
      if (box) box.remove();
      return;
    }

    if (!box) {
      box = document.createElement('section');
      box.id = COLLECTION_BOX_ID;
      box.dataset.px = '1';
      box.setAttribute('aria-label', '所属合集');
      box.textContent = '正在读取合集…';
      box.className = 'text-sm';
      aside.appendChild(box);
    }

    let items = [];
    try {
      items = await loadCollectionTopics(col.id);
    } catch {
      items = [];
    }
    collectionBoxCache.set(topicId, { col, items });
    renderCollectionBox();
  }

  /** topicId -> {col, items}，切换排序时不用重新请求 */
  const collectionBoxCache = new Map();

  function renderCollectionBox() {
    const box = document.getElementById(COLLECTION_BOX_ID);
    if (!box) return;
    const topicId = detailTopicId();
    const rec = collectionBoxCache.get(topicId);
    if (!rec) return;
    const sig = [rec.col.id, rec.items.length, colState.sort, colState.expanded, topicId].join('|');
    if (box.dataset.sig === sig) return;
    box.innerHTML = collectionBoxHTML(rec.col, rec.items, topicId);
    box.dataset.sig = sig;
    box.dataset.px = '1';
    // 当前这篇滚进可视区（合集很长时能立刻看到自己在哪）
    const cur = box.querySelector('[data-current="true"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------
   * 从搜索结果跳进来：#post-{楼层号} → 展开所在楼、翻到那页、并高亮
   * ------------------------------------------------------------ */
  let lastFocusHash = '';
  let lastFocusTopic = '';

  function highlightComment(el) {
    if (!el) return;
    document.querySelectorAll('[data-px-focus]').forEach((x) => x.removeAttribute('data-px-focus'));
    el.setAttribute('data-px-focus', '1');
    // 10 秒后自己淡出，别一直亮着
    setTimeout(() => {
      if (el.isConnected && el.getAttribute('data-px-focus') === '1') el.removeAttribute('data-px-focus');
    }, 10000);
    setTimeout(() => {
      if (!el.isConnected || typeof el.scrollIntoView !== 'function') return;
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        el.scrollIntoView();
      }
    }, 80);
  }

  /** 返回 true 表示这次真的定位到了 */
  function focusHashComment() {
    const m = (location.hash || '').match(/^#post-(\d+)/u);
    if (!m) return false;
    const target = document.getElementById('post-' + m[1]);
    if (!target) return false; // 评论还没渲染出来，等下一轮 processDetail 再试

    const article = target.closest(THREAD_SEL);
    if (!article) return false;
    const box = article.querySelector('.post-comment-replies');
    const inThread = !!(box && box.contains(target));

    if (inThread) {
      // 1) 这层楼如果折着，先展开
      const key = threadKeyOf(article);
      detailGlobal = null;
      threadState.set(key, true);
      refreshThreads(article);
      // 2) 楼中楼分页：翻到目标所在的那一页
      const nodes = threadReplyNodes(box);
      const idx = nodes.findIndex((el) => el === target || el.contains(target));
      if (idx >= 0) {
        threadPage.set(key, Math.floor(idx / THREAD_PAGE_SIZE) + 1);
        applyThreadPaging(article);
      }
    } else {
      // 顶层楼层：翻到它所在的那一页
      const section = document.querySelector(COMMENT_SECTION);
      if (section) {
        const visible = orderedThreads(section).filter((a) => !a.dataset.pxHidden);
        const idx = visible.indexOf(article);
        if (idx >= 0) {
          const sc = detailScope();
          commentPage.topic = sc ? sc.key : '';
          commentPage.page = Math.floor(idx / commentPageSize()) + 1;
          applyCommentPaging(section);
        }
      }
    }

    highlightComment(target);
    return true;
  }

  function maybeFocusHash() {
    const sc = detailScope();
    const topic = sc ? sc.key : '';
    // 换帖子了就把「已经定位过」的记录清掉，同一个 #post-N 也能再定位
    if (topic !== lastFocusTopic) {
      lastFocusTopic = topic;
      lastFocusHash = '';
    }
    const h = location.hash || '';
    if (!h || h === lastFocusHash) return;
    if (focusHashComment()) lastFocusHash = h;
  }

  function processDetail() {
    const section = document.querySelector(COMMENT_SECTION);
    if (!section) return;
    const scope = detailScope();
    // 帖子信息条 / 右侧合集只对帖子详情有意义；作品详情没有 /topics 数据
    const topicId = scope && scope.kind === 'topic' ? scope.id : '';
    if (topicId) {
      injectTopicInfo(section, topicId);
      mountCollectionBox(topicId);
    }
    mountCommentSort(section, topicId);
    injectGlobalToggle(section);
    refreshThreads();
    applyCommentPaging(section);
    maybeFocusHash();
    expandReplyToolbars();
    if (settings.commentSortMode === 'replace') scheduleCommentOrder(section);
  }
