const fs = require('fs');

// 1) 合并模式的宿主自身也要是 flex 容器
let s = fs.readFileSync('pictExt.user.js', 'utf8');
s = s.replace(
  ':is(#${PANEL_ID}, .px-merged-host) .px-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }',
  ':is(#${PANEL_ID}, .px-merged-host) .px-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }\n.px-merged-host{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }'
);

// 2) 版本号
s = s.replace('// @version      1.2.0', '// @version      1.3.0');
s = s.replace(' * pictExt / v1.2.0', ' * pictExt / v1.3.0');
s = s.replace("'%cpictExt%c v1.2.0 已加载", "'%cpictExt%c v1.3.0 已加载");
fs.writeFileSync('pictExt.user.js', s);

// 3) README 版本
let r = fs.readFileSync('README.md', 'utf8');
r = r.replace('v1.2', 'v1.3');
fs.writeFileSync('README.md', r);
console.log('ok');
