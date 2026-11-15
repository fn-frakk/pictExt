const fs = require('fs');
const p = 'pictExt.user.js';
let s = fs.readFileSync(p, 'utf8');

/* ---------- 1) 设置项：新增「板块页排序栏」「与站内排序合并一排」 ---------- */
s = s.replace(
  `    {
      key: 'searchSort',
      type: 'switch',
      label: '搜索页排序栏',
      desc: '在搜索结果的帖子列表上方加一排排序，关键词与板块筛选会一起带过去。',
    },`,
  `    {
      key: 'searchSort',
      type: 'switch',
      label: '搜索页排序栏',
      desc: '在搜索结果的帖子列表上方加一排排序，关键词与板块筛选会一起带过去。',
    },
    {
      key: 'categorySort',
      type: 'switch',
      label: '板块页排序栏',
      desc: '点帖子上的 #标签 进入的板块页，同样加一排排序（只排该板块内的帖子）。',
    },
    {
      key: 'mergeTabs',
      type: 'switch',
      label: '与站内排序合并到一排',
      desc: '把排序并进首页原来「关注 / 推荐 / 最新」那一排：原生的推荐与最新由我们接管，站内自己也有「关注」（要走登录态，我们的排序用不了）。',
    },`
);

/* ---------- 2) 设置页：改成左侧导航里加一项 PICTEXT ---------- */
const oldFn = s.slice(s.indexOf('  function mountSettingsPanel() {'), s.indexOf('  /* ============================================================\n   * 11. 挂载 / 卸载'));

const newFn = `  /** 左侧导航里加一项 PICTEXT（桌面侧栏 + 移动端横排都加） */
  function mountSettingsNav() {
    const navs = document.querySelectorAll('nav[aria-label="设置分类"]');
    navs.forEach((nav) => {
      let btn = nav.querySelector('[data-px-settings-nav]');
      if (!btn) {
        const template = nav.querySelector('button');
        btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.px = '1';
        btn.dataset.pxSettingsNav = '1';
        btn.className =
          template?.className ||
          'flex h-11 min-w-0 items-center gap-2.5 rounded-md px-4 text-left text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:bg-accented hover:text-default focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary aria-pressed:bg-primary/10 aria-pressed:text-primary';
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" aria-hidden="true" class="size-4.5 shrink-0">' +
          '<line x1="40" y1="80" x2="216" y2="80"></line><circle cx="100" cy="80" r="20" fill="currentColor" stroke="none"></circle>' +
          '<line x1="40" y1="176" x2="216" y2="176"></line><circle cx="156" cy="176" r="20" fill="currentColor" stroke="none"></circle>' +
          '</svg><span>PICTEXT</span>';
        btn.addEventListener('click', () => {
          settingsActive = true;
          renderSettingsArea();
        });
        nav.appendChild(btn);
      }
      btn.setAttribute('aria-pressed', settingsActive ? 'true' : 'false');
    });
  }

  /** 激活时把 PICTEXT 面板放进设置内容区，并把原生分区藏起来；未激活时完全还原 */
  function renderSettingsArea() {
    const container = document.querySelector('div[id^="settings-"]');
    if (!container) return;

    document.querySelectorAll('[data-px-settings-nav]').forEach((b) => {
      b.setAttribute('aria-pressed', settingsActive ? 'true' : 'false');
    });
    document.querySelectorAll('nav[aria-label="设置分类"] button:not([data-px-settings-nav])').forEach((b) => {
      if (settingsActive) b.setAttribute('aria-pressed', 'false');
    });

    let sec = document.getElementById('pictExt-settings');
    if (!settingsActive) {
      [...container.children].forEach((el) => {
        if (el.dataset.pxHiddenBy) {
          el.style.display = el.dataset.pxPrevDisplay || '';
          delete el.dataset.pxHiddenBy;
          delete el.dataset.pxPrevDisplay;
        }
      });
      if (sec) sec.remove();
      return;
    }

    if (!sec) {
      const holder = document.createElement('div');
      holder.innerHTML = settingsSectionHTML();
      sec = holder.firstElementChild;
    }
    if (!sec.isConnected) container.appendChild(sec);
    [...container.children].forEach((el) => {
      if (el === sec) return;
      if (!el.dataset.pxHiddenBy) {
        el.dataset.pxHiddenBy = '1';
        el.dataset.pxPrevDisplay = el.style.display;
        el.style.display = 'none';
      }
    });
    bindSettingsSection(sec);
    syncSettingsValues(sec);
  }

  function bindSettingsSection(sec) {
    if (sec.dataset.pxBound === '1') return;
    sec.dataset.pxBound = '1';

    sec.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-px-set][role="switch"]');
      if (sw) {
        settings[sw.dataset.pxSet] = !settings[sw.dataset.pxSet];
        syncSettingsValues(sec);
        applySettings();
        return;
      }
      if (e.target.closest('[data-px-reset]')) {
        settings = { ...DEFAULT_SETTINGS };
        syncSettingsValues(sec);
        applySettings();
        return;
      }
      if (e.target.closest('[data-px-clear]')) {
        try {
          localStorage.removeItem(SETTINGS_KEY);
        } catch {
          /* ignore */
        }
        settings = { ...DEFAULT_SETTINGS };
        syncSettingsValues(sec);
        applySettings();
      }
    });

    sec.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-px-set]');
      if (!sel) return;
      const key = sel.dataset.pxSet;
      settings[key] = key === 'collapseMin' ? Number(sel.value) : sel.value;
      applySettings();
    });
  }

`;

s = s.replace(oldFn, newFn);

/* ---------- 3) 状态变量 ---------- */
s = s.replace(
  "  let settings = loadSettings();",
  "  let settings = loadSettings();\n  /** 设置页里用户是否正在看 PICTEXT 面板 */\n  let settingsActive = false;"
);

/* ---------- 4) mount() 里改用新的两个函数 ---------- */
s = s.replace(
  `    if (location.pathname.startsWith('/settings')) {
      if (view) teardown();
      mountSettingsPanel();
      return;
    }`,
  `    if (location.pathname.startsWith('/settings')) {
      if (view) teardown();
      mountSettingsNav();
      renderSettingsArea();
      return;
    }`
);

/* ---------- 5) 点站内导航项 → 退出 PICTEXT ---------- */
s = s.replace(
  "  function bindNativeReset() {",
  `  /** 点了站内的设置分类 → 退出 PICTEXT 面板 */
  function bindSettingsNavReset() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('nav[aria-label="设置分类"] button');
        if (!btn || btn.hasAttribute('data-px-settings-nav')) return;
        if (!settingsActive) return;
        settingsActive = false;
        setTimeout(renderSettingsArea, 0);
      },
      true
    );
  }

  function bindNativeReset() {`
);
s = s.replace('    bindNativeReset();', '    bindNativeReset();\n    bindSettingsNavReset();');

fs.writeFileSync(p, s);
console.log('patched');
