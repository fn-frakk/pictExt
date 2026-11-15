  /* ============================================================
   * 3. 数据层
   * ============================================================ */

  /** 统一字段。带 q 的搜索返回里没有 likeCount，标为 null 等补齐。 */
  function normalize(it) {
    return {
      id: it.id,
      title: it.title || '',
      excerpt: (it.match && it.match.excerpt) || it.excerpt || '',
      author: it.author || (it.match && it.match.author) || null,
      replyCount: Number(it.replyCount ?? 0),
      viewCount: Number(it.viewCount ?? 0),
      likeCount: typeof it.likeCount === 'number' ? it.likeCount : null,
      bookmarkCount: typeof it.bookmarkCount === 'number' ? it.bookmarkCount : null,
      createdAt: it.createdAt || null,
      // editedAt = 最近一次修改（帖子有新版本才有值）
      editedAt: it.editedAt || null,
      lastActivityAt: it.lastActivityAt || it.createdAt || null,
      tags: Array.isArray(it.tags) ? it.tags : [],
      pinned: !!(it.pinned || it.pinnedGlobally),
      kind: it.kind || '',
      matchPostNumber: it.match ? it.match.postNumber : null,
    };
  }

  /** 拉一页 /topics。ctx: {q, boards, tag} */
  async function fetchTopicPage(ctx, sort, cursor) {
    const params = { limit: PAGE_LIMIT, cursor };
    if (sort) params.sort = sort; // 不传 sort = 站点自己的默认顺序（板块页「默认排序」）
    if (ctx.q) params.q = ctx.q;
    if (ctx.tag) params.tag = ctx.tag;
    if (ctx.boards && ctx.boards.length) {
      params.tag = ctx.boards;
      params.tagMode = 'any';
    }
    const data = await apiGet('/topics', params);
    const items = (data.items || []).map(normalize);
    const next = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
    return { items, next };
  }

  /**
   * 拉一页 /topic-recommendations。
   * scope='following' 就是站内的「关注」流（必须登录才有），不传 scope 是公开的推荐流。
   */
  async function fetchFeedPage(scope, cursor) {
    const params = { limit: FEED_LIMIT, cursor };
    if (scope === 'following') params.scope = 'following';
    // 推荐流的游标绑定"本次浏览"（服务端按会话记状态），所以带登录态去请求更容易续上；
    // settings.useSession 关掉时 apiGet 仍会退回 credentials:'omit'
    const data = await apiGet('/topic-recommendations', params, { auth: true });
    const items = (data.items || []).map(normalize);
    const next = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
    return { items, next };
  }

  /**
   * 顺链拉多页（游标必须串行）。返回最后那个游标，方便之后继续往后翻。
   * done = 这条链已经到底（服务端没给 nextCursor）
   */
  async function fetchChain(ctx, sort, pages) {
    const out = [];
    let cursor = null;
    let done = false;
    let n = 0;
    for (let i = 0; i < pages; i++) {
      const page = await fetchTopicPage(ctx, sort, cursor);
      out.push(...page.items);
      n++;
      cursor = page.next;
      if (!cursor) {
        done = true;
        break;
      }
    }
    return { items: out, cursor, done, pages: n };
  }

  const detailCache = new Map();

  /** 搜索返回体没有 likeCount，用详情里的 firstPost.likeCount 补 */
  async function fetchLikeCount(id) {
    if (detailCache.has(id)) return detailCache.get(id);
    let likes = 0;
    try {
      const d = await apiGet('/topics/' + encodeURIComponent(id));
      likes = Number(d?.firstPost?.likeCount ?? 0);
    } catch {
      likes = 0;
    }
    detailCache.set(id, likes);
    return likes;
  }

  /** 只补齐排上队的那些；没补到的保持 null，后面会被排除，绝不伪造 0 赞 */
  async function enrichLikes(items, max = ENRICH_MAX) {
    const need = items.filter((i) => i.likeCount === null);
    const slice = need.slice(0, max);
    let idx = 0;
    const workers = Array.from({ length: ENRICH_CONCURRENCY }, async () => {
      while (idx < slice.length) {
        const item = slice[idx++];
        item.likeCount = await fetchLikeCount(item.id);
      }
    });
    await Promise.all(workers);
  }

  /**
   * 候选池 = 最新链 + 热帖链。
   * 默认只取 9 页（最新 6 + 热帖 3，约 450 条）；这两条链的游标一并留着，
   * 用户点「继续加载」时可以接着往后翻，不是到第 9 页就断了。
   */
  const poolCache = new Map();

  /** 按 id 合并，保留带点赞数的那份 */
  function mergeTopics(target, incoming) {
    const map = new Map(target.map((i) => [i.id, i]));
    for (const it of incoming) {
      const prev = map.get(it.id);
      if (!prev) map.set(it.id, it);
      else if (prev.likeCount === null && it.likeCount !== null) map.set(it.id, it);
    }
    return [...map.values()];
  }

  function poolKey(ctx) {
    return JSON.stringify([ctx.q || '', ctx.tag || '', ctx.boards || []]);
  }

  /** 初始池：最新 6 页 + 热帖 3 页 */
  async function createPool(ctx) {
    const key = poolKey(ctx);
    const hit = poolCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.state, items: hit.state.items.slice() };

    const latestPages = clampInt(settings.poolLatestPages, 1, POOL_PAGES_MAX, POOL_LATEST_PAGES);
    const hotPages = clampInt(settings.poolHotPages, 1, POOL_PAGES_MAX, POOL_HOT_PAGES);
    const [latest, hot] = await Promise.all([
      fetchChain(ctx, 'latest', latestPages),
      fetchChain(ctx, 'hot', hotPages),
    ]);
    const state = {
      items: mergeTopics([], [...hot.items, ...latest.items]),
      cursorLatest: latest.cursor,
      cursorHot: hot.cursor,
      doneLatest: latest.done,
      doneHot: hot.done,
      pages: latest.pages + hot.pages,
    };
    poolCache.set(key, { at: Date.now(), state });
    return { ...state, items: state.items.slice() };
  }

  /** 池子里的条目都看完了：两条链各再往后翻一页（谁没到底就翻谁） */
  async function extendPool(ctx, state) {
    const jobs = [];
    if (!state.doneLatest)
      jobs.push(fetchTopicPage(ctx, 'latest', state.cursorLatest).then((p) => ({ chain: 'latest', p })));
    if (!state.doneHot) jobs.push(fetchTopicPage(ctx, 'hot', state.cursorHot).then((p) => ({ chain: 'hot', p })));
    if (!jobs.length) return 0;

    const rs = await Promise.all(jobs);
    let added = 0;
    for (const { chain, p } of rs) {
      const before = state.items.length;
      state.items = mergeTopics(state.items, p.items);
      added += state.items.length - before;
      state.pages++;
      if (chain === 'latest') {
        state.cursorLatest = p.next;
        state.doneLatest = !p.next;
      } else {
        state.cursorHot = p.next;
        state.doneHot = !p.next;
      }
    }
    return added;
  }

  /** 人话版错误提示 */
  function errorTextOf(err, sort) {
    const code = (err && err.code) || '';
    if (err && err.status === 401) return sort && sort.needAuth ? '关注流需要登录后才能查看' : '这个排序需要登录';
    if (err && err.status === 429) return '请求太频繁，稍等一下再试';
    if (code === 'RECOMMENDATION_FEED_EXPIRED' || code === 'RECOMMENDATION_CURSOR_INVALID') return '这一轮推荐已过期，重试一下';
    if (err && err.status === 400) return '这个排序暂时不可用，换一个试试';
    return '加载失败，请重试';
  }
