  /* ============================================================
   * 4. 样式（只保留排序栏与状态行；卡片全部复用站点类名）
   * ============================================================ */
  const CSS = `
#${PANEL_ID}{
  --px-primary: var(--ui-primary, #3b82f6);
  --px-text: var(--ui-text, #111827);
  --px-muted: var(--ui-text-muted, #6b7280);
  --px-dim: var(--ui-text-dimmed, #9ca3af);
  --px-border: var(--ui-border, rgba(127,127,127,.24));
  margin: 0 0 12px;
  color: var(--px-text);
  font-size: 14px;
  line-height: 1.5;
}
#${PANEL_ID}, #${PANEL_ID} *{ box-sizing: border-box; }
#${PANEL_ID} .px-bar{
  display:flex; align-items:center; gap:8px;
  min-height:36px; margin-bottom:8px; flex-wrap:wrap;
}
#${PANEL_ID} .px-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }
#${PANEL_ID}.px-align-end .px-tabs{ margin-left:auto; }
#${PANEL_ID} .px-tab{
  appearance:none; border:0; background:transparent; cursor:pointer;
  display:inline-flex; align-items:center; min-width:0;
  padding:6px 12px; border-radius:8px;
  font-size:15px; font-weight:500; font-family:inherit; line-height:1.4;
  color:var(--px-muted); position:relative;
  transition:color .15s ease;
}
#${PANEL_ID} .px-tab:hover{ color:var(--px-text); }
#${PANEL_ID} .px-tab[data-active="true"]{ color:var(--px-primary); }
#${PANEL_ID} .px-tab[data-active="true"]::after{
  content:""; position:absolute; left:10px; right:10px; bottom:-2px;
  height:1px; background:var(--px-primary);
}
#${PANEL_ID} .px-tab:focus-visible{ outline:2px solid var(--px-primary); outline-offset:2px; }
#${PANEL_ID} .px-note{
  font-size:12px; line-height:1.6; color:var(--px-dim); margin:0 0 10px; padding-left:2px;
}
#${PANEL_ID} .px-list{ display:flex; flex-direction:column; gap:12px; }
#${PANEL_ID} .px-state{
  padding:26px 12px; text-align:center; font-size:13px; color:var(--px-dim);
}
#${PANEL_ID} .px-state button{
  margin-top:10px; display:inline-block; cursor:pointer;
  border:1px solid var(--px-border); background:transparent; color:var(--px-text);
  border-radius:8px; padding:6px 14px; font-size:13px; font-family:inherit;
}
#${PANEL_ID} .px-foot{ display:flex; justify-content:center; padding:12px 0 4px; }
#${PANEL_ID} .px-more{
  cursor:pointer; border:1px solid var(--px-border); background:transparent;
  color:var(--px-text); border-radius:9px; padding:8px 22px;
  font-size:13px; font-weight:600; font-family:inherit;
  transition:background-color .15s ease;
}
#${PANEL_ID} .px-more:hover{ background:color-mix(in srgb, var(--px-primary) 10%, transparent); }
#${PANEL_ID} .px-more[disabled]{ opacity:.55; cursor:default; }

/* 评论区「改版」排序栏：视觉对齐站点原生评论排序 */
#pictExt-comment-sort{
  display:flex; align-items:center; gap:2px; flex-wrap:wrap;
  margin: 0 0 10px;
}
#pictExt-comment-sort .pxc-tab{
  appearance:none; border:0; background:transparent; cursor:pointer;
  padding:4px 9px; border-radius:8px;
  font-family:inherit; font-size:14px; font-weight:500; line-height:1.5;
  color:var(--ui-text-muted,#6b7280); position:relative;
  transition:color .15s ease;
}
#pictExt-comment-sort .pxc-tab:hover{ color:var(--ui-text,#111827); }
#pictExt-comment-sort .pxc-tab[data-active="true"]{ color:var(--ui-primary,#3b82f6); }
#pictExt-comment-sort .pxc-tab[data-active="true"]::after{
  content:""; position:absolute; left:8px; right:8px; bottom:-1px;
  height:1px; background:var(--ui-primary,#3b82f6);
}
#pictExt-comment-sort .pxc-note{
  margin-left:6px; font-size:12px; color:var(--ui-text-dimmed,#9ca3af);
}

/* 评论区翻页器（仿 B 站） */
#pictExt-comment-pager{
  display:flex; align-items:center; justify-content:center; flex-wrap:wrap;
  gap:2px; margin:16px 0 4px; font-size:14px; line-height:1.5;
  color:var(--ui-text-muted,#6b7280);
}
#pictExt-comment-pager .pxcp-sum{ margin-right:8px; font-size:13px; }
#pictExt-comment-pager .pxcp-btn{
  appearance:none; border:0; background:transparent; cursor:pointer;
  min-width:28px; padding:4px 7px; border-radius:6px; font-family:inherit;
  font-size:14px; color:var(--ui-text-muted,#6b7280);
  transition:background-color .15s ease,color .15s ease;
}
#pictExt-comment-pager .pxcp-btn:hover{ color:var(--ui-primary,#3b82f6); }
#pictExt-comment-pager .pxcp-btn[data-active="true"]{ color:var(--ui-primary,#3b82f6); font-weight:700; }
#pictExt-comment-pager .pxcp-btn[disabled]{ opacity:.45; cursor:default; }
#pictExt-comment-pager .pxcp-gap{ padding:0 2px; color:var(--ui-text-dimmed,#9ca3af); }

/* 楼中楼翻页 */
.pxc-tpager{
  display:flex; align-items:center; gap:4px; margin:6px 0 0 46px;
  font-size:12px; color:var(--ui-text-muted,#6b7280);
}
.pxc-tpager .pxc-tpager-sum{ margin-right:4px; color:var(--ui-text-dimmed,#9ca3af); }
.pxc-tpager button{
  appearance:none; border:0; background:transparent; cursor:pointer;
  padding:2px 8px; border-radius:6px; font-family:inherit; font-size:12px;
  color:var(--ui-text-muted,#6b7280);
}
.pxc-tpager button:hover{ color:var(--ui-primary,#3b82f6); }
.pxc-tpager button[disabled]{ opacity:.45; cursor:default; }

/* 搜索结果卡片上的「帖子 / 评论」标记 */
.px-kind{
  display:inline-flex; align-items:center; height:18px; padding:0 6px;
  border-radius:5px; font-size:11px; font-weight:700; white-space:nowrap;
  color:var(--ui-text-muted,#6b7280); background:color-mix(in srgb, currentColor 12%, transparent);
}
.px-kind[data-kind="comment"]{ color:var(--ui-primary,#3b82f6); }

/* 从搜索结果跳进来时，命中的那一楼 / 楼中楼高亮 */
[data-px-focus]{
  border-radius:8px;
  background:color-mix(in srgb, var(--ui-primary,#3b82f6) 8%, transparent);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--ui-primary,#3b82f6) 45%, transparent);
  transition:background-color .3s ease, box-shadow .3s ease;
}

/* 长评论折叠 */
[data-px-expand]{
  display:inline; margin-left:4px; appearance:none; border:0; background:transparent;
  cursor:pointer; padding:0; font-family:inherit; font-size:inherit; font-weight:600;
  color:var(--ui-primary,#3b82f6); vertical-align:baseline;
}
[data-px-expand]:hover{ text-decoration:underline; }

/* 帖子右侧栏：所属合集 */
/* 目录很长 + 合集很多时两者会叠在一起：让侧栏自己滚，两块各占各的高度 */
aside[aria-label="帖子信息"]{
  overflow-y:auto;
  overscroll-behavior:contain;
}
aside[aria-label="帖子信息"] > nav[aria-label="文章目录"]{
  flex:0 0 auto;
}
#pictExt-collection{
  flex:0 0 auto;
  position:relative; z-index:2;
  /* 万一目录那块内容溢出来，也盖不住它：给个实底 + 压在最上层 */
  background:var(--ui-bg,Canvas);
  margin-top:20px; padding-top:14px;
  max-height:45vh; overflow-y:auto; overscroll-behavior:contain;
  border-top:1px solid var(--ui-border,rgba(127,127,127,.24));
}
#pictExt-collection .pxcol-head{ display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
#pictExt-collection .pxcol-name{
  min-width:0; font-size:15px; font-weight:700; color:var(--ui-text,#111827);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
#pictExt-collection .pxcol-idx{ flex:none; font-size:12px; color:var(--ui-text-dimmed,#9ca3af); }
#pictExt-collection .pxcol-sort,
#pictExt-profcol .pxcol-sort{ display:flex; flex-wrap:wrap; gap:2px; margin-bottom:0; }
#pictExt-collection .pxcol-sort button,
#pictExt-profcol .pxcol-sort button{
  appearance:none; border:0; background:transparent; cursor:pointer;
  padding:3px 6px; border-radius:6px; font-family:inherit; font-size:12px;
  color:var(--ui-text-muted,#6b7280);
}
#pictExt-collection .pxcol-sort button[data-active="true"],
#pictExt-profcol .pxcol-sort button[data-active="true"]{ color:var(--ui-primary,#3b82f6); font-weight:600; }
#pictExt-profcol .pxc-note{ font-size:12px; color:var(--ui-text-dimmed,#9ca3af); }
#pictExt-collection .pxcol-item{
  display:block; min-width:0; padding:4px 6px; border-radius:6px; font-size:13px;
  color:var(--ui-text,#111827); text-decoration:none; line-height:1.45;
}
#pictExt-collection .pxcol-item:hover{ background:color-mix(in srgb, var(--ui-primary,#3b82f6) 8%, transparent); }
#pictExt-collection .pxcol-item[data-current="true"]{ color:var(--ui-primary,#3b82f6); font-weight:600; }
#pictExt-collection .pxcol-title{ display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#pictExt-collection .pxcol-meta{
  display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;
  font-size:11px; color:var(--ui-text-dimmed,#9ca3af);
}
#pictExt-collection .pxcol-excerpt{
  margin-top:2px; font-size:11px; color:var(--ui-text-muted,#6b7280);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
#pictExt-collection .pxcol-toggle{
  appearance:none; border:0; background:transparent; cursor:pointer; padding:4px 0 0;
  font-family:inherit; font-size:12px; color:var(--ui-text-muted,#6b7280);
}
#pictExt-collection .pxcol-toggle:hover{ color:var(--ui-primary,#3b82f6); }
`;

  function injectStyle() {
    if (document.getElementById('pictExt-style')) return;
    const el = document.createElement('style');
    el.id = 'pictExt-style';
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }
