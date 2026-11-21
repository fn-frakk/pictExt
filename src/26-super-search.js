  /* ============================================================
   * 13. Super 搜索 —— 严格关键词搜索 + 本地候选池（增量缓存 + 清理失效）
   * ------------------------------------------------------------
   * 为什么不用站内搜索：
   *   站内 /topics?q= 是「相关度」模糊匹配，搜 pick 出 29 条、搜 pickcat 出 500 条，
   *   关键词越短命中越多，完全没法当检索用。这里改成：
   *   1) 候选池：本地缓存全站主题 + 回复，按时间水位线增量拉取；
   *   2) 严格匹配：所有词都要命中（AND），支持 "精确短语" / -排除 / title: 作者: 限定；
   *   3) 缓存增量：本次已加载到 YYYY-MM-DD HH:MM:SS，下次只拉这之后的内容；
   *   4) 清理失效：帖子被删 / 回复被删 / 楼层 deleted → 从池子里剔除。
   * ============================================================ */
  const SUPER_POOL_KEY = 'pictExt:superpool:v1';
  const SUPER_ID = 'pictExt-super';

  const SUPER_MAX_TOPICS = 1500;   // 池子里最多留多少主题（超了丢最老的）
  const SUPER_MAX_REPLIES = 3000;  // 池子里最多留多少条回复
  const SUPER_TOPIC_PAGES = 8;     // 一次同步最多翻几页主题（每页 50）
  const SUPER_POST_PAGES = 2;      // 每个有新活动的帖最多翻几页回复
  const SUPER_REPLY_TOPICS = 20;   // 一次同步最多给多少个帖子补回复（避免请求打爆）
  const SUPER_REPLY_CHARS = 500;   // 单条回复正文最多留多少字（够搜就行）
  const SUPER_EXCERPT_CHARS = 600;
  const SUPER_RESULT_MAX = 200;    // 一次最多返回多少条结果

  /** 池子（内存态；持久化在 localStorage） */
  const superPool = {
    v: 1,
    watermark: 0,     // 已加载到的最后时间点（毫秒）
    updatedAt: 0,     // 上次同步完成时间
    topics: {},       // id -> 主题记录
    replies: {},      // id -> 回复记录
  };

  let superPoolLoaded = false;
  let superSyncing = false;
  let superSyncError = '';

  /* ------------------------------------------------------------
   * 13.1 存储
   * ---------------------------------------------------------- */

  function loadSuperPool() {
    if (superPoolLoaded) return superPool;
    superPoolLoaded = true;
    try {
      const raw = localStorage.getItem(SUPER_POOL_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          superPool.v = 1;
          superPool.watermark = Number(p.watermark) || 0;
          superPool.updatedAt = Number(p.updatedAt) || 0;
          superPool.topics = p.topics && typeof p.topics === 'object' ? p.topics : {};
          superPool.replies = p.replies && typeof p.replies === 'object' ? p.replies : {};
        }
      }
    } catch {
      /* 读不出来就当空池 */
    }
    return superPool;
  }

  /** 超配额时先砍掉最老的一半再存；实在存不进去就放弃这次落盘（内存里照用） */
  function saveSuperPool() {
    const pool = loadSuperPool();
    pool.updatedAt = Date.now();
    const trim = () => {
      const t = Object.values(pool.topics).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      while (t.length > SUPER_MAX_TOPICS) delete pool.topics[t.shift().id];
      const r = Object.values(pool.replies).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      while (r.length > SUPER_MAX_REPLIES) delete pool.replies[r.shift().id];
    };
    trim();
    try {
      localStorage.setItem(SUPER_POOL_KEY, JSON.stringify(pool));
    } catch {
      try {
        const t = Object.values(pool.topics).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        while (t.length > Math.floor(SUPER_MAX_TOPICS / 2)) delete pool.topics[t.shift().id];
        const r = Object.values(pool.replies).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        while (r.length > Math.floor(SUPER_MAX_REPLIES / 2)) delete pool.replies[r.shift().id];
        localStorage.setItem(SUPER_POOL_KEY, JSON.stringify(pool));
      } catch {
        /* 无痕模式等场景写不进去就算了，池子仍然在内存里可用 */
      }
    }
  }

  /* ------------------------------------------------------------
   * 13.2 文本处理
   * ---------------------------------------------------------- */

  const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', apos: "'" };

  /** cookedHtml → 纯文本（去掉标签、还原实体、压空白） */
  function plainText(html, limit) {
    if (!html) return '';
    let s = String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]*>/g, '');
    s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
      const key = g.toLowerCase();
      if (HTML_ENTITIES[key]) return HTML_ENTITIES[key];
      if (key.startsWith('#x')) {
        const code = parseInt(key.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      if (key.startsWith('#')) {
        const code = parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return m;
    });
    s = s.replace(/\s+/g, ' ').trim();
    if (limit && s.length > limit) s = s.slice(0, limit);
    return s;
  }

  const tsOf = (iso) => {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) ? t : 0;
  };

  /** 毫秒 → 'YYYY-MM-DD HH:MM:SS'（本地时区，给人看的水位线） */
  function stampText(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /* ------------------------------------------------------------
   * 13.3 候选池同步（增量 + 清理失效）
   * ---------------------------------------------------------- */

  function topicRecord(it) {
    return {
      id: it.id,
      title: it.title || '',
      kind: it.kind || '',
      text: plainText(it.excerpt || '', SUPER_EXCERPT_CHARS),
      authorId: it.author?.id || '',
      authorName: it.author?.username || '',
      replyCount: Number(it.replyCount ?? 0),
      viewCount: Number(it.viewCount ?? 0),
      likeCount: typeof it.likeCount === 'number' ? it.likeCount : null,
      bookmarkCount: typeof it.bookmarkCount === 'number' ? it.bookmarkCount : null,
      tags: Array.isArray(it.tags) ? it.tags.map((t) => t?.slug || '').filter(Boolean) : [],
      createdAt: it.createdAt || '',
      lastActivityAt: it.lastActivityAt || it.createdAt || '',
      _t: tsOf(it.createdAt),
      _a: tsOf(it.lastActivityAt || it.createdAt),
    };
  }

  function replyRecord(p, topic) {
    return {
      id: p.id,
      topicId: p.topicId || topic?.id || '',
      topicTitle: topic?.title || '',
      postNumber: Number(p.postNumber ?? 0),
      text: plainText(p.cookedHtml || '', SUPER_REPLY_CHARS),
      authorId: p.author?.id || '',
      authorName: p.author?.username || '',
      likeCount: Number(p.likeCount ?? 0),
      createdAt: p.createdAt || '',
      deleted: !!p.deleted,
      _t: tsOf(p.createdAt),
    };
  }

  /** 主题被删 → 连它的回复一起清掉 */
  function dropTopic(topicId) {
    const pool = loadSuperPool();
    delete pool.topics[topicId];
    for (const [rid, r] of Object.entries(pool.replies)) {
      if (r.topicId === topicId) delete pool.replies[rid];
    }
  }

  /** 回复被删（deleted=true 或整篇列表里消失）→ 从池子里剔掉 */
  function dropReply(replyId) {
    delete loadSuperPool().replies[replyId];
  }

  /**
   * 同步候选池。
   * @param {{onProgress?:(st:object)=>void, force?:boolean}} opts
   *   force=true 时忽略水位线，全量重来（顺带把失效条目清干净）
   */
  async function syncSuperPool(opts) {
    const options = opts || {};
    const pool = loadSuperPool();
    if (superSyncing) return { skipped: true };
    superSyncing = true;
    superSyncError = '';
    const st = { pages: 0, topics: 0, replies: 0, removed: 0, done: false, error: '' };
    const report = () => {
      if (options.onProgress) options.onProgress({ ...st });
    };
    try {
      const wm = options.force ? 0 : pool.watermark || 0;
      const touched = new Map(); // topicId -> 主题记录（有新活动，需要补回复）
      let cursor = null;
      let maxSeen = wm;

      const maxPages = clampInt(settings.superPoolPages, 1, 30, SUPER_TOPIC_PAGES);
      for (let page = 0; page < maxPages; page++) {
        const data = await apiGet('/topics', { limit: PAGE_LIMIT, sort: 'latest', cursor });
        const items = data.items || [];
        if (!items.length) break;
        let newer = false;
        for (const it of items) {
          if (!it || !it.id) continue;
          const rec = topicRecord(it);
          if (rec._a >= wm) {
            newer = true;
            if (rec._a > maxSeen) maxSeen = rec._a;
          }
          const prev = pool.topics[rec.id];
          if (!prev) {
            pool.topics[rec.id] = rec;
            st.topics++;
            // 新主题：它下面的回复也要拉（池子里的回复才算全）
            if (rec._a >= wm) touched.set(rec.id, rec);
          } else {
            // 已有的主题：更新计数与活跃时间，标记为「有活动」→ 待会儿补回复
            const changed =
              rec.replyCount !== prev.replyCount || rec._a > prev._a || rec.lastActivityAt !== prev.lastActivityAt;
            pool.topics[rec.id] = { ...prev, ...rec };
            if (changed && rec._a >= wm) touched.set(rec.id, pool.topics[rec.id]);
          }
        }
        st.pages++;
        report();
        cursor = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
        if (!cursor) break;
        // 整页都是旧内容 → 后面不会再有新的了
        if (!newer) {
          cursor = null;
          break;
        }
      }

      // 有新活动的帖子：增量补回复（只收比水位线新的；顺带发现被删的）
      // 请求量控制：一次最多给 SUPER_REPLY_TOPICS 个帖子补回复，且优先最近活跃的
      const toSync = [...touched.values()]
        .filter((t) => t.replyCount > 0)
        .sort((a, b) => b._a - a._a)
        .slice(0, SUPER_REPLY_TOPICS);
      for (const topic of toSync) {
        try {
          const r = await syncTopicReplies(topic, wm, st);
          st.replies += r.added;
          st.removed += r.removed;
        } catch (err) {
          if (err && err.status === 404) {
            dropTopic(topic.id);
            st.removed++;
          }
        }
        report();
      }

      pool.watermark = Math.max(pool.watermark || 0, maxSeen);
      saveSuperPool();
      st.done = true;
      report();
      return st;
    } catch (err) {
      superSyncError = (err && err.message) || String(err);
      st.error = superSyncError;
      report();
      return st;
    } finally {
      superSyncing = false;
    }
  }

  /**
   * 补某个主题的回复：只收比水位线新的；整篇列完还缺的那些 = 已被删 → 剔除。
   */
  async function syncTopicReplies(topic, wm, st) {
    const pool = loadSuperPool();
    let cursor = null;
    let added = 0;
    let removed = 0;
    const seen = new Set();
    let complete = false;

    for (let page = 0; page < SUPER_POST_PAGES; page++) {
      const data = await apiGet('/topics/' + encodeURIComponent(topic.id) + '/posts', {
        limit: PAGE_LIMIT,
        sort: 'latest',
        cursor,
      });
      const items = data.items || [];
      const flat = [];
      const walk = (arr) => {
        for (const p of arr || []) {
          if (!p || !p.id) continue;
          flat.push(p);
          if (Array.isArray(p.children)) walk(p.children);
        }
      };
      walk(items);

      for (const p of flat) {
        seen.add(p.id);
        if (p.deleted) {
          if (pool.replies[p.id]) {
            dropReply(p.id);
            removed++;
          }
          continue;
        }
        const rec = replyRecord(p, topic);
        if (rec._t < wm) continue; // 水位线之前的：早就加载过了
        if (!pool.replies[rec.id]) {
          pool.replies[rec.id] = rec;
          added++;
        } else {
          pool.replies[rec.id] = { ...pool.replies[rec.id], ...rec };
        }
      }

      cursor = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
      if (!cursor) {
        complete = true;
        break;
      }
    }

    // 完整列过一遍：缓存里这条主题的回复不在列表里 → 已被删
    if (complete) {
      for (const [rid, r] of Object.entries(pool.replies)) {
        if (r.topicId === topic.id && !seen.has(rid)) {
          delete pool.replies[rid];
          removed++;
        }
      }
    }
    if (st) st.removed += 0;
    return { added, removed };
  }

  /** 手动清理：把池子里已经失效（404 / deleted）的条目剔掉 */
  async function pruneSuperPool(opts) {
    const options = opts || {};
    const pool = loadSuperPool();
    const st = { checked: 0, removed: 0, done: false };
    const report = () => {
      if (options.onProgress) options.onProgress({ ...st });
    };
    const topics = Object.values(pool.topics);
    for (const t of topics) {
      st.checked++;
      try {
        await apiGet('/topics/' + encodeURIComponent(t.id), null, {});
      } catch (err) {
        if (err && err.status === 404) {
          dropTopic(t.id);
          st.removed++;
        }
      }
      if (st.checked % 20 === 0) report();
    }
    st.done = true;
    report();
    saveSuperPool();
    return st;
  }

  /* ------------------------------------------------------------
   * 13.4 严格关键词匹配
   * ---------------------------------------------------------- */

  /**
   * 查询语法：
   *   普通词        —— 必须全部命中（AND，严格）
   *   "整段短语"    —— 必须原样出现
   *   -词           —— 排除
   *   title:词      —— 只在标题里找
   *   author:词     —— 只在作者名里找
   *   in:topic / in:reply —— 限定范围
   */
  function parseSuperQuery(raw) {
    const q = String(raw || '').trim();
    const terms = [];
    const phrases = [];
    let scope = 'all';
    if (!q) return { terms, phrases, scope, empty: true };

    // 先把引号里的短语抠出来
    let rest = q;
    const re = /"([^"]+)"|“([^”]+)”/g;
    let m;
    while ((m = re.exec(q)) !== null) {
      const p = (m[1] || m[2] || '').trim();
      if (p) phrases.push(p.toLowerCase());
    }
    rest = rest.replace(/"([^"]+)"|“([^”]+)”/g, ' ');

    for (const rawTok of rest.split(/\s+/)) {
      const tok = rawTok.trim();
      if (!tok) continue;
      let negate = false;
      let t = tok;
      if (t.startsWith('-') && t.length > 1) {
        negate = true;
        t = t.slice(1);
      }
      let field = 'any';
      const fm = /^(title|author|in):(.+)$/i.exec(t);
      if (fm) {
        field = fm[1].toLowerCase();
        t = fm[2];
        if (field === 'in') {
          scope = /reply|comment/i.test(t) ? 'reply' : 'topic';
          continue;
        }
      }
      if (!t) continue;
      terms.push({ text: t.toLowerCase(), field, negate });
    }
    return { terms, phrases, scope, empty: !terms.length && !phrases.length };
  }

  const has = (hay, needle) => !!needle && hay.toLowerCase().includes(needle);

  /** 单条候选（主题或回复）是否命中 + 打分 */
  function matchSuperItem(item, q) {
    const title = (item.title || '').toLowerCase();
    const body = (item.text || '').toLowerCase();
    const author = (item.authorName || '').toLowerCase();
    let score = 0;

    for (const term of q.terms) {
      let hit = false;
      let bonus = 0;
      if (term.field === 'title') {
        hit = has(title, term.text);
        bonus = 60;
      } else if (term.field === 'author') {
        hit = has(author, term.text);
        bonus = 40;
      } else {
        hit = has(title, term.text) || has(body, term.text) || has(author, term.text);
        bonus = has(title, term.text) ? 50 : has(body, term.text) ? 12 : 6;
      }
      if (term.negate) {
        if (hit) return null; // 排除词命中 → 整条出局
      } else {
        if (!hit) return null; // 严格：所有词都要命中
        score += bonus;
      }
    }

    for (const p of q.phrases) {
      if (!(has(title, p) || has(body, p))) return null;
      score += has(title, p) ? 200 : 40;
    }

    if (!q.terms.length && !q.phrases.length) return null;

    // 整串完全等于标题 → 最高分
    const whole = q.terms.map((t) => t.text).join(' ');
    if (whole && title === whole) score += 1000;
    // 越新越靠前（最多 +20）
    const age = Date.now() - (item._t || 0);
    score += Math.max(0, 20 - Math.floor(age / 86400000));
    return score;
  }

  /** 在池子里搜 */
  function searchSuperPool(rawQuery, opts) {
    const options = opts || {};
    const pool = loadSuperPool();
    const q = parseSuperQuery(rawQuery);
    if (q.empty) return { query: rawQuery, parsed: q, items: [], total: 0, scope: q.scope, watermark: pool.watermark };

    const scope = options.scope && options.scope !== 'all' ? options.scope : q.scope;
    const hits = [];
    let total = 0;

    const consider = (item, type) => {
      if (scope === 'topic' && type !== 'topic') return;
      if (scope === 'reply' && type !== 'reply') return;
      const score = matchSuperItem(item, q);
      if (score === null) return;
      total++;
      hits.push({
        type,
        id: item.id,
        topicId: type === 'reply' ? item.topicId : item.id,
        postNumber: type === 'reply' ? item.postNumber : null,
        title: type === 'reply' ? item.topicTitle : item.title,
        text: item.text || '',
        authorId: item.authorId || '',
        authorName: item.authorName || '',
        createdAt: item.createdAt || '',
        replyCount: type === 'topic' ? item.replyCount : null,
        score,
        _t: item._t || 0,
      });
    };

    for (const t of Object.values(pool.topics)) consider(t, 'topic');
    for (const r of Object.values(pool.replies)) consider(r, 'reply');

    const sort = options.sort || 'relevance';
    hits.sort((a, b) => {
      if (sort === 'latest') return b._t - a._t;
      if (sort === 'replies') return (b.replyCount || 0) - (a.replyCount || 0);
      return b.score - a.score || b._t - a._t;
    });

    const limit = options.limit || SUPER_RESULT_MAX;
    return {
      query: rawQuery,
      parsed: q,
      items: hits.slice(0, limit),
      total,
      scope,
      watermark: pool.watermark,
      poolTopics: Object.keys(pool.topics).length,
      poolReplies: Object.keys(pool.replies).length,
    };
  }

  /* ------------------------------------------------------------
   * 13.5 渲染
   * ---------------------------------------------------------- */

  /** 关键词高亮（转义后再插 <mark>） */
  function highlightSuper(text, q) {
    const s = String(text || '');
    if (!s) return '';
    let html = esc(s);
    const needles = [];
    for (const p of q.phrases || []) if (p) needles.push(p);
    for (const t of (q.terms || [])) if (t && !t.negate && t.text) needles.push(t.text);
    if (!needles.length) return html;
    // 长词先替，避免短词把长词切碎
    const uniq = [...new Set(needles)].sort((a, b) => b.length - a.length);
    for (const n of uniq) {
      const safe = esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp('(' + safe + ')', 'gi'), '<mark class="px-mark">$1</mark>');
    }
    return html;
  }

  /** 命中处上下文片段 */
  function snippetSuper(text, q, radius) {
    const s = String(text || '');
    if (!s) return '';
    const needles = [];
    for (const p of q.phrases || []) if (p) needles.push(p);
    for (const t of (q.terms || [])) if (t && !t.negate && t.text) needles.push(t.text);
    const low = s.toLowerCase();
    let at = -1;
    for (const n of needles) {
      const i = low.indexOf(n);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    const r = radius || 60;
    if (at < 0) return s.slice(0, r * 2);
    const start = Math.max(0, at - r);
    const end = Math.min(s.length, at + r);
    return (start > 0 ? '…' : '') + s.slice(start, end) + (end < s.length ? '…' : '');
  }

  function superResultHTML(hit, q) {
    const isReply = hit.type === 'reply';
    const href = isReply
      ? `/forum/post/${encodeURIComponent(hit.id)}#post-${hit.postNumber}`
      : `/forum/post/${encodeURIComponent(hit.id)}`;
    const when = hit.createdAt ? new Date(hit.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
    const snippet = snippetSuper(hit.text, q, 70);
    return `<article class="px-super-item" data-px-super-type="${hit.type}" data-px-super-id="${esc(hit.id)}">
      <div class="px-super-item-head">
        <span class="px-super-badge" data-kind="${isReply ? 'reply' : 'topic'}">${isReply ? `回复 · 第 ${hit.postNumber} 楼` : '帖子'}</span>
        <h3 class="px-super-title"><a href="${href}">${highlightSuper(hit.title, q)}</a></h3>
      </div>
      ${snippet ? `<p class="px-super-snip">${highlightSuper(snippet, q)}</p>` : ''}
      <div class="px-super-meta">
        <span class="px-super-author">${esc(hit.authorName || '匿名')}</span>
        <span>${esc(timeAgo(hit.createdAt))}</span>
        ${hit.replyCount !== null && hit.replyCount !== undefined ? `<span>回复 ${fmtNum(hit.replyCount)}</span>` : ''}
        <span class="px-super-score">得分 ${Math.round(hit.score)}</span>
      </div>
    </article>`;
  }

  function superPanelHTML(q) {
    return `<div class="px-super-head">
        <div class="px-super-brand"><span class="px-super-logo">⚡</span><span>Super 搜索</span></div>
        <div class="px-super-sub">严格关键词匹配 · 本地候选池增量缓存</div>
        <button class="px-super-close" type="button" data-px-super-close aria-label="关闭">✕</button>
      </div>
      <div class="px-super-searchbar">
        <input class="px-super-input" type="search" placeholder="严格搜索：所有词都要命中，支持 &quot;短语&quot; / -排除 / title: / author:" value="${esc(q || '')}" aria-label="Super 搜索关键词" />
        <button class="px-super-btn" type="button" data-px-super-sync>同步候选池</button>
        <button class="px-super-btn ghost" type="button" data-px-super-prune>清理失效</button>
      </div>
      <div class="px-super-chips">
        <button type="button" data-px-super-scope="all" class="px-super-chip">全部</button>
        <button type="button" data-px-super-scope="topic" class="px-super-chip">只看帖子</button>
        <button type="button" data-px-super-scope="reply" class="px-super-chip">只看回复</button>
        <span class="px-super-sep"></span>
        <button type="button" data-px-super-sort="relevance" class="px-super-chip">相关度</button>
        <button type="button" data-px-super-sort="latest" class="px-super-chip">最新</button>
        <button type="button" data-px-super-sort="replies" class="px-super-chip">最多回复</button>
      </div>
      <div class="px-super-status" data-px-super-status></div>
      <div class="px-super-results" data-px-super-results aria-live="polite"></div>`;
  }

  /* ------------------------------------------------------------
   * 13.6 挂载（搜索页接管 / Ctrl+K 浮层）
   * ---------------------------------------------------------- */

  const superState = { scope: 'all', sort: 'relevance', overlay: false, host: null, mounted: false, dirty: false, urlQ: '' };

  function superStatusText(res) {
    const pool = loadSuperPool();
    const bits = [];
    bits.push(`命中 ${res.total}`);
    if (res.items.length) bits.push(`显示 ${res.items.length}`);
    bits.push(`池子 ${Object.keys(pool.topics).length} 帖 / ${Object.keys(pool.replies).length} 回复`);
    bits.push(`已同步至 ${stampText(pool.watermark)}`);
    if (superSyncError) bits.push(`⚠ ${superSyncError}`);
    return bits.join(' · ');
  }

  function renderSuperResults() {
    const host = superState.host;
    if (!host) return;
    const input = host.querySelector('.px-super-input');
    const q = input ? input.value : '';
    const res = searchSuperPool(q, { scope: superState.scope, sort: superState.sort });
    const status = host.querySelector('[data-px-super-status]');
    const list = host.querySelector('[data-px-super-results]');
    if (status) status.textContent = superStatusText(res);
    // chip 选中态
    for (const b of host.querySelectorAll('[data-px-super-scope]')) {
      b.dataset.active = String(b.dataset.pxSuperScope === superState.scope);
    }
    for (const b of host.querySelectorAll('[data-px-super-sort]')) {
      b.dataset.active = String(b.dataset.pxSuperSort === superState.sort);
    }
    if (!list) return;
    if (res.parsed.empty) {
      list.innerHTML = `<div class="px-super-empty">输入关键词开始严格搜索（所有词都要命中）</div>`;
      return;
    }
    if (!res.items.length) {
      list.innerHTML = `<div class="px-super-empty">没有严格命中。换个词，或先「同步候选池」把更新的内容拉进来。</div>`;
      return;
    }
    list.innerHTML = res.items.map((h) => superResultHTML(h, res.parsed)).join('');
  }

  function superBind(host) {
    if (!host || host.dataset.pxBound === '1') return;
    host.dataset.pxBound = '1';
    const input = host.querySelector('.px-super-input');

    host.addEventListener('input', (e) => {
      if (e.target !== input) return;
      superState.dirty = true; // 用户自己改过关键词 → 后面重挂载别把它冲掉
      renderSuperResults();
    });
    host.addEventListener('click', (e) => {
      const scopeBtn = e.target.closest('[data-px-super-scope]');
      if (scopeBtn) {
        superState.scope = scopeBtn.dataset.pxSuperScope;
        superState.host = host;
        renderSuperResults();
        return;
      }
      const sortBtn = e.target.closest('[data-px-super-sort]');
      if (sortBtn) {
        superState.sort = sortBtn.dataset.pxSuperSort;
        superState.host = host;
        renderSuperResults();
        return;
      }
      if (e.target.closest('[data-px-super-sync]')) {
        const btn = e.target.closest('[data-px-super-sync]');
        btn.disabled = true;
        btn.textContent = '同步中…';
        syncSuperPool({
          onProgress: () => {
            superState.host = host;
            renderSuperResults();
          },
        }).then(() => {
          btn.disabled = false;
          btn.textContent = '同步候选池';
          superState.host = host;
          renderSuperResults();
        });
        return;
      }
      if (e.target.closest('[data-px-super-prune]')) {
        const btn = e.target.closest('[data-px-super-prune]');
        btn.disabled = true;
        btn.textContent = '清理中…';
        pruneSuperPool({
          onProgress: () => {
            superState.host = host;
            renderSuperResults();
          },
        }).then(() => {
          btn.disabled = false;
          btn.textContent = '清理失效';
          superState.host = host;
          renderSuperResults();
        });
        return;
      }
      if (e.target.closest('[data-px-super-close]')) {
        closeSuperOverlay();
      }
    });
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSuperOverlay();
      }
    });
  }

  /** 搜索页接管：把站内结果区换成 Super 搜索面板 */
  function mountSuperSearch(anchor) {
    if (!anchor) return false;
    let host = document.getElementById(SUPER_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = SUPER_ID;
    }
    host.className = 'px-super';
    if (!host.dataset.pxBuilt) {
      host.innerHTML = superPanelHTML('');
      host.dataset.pxBuilt = '1';
    }
    const q = new URLSearchParams(location.search).get('q') || '';
    const input = host.querySelector('.px-super-input');
    // URL 里的关键词变了才覆盖输入框；用户自己改过的内容不要冲掉（站点会重渲染，mount 会被反复调用）
    if (input && (!superState.dirty || superState.urlQ !== q)) {
      input.value = q;
      superState.dirty = false;
    }
    superState.urlQ = q;
    if (anchor.parentElement) anchor.parentElement.insertBefore(host, anchor);
    else anchor.insertAdjacentElement('beforebegin', host);
    superState.host = host;
    superState.mounted = true;
    superBind(host);
    renderSuperResults();
    // 后台顺手同步一次（空池 / 超过 10 分钟才拉），走增量
    const pool = loadSuperPool();
    const stale = !pool.updatedAt || Date.now() - pool.updatedAt > 10 * 60 * 1000;
    if (stale && !superSyncing) {
      setTimeout(() => {
        syncSuperPool({
          onProgress: () => {
            superState.host = host;
            renderSuperResults();
          },
        });
      }, 400);
    }
    return true;
  }

  function unmountSuperSearch() {
    const host = document.getElementById(SUPER_ID);
    if (host && !superState.overlay) {
      host.remove();
      superState.mounted = false;
      superState.host = null;
      superState.dirty = false;
      superState.urlQ = '';
    }
  }

  /** Ctrl/⌘+K 浮层 */
  function openSuperOverlay() {
    let host = document.getElementById(SUPER_ID + '-overlay');
    if (!host) {
      host = document.createElement('div');
      host.id = SUPER_ID + '-overlay';
      host.className = 'px-super-overlay';
      host.innerHTML = superPanelHTML('');
      document.body.appendChild(host);
      superBind(host);
    }
    superState.overlay = true;
    superState.host = host;
    host.style.display = 'flex';
    const input = host.querySelector('.px-super-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    renderSuperResults();
  }

  function closeSuperOverlay() {
    const host = document.getElementById(SUPER_ID + '-overlay');
    if (host) host.style.display = 'none';
    superState.overlay = false;
    superState.host = null;
  }

  function bindSuperHotkey() {
    document.addEventListener(
      'keydown',
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key !== 'k' && e.key !== 'K') return;
        if (!settings.superSearch) return;
        e.preventDefault();
        if (superState.overlay) closeSuperOverlay();
        else openSuperOverlay();
      },
      true
    );
  }
