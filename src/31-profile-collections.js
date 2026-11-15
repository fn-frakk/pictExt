  /* ============================================================
   * 10.7 个人资料页：合集列表排序 + 搜索
   * ------------------------------------------------------------
   * 站点把合集列表渲染在 [data-profile-collection-list]（aria-label="合集列表"）里，
   * 每个合集是 button[data-collection-id]。这里在列表上方加一条工具栏：
   *   - 搜索框：按合集中文名过滤（纯前端，不发请求）
   *   - 排序：最新（站点原始顺序）/ 最多浏览 / 最多点赞 / 最多回复
   * 浏览/点赞/回复是合集内所有帖子的合计，只能靠逐个合集拉主题列表算出来，
   * 所以只在点了这三项时才发请求，并且每个合集最多翻 3 页（150 篇）。
   * ============================================================ */
  const PROFCOL_BAR_ID = 'pictExt-profcol';
  const PROFCOL_LIST_SEL = '[data-profile-collection-list]';
  const PROFCOL_STAT_PAGES = 3;
  const profColState = { sort: 'latest', q: '' };
  const profColStats = new Map(); // collectionId -> {at, viewCount, likeCount, replyCount}

  function profileUid() {
    const m = location.pathname.match(/^\/profile\/([^/?#]+)/u);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function collectionTotals(colId) {
    const hit = profColStats.get(colId);
    if (hit && Date.now() - hit.at < CACHE_TTL * 4) return hit;
    const acc = { at: Date.now(), viewCount: 0, likeCount: 0, replyCount: 0 };
    let cursor = null;
    for (let i = 0; i < PROFCOL_STAT_PAGES; i++) {
      const page = await apiGet('/topic-collections/' + encodeURIComponent(colId) + '/topics', {
        limit: PAGE_LIMIT,
        cursor,
      });
      for (const t of page.items || []) {
        acc.viewCount += Number(t.viewCount || 0);
        acc.likeCount += Number(t.likeCount || 0);
        acc.replyCount += Number(t.replyCount || 0);
      }
      const next = page.pageInfo && page.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    profColStats.set(colId, acc);
    return acc;
  }

  function profColBarHTML() {
    const sorts = [
      ['latest', '最新'],
      ['views', '最多浏览'],
      ['likes', '最多点赞'],
      ['replies', '最多回复'],
    ];
    return `<div class="flex flex-wrap items-center gap-2">
        <input type="search" data-px-colq placeholder="搜索合集名字…" value="${esc(profColState.q)}"
          class="h-8 min-w-32 flex-1 rounded-md border border-default bg-default px-2.5 text-sm text-default focus-visible:outline-2 focus-visible:outline-primary">
        <div class="pxcol-sort" role="tablist" aria-label="合集排序">${sorts
          .map(
            ([k, l]) =>
              `<button type="button" data-px-profsort="${k}" data-active="${k === profColState.sort}">${esc(l)}</button>`
          )
          .join('')}</div>
        <span class="pxc-note" hidden></span>
      </div>`;
  }

  async function applyProfileCollectionView() {
    const list = document.querySelector(PROFCOL_LIST_SEL);
    if (!list) return;
    const items = [...list.children].filter((el) => el.nodeType === 1);
    const q = profColState.q.trim().toLowerCase();

    items.forEach((el) => {
      const hit = !q || (el.textContent || '').toLowerCase().includes(q);
      el.style.display = hit ? '' : 'none';
    });

    const bar = document.getElementById(PROFCOL_BAR_ID);
    const note = bar && bar.querySelector('.pxc-note');
    const setNote = (t) => {
      if (!note) return;
      note.textContent = t || '';
      note.hidden = !t;
    };

    if (profColState.sort === 'latest') {
      items.forEach((el) => {
        el.style.order = '';
        delete el.dataset.pxColOrder;
      });
      list.style.display = '';
      list.style.flexDirection = '';
      setNote('');
      return;
    }

    const metric = profColState.sort === 'views' ? 'viewCount' : profColState.sort === 'likes' ? 'likeCount' : 'replyCount';
    const withId = items.filter((el) => el.dataset.collectionId);
    if (!withId.length) {
      setNote('这个页面的合集卡片没带 id，排不了');
      return;
    }
    if (withId.length > 12) setNote('合集较多，只按前 12 个算合计');

    const totals = new Map();
    await Promise.all(
      withId.slice(0, 12).map(async (el) => {
        try {
          totals.set(el.dataset.collectionId, await collectionTotals(el.dataset.collectionId));
        } catch {
          totals.set(el.dataset.collectionId, { viewCount: 0, likeCount: 0, replyCount: 0 });
        }
      })
    );

    if (list.style.display !== 'flex') {
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
    }
    const score = (el) => {
      const t = totals.get(el.dataset.collectionId);
      return t ? t[metric] || 0 : -1;
    };
    [...items]
      .sort((a, b) => score(b) - score(a))
      .forEach((el, i) => {
        el.style.order = String(i);
        el.dataset.pxColOrder = '1';
      });
    setNote(`按合集内帖子合计排序（每册最多算 ${PROFCOL_STAT_PAGES * PAGE_LIMIT} 篇）`);
  }

  function mountProfileCollections() {
    const list = document.querySelector(PROFCOL_LIST_SEL);
    let bar = document.getElementById(PROFCOL_BAR_ID);
    if (!list) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = PROFCOL_BAR_ID;
      bar.dataset.px = '1';
      bar.className = 'mb-3';
      bar.innerHTML = profColBarHTML();
      list.insertAdjacentElement('beforebegin', bar);
    } else if (bar.nextElementSibling !== list) {
      list.insertAdjacentElement('beforebegin', bar);
    }
    applyProfileCollectionView();
  }
