const fs = require('fs');
const p = 'pictExt.user.js';
let s = fs.readFileSync(p, 'utf8');

// 1) CSS：让排序标签在「并进站内那一排」时也能吃到同样的样式
s = s.replace(
  '#${PANEL_ID} .px-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }',
  ':is(#${PANEL_ID}, .px-merged-host) .px-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }\n#${PANEL_ID} .px-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }'
);
s = s.split('#${PANEL_ID} .px-tab').join(':is(#${PANEL_ID}, .px-merged-host) .px-tab');
s = s.split('#${PANEL_ID} .px-tab:focus-visible').join(':is(#${PANEL_ID}, .px-merged-host) .px-tab:focus-visible');

// 2) FeedView：支持把排序标签放在别处（并进站内那一排）
s = s.replace(
  "    constructor(panel, kind, ctx, getNativeNodes) {",
  "    constructor(panel, kind, ctx, getNativeNodes, tabsEl) {"
);
s = s.replace(
  "      this.tabEls = [...panel.querySelectorAll('.px-tab')];",
  "      this.tabEls = [...(tabsEl || panel).querySelectorAll('.px-tab')];"
);

// 3) 设置项：新增两个
s = s.replace(
  "    homeSort: true,        // 首页显示排序栏",
  "    homeSort: true,        // 首页显示排序栏\n    categorySort: true,    // 板块页（点标签进来）显示排序栏\n    mergeTabs: false,      // 与站内排序合并到同一排"
);

// 4) lastSortKey 增加 category
s = s.replace(
  "  const lastSortKey = { home: 'default', search: 'default' };",
  "  const lastSortKey = { home: 'default', search: 'default', category: 'default' };"
);

// 5) 面板标题：板块页也用「站内排序」
s = s.replace(
  "    const noteLabel = kind === 'home' ? '站内推荐' : '站内排序';",
  "    const noteLabel = kind === 'home' ? '站内推荐' : '站内排序';"
);

fs.writeFileSync(p, s);
console.log('patched');
