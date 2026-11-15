const fs = require('fs');
const p = 'pictExt.user.js';
let s = fs.readFileSync(p, 'utf8');

// CSS 变量同时给「并排模式」的宿主用
s = s.replace(
  'const CSS = `\n#${PANEL_ID}{',
  'const CSS = `\n:is(#${PANEL_ID}, .px-merged-host){'
);
s = s.replace(
  '#${PANEL_ID}, #${PANEL_ID} *{ box-sizing: border-box; }',
  '#${PANEL_ID}, #${PANEL_ID} *, .px-merged-host, .px-merged-host *{ box-sizing: border-box; }'
);

// 合并模式相关函数
const helpers = `
  /* ============================================================
   * 9.5 「完全替换」模式：把排序并进站内那一排
   * ============================================================ */
  const mergedNativeHidden = [];

  function restoreMergedNativeTabs() {
    while (mergedNativeHidden.length) {
      const el = mergedNativeHidden.pop();
      if (el && el.isConnected) el.style.display = '';
    }
  }

  /**
   * 把我们的排序标签搬进站内标签行，原生的「推荐 / 最新」由我们接管（藏掉）。
   * 「关注」保留原样：它要走站点的登录态，我们不碰。
   */
  function mergeIntoNativeTabs(tabsRoot, panel) {
    const list = tabsRoot.querySelector('[role="tablist"]') || tabsRoot;
    const nativeTabs = [...tabsRoot.querySelectorAll('[role="tab"]')];
    const tabsHost = panel.querySelector('.px-tabs');
    if (!tabsHost) return { tabsHost: null };

    nativeTabs.forEach((t) => {
      const label = t.textContent.trim();
      if ((label === '推荐' || label === '最新') && t.style.display !== 'none') {
        t.style.display = 'none';
        mergedNativeHidden.push(t);
      }
    });

    // 站内的选中指示条：它会一直指着被藏起来的「推荐」，一并藏掉，改用我们自己的下划线
    const indicator = list.querySelector('[style*="--reka-tabs-indicator"]');
    if (indicator && indicator.style.display !== 'none') {
      indicator.style.display = 'none';
      mergedNativeHidden.push(indicator);
    }

    tabsHost.classList.add('px-merged-host');
    list.appendChild(tabsHost);
    return { tabsHost };
  }

`;
s = s.replace('  /* ============================================================\n   * 10. 帖子详情页：折叠楼中楼 + 补全信息', helpers + '  /* ============================================================\n   * 10. 帖子详情页：折叠楼中楼 + 补全信息');

fs.writeFileSync(p, s);
console.log('patched');
