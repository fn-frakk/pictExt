  /* ============================================================
   * 10.3 评论区排序（改版）
   * ------------------------------------------------------------
   * 站内那个「评论排序」其实是一个下拉组件（Nuxt UI USelect，aria-label="评论排序"），
   * 不是一排 tab —— 所以绝不能靠"点站内按钮"来切排序。这里改成自己算顺序：
   *   - 最热 / 最新 / 最早：直接按 /topics/{id}/posts?sort=hot|latest|earliest 的返回顺序
   *   - 最多点赞 / 最多楼高：拉一份评论索引（postId → likeCount / 楼中楼层数），客户端排
   *   - 关注：拉当前账号的关注列表，只留下关注的人发的楼层
   * 排序方式不是搬 DOM 节点（Vue 一重渲染就会还原），而是给楼层加 CSS `order`，
   * 把列表容器临时设成纵向 flex。Vue 重渲染不会清掉这个行内 order，也不会
   * 触发 MutationObserver 死循环，点赞 / 回复 / 楼中楼折叠等原生交互全部保留。
   * 原版模式下这一整套逻辑一条都不跑，只保留「折叠全部回复」。
   * ============================================================ */
  const COMMENT_SORT_ID = 'pictExt-comment-sort';
  const COMMENT_SORTS = [
    { key: 'hot', label: '最热', server: 'hot' },
    { key: 'following', label: '关注' },
    { key: 'earliest', label: '最早', server: 'earliest' },
    { key: 'latest', label: '最新', server: 'latest' },
    { key: 'likes', label: '最多点赞' },
  ];
  /** 当前评论区排序（native = 原版不动） */
  let commentSortKey = 'native';
  /** topicId|sort -> {at, ids, map} */
  const commentIndexCache = new Map();
  let followingCache = null;
  /** 我们改过布局的容器，退出改版时要还原（Set 而不是 WeakSet：要能遍历） */
  const touchedContainers = new Set();

  function commentSortBarEl() {
    return document.getElementById(COMMENT_SORT_ID);
  }

  /** 评论索引：一次拉多页，返回该排序下顶层的 id 顺序 + postId 明细 */
  async function loadCommentIndex(topicId, sortKey) {
    const ck = `${topicId}|${sortKey}`;
    const hit = commentIndexCache.get(ck);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit;
    const map = new Map();
    const ids = [];
    let cursor = null;
    for (let i = 0; i < 6; i++) {
      const data = await apiGet('/topics/' + encodeURIComponent(topicId) + '/posts', {
        limit: PAGE_LIMIT,
        sort: sortKey,
        cursor,
      });
      for (const p of data.items || []) {
        if (!p || !p.id) continue;
        const kids = Array.isArray(p.children) ? p.children : [];
        if (!map.has(p.id)) ids.push(p.id);
        map.set(p.id, {
          likeCount: Number(p.likeCount ?? 0),
          depth: kids.reduce((n, c) => n + 1 + (Array.isArray(c.children) ? c.children.length : 0), 0),
          authorId: p.author?.id || '',
          createdAt: p.createdAt || null,
          pinned: !!p.pinned,
          postNumber: Number(p.postNumber ?? 0),
        });
      }
      const next = data.pageInfo && data.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    const rec = { at: Date.now(), ids, map };
    commentIndexCache.set(ck, rec);
    return rec;
  }

  /** 当前登录用户关注的人（用于评论「关注」筛选）；失败返回 null */
  async function loadFollowingSet() {
    if (followingCache && Date.now() - followingCache.at < CACHE_TTL) return followingCache.set;
    if (!settings.useSession) return null;
    let meId = '';
    try {
      const me = await apiGet('/session', null, { auth: true });
      meId = me?.user?.id || me?.session?.user?.id || me?.userId || me?.id || '';
    } catch {
      meId = '';
    }
    if (!meId) return null;
    const set = new Set();
    let cursor = null;
    for (let i = 0; i < 4; i++) {
      const data = await apiGet('/users/' + encodeURIComponent(meId) + '/following', { limit: PAGE_LIMIT, cursor });
      for (const it of data.items || []) {
        const id = it?.user?.id || it?.id;
        if (id) set.add(id);
      }
      const next = data.pageInfo && data.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    followingCache = { at: Date.now(), set };
    return set;
  }

  function threadPostId(article) {
    const row = article.querySelector('[data-post-id]');
    const id = row && row.getAttribute('data-post-id');
    if (id) return id;
    const anchored = article.querySelector('[id^="post-"]');
    return anchored ? anchored.id.replace(/^post-/, '') : article.id.replace(/^post-/, '');
  }

  /** 楼层列表容器（所有顶层楼层共同的父节点） */
  function commentContainer(section) {
    const arts = [...section.querySelectorAll(THREAD_SEL)];
    if (arts.length < 2) return arts.length === 1 ? arts[0].parentElement : null;
    const parent = arts[0].parentElement;
    if (!parent) return null;
    return arts.every((a) => a.parentElement === parent) ? parent : null;
  }

  /** 清掉我们加过的一切（order / flex / 隐藏） */
  function resetCommentLayout(section) {
    section.querySelectorAll(`${THREAD_SEL}[data-px-hidden]`).forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxHidden;
    });
    section.querySelectorAll('[data-px-order]').forEach((el) => {
      el.style.order = '';
      delete el.dataset.pxOrder;
    });
    section.querySelectorAll(`${THREAD_SEL}[data-px-page]`).forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxPage;
    });
    touchedContainers.forEach((parent) => {
      if (!parent) return;
      if (parent.isConnected) {
        parent.style.display = '';
        parent.style.flexDirection = '';
        delete parent.dataset.pxFlex;
      } else {
        touchedContainers.delete(parent);
      }
    });
  }

  /** 按 id 顺序给楼层打 order（CSS 顺序，不动 DOM 节点） */
  function applyCommentLayout(section, ids) {
    const parent = commentContainer(section);
    if (!parent) return '楼层结构变了，暂时排不了这一种';
    const rank = new Map(ids.map((id, i) => [id, i]));
    const arts = [...section.querySelectorAll(THREAD_SEL)];

    if (parent.style.display !== 'flex') {
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';
      parent.dataset.pxFlex = '1';
      touchedContainers.add(parent);
    }
    let unknown = 0;
    arts.forEach((a) => {
      const id = threadPostId(a);
      let r;
      if (rank.has(id)) r = rank.get(id);
      else r = 5000 + unknown++;
      a.style.order = String(r);
      a.dataset.pxOrder = '1';
    });
    // 「加载更多回复」之类的块永远排最后
    [...parent.children].forEach((ch) => {
      if (ch.matches && ch.matches(THREAD_SEL)) return;
      ch.style.order = '9000';
      ch.dataset.pxOrder = '1';
    });
    return unknown ? `另有 ${unknown} 条不在已加载的评论里，排在最后` : '';
  }

  /** 算出当前排序下的楼层 id 顺序 */
  async function buildCommentOrder(topicId, key) {
    if (key === 'likes') {
      const { map } = await loadCommentIndex(topicId, 'earliest');
      const entries = [...map.entries()];
      const metric = 'likeCount';
      entries.sort((a, b) => {
        const pa = a[1].pinned ? 1 : 0;
        const pb = b[1].pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const d = (b[1][metric] || 0) - (a[1][metric] || 0);
        if (d !== 0) return d;
        return (a[1].postNumber || 0) - (b[1].postNumber || 0);
      });
      return entries.map(([id]) => id);
    }
    const { ids } = await loadCommentIndex(topicId, key);
    return ids;
  }

  async function applyCommentOrder(section, key) {
    if (!key || key === 'native') return '';
    const arts = [...section.querySelectorAll(THREAD_SEL)];
    if (!arts.length) return '还没有回复';
    const topicId = detailTopicId();
    if (!topicId) return '没认出这是哪个帖子（地址栏不是 /forum/post/…）';

    if (key === 'following') {
      resetCommentLayout(section);
      const set = await loadFollowingSet();
      if (!set) return '关注筛选需要登录，且要能读到你的关注列表';
      const { map } = await loadCommentIndex(topicId, 'earliest');
      let shown = 0;
      for (const a of arts) {
        const info = map.get(threadPostId(a));
        const hit = info && set.has(info.authorId);
        if (hit) shown++;
        else {
          a.style.display = 'none';
          a.dataset.pxHidden = '1';
        }
      }
      return `只显示你关注的 ${shown} 条楼层`;
    }

    // 其余排序：清掉上一次的隐藏状态再排
    section.querySelectorAll(`${THREAD_SEL}[data-px-hidden]`).forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxHidden;
    });
    const ids = await buildCommentOrder(topicId, key);
    return applyCommentLayout(section, ids);
  }

  /* ------------------------------------------------------------
   * 评论区翻页（仿 B 站）：按当前排序一页显示 N 层楼
   * ------------------------------------------------------------
   * 楼层太多时全渲染会把浏览器拖死，所以这里只控制「显示」，不改 DOM 节点：
   * 用 order 决定顺序、display 决定这一页露谁。首页 / 关注筛选 / 排序 / 翻页
   * 四者互不干扰（被「关注」隐藏的楼层不参与分页计数）。
   * ------------------------------------------------------------ */
  const COMMENT_PAGER_ID = 'pictExt-comment-pager';
  const commentPage = { topic: '', page: 1 };

  function commentPageSize() {
    return clampInt(settings.commentPageSize, 1, 20, 10);
  }

  function commentPagerEl() {
    return document.getElementById(COMMENT_PAGER_ID);
  }

  /** 楼层按当前呈现顺序排好（有 order 用 order，没有按 DOM 顺序） */
  function orderedThreads(section) {
    const arts = [...section.querySelectorAll(THREAD_SEL)];
    const domIdx = new Map(arts.map((a, i) => [a, i]));
    return arts.sort(
      (a, b) => Number(a.style.order || 0) - Number(b.style.order || 0) || domIdx.get(a) - domIdx.get(b)
    );
  }

  function renderCommentPager(section, total, shown, counts) {
    const container = commentContainer(section);
    if (!container) return;
    let pager = commentPagerEl();
    if (!pager) {
      pager = document.createElement('div');
      pager.id = COMMENT_PAGER_ID;
      pager.dataset.px = '1';
      container.insertAdjacentElement('afterend', pager);
      // 点击由 document 级委托统一处理（见 12.1），节点被重建也不会点两次
    } else if (pager.previousElementSibling !== container) {
      container.insertAdjacentElement('afterend', pager);
    }

    const cur = commentPage.page;
    // 页码列表：1 ... cur-1 cur cur+1 ... total
    const nums = new Set([1, total, cur, cur - 1, cur + 1]);
    if (total <= 7) for (let i = 1; i <= total; i++) nums.add(i);
    const list = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    let html = `<span class="pxcp-sum">共 ${total} 页</span>`;
    html += `<button class="pxcp-btn" type="button" data-px-page="prev"${cur <= 1 ? ' disabled' : ''}>上一页</button>`;
    let prev = 0;
    for (const n of list) {
      if (prev && n - prev > 1) html += '<span class="pxcp-gap">…</span>';
      html += `<button class="pxcp-btn" type="button" data-px-page="${n}" data-active="${
        n === cur ? 'true' : 'false'
      }">${n}</button>`;
      prev = n;
    }
    html += `<button class="pxcp-btn" type="button" data-px-page="next"${cur >= total ? ' disabled' : ''}>下一页</button>`;
    if (shown && counts.totalAll > counts.visible) html += `<span class="pxcp-sum">（筛掉 ${counts.totalAll - counts.visible} 层）</span>`;
    if (pager.dataset.html !== html) {
      pager.innerHTML = html;
      pager.dataset.html = html;
    }
    pager.dataset.px = '1';
  }

  function applyCommentPaging(section) {
    if (!section || !section.isConnected) return;
    const pager = commentPagerEl();
    // 关掉开关 / 原版且没开分页：把隐藏的楼层全放出来
    if (!settings.commentPaging) {
      section.querySelectorAll(`${THREAD_SEL}[data-px-page]`).forEach((el) => {
        el.style.display = '';
        delete el.dataset.pxPage;
      });
      if (pager) pager.remove();
      return;
    }

    const all = orderedThreads(section);
    if (!all.length) {
      if (pager) pager.remove();
      return;
    }
    const visible = all.filter((a) => !a.dataset.pxHidden);
    if (!visible.length) {
      if (pager) pager.remove();
      return;
    }
    const size = commentPageSize();
    const total = Math.max(1, Math.ceil(visible.length / size));
    const topic = detailTopicId();
    if (commentPage.topic !== topic) {
      commentPage.topic = topic;
      commentPage.page = 1;
    }
    commentPage.page = Math.min(total, Math.max(1, commentPage.page));
    // 只有一页就别碍眼了（B 站也是这么干的）
    if (total <= 1) {
      section.querySelectorAll(`${THREAD_SEL}[data-px-page]`).forEach((el) => {
        el.style.display = '';
        delete el.dataset.pxPage;
      });
      const p1 = commentPagerEl();
      if (p1) p1.remove();
      return;
    }
    const start = (commentPage.page - 1) * size;
    const end = start + size;

    visible.forEach((a, i) => {
      const show = i >= start && i < end;
      if (show) {
        if (a.dataset.pxPage) {
          a.style.display = '';
          delete a.dataset.pxPage;
        }
      } else if (!a.dataset.pxPage) {
        a.style.display = 'none';
        a.dataset.pxPage = '1';
      }
    });

    renderCommentPager(section, total, visible.length, { visible: visible.length, totalAll: all.length });
  }

  function scheduleCommentOrder(section) {
    if (!section || commentSortKey === 'native') return;
    clearTimeout(scheduleCommentOrder.t);
    scheduleCommentOrder.t = setTimeout(async () => {
      const sec = section && section.isConnected ? section : document.querySelector(COMMENT_SECTION);
      if (!sec) return;
      const key = commentSortKey;
      const label = (COMMENT_SORTS.find((s) => s.key === key) || {}).label || '';
      try {
        const msg = await applyCommentOrder(sec, key);
        applyCommentPaging(sec);
        if (key === commentSortKey) setCommentNote(msg ? `${label} · ${msg}` : `${label} · 已重排`);
      } catch (err) {
        log('comment order failed', err);
        if (key === commentSortKey) setCommentNote(`${label} · 排序失败：` + (err && err.message ? err.message : '接口没给数据'));
      }
    }, 200);
  }

  function setCommentNote(text) {
    const bar = commentSortBarEl();
    if (!bar) return;
    const note = bar.querySelector('.pxc-note');
    if (note) {
      note.textContent = text || '';
      note.hidden = !text;
    }
  }

  function mountCommentSort(section, topicId) {
    const nativeBar = section.querySelector('[aria-label="评论排序"]');
    let bar = commentSortBarEl();

    // 原版：把站内那套还回去，自己的整条拆掉，布局复位
    if (settings.commentSortMode !== 'replace') {
      if (commentSortKey !== 'native') commentSortKey = 'native';
      if (bar) bar.remove();
      if (nativeBar) nativeBar.style.display = '';
      resetCommentLayout(section);
      return;
    }

    if (!nativeBar) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = COMMENT_SORT_ID;
      bar.dataset.px = '1';
      bar.setAttribute('role', 'tablist');
      bar.setAttribute('aria-label', 'pictExt 评论排序');
      bar.innerHTML =
        COMMENT_SORTS.map(
          (s) =>
            `<button type="button" class="pxc-tab" role="tab" data-csort="${s.key}" data-active="false" aria-selected="false">${esc(
              s.label
            )}</button>`
        ).join('') + '<span class="pxc-note" hidden></span>';
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-csort]');
        if (!btn) return;
        selectCommentSort(btn.dataset.csort);
      });
      nativeBar.insertAdjacentElement('beforebegin', bar);
    }
    // 站内那个下拉整体藏掉（不点它，排序全由扩展自己算）
    if (nativeBar.style.display !== 'none') nativeBar.style.display = 'none';
    if (commentSortKey === 'native') commentSortKey = 'hot';
    syncCommentTabs();
    // 已经挂上来的楼层补一次排序（首次进入 / 加载更多之后）
    scheduleCommentOrder(section);
  }

  function syncCommentTabs() {
    const bar = commentSortBarEl();
    if (!bar) return;
    bar.querySelectorAll('[data-csort]').forEach((b) => {
      const on = b.dataset.csort === commentSortKey;
      b.dataset.active = on ? 'true' : 'false';
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function selectCommentSort(key) {
    if (!COMMENT_SORTS.some((s) => s.key === key)) return;
    const section = document.querySelector(COMMENT_SECTION);
    if (!section) return;
    commentSortKey = key;
    syncCommentTabs();
    setCommentNote('');
    scheduleCommentOrder(section);
  }

  function statItem(label, value) {
    return `<span class="inline-flex items-center gap-1"><span class="text-dimmed">${label}</span><span class="font-semibold text-muted">${esc(
      value
    )}</span></span>`;
  }

  function renderTopicInfo(d) {
    const parts = [
      statItem('浏览', fmtNum(d.viewCount)),
      statItem('回复', fmtNum(d.replyCount)),
      statItem('点赞', fmtNum(d.firstPost?.likeCount ?? 0)),
      statItem('发布于', timeAgo(d.createdAt)),
    ];
    if (d.lastActivityAt && d.lastActivityAt !== d.createdAt) parts.push(statItem('最后活跃', timeAgo(d.lastActivityAt)));
    if (d.kind === 'QUESTION') parts.push(statItem('类型', '问答'));
    if (d.pinned || d.pinnedGlobally) parts.push(statItem('状态', '置顶'));
    if (d.closedAt) parts.push(statItem('状态', '已关闭'));

    const tags = (d.tags || [])
      .map(
        (t) =>
          `<a href="/forum/category/${esc(t.slug)}" class="inline-flex items-center gap-1 text-primary hover:underline">${icon(
            'tag',
            12
          )}${esc(t.name)}</a>`
      )
      .join('');
    return parts.join('') + (tags ? `<span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">${tags}</span>` : '');
  }

  async function injectTopicInfo(section, topicId) {
    if (!topicId) return;
    let bar = section.querySelector('[data-px-topic-info]');
    if (!settings.topicInfo) {
      if (bar) bar.remove();
      return;
    }
    if (bar && bar.dataset.loaded === '1') return;
    if (!bar) {
      bar = document.createElement('div');
      bar.dataset.px = '1';
      bar.dataset.pxTopicInfo = '1';
      bar.className = 'mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-5';
      bar.textContent = '正在读取帖子信息…';
      const first = section.firstElementChild;
      if (first) first.insertAdjacentElement('beforebegin', bar);
      else section.appendChild(bar);
    }
    if (bar.dataset.pending === '1') return;
    bar.dataset.pending = '1';
    try {
      const data = await getTopicDetail(topicId);
      if (!bar.isConnected) return;
      bar.innerHTML = renderTopicInfo(data);
      bar.dataset.loaded = '1';
    } catch {
      if (bar.isConnected) bar.textContent = '帖子信息读取失败';
    } finally {
      bar.dataset.pending = '0';
    }
  }
