  /* ============================================================
   * 3. 数据层
   * ============================================================ */

  /**
   * 统一字段。
   * - 带 q 的搜索返回里没有 likeCount，标为 null 等补齐（绝不填 0 冒充）。
   * - `_t` / `_a` 是排好序用的毫秒时间戳：排序里再 new Date() 的话，
   *   一万条 × 每次比较都解析一次字符串，光是排序就能卡住主线程。
   */
  function normalize(it) {
    const createdAt = it.createdAt || null;
    const lastActivityAt = it.lastActivityAt || createdAt;
    return {
      id: it.id,
      title: it.title || '',
      excerpt: (it.match && it.match.excerpt) || it.excerpt || '',
      author: it.author || (it.match && it.match.author) || null,
      replyCount: Number(it.replyCount ?? 0),
      viewCount: Number(it.viewCount ?? 0),
      likeCount: typeof it.likeCount === 'number' ? it.likeCount : null,
      bookmarkCount: typeof it.bookmarkCount === 'number' ? it.bookmarkCount : null,
      createdAt,
      // editedAt = 最近一次修改（帖子有新版本才有值）
      editedAt: it.editedAt || null,
      lastActivityAt,
      tags: Array.isArray(it.tags) ? it.tags : [],
      pinned: !!(it.pinned || it.pinnedGlobally),
      kind: it.kind || '',
      matchPostNumber: it.match ? it.match.postNumber : null,
      _t: Date.parse(createdAt) || 0,
      _a: Date.parse(lastActivityAt) || 0,
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

  /* ------------------------------------------------------------
   * 3.1 游标：站点的 nextCursor 是一段 base64url 的 JSON，形如
   *   {v:1, mode:"browse", binding:{q,sort,kind,tags,tagMode},
   *    position:{pinnedRank, orderedAt:"<时间>", id}}
   * 这意味着「位置 = 某个活跃时间点」，于是可以按时间点直接落页：
   * 深翻 100 页时把一条链切成几段同时拉，墙钟时间从 30 秒降到几秒。
   *
   * 只做字符串层面的替换（不动 binding、不解析 UTF-8），读不懂就返回 null，
   * 上层自动退回逐页串行 —— 站点改版也不会因此坏掉。
   * ---------------------------------------------------------- */
  function b64urlToBin(s) {
    let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    try {
      return atob(t);
    } catch {
      return null;
    }
  }

  function binToB64url(bin) {
    try {
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
      return null;
    }
  }

  /** 游标里记的「排序时间点」（毫秒）。读不出来 → null */
  function cursorOrderedAt(cursor) {
    if (!cursor) return null;
    const json = b64urlToBin(cursor);
    if (!json) return null;
    const m = json.match(/"orderedAt"\s*:\s*"([^"]+)"/);
    if (!m) return null;
    const t = Date.parse(m[1]);
    return Number.isFinite(t) ? t : null;
  }

  /** 复制一份游标，只把位置换成指定时间点（binding 原样保留） */
  function cursorAt(cursor, iso) {
    if (!cursor) return null;
    const json = b64urlToBin(cursor);
    if (!json || !/"orderedAt"\s*:\s*"[^"]+"/.test(json)) return null;
    const next = json.replace(/("orderedAt"\s*:\s*")[^"]+(")/, `$1${iso}$2`);
    return binToB64url(next);
  }

  const isoOf = (ms) => new Date(ms).toISOString();

  /* ------------------------------------------------------------
   * 3.2 顺着游标拉页
   * ---------------------------------------------------------- */

  /**
   * @param {object} opts
   *   pages    这次最多拉几页
   *   cursor   从哪个游标接着拉（null = 从头）
   *   done     这条链已经到底
   *   workers  并行段数（1 = 串行）
   *   onPage(st)  每拉完一页回调一次，st.pending 里是这一页的新条目
   *   stopped()   返回 true 就尽快停（用户点了「停止」）
   * @returns {{pages:number, cursor:string|null, done:boolean}}
   */
  async function walkChain(ctx, sort, opts) {
    const budget = Math.max(1, opts.pages || 1);
    const stopped = opts.stopped || (() => false);
    const onPage = opts.onPage || (() => {});
    const st = { pages: 0, cursor: opts.cursor || null, done: !!opts.done, pending: [] };
    if (st.done) return st;

    const first = await fetchTopicPage(ctx, sort, st.cursor);
    st.pages++;
    st.pending.push(...first.items);
    st.cursor = first.next;
    st.done = !first.next;
    onPage(st);
    if (st.done || st.pages >= budget || stopped()) return st;

    const remain = budget - st.pages;
    const segs = planSegments(first, remain, opts.workers || 1);
    if (!segs) return walkSerial(ctx, sort, st, remain, stopped, onPage);
    return runSegments(ctx, sort, st, segs, remain, stopped, onPage);
  }

  /** 一页一页顺着游标走（默认路径；也是并发条件不成立时的兜底） */
  async function walkSerial(ctx, sort, st, remain, stopped, onPage) {
    let cursor = st.cursor;
    for (let i = 0; i < remain && cursor && !stopped(); i++) {
      const p = await fetchTopicPage(ctx, sort, cursor);
      st.pages++;
      st.pending.push(...p.items);
      cursor = p.next;
      if (!cursor) st.done = true;
      onPage(st);
    }
    st.cursor = cursor;
    return st;
  }

  /**
   * 把剩下要翻的页按「活跃时间点」切段：先用页 1 里条目的疏密估一段跨度，
   * 再在这个跨度上等距探几个时间点（探测本身也返回一整页真实数据，不浪费）。
   * 返回 null = 不值得并行 / 游标读不动 → 上层走串行。
   */
  function planSegments(first, remain, workers) {
    if (!settings.poolParallel) return null;
    if (workers < 2 || remain < 4 || !first.next) return null;
    const anchor = cursorOrderedAt(first.next);
    if (!anchor) return null;

    const times = first.items.map((i) => i._a).filter((t) => t > 0);
    if (times.length < 2) return null;
    const hi = Math.max(...times);
    const lo = Math.min(...times);
    const perDay = hi > lo ? (times.length / (hi - lo)) * 86400000 : PAGE_LIMIT;
    // 估「再翻 remain 页大约要往回追多少天」，至少给半天、最多给 10 年
    const estDays = Math.min(3650, Math.max(0.5, (remain * PAGE_LIMIT) / Math.max(0.5, perDay)));
    if (estDays < 0.2) return null;

    const k = Math.min(workers, Math.max(2, Math.ceil(remain / PAGES_PER_WORKER)));
    const bounds = [];
    for (let i = 1; i < k; i++) bounds.push(anchor - (estDays * i * 86400000) / k);
    return { anchor, bounds, k };
  }

  async function runSegments(ctx, sort, st, seg, remain, stopped, onPage) {
    const { bounds } = seg;
    // 探测：每个边界点各拉一页（并行），拿到该段真正的起点游标。
    // 探测页本身就是真实数据（该时间点之后的第一页），不浪费。
    const probes = await Promise.all(
      bounds.map((ts) => {
        const c = cursorAt(st.cursor, isoOf(ts));
        if (!c) return Promise.resolve(null);
        return fetchTopicPage(ctx, sort, c).then(
          (p) => ({ ts, p }),
          () => null // 这个点探不动就不切这一段，由上面那段一路走下来兜住
        );
      })
    );

    let good = probes.filter((x) => x && x.p.items.length);

    // 一个都没探到 = 估的跨度比站点实际历史还早（或探到了空页）：
    // 把每个点往回收一半再试一轮，还是不成才退回串行。多花几条请求，换一次真正并行的机会。
    if (!good.length) {
      const retried = await Promise.all(
        bounds.map((ts) => {
          const mid = seg.anchor - (seg.anchor - ts) / 2;
          const c = cursorAt(st.cursor, isoOf(mid));
          if (!c) return Promise.resolve(null);
          return fetchTopicPage(ctx, sort, c).then(
            (p) => ({ ts: mid, p }),
            () => null
          );
        })
      );
      good = retried.filter((x) => x && x.p.items.length);
    }
    if (!good.length) return walkSerial(ctx, sort, st, remain, stopped, onPage);

    good.sort((a, b) => b.ts - a.ts); // 从近到远

    const starts = [{ cursor: st.cursor, lower: good[0].ts }]; // 第一段：从页 1 之后接着走
    for (const { ts, p } of good) {
      st.pending.push(...p.items);
      st.pages++;
      onPage(st);
      starts.push({ cursor: p.next, lower: null, ts });
    }
    for (let i = 1; i < starts.length; i++) {
      starts[i].lower = i + 1 < starts.length ? good[i].ts : null; // 最后一段不管地界，一直走到底
    }

    // 预算只做安全阀：按设置的目标页数封顶（探测页额外算）。真估偏了顶多砍掉最老的那几页，
    // 不会在中间留洞 —— 池子里「新的那部分」永远是完整的。
    let used = 0;
    const maxPages = remain;
    const results = await Promise.all(
      starts.map(async (s) => {
        let cursor = s.cursor;
        let pages = 0;
        let done = !cursor;
        while (cursor && used < maxPages && !stopped()) {
          used++;
          const p = await fetchTopicPage(ctx, sort, cursor);
          pages++;
          st.pending.push(...p.items);
          st.pages++;
          cursor = p.next;
          onPage(st);
          if (!cursor) {
            done = true;
            break;
          }
          const lastT = p.items.length ? p.items[p.items.length - 1]._a : 0;
          if (s.lower != null && lastT && lastT < s.lower) break; // 够到下一段的地界了
          if (!p.items.length) break;
        }
        return { pages, cursor, done };
      })
    );

    // 续翻的起点取「最深的那个游标」；所有段都到底才算这条链到底
    let cursor = null;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].cursor) {
        cursor = results[i].cursor;
        break;
      }
    }
    st.cursor = cursor;
    st.done = results.every((r) => r.done);
    return st;
  }

  /* ------------------------------------------------------------
   * 3.3 候选池
   * ---------------------------------------------------------- */
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

  const poolCache = new Map();

  /** 这个排序要哪几条链、每条链先翻几页 */
  function poolPlan(sort) {
    const chains = (sort && sort.poolChains) || ['latest', 'hot'];
    const pagesOf = {
      latest: clampInt(settings.poolLatestPages, 1, POOL_PAGES_MAX, POOL_LATEST_PAGES),
      hot: clampInt(settings.poolHotPages, 1, POOL_PAGES_MAX, POOL_HOT_PAGES),
    };
    return chains.map((c) => ({ sort: c, pages: pagesOf[c] || 1 }));
  }

  function poolKey(ctx, plan) {
    return JSON.stringify([ctx.q || '', ctx.tag || '', ctx.boards || [], plan.map((p) => p.sort + ':' + p.pages)]);
  }

  function newPoolState(plan) {
    const state = { items: [], index: new Map(), chains: {}, plan, pages: 0, target: 0, stopped: false };
    for (const p of plan) {
      state.chains[p.sort] = { cursor: null, done: false, pages: 0 };
      state.target += p.pages;
    }
    // 整池共享 6 个 worker，按各链页数分配
    const total = Math.max(1, state.target);
    for (const p of plan) {
      p.workers = Math.max(1, Math.min(POOL_WORKERS, Math.round((POOL_WORKERS * p.pages) / total) || 1));
    }
    return state;
  }

  function clonePool(state) {
    const out = {
      items: state.items.slice(),
      index: new Map(state.index),
      chains: {},
      plan: state.plan.map((p) => ({ ...p })),
      pages: state.pages,
      target: state.target,
      stopped: state.stopped,
    };
    for (const k of Object.keys(state.chains)) out.chains[k] = { ...state.chains[k] };
    return out;
  }

  /** 按 id 去重合并；同一条目已有的话，把「补到点赞数」的那份换进去 */
  function addItems(state, incoming) {
    for (const it of incoming) {
      const at = state.index.get(it.id);
      if (at === undefined) {
        state.index.set(it.id, state.items.length);
        state.items.push(it);
      } else {
        const prev = state.items[at];
        if (prev.likeCount === null && it.likeCount !== null) state.items[at] = it;
      }
    }
  }

  /**
   * 按 plan 把各条链拉起来（各链之间并行；单条链内部再按时间切段并行）。
   * hooks: { onPage(state), stopped() }
   */
  async function runChains(ctx, state, only, pagesOf, hooks) {
    const stopped = (hooks && hooks.stopped) || (() => false);
    const onUpdate = (hooks && hooks.onPage) || (() => {});
    const jobs = state.plan
      .filter((p) => !only || only.includes(p.sort))
      .filter((p) => !state.chains[p.sort].done)
      .map((p) => {
        const chain = state.chains[p.sort];
        let seen = 0;
        return walkChain(ctx, p.sort, {
          pages: pagesOf ? pagesOf(p) : p.pages,
          cursor: chain.cursor,
          done: chain.done,
          workers: pagesOf ? 1 : p.workers,
          stopped,
          onPage: (local) => {
            if (local.pending.length) {
              addItems(state, local.pending.splice(0));
            }
            const delta = local.pages - seen;
            if (delta > 0) {
              seen = local.pages;
              state.pages += delta;
            }
            onUpdate(state);
          },
        }).then((res) => {
          chain.cursor = res.cursor;
          chain.done = res.done;
          chain.pages += res.pages;
        });
      });
    await Promise.all(jobs);
    return state;
  }

  /** 初始池：按当前排序需要的链和页数拉起来（进度通过 hooks.onPage 往外抛） */
  async function createPool(ctx, sort, hooks) {
    const plan = poolPlan(sort);
    const key = poolKey(ctx, plan);
    const hit = poolCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      const state = clonePool(hit.state);
      if (hooks && hooks.onPage) hooks.onPage(state);
      return state;
    }
    const state = newPoolState(plan);
    // 先把 Super 候选池里已经缓存的主题白捡进来（本地已有，不用再翻接口）
    // —— 首页 / 板块页的排序池因此能立刻有内容，接口只负责补新的。
    try {
      const cached = superCachedTopics();
      if (cached.length) addItems(state, cached);
    } catch {
      /* 池子读不出来就当没有 */
    }
    await runChains(ctx, state, null, null, hooks);
    poolCache.set(key, { at: Date.now(), state: clonePool(state) });
    while (poolCache.size > POOL_CACHE_MAX) poolCache.delete(poolCache.keys().next().value);
    return state;
  }

  /** 池子里的条目都看完了：每条没到底的链各再往后翻一页 */
  async function extendPool(ctx, state, hooks) {
    const before = state.items.length;
    await runChains(ctx, state, null, () => 1, hooks);
    poolCache.clear(); // 池子被续翻过，缓存里的那份已经不是最新的了
    return state.items.length - before;
  }

  /** 计划里的链都到底了，才算真的没得翻 */
  function poolDone(state) {
    if (!state) return true;
    return state.plan.every((p) => state.chains[p.sort] && state.chains[p.sort].done);
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
