  /* ============================================================
   * 7. 列表视图
   * ============================================================ */
  class FeedView {
    /**
     * @param {HTMLElement} panel
     * @param {'home'|'search'} kind
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

      this.tabEls.forEach((btn) => {
        btn.addEventListener('click', () => this.select(btn.dataset.sort));
      });

      this.footEl.addEventListener('click', (e) => {
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
      return SORT_MAP.get(this.activeKey) || SORT_MAP.get('latest');
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
        this.setNote('站内搜索需要关键词');
        this.footEl.innerHTML = '';
        return;
      }
      const page = await fetchTopicPage(this.ctx, this.sort.serverSort, this.serverCursor);
      if (token !== this.token) return;
      const seen = new Set(this.serverItems.map((i) => i.id));
      this.serverItems.push(...page.items.filter((i) => !seen.has(i.id)));
      this.serverCursor = page.next;
      this.serverHasMore = !!page.next;

      this.renderCards(this.serverItems);
      this.setNote(`${this.sort.note} · 已加载 ${this.serverItems.length} 条`);
      this.renderFoot(this.serverHasMore, '加载更多');
    }

    /** 关注 / 推荐流：翻 pages 页，板块页再按标签过滤 */
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
      } catch (err) {
        if (!isMore) throw err; // 第一页就失败 → 交给上层显示错误
        if (token !== this.token) return;
        const expired = err && err.code === 'RECOMMENDATION_CURSOR_INVALID';
        this.renderCards(this.serverItems);
        this.setNote(`${this.sort.note} · 下一批没取到（${expired ? '这一轮推荐已过期' : '接口报错'}），再点一次试试`);
        this.renderFoot(true, '继续加载');
        return;
      }
      if (token !== this.token) return;

      st.scanned += page.items.length;
      const fresh = tag ? page.items.filter((i) => (i.tags || []).some((t) => t.slug === tag)) : page.items;
      const seen = new Set(st.items.map((i) => i.id));
      st.items.push(...fresh.filter((i) => !seen.has(i.id)));
      st.cursor = page.next;
      st.done = !page.next;
      this.serverItems = st.items.slice();

      this.renderCards(this.serverItems);
      const base = `${this.sort.note} · 已显示 ${this.serverItems.length} 条`;
      this.setNote(
        tag
          ? `${base}（关注 / 推荐流是全站流，只保留 #${tag} 板块内的帖子；已扫过 ${st.scanned} 条）`
          : base
      );
      this.renderFoot(!st.done, '继续加载');
    }

    /**
     * 候选池排序（浏览 / 点赞 / 回复 / 收藏）。
     * 默认池子是 9 页（最新 6 + 热帖 3）；池子里的都看完了还会继续往后翻，
     * 所以「9 页」只是起点，不是上限。
     */
    async loadPool(token) {
      if (!this.pool) {
        const st = await createPool(this.ctx);
        if (token !== this.token) return;
        this.pool = st;
        this.poolVisible = 0;
        await this.enrichPool(token);
        if (token !== this.token) return;
        this.derivePool();
      } else if (this.poolVisible >= this.poolItems.length && !this.poolDone()) {
        // 池子见底但两条链还有下一页 → 往后翻一批
        this.footEl.innerHTML = `<button class="px-more" disabled>正在往后翻（已翻 ${this.pool.pages} 页）…</button>`;
        await extendPool(this.ctx, this.pool);
        if (token !== this.token) return;
        await this.enrichPool(token);
        if (token !== this.token) return;
        this.derivePool();
      }

      const asc = !!this.sort.asc;
      this.poolItems.sort((a, b) => {
        if (asc) {
          // 「最早」：按发布时间正序（同一时间再按楼层/更新时间兜底）
          const pa = a.pinned ? 0 : 1;
          const pb = b.pinned ? 0 : 1;
          if (pa !== pb) return pa - pb;
          const d = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
          if (d !== 0) return d;
          return new Date(a.lastActivityAt || 0) - new Date(b.lastActivityAt || 0);
        }
        const d = (b[this.sort.metric] || 0) - (a[this.sort.metric] || 0);
        if (d !== 0) return d;
        return new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0);
      });

      this.poolVisible = Math.min(this.poolItems.length, Math.max(20, this.poolVisible + 20));
      if (!this.poolItems.length) {
        // 典型场景：搜索结果接口根本不返回 bookmarkCount，收藏排序无数据可排（不假装排了）
        const metricLabel = { viewCount: '浏览量', likeCount: '点赞数', replyCount: '回复数', bookmarkCount: '收藏数' }[
          this.sort.metric
        ];
        this.listEl.innerHTML = `<div class="px-state">这个页面的接口不返回${esc(
          metricLabel
        )}，这一项排不了<br>换「最新 / 最多点赞 / 最多回复」试试</div>`;
        this.setNote(`${this.sort.note} · 候选池 ${this.poolTotal} 条里没有一条带${esc(metricLabel)}`);
        this.footEl.innerHTML = '';
        return;
      }
      this.renderCards(this.poolItems.slice(0, this.poolVisible));
      const scopeNote = this.ctx.tag ? `仅 #${this.ctx.tag} 板块内` : '全站';
      const pagesNote = `已翻 ${this.pool.pages} 页`;
      this.setNote(
        this.poolItems.length < this.poolTotal
          ? `${this.sort.note} · 候选池 ${this.poolTotal} 条（${scopeNote}，${pagesNote}），其中 ${this.poolItems.length} 条带这项数据、参与排序`
          : `${this.sort.note} · 候选池 ${this.pool.items.length} 条（${scopeNote}，${pagesNote}）`
      );
      if (this.poolVisible < this.poolItems.length) this.renderFoot(true, '再多看几条');
      else if (!this.poolDone()) this.renderFoot(true, `继续往后翻（已翻 ${this.pool.pages} 页）`);
      else this.renderFoot(false);
    }

    /** 两条链都到底了才算真的没得翻了 */
    poolDone() {
      return !!(this.pool && this.pool.doneLatest && this.pool.doneHot);
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
      this.poolTotal = this.pool.items.length;
      this.poolItems = this.pool.items.filter((i) => i[metric] !== null && i[metric] !== undefined);
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

    renderCards(items) {
      if (!items.length) {
        this.listEl.innerHTML = `<div class="px-state">没有找到帖子</div>`;
        return;
      }
      const shell = nativeCardShell(this.kind);
      this.listEl.innerHTML = items.map((t) => cardHTML(t, this.timeKey, shell, this.kind)).join('');
    }

    hideNative() {
      const nodes = typeof this.getNativeNodes === 'function' ? this.getNativeNodes() : [];
      nativeHider.hide(nodes);
    }
  }
