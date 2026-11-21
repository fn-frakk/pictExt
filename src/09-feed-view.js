  /* ============================================================
   * 7. 列表视图
   * ------------------------------------------------------------
   * 性能约定（v1.7.5）：
   * 1. 列表只「往后追加」，不整块重建 —— 缓存里的几千条数据不会每点一次
   *    「再多看几条」就把已经画好的卡片全部丢掉重画（旧做法是 O(n²)）。
   * 2. 候选池边拉边画：第一页到手就先出一屏，后面每来一批再补，深翻 100 页
   *    也不会出现「白屏等 30 秒」。
   * 3. 排序用 normalize() 里预解析好的 _t / _a 毫秒数，比较器里不再 new Date()。
   * ============================================================ */
  class FeedView {
    /**
     * @param {HTMLElement} panel
     * @param {'home'|'search'|'category'} kind
     * @param {{q?:string, tag?:string, boards?:string[]}} ctx
     * @param {() => HTMLElement[]} getNativeNodes 取当前需要隐藏的原生节点
     */
    constructor(panel, kind, ctx, getNativeNodes, tabsEl) {
      this.panel = panel;
      this.kind = kind;
      this.ctx = ctx;
      this.getNativeNodes = getNativeNodes;
      this.listEl = panel.querySelector('.px-list');
      this.noteEl = panel.querySelector('.px-note');
      this.footEl = panel.querySelector('.px-foot');
      this.tabEls = [...(tabsEl || panel).querySelectorAll('.px-tab')];

      this.activeKey = 'default';
      this.timeKey = 'lastActivityAt';
      this.token = 0;
      this.serverCursor = null;
      this.serverHasMore = false;
      this.serverItems = [];
      this.pool = null;
      this.poolItems = [];
      this.poolVisible = 0;
      this.poolTotal = 0;
      this.feedState = null;
      this.loading = false;
      this.errorText = '';
      this.renderedIds = [];      // 已经画在 DOM 里的卡片 id（决定能不能追加）
      this.paintTimer = 0;
      this.stopTimer = 0;
      this.stopRequested = false;

      this.tabEls.forEach((btn) => {
        btn.addEventListener('click', () => this.select(btn.dataset.sort));
      });

      this.footEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-px-stop]')) {
          this.stopRequested = true;
          this.footEl.innerHTML = `<span class="px-note" style="margin:0;padding:0">正在停下…</span>`;
          return;
        }
        if (e.target.closest('.px-more')) this.loadMore();
      });
      this.listEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-px-retry]')) {
          e.preventDefault();
          this.loadMore(true);
        }
      });
    }

    get sort() {
      return resolveSort(this.activeKey);
    }

    syncTabs() {
      this.tabEls.forEach((b) => {
        const on = b.dataset.sort === this.activeKey;
        b.dataset.active = on ? 'true' : 'false';
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    select(key) {
      if (!SORT_MAP.has(key)) return;
      this.activeKey = key;
      lastSortKey[this.kind] = key;
      // 「最新」「最早」卡片显示的本来就是发布时间；其余排序显示最近活跃时间
      this.timeKey = key === 'latest' || key === 'earliest' ? 'createdAt' : 'lastActivityAt';
      this.syncTabs();
      this.hideNative();
      this.reset();
      this.loadMore();
    }

    reset() {
      this.token++;
      this.serverCursor = null;
      this.serverHasMore = false;
      this.serverItems = [];
      this.pool = null;
      this.poolItems = [];
      this.poolVisible = 0;
      this.poolTotal = 0;
      this.feedState = null;
      this.loading = false;
      this.errorText = '';
      this.renderedIds = [];
      this.stopRequested = false;
      clearTimeout(this.paintTimer);
      clearTimeout(this.stopTimer);
      this.listEl.innerHTML = '';
      this.footEl.innerHTML = '';
      this.noteEl.hidden = true;
    }

    async loadMore(force) {
      if (this.loading && !force) return;
      const token = ++this.token;
      this.loading = true;
      if (!this.listEl.children.length || this.errorText) {
        this.listEl.innerHTML = `<div class="px-state">正在加载…</div>`;
        this.renderedIds = [];
      } else {
        this.footEl.innerHTML = `<button class="px-more" disabled>加载中…</button>`;
      }
      this.errorText = '';

      try {
        const mode = this.sort.mode;
        if (mode === 'server') await this.loadServerPage(token);
        else if (mode === 'feed') await this.loadFeedPage(token);
        else await this.loadPool(token);
      } catch (err) {
        if (token !== this.token) return;
        log('load error', err);
        this.errorText = errorTextOf(err, this.sort);
        this.listEl.innerHTML = `<div class="px-state">${esc(this.errorText)}<br><button data-px-retry>重试</button></div>`;
        this.renderedIds = [];
        this.footEl.innerHTML = '';
        this.setNote('');
      } finally {
        if (token === this.token) this.loading = false;
      }
    }

    async loadServerPage(token) {
      // 相关度排序只在有关键词时成立；纯标签浏览时站点会直接 400
      if (this.sort.serverSort === 'relevance' && !this.ctx.q) {
        this.listEl.innerHTML = `<div class="px-state">这一页没有搜索关键词，用不了「站内搜索」相关度<br>换「最新 / 最多回复 / 最热」试试</div>`;
        this.renderedIds = [];
        this.setNote('站内搜索需要关键词');
        this.footEl.innerHTML = '';
        return;
      }
      const page = await fetchTopicPage(this.ctx, this.sort.serverSort, this.serverCursor);
      if (token !== this.token) return;
      const before = this.serverItems.length;
      this.serverItems.push(...page.items);
      this.serverCursor = page.next;
      this.serverHasMore = !!page.next;

      this.syncList(this.serverItems, before === 0);
      this.setNote(`${this.sort.note} · 已加载 ${this.serverItems.length} 条`);
      this.renderFoot(this.serverHasMore, '加载更多');
    }

    /**
     * 关注 / 推荐流：一次拉一页（推荐流单页上限 30），底部给「继续加载」。
     * 站点的推荐游标绑定本次浏览，下一批可能直接回 RECOMMENDATION_CURSOR_INVALID，
     * 这种情况保留已显示的条目，只把提示写清楚，不把列表清空。
     */
    async loadFeedPage(token) {
      const scope = this.sort.feedScope;
      const tag = this.ctx.tag || '';
      const ck = ['feed', scope, this.kind, tag].join('|');
      if (!this.feedState || this.feedState.key !== ck) {
        this.feedState = { key: ck, items: [], scanned: 0, cursor: null, done: false, started: false };
      }
      const st = this.feedState;
      const isMore = st.started;
      st.started = true;

      let page;
      try {
        page = await fetchFeedPage(scope, st.cursor);
        // 关注流常常只回一两条（站点那边就是按「你关注的人的新帖」给的），
        // 这里自动续着翻几页，直到攒够一屏或没有下一页 —— 免得开出来就一条。
        if (scope === 'following' && page.items.length && page.items.length < 10 && page.next) {
          let cursor = page.next;
          const extra = [];
          for (let i = 0; i < 4 && cursor; i++) {
            let more;
            try {
              more = await fetchFeedPage(scope, cursor);
            } catch {
              break; // 游标过期之类 → 就用已经拿到的
            }
            if (!more.items.length) break;
            extra.push(...more.items);
            cursor = more.next;
            if (extra.length >= 20) break;
          }
          if (extra.length) {
            const seenIds = new Set(page.items.map((i) => i.id));
            page.items = page.items.concat(extra.filter((i) => !seenIds.has(i.id)));
            page.next = cursor;
          }
        }
      } catch (err) {
        if (!isMore) throw err; // 第一页就失败 → 交给上层显示错误
        if (token !== this.token) return;
        const expired = err && err.code === 'RECOMMENDATION_CURSOR_INVALID';
        this.syncList(this.serverItems, true);
        this.setNote(`${this.sort.note} · 下一批没取到（${expired ? '这一轮推荐已过期' : '接口报错'}），再点一次试试`);
        this.renderFoot(true, '继续加载');
        return;
      }
      if (token !== this.token) return;

      st.scanned += page.items.length;
      const fresh = tag ? page.items.filter((i) => (i.tags || []).some((t) => t.slug === tag)) : page.items;
      const seen = new Set(st.items.map((i) => i.id));
      const before = st.items.length;
      st.items.push(...fresh.filter((i) => !seen.has(i.id)));
      st.cursor = page.next;
      st.done = !page.next;
      this.serverItems = st.items.slice();

      this.syncList(this.serverItems, before === 0 && this.renderedIds.length === 0);
      const base = `${this.sort.note} · 已显示 ${this.serverItems.length} 条`;
      this.setNote(
        tag
          ? `${base}（关注 / 推荐流是全站流，只保留 #${tag} 板块内的帖子；已扫过 ${st.scanned} 条）`
          : base
      );
      this.renderFoot(!st.done, '继续加载');
    }

    /* ---------------- 候选池 ---------------- */

    /**
     * 候选池排序（最新 / 最早 / 浏览 / 点赞 / 回复 / 收藏）。
     * 池子起步按设置里的页数拉（默认最新 6 + 热帖 3），边拉边显示；
     * 池子里的都看完了还能在底部「继续往后翻」，所以页数只是起点，不是上限。
     */
    async loadPool(token) {
      let mode = 'more';
      if (!this.pool) mode = 'create';
      else if (this.poolVisible >= this.poolItems.length && !this.poolDone()) mode = 'extend';

      if (mode !== 'more') {
        await this.runPoolLoad(token, mode);
        if (mode === 'create') await this.enrichPool(token);
      }
      if (token !== this.token) return;

      this.derivePool();
      this.sortPool();

      if (!this.poolItems.length) {
        // 典型场景：搜索结果接口根本不返回 bookmarkCount，收藏排序无数据可排（不假装排了）
        const metricLabel = { viewCount: '浏览量', likeCount: '点赞数', replyCount: '回复数', bookmarkCount: '收藏数' }[
          this.sort.metric
        ];
        this.listEl.innerHTML = `<div class="px-state">这个页面的接口不返回${esc(
          metricLabel
        )}，这一项排不了<br>换「最新 / 最多点赞 / 最多回复」试试</div>`;
        this.renderedIds = [];
        this.setNote(`${this.sort.note} · 候选池 ${this.poolTotal} 条里没有一条带${esc(metricLabel)}`);
        this.footEl.innerHTML = '';
        return;
      }

      // 每次点击只多放一屏：首次给一屏，之后每点一次加一屏
      this.poolVisible = Math.min(
        this.poolItems.length,
        this.poolVisible === 0 ? this.chunk() : this.poolVisible + this.chunk()
      );
      this.paintPool(this.poolVisible);
      this.setNote(this.poolNote());
      if (this.poolVisible < this.poolItems.length) this.renderFoot(true, '再多看几条');
      else if (!this.poolDone()) this.renderFoot(true, `继续往后翻（已翻 ${this.pool.pages} 页）`);
      else this.renderFoot(false);
    }

    /** 一次多显示几条 */
    chunk() {
      return clampInt(settings.poolRenderChunk, RENDER_CHUNK_MIN, RENDER_CHUNK_MAX, RENDER_CHUNK);
    }

    /**
     * 拉池子。initial=true 建池，否则续翻一页。
     * 每有数据进来就节流刷新一屏，不等整池拉完。
     */
    async runPoolLoad(token, mode) {
      if (mode === 'create') {
        this.setNote('正在加载候选池…');
        this.footEl.innerHTML = `<button class="px-more" disabled>加载中…</button>`;
      } else {
        this.footEl.innerHTML = `<button class="px-more" disabled>正在往后翻（已翻 ${this.pool.pages} 页）…</button>`;
      }
      this.stopRequested = false;

      // 超过 0.6 秒还没拉完，底部换成「停止」，长任务随时能刹住
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        if (token !== this.token || !this.loading) return;
        this.footEl.innerHTML = `<button class="px-more" data-px-stop>停止加载（已翻 ${
          this.pool ? this.pool.pages : 0
        } 页）</button>`;
      }, 600);

      const hooks = {
        stopped: () => this.stopRequested,
        onPage: (state) => {
          if (token !== this.token) return;
          this.pool = state;
          this.schedulePoolPaint();
        },
      };

      try {
        if (mode === 'create') {
          this.pool = await createPool(this.ctx, this.sort, hooks);
        } else {
          await extendPool(this.ctx, this.pool, hooks);
        }
      } finally {
        clearTimeout(this.stopTimer);
      }
      if (token !== this.token) return;
      this.flushPoolPaint();
    }

    /** 边拉边画：250ms 合并一次，避免每来一页就重排+重画 */
    schedulePoolPaint() {
      if (this.paintTimer) return;
      const token = this.token;
      this.paintTimer = setTimeout(() => {
        this.paintTimer = 0;
        if (token !== this.token) return;
        this.flushPoolPaint();
        if (this.loading) this.setNote(this.poolLoadingNote());
      }, 250);
    }

    flushPoolPaint() {
      clearTimeout(this.paintTimer);
      this.paintTimer = 0;
      if (!this.pool) return;
      this.derivePool();
      this.sortPool();
      // 加载过程中先放一屏出来，不多占（正式的可见条数由 loadPool 决定）
      this.paintPool(Math.max(this.poolVisible, this.chunk()));
    }

    poolLoadingNote() {
      const st = this.pool;
      if (!st) return '正在加载候选池…';
      const scope = this.ctx.tag ? `仅 #${this.ctx.tag} 板块内` : '全站';
      return `正在加载候选池… ${scope}，已翻 ${st.pages}/${st.target} 页，收到 ${st.items.length} 条`;
    }

    poolNote() {
      if (!this.pool) return '';
      const scopeNote = this.ctx.tag ? `仅 #${this.ctx.tag} 板块内` : '全站';
      const pagesNote = `已翻 ${this.pool.pages} 页`;
      if (this.poolItems.length < this.poolTotal) {
        return `${this.sort.note} · 候选池 ${this.poolTotal} 条（${scopeNote}，${pagesNote}），其中 ${this.poolItems.length} 条带这项数据、参与排序`;
      }
      return `${this.sort.note} · 候选池 ${this.pool.items.length} 条（${scopeNote}，${pagesNote}）`;
    }

    /** 两条链都到底了才算真的没得翻了 */
    poolDone() {
      return poolDone(this.pool);
    }

    /** 搜索接口不返回点赞数，排「最多点赞」前先把有数的那批补上 */
    async enrichPool(token) {
      if (this.sort.metric !== 'likeCount') return;
      const need = this.pool.items.filter((i) => i.likeCount === null || i.likeCount === undefined);
      if (!need.length) return;
      this.setNote(`正在补齐点赞数…（候选池里 ${Math.min(need.length, ENRICH_MAX)} 条）`);
      await enrichLikes(this.pool.items, ENRICH_MAX);
      if (token !== this.token) return;
    }

    /** 按当前指标挑出能参与排序的条目（没这项数据的排除，绝不拿 0 充数） */
    derivePool() {
      const metric = this.sort.metric;
      this.poolTotal = this.pool ? this.pool.items.length : 0;
      this.poolItems = this.pool
        ? this.pool.items.filter((i) => i[metric] !== null && i[metric] !== undefined)
        : [];
    }

    /** 排序：时间类按 _t（发布时间）排，数值类按指标排，都不 new Date() */
    sortPool() {
      const metric = this.sort.metric;
      const asc = !!this.sort.asc;
      const byTime = metric === 'createdAt';
      const list = this.poolItems;
      if (byTime) {
        // 纯时间序：置顶帖也按自己真实的发布时间排队，不硬塞到最前面
        list.sort((a, b) => {
          const d = asc ? a._t - b._t : b._t - a._t;
          if (d !== 0) return d;
          return asc ? a._a - b._a : b._a - a._a;
        });
        return;
      }
      list.sort((a, b) => {
        const d = (b[metric] || 0) - (a[metric] || 0);
        if (d !== 0) return d;
        return b._a - a._a;
      });
    }

    /** @param {number} [shown] 要画多少条（默认当前可见条数） */
    paintPool(shown) {
      const n = shown == null ? this.poolVisible : shown;
      this.syncList(this.poolItems.slice(0, Math.min(n, this.poolItems.length)), false);
    }

    setNote(text) {
      this.noteEl.hidden = !text;
      this.noteEl.textContent = text || '';
    }

    renderFoot(hasMore, label) {
      this.footEl.innerHTML = hasMore
        ? `<button class="px-more">${esc(label)}</button>`
        : this.listEl.querySelector('article')
          ? `<span class="px-note" style="margin:0;padding:0">已经到底了</span>`
          : '';
    }

    /**
     * 把列表同步到 items：能追加就只追加（便宜），顺序变了才整体重建（贵）。
     * @param {Array} items 要显示的条目（顺序即显示顺序）
     * @param {boolean} force true = 必须整体重建（排序变了 / 数据被替换过）
     */
    syncList(items, force) {
      if (!items.length) {
        this.listEl.innerHTML = `<div class="px-state">没有找到帖子</div>`;
        this.renderedIds = [];
        return;
      }
      const ids = items.map((i) => i.id);
      const prev = this.renderedIds;
      const hasState = !!this.listEl.querySelector('.px-state');
      const isPrefix = prev.length <= ids.length && prev.every((id, i) => ids[i] === id);
      if (!force && !hasState && isPrefix && prev.length === ids.length) return;

      const shell = nativeCardShell(this.kind);
      const html = (arr) => arr.map((t) => cardHTML(t, this.timeKey, shell, this.kind)).join('');
      if (!force && !hasState && isPrefix && prev.length < ids.length) {
        this.listEl.insertAdjacentHTML('beforeend', html(items.slice(prev.length)));
      } else {
        this.listEl.innerHTML = html(items);
      }
      this.renderedIds = ids;
    }

    hideNative() {
      const nodes = typeof this.getNativeNodes === 'function' ? this.getNativeNodes() : [];
      nativeHider.hide(nodes);
    }
  }
