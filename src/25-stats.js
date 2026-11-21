  /* ============================================================
   * 10.6 首页数据统计卡片（独立模块，懒加载，不阻塞 feed）
   * ------------------------------------------------------------
   * 一张可折叠卡片，两个标签页：帖子发布 / 回复热度。
   * 纯内联 SVG 作图，视觉仿参考图（累计蓝线 + 右轴红柱 + 时段刻度 +
   * 异常红三角 + 图例 + 警告条），配色全部走站点 CSS 变量跟随明暗。
   *
   * 【独立 / 不影响其他】
   * - 只有 settings.showStats 打开 + 首页才挂载；默认关。
   * - 卡片默认折叠，点开才拉数据（懒加载）。
   * - 抓数据用独立的 fetch 链（apiGet），低并发、每页之间让出主线程；
   *   站点原生的「推荐帖子」列表是 Vue 自己渲染的，与本模块完全解耦，
   *   本模块还在加载时 feed 照常加载 / 显示。
   * - DOM 用独立容器 #pictExt-stats，不进 nativeHider 的隐藏清单，
   *   排序「全部替换」模式下也不会被一起藏掉。
   * - 任何异常都 try/catch 兜住，失败只在本卡片里显示一句，绝不影响全局。
   * ============================================================ */
  /* 样式随模块自带：追加到已有 #pictExt-style，或独立建一个。
     全部走站点 CSS 变量，html.dark 时自动跟随暗色。 */
  const STATS_CSS = `
#pictExt-stats{font-family:inherit;color:var(--ui-text,#111827)}
#pictExt-stats *{box-sizing:border-box}
#pictExt-stats .pxst{margin:0 0 1rem}
#pictExt-stats .pxst-head{display:flex;align-items:center;gap:.5rem;width:100%;padding:.7rem .95rem;border-radius:.6rem;border:1px solid var(--ui-border,#e5e7eb);background:var(--ui-bg,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit;transition:background .15s,border-color .15s}
#pictExt-stats .pxst-head:hover{background:var(--ui-muted,#f9fafb);border-color:var(--ui-primary,#3b82f6)}
#pictExt-stats .pxst-head-icon{display:inline-flex;color:var(--ui-primary,#3b82f6)}
#pictExt-stats .pxst-head-title{font-size:.9rem;font-weight:700;color:var(--ui-text,#111827)}
#pictExt-stats .pxst-head-sub{font-size:.75rem;color:var(--ui-text-muted,#6b7280);margin-left:.25rem}
#pictExt-stats .pxst-chevron{margin-left:auto;color:var(--ui-text-muted,#6b7280);transition:transform .18s}
#pictExt-stats .pxst-chevron[data-state="open"]{transform:rotate(180deg)}
#pictExt-stats .pxst-panel{margin-top:.5rem;border-radius:.6rem;border:1px solid var(--ui-border,#e5e7eb);background:var(--ui-bg,#fff);padding:.9rem;overflow:hidden}
#pictExt-stats .pxst-tabs{display:inline-flex;gap:.25rem;padding:.25rem;border-radius:.5rem;background:var(--ui-muted,#f3f4f6);margin-bottom:.85rem}
#pictExt-stats .pxst-tabs button{border:0;background:transparent;color:var(--ui-text-muted,#6b7280);padding:.35rem .9rem;border-radius:.4rem;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
#pictExt-stats .pxst-tabs button[data-active="true"]{background:var(--ui-bg,#fff);color:var(--ui-primary,#3b82f6);box-shadow:0 1px 3px rgba(0,0,0,.08)}
#pictExt-stats .pxst-card{width:100%}
#pictExt-stats .pxst-card-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem;margin-bottom:.5rem}
#pictExt-stats .pxst-title{font-size:1.02rem;font-weight:800;margin:0;color:var(--ui-text,#111827)}
#pictExt-stats .pxst-range{font-size:.78rem;color:var(--ui-text-muted,#6b7280);font-variant-numeric:tabular-nums}
#pictExt-stats .pxst-chart{width:100%;background:var(--ui-muted,#f8fafc);border-radius:.5rem;padding:.4rem .2rem}
#pictExt-stats .pxst-svg{display:block;width:100%;height:auto;max-height:360px}
#pictExt-stats .pxst-hit{cursor:crosshair}
#pxc-stats-tip{position:fixed;z-index:2147483000;pointer-events:none;min-width:168px;max-width:230px;padding:.55rem .7rem;border-radius:.5rem;font-family:inherit;font-size:.76rem;line-height:1.55;color:var(--ui-text,#111827);background:var(--ui-bg,#fff);border:1px solid var(--ui-border,#e5e7eb);box-shadow:0 6px 22px rgba(0,0,0,.16);opacity:0;transition:opacity .1s}
#pxc-stats-tip[data-show="1"]{opacity:1}
#pxc-stats-tip .pxc-tip-day{font-weight:700;margin-bottom:.35rem;padding-bottom:.35rem;border-bottom:1px solid var(--ui-border,#e5e7eb)}
#pxc-stats-tip .pxc-tip-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
#pxc-stats-tip .pxc-tip-row .pxc-tip-k{color:var(--ui-text-muted,#6b7280)}
#pxc-stats-tip .pxc-tip-row .pxc-tip-v{font-weight:700;font-variant-numeric:tabular-nums}
#pxc-stats-tip .pxc-tip-posts .pxc-tip-v{color:var(--ui-primary,#3b82f6)}
#pxc-stats-tip .pxc-tip-replies .pxc-tip-v{color:#ef4444}
#pxc-stats-tip .pxc-tip-bad{margin-top:.35rem;padding-top:.35rem;border-top:1px solid var(--ui-border,#e5e7eb);color:#ef4444;font-size:.72rem}
#pictExt-stats .pxst-axis{font-size:12px;font-family:inherit;font-variant-numeric:tabular-nums}
#pictExt-stats .pxst-axis-l{fill:var(--ui-text-muted,#8a94a6)}
#pictExt-stats .pxst-axis-r{fill:#ef4444;fill-opacity:.85}
#pictExt-stats .pxst-axis-x{fill:var(--ui-text-muted,#6b7280)}
#pictExt-stats .pxst-period-label{fill:var(--ui-text-dimmed,#9ca3af);font-size:12px;font-family:inherit}
#pictExt-stats .pxst-period-value{fill:var(--ui-text,#111827);font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;font-family:inherit}
#pictExt-stats .pxst-legend{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;margin-top:.7rem;font-size:.75rem;color:var(--ui-text-muted,#6b7280)}
#pictExt-stats .pxst-legend-item{display:inline-flex;align-items:center;gap:.35rem}
#pictExt-stats .pxst-lg-line{display:inline-block;width:18px;height:3px;border-radius:2px}
#pictExt-stats .pxst-lg-bar{display:inline-block;width:5px;height:12px;border-radius:1px}
#pictExt-stats .pxst-lg-tri{display:inline-block;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #ef4444}
#pictExt-stats .pxst-warn{display:flex;gap:.5rem;margin-top:.7rem;padding:.55rem .7rem;border-radius:.45rem;font-size:.75rem;line-height:1.5;background:color-mix(in srgb,#ef4444 8%,transparent);color:var(--ui-text,#7f1d1d);border:1px solid color-mix(in srgb,#ef4444 22%,transparent)}
#pictExt-stats .pxst-warn-icon{flex:none;color:#ef4444}
#pictExt-stats .pxst-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.65rem;padding-top:.6rem;border-top:1px solid var(--ui-border,#e5e7eb);font-size:.72rem;color:var(--ui-text-dimmed,#9ca3af)}
#pictExt-stats .pxst-foot button{border:1px solid var(--ui-border,#e5e7eb);background:var(--ui-bg,#fff);color:var(--ui-text-muted,#6b7280);border-radius:.4rem;padding:.25rem .7rem;font-size:.72rem;cursor:pointer;font-family:inherit}
#pictExt-stats .pxst-foot button:hover{color:var(--ui-primary,#3b82f6);border-color:var(--ui-primary,#3b82f6)}
#pictExt-stats .pxst-loading{display:flex;align-items:center;justify-content:center;gap:.6rem;min-height:120px;font-size:.82rem;color:var(--ui-text-muted,#6b7280)}
#pictExt-stats .pxst-spinner{width:16px;height:16px;border:2px solid var(--ui-border,#e5e7eb);border-top-color:var(--ui-primary,#3b82f6);border-radius:50%;animation:pxst-spin .8s linear infinite}
@keyframes pxst-spin{to{transform:rotate(360deg)}}
`;

  function injectStatsStyle() {
    let el = document.getElementById('pictExt-style');
    if (el && el.dataset.pxStatsStyled === '1') return;
    if (el && el.textContent != null) {
      el.textContent += STATS_CSS;
      el.dataset.pxStatsStyled = '1';
    } else {
      const own = document.createElement('style');
      own.id = 'pictExt-stats-style';
      own.textContent = STATS_CSS;
      (document.head || document.documentElement).appendChild(own);
    }
  }

  const STATS_ID = 'pictExt-stats';
  const STATS_CACHE_KEY = 'pictExt:stats:v1';
  const STATS_TTL = 24 * 60 * 60 * 1000; // 缓存 24h
  const STATS_MAX_PAGES = 200;           // 安全上限：200 页 × 50 = 1 万帖，防止游标异常无限翻
  const STATS_YIELD_MS = 0;              // 每页之间让出主线程的时长

  let statsExpanded = false;   // 卡片是否展开（本次会话内记住，刷新后回到折叠）
  let statsTab = 'posts';      // posts | replies
  let statsData = null;        // {days:[{day,posts,replies}], first, last, daysCount}
  let statsGen = 0;            // 抓取代号：换页 / 关设置时自增，旧请求回来直接丢弃
  let statsLoading = false;

  /** 把 /topics 的原始条目按「自然日」聚合成时间序列 */
  function aggregateStats(items) {
    const buckets = new Map(); // 'YYYY-MM-DD' -> {posts, replies}
    let minT = Infinity;
    let maxT = -Infinity;
    for (const it of items) {
      const t = typeof it._t === 'number' ? it._t : Date.parse(it.createdAt);
      if (!Number.isFinite(t) || t <= 0) continue;
      const day = statsDayKey(t);
      if (!day) continue;
      const b = buckets.get(day) || { posts: 0, replies: 0 };
      b.posts += 1;
      // replyCount 是该帖「至今累计收到的回复」，归到它发布那天，作为回复热度的近似。
      b.replies += Number(it.replyCount || 0);
      buckets.set(day, b);
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
    // 从最早那天补到最晚那天，中间没有帖子的天空桶填 0（曲线才连续）
    const days = [];
    if (Number.isFinite(minT) && Number.isFinite(maxT)) {
      const cur = new Date(minT);
      cur.setHours(0, 0, 0, 0);
      const end = new Date(maxT);
      end.setHours(0, 0, 0, 0);
      let guard = 0;
      while (cur <= end && guard++ < 20000) {
        const key = statsDayKey(cur.getTime());
        const b = buckets.get(key) || { posts: 0, replies: 0 };
        days.push({ day: key, posts: b.posts, replies: b.replies });
        cur.setDate(cur.getDate() + 1);
      }
    }
    return {
      days,
      first: days.length ? days[0].day : '',
      last: days.length ? days[days.length - 1].day : '',
      daysCount: days.length,
      fetchedAt: Date.now(),
    };
  }

  function statsDayKey(t) {
    const d = new Date(t);
    if (isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function readStatsCache() {
    try {
      const raw = localStorage.getItem(STATS_CACHE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !Array.isArray(o.days) || !o.days.length) return null;
      if (Date.now() - (o.fetchedAt || 0) > STATS_TTL) return null;
      return o;
    } catch {
      return null;
    }
  }

  function writeStatsCache(data) {
    try {
      localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(data));
    } catch {
      /* 无痕 / 存储满：不缓存也不影响功能 */
    }
  }

  /** 抓全站 topic（独立链，低并发，可随时中止） */
  async function loadStatsData(force) {
    if (statsLoading) return;
    if (!force) {
      const cached = readStatsCache();
      if (cached) {
        statsData = cached;
        renderStatsBody();
        return;
      }
    }
    statsLoading = true;
    const gen = ++statsGen;
    renderStatsLoading('正在读取全站公开数据…');
    const all = [];
    let cursor = null;
    let pages = 0;
    try {
      while (pages < STATS_MAX_PAGES) {
        if (gen !== statsGen) return; // 被取消
        const params = { limit: PAGE_LIMIT, sort: 'latest', cursor };
        const res = await apiGet('/topics', params);
        const items = Array.isArray(res.items) ? res.items : [];
        for (const it of items) all.push(it);
        pages += 1;
        if (gen !== statsGen) return;
        renderStatsLoading(`正在读取全站公开数据… 第 ${pages} 页 / ${all.length} 帖`);
        const next = res.pageInfo && res.pageInfo.nextCursor ? res.pageInfo.nextCursor : null;
        if (!next || items.length === 0) break;
        cursor = next;
        // 每页之间让出主线程：feed 的渲染、滚动都不被本模块拖住
        await new Promise((r) => setTimeout(r, STATS_YIELD_MS));
      }
      if (gen !== statsGen) return;
      if (!all.length) {
        renderStatsLoading('暂时读不到数据，请稍后再试。');
        return;
      }
      statsData = aggregateStats(all);
      writeStatsCache(statsData);
      renderStatsBody();
    } catch (err) {
      if (gen !== statsGen) return;
      log('stats load failed', err);
      renderStatsLoading('数据加载失败，请点「刷新」重试。');
    } finally {
      if (gen === statsGen) statsLoading = false;
    }
  }

  /* ---------------- SVG 绘图 ---------------- */

  const STATS_CAP_CLR = '#ef4444';
  const STATS_LINE_CLR = '#3b82f6';

  function statsNiceCeil(v) {
    if (!(v > 0)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * exp;
  }
  function statsComma(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 生成一张图的 SVG。series: 'posts' | 'replies'
   * 视觉对齐参考图：双 Y 轴、5 条横向网格、7 个时段刻度、累计阶梯线 +
   * 每日红柱、超阈值日移出图表范围并用红三角标记。
   */
  function statsChartSVG(series) {
    const days = statsData.days;
    const n = days.length;
    const W = 1040;
    const H = 430;
    const L = 92;   // 左轴留白
    const R = 78;   // 右轴留白
    const T = 78;   // 顶部时段区
    const B = 62;   // 底部日期区
    const pw = W - L - R;
    const ph = H - T - B;

    const daily = days.map((d) => d[series]);
    const cum = [];
    let running = 0;
    for (const v of daily) { running += v; cum.push(running); }
    // 两套累计都算出来：悬停提示要同时显示「发帖 / 回复」两组数字，不随标签页变
    const cumPosts = [];
    const cumReplies = [];
    let rp = 0;
    let rr = 0;
    for (const d of days) {
      rp += d.posts;
      rr += d.replies;
      cumPosts.push(rp);
      cumReplies.push(rr);
    }

    // 左轴（累计）：覆盖最大累计值
    const cumMax = statsNiceCeil(Math.max(1, running));
    // 右轴（每日）：用「正常上限」——95 分位附近向上取整，异常尖峰移出范围
    const sorted = daily.slice().sort((a, b) => a - b);
    const q95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 1;
    const cap = Math.max(1, statsNiceCeil(q95 || 1));
    const anomalies = [];
    daily.forEach((v, i) => { if (v > cap) anomalies.push(i); });

    const parts = [];
    const grid = 5;
    // 背景网格 + 双轴刻度
    for (let i = 0; i <= grid; i++) {
      const y = T + (ph * i) / grid;
      parts.push(`<line x1="${L}" y1="${y.toFixed(1)}" x2="${L + pw}" y2="${y.toFixed(1)}" stroke="var(--ui-border, #e5e7eb)" stroke-opacity=".7" stroke-width="1"/>`);
      const leftVal = cumMax - (cumMax * i) / grid;
      const rightVal = cap - (cap * i) / grid;
      parts.push(`<text x="${L - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="pxst-axis pxst-axis-l">${statsComma(leftVal)}</text>`);
      parts.push(`<text x="${L + pw + 10}" y="${(y + 4).toFixed(1)}" text-anchor="start" class="pxst-axis pxst-axis-r">${statsComma(rightVal)}</text>`);
    }

    // 7 个时段：竖虚线 + 时段末累计值
    const periodCount = 7;
    for (let s = 0; s < periodCount; s++) {
      const x = L + (pw * s) / (periodCount - 1);
      if (s > 0 && s < periodCount - 1) {
        parts.push(`<line x1="${x.toFixed(1)}" y1="${T}" x2="${x.toFixed(1)}" y2="${T + ph}" stroke="var(--ui-border, #e5e7eb)" stroke-opacity=".45" stroke-width="1" stroke-dasharray="4 4"/>`);
      }
      const idx = Math.min(n - 1, Math.max(0, Math.round(((s + 1) / periodCount) * n) - 1));
      parts.push(`<text x="${x.toFixed(1)}" y="${T - 42}" text-anchor="middle" class="pxst-period-label">时段 ${s + 1}</text>`);
      parts.push(`<text x="${x.toFixed(1)}" y="${T - 18}" text-anchor="middle" class="pxst-period-value">${statsComma(cum[idx] || 0)}</text>`);
    }

    const xOf = (i) => L + (n <= 1 ? pw / 2 : (pw * i) / (n - 1));
    const barW = Math.max(1, Math.min(14, (n <= 1 ? pw : pw / n) * 0.72));

    // 每日红柱（超出 cap 的不画柱，改由红三角标记）
    for (let i = 0; i < n; i++) {
      const v = daily[i];
      if (v <= 0 || v > cap) continue;
      const x = xOf(i);
      const h = (v / cap) * ph;
      const y = T + ph - h;
      parts.push(`<rect x="${(x - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${STATS_CAP_CLR}" fill-opacity=".82"/>`);
    }

    // 累计蓝色阶梯线：先数据多的日子才抬升，视觉同参考图的累计曲线
    if (n) {
      let d = `M ${xOf(0).toFixed(1)} ${(T + ph - (cum[0] / cumMax) * ph).toFixed(1)}`;
      for (let i = 1; i < n; i++) {
        d += ` L ${xOf(i).toFixed(1)} ${(T + ph - (cum[i] / cumMax) * ph).toFixed(1)}`;
      }
      parts.push(`<path d="${d}" fill="none" stroke="${STATS_LINE_CLR}" stroke-width="2.4" stroke-linejoin="round"/>`);
      // 线下方淡蓝填充
      parts.push(`<path d="${d} L ${xOf(n - 1).toFixed(1)} ${T + ph} L ${xOf(0).toFixed(1)} ${T + ph} Z" fill="${STATS_LINE_CLR}" fill-opacity=".10"/>`);
    }

    // 异常刷屏：红三角标在顶部（已移出图表范围）
    for (const i of anomalies) {
      const x = xOf(i);
      parts.push(`<path d="M ${x.toFixed(1)} ${T - 10} l 6 10 l -12 0 Z" fill="${STATS_CAP_CLR}"/>`);
    }

    // X 轴日期：7 个刻度
    for (let s = 0; s < periodCount; s++) {
      const idx = Math.min(n - 1, Math.round((s / (periodCount - 1)) * (n - 1)));
      const x = xOf(idx);
      const label = days[idx] ? days[idx].day.slice(0, 7) : '';
      parts.push(`<text x="${x.toFixed(1)}" y="${T + ph + 24}" text-anchor="middle" class="pxst-axis pxst-axis-x">${label}</text>`);
    }

    // 透明命中条：铺满每一天的整列（含红色柱 / 累计线区域），鼠标一进去就能看到当天详情。
    // 数据在 data-* 上，浮层直接从节点读，不依赖闭包；节点被重画也不影响委托。
    const colW = n <= 1 ? pw : pw / (n - 1);
    const hitW = Math.max(4, Math.min(colW, 26));
    const anomalySet = new Set(anomalies);
    for (let i = 0; i < n; i++) {
      const x = xOf(i);
      const d = days[i];
      parts.push(
        `<rect class="pxst-hit" x="${(x - hitW / 2).toFixed(1)}" y="${T}" width="${hitW.toFixed(1)}" height="${ph}" ` +
          `fill="transparent" data-px-stats-day="${esc(d.day)}" data-px-stats-p="${d.posts}" data-px-stats-r="${d.replies}" ` +
          `data-px-stats-cp="${cumPosts[i]}" data-px-stats-cr="${cumReplies[i]}" data-px-stats-bad="${anomalySet.has(i) ? '1' : '0'}"/>`
      );
    }

    return `<svg class="pxst-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="PICKCAT ${series === 'posts' ? '帖子发布' : '回复热度'}统计">${parts.join('')}</svg>`;
  }

  function statsLegendHTML(series, cap, anomalyCount) {
    const totalLabel = series === 'posts' ? '帖子累计数（左轴）' : '回复累计数（左轴）';
    const dailyLabel = series === 'posts' ? '每日发帖数（右轴' : '每日回复数（右轴';
    return `<div class="pxst-legend">
      <span class="pxst-legend-item"><i class="pxst-lg-line" style="background:${STATS_LINE_CLR}"></i>${totalLabel}</span>
      <span class="pxst-legend-item"><i class="pxst-lg-bar" style="background:${STATS_CAP_CLR}"></i>${dailyLabel}，正常上限 ${statsComma(cap)}）</span>
      <span class="pxst-legend-item"><i class="pxst-lg-tri" style="border-bottom-color:${STATS_CAP_CLR}"></i>异常刷屏（已移出图表范围）</span>
    </div>
    ${anomalyCount > 0 ? `<div class="pxst-warn"><span class="pxst-warn-icon">⚠</span><span>检测到 <b>${anomalyCount}</b> 天存在异常刷屏数据（单日${series === 'posts' ? '发帖' : '回复'}数超过 ${statsComma(cap)}）。为避免干扰正常趋势，这些点已超出图表顶部显示，红色三角为它们的位置标记。</span></div>` : ''}`;
  }

  /** 渲染展开后的图表主体 */
  function renderStatsBody() {
    hideStatsTip(); // 重画后旧命中条失效，先收起浮层
    const card = document.getElementById(STATS_ID);
    if (!card) return;
    const host = card.querySelector('.pxst-body');
    if (!host) return;
    if (!statsData || !statsData.days || !statsData.days.length) {
      host.innerHTML = `<div class="pxst-loading">暂时没有数据。</div>`;
      return;
    }
    const series = statsTab;
    const daily = statsData.days.map((d) => d[series]);
    const sorted = daily.slice().sort((a, b) => a - b);
    const q95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 1;
    const cap = Math.max(1, statsNiceCeil(q95 || 1));
    const anomalyCount = daily.filter((v) => v > cap).length;
    const title = `PICKCAT ${series === 'posts' ? '帖子发布总数统计' : '帖子回复热度统计'}`;
    const range = `共 ${statsData.daysCount} 天数据 · ${statsData.first} ~ ${statsData.last}`;
    const cacheHint = (() => {
      const d = new Date(statsData.fetchedAt || 0);
      return isNaN(d.getTime()) ? '' : `数据读取于 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })();
    host.innerHTML = `<div class="pxst-card">
      <div class="pxst-card-head">
        <h3 class="pxst-title">${esc(title)}</h3>
        <span class="pxst-range">${esc(range)}</span>
      </div>
      <div class="pxst-chart">${statsChartSVG(series)}</div>
      ${statsLegendHTML(series, cap, anomalyCount)}
      <div class="pxst-foot"><span>${esc(cacheHint)} · 数据来自站点公开只读接口，按每天新增统计</span><button type="button" data-px-stats-refresh>刷新</button></div>
    </div>`;
    syncStatsTabs(card);
  }

  function renderStatsLoading(msg) {
    const card = document.getElementById(STATS_ID);
    if (!card) return;
    const host = card.querySelector('.pxst-body');
    if (host) host.innerHTML = `<div class="pxst-loading"><span class="pxst-spinner"></span>${esc(msg)}</div>`;
    syncStatsTabs(card);
  }

  function statsCardHTML() {
    return `<button type="button" class="pxst-head" data-px-stats-toggle aria-expanded="${statsExpanded}">
        <span class="pxst-head-icon">${icon('chat', 16)}</span>
        <span class="pxst-head-title">PICKCAT 数据统计</span>
        <span class="pxst-head-sub">${statsExpanded ? '点击收起' : '点击展开 · 帖子发布 / 回复热度'}</span>
        <span class="pxst-chevron" data-state="${statsExpanded ? 'open' : 'closed'}">▾</span>
      </button>
      <div class="pxst-panel"${statsExpanded ? '' : ' hidden'}>
        <div class="pxst-tabs" role="tablist" aria-label="数据统计类别">
          <button type="button" role="tab" data-px-stats-tab="posts" data-active="${statsTab === 'posts'}" aria-selected="${statsTab === 'posts'}">帖子发布</button>
          <button type="button" role="tab" data-px-stats-tab="replies" data-active="${statsTab === 'replies'}" aria-selected="${statsTab === 'replies'}">回复热度</button>
        </div>
        <div class="pxst-body"></div>
      </div>`;
  }

  function syncStatsTabs(card) {
    card.querySelectorAll('[data-px-stats-tab]').forEach((b) => {
      const on = b.dataset.pxStatsTab === statsTab;
      b.dataset.active = String(on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  /** 挂载 / 卸载卡片（只首页 + 开关打开时存在） */
  function syncStatsCard() {
    const isHome = location.pathname === '/' || location.pathname === '/index';
    const card = document.getElementById(STATS_ID);
    if (settings.showStats && isHome) injectStatsStyle();
    if (!settings.showStats || !isHome) {
      statsGen += 1; // 取消在途请求
      statsLoading = false;
      hideStatsTip();
      if (card) card.remove();
      return;
    }
    if (card && card.isConnected) {
      // 兜底：万一某个旧流程把卡片设成了 display:none（替换模式曾误伤），这里恢复
      if (card.style.display === 'none') card.style.display = '';
      return;
    }
    // 找一个稳定的落点：首页排序栏所在容器的父级之前；找不到就退回 feed 段之前
    const tabs = document.querySelector('[aria-label="首页排序"]');
    const feed = document.querySelector('section[aria-label="推荐帖子"], section[aria-label="最新帖子"], section[aria-label="关注帖子"]');
    const anchor = tabs || feed;
    if (!anchor) return; // 等 Vue 渲染出来，下一次 observer / mount 会再试
    const host = document.createElement('section');
    host.id = STATS_ID;
    host.dataset.px = '1';
    host.className = 'pxst';
    host.innerHTML = statsCardHTML();
    const before = anchor.parentElement && anchor.parentElement.contains(anchor) ? anchor.parentElement : anchor;
    before.insertAdjacentElement('beforebegin', host);
    if (statsExpanded) {
      if (!statsData) statsData = readStatsCache();
      renderStatsBody();
      if (!statsData && !statsLoading) loadStatsData(false);
    }
  }

  const scheduleStats = debounce(() => {
    try {
      syncStatsCard();
    } catch (err) {
      log('stats mount failed', err);
    }
  }, 200);

  /** 悬停浮层：单个 fixed 元素挂 body，避免被卡片 overflow 裁掉 */
  const TIP_ID = 'pxc-stats-tip';
  function ensureStatsTip() {
    let tip = document.getElementById(TIP_ID);
    if (!tip) {
      tip = document.createElement('div');
      tip.id = TIP_ID;
      tip.dataset.px = '1';
      tip.setAttribute('role', 'tooltip');
      (document.body || document.documentElement).appendChild(tip);
    }
    return tip;
  }
  function hideStatsTip() {
    const tip = document.getElementById(TIP_ID);
    if (tip) tip.dataset.show = '0';
  }
  function showStatsTip(hit, x, y) {
    const tip = ensureStatsTip();
    const day = hit.dataset.pxStatsDay || '';
    const posts = hit.dataset.pxStatsP || '0';
    const replies = hit.dataset.pxStatsR || '0';
    const cp = hit.dataset.pxStatsCp || '0';
    const cr = hit.dataset.pxStatsCr || '0';
    const bad = hit.dataset.pxStatsBad === '1';
    tip.innerHTML =
      `<div class="pxc-tip-day">${esc(day)}</div>` +
      `<div class="pxc-tip-row pxc-tip-posts"><span class="pxc-tip-k">当日发帖</span><span class="pxc-tip-v">${statsComma(posts)}</span></div>` +
      `<div class="pxc-tip-row pxc-tip-posts"><span class="pxc-tip-k">累计发帖</span><span class="pxc-tip-v">${statsComma(cp)}</span></div>` +
      `<div class="pxc-tip-row pxc-tip-replies"><span class="pxc-tip-k">当日回复</span><span class="pxc-tip-v">${statsComma(replies)}</span></div>` +
      `<div class="pxc-tip-row pxc-tip-replies"><span class="pxc-tip-k">累计回复</span><span class="pxc-tip-v">${statsComma(cr)}</span></div>` +
      (bad ? `<div class="pxc-tip-bad">⚠ 异常刷屏日（超出正常上限）</div>` : '');
    tip.dataset.show = '1';
    // 贴着鼠标放，靠近视口边缘时翻到另一侧，别跑出屏幕
    const pad = 14;
    const w = tip.offsetWidth || 180;
    const h = tip.offsetHeight || 130;
    let left = x + pad;
    let top = y + pad;
    if (left + w > window.innerWidth - 8) left = x - w - pad;
    if (top + h > window.innerHeight - 8) top = y - h - pad;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }

  /** 展开 / 收起 / 切页 / 刷新 —— document 级委托，节点被 Vue 重建也不丢 */
  function bindStatsEvents() {
    if (bindStatsEvents.bound) return;
    bindStatsEvents.bound = true;
    // 悬停详情：柱子命中条 → 浮层；离开图表区 / 滚动 / 折叠 → 收起
    document.addEventListener(
      'pointermove',
      (e) => {
        const hit = e.target && e.target.closest ? e.target.closest('.pxst-hit') : null;
        if (hit && hit.closest('#' + STATS_ID)) showStatsTip(hit, e.clientX, e.clientY);
        else hideStatsTip();
      },
      true
    );
    document.addEventListener('scroll', hideStatsTip, true);
    window.addEventListener('blur', hideStatsTip);

    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0 || !e.target || !e.target.closest) return;
        const card = e.target.closest('#' + STATS_ID);
        if (!card) return;
        const tog = e.target.closest('[data-px-stats-toggle]');
        if (tog) {
          e.preventDefault();
          statsExpanded = !statsExpanded;
          tog.setAttribute('aria-expanded', String(statsExpanded));
          const sub = tog.querySelector('.pxst-head-sub');
          if (sub) sub.textContent = statsExpanded ? '点击收起' : '点击展开 · 帖子发布 / 回复热度';
          const che = tog.querySelector('.pxst-chevron');
          if (che) che.dataset.state = statsExpanded ? 'open' : 'closed';
          const panel = card.querySelector('.pxst-panel');
          if (panel) panel.hidden = !statsExpanded;
          if (statsExpanded) {
            if (!statsData) statsData = readStatsCache();
            renderStatsBody();
            if (!statsData && !statsLoading) loadStatsData(false);
          } else {
            statsGen += 1;
            statsLoading = false;
            hideStatsTip();
          }
          return;
        }
        const tab = e.target.closest('[data-px-stats-tab]');
        if (tab) {
          e.preventDefault();
          const key = tab.dataset.pxStatsTab;
          if (key !== statsTab) {
            statsTab = key;
            renderStatsBody();
          }
          return;
        }
        if (e.target.closest('[data-px-stats-refresh]')) {
          e.preventDefault();
          loadStatsData(true);
        }
      },
      true
    );
  }
