#!/usr/bin/env node
/**
 * 零依赖构建脚本：把 src/*.js 按固定顺序拼成一个 IIFE，输出 dist/content.js。
 *
 * 为什么用「拼接」而不是引入打包器：
 *   - 内容脚本最终就是一个文件，不需要模块解析、tree-shaking、代码分割；
 *   - 不装任何依赖 → clone 下来 `npm run build` 立刻能跑，离线也行；
 *   - 每个 src 文件都是普通脚本片段，共享同一个闭包，读代码时按文件名顺序读即可。
 *
 * 用法：
 *   node build.js           # 产出 dist/content.js
 *   node build.js --watch   # 改了 src 自动重建（polling，无需额外依赖）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'content.js');

/** 唯一权威的加载顺序：文件名即顺序，改顺序＝改这里 */
const ORDER = [
  '01-constants',
  '02-settings',
  '03-utils',
  '04-net',
  '05-data',
  '06-style',
  '07-sorts',
  '08-cards',
  '09-feed-view',
  '10-list-hider',
  '11-adapters',
  '20-detail',
  '21-comment-sort',
  '22-collection',
  '23-reply-toolbar',
  '24-settings-ui',
  '25-stats',
  '26-super-search',
  '30-mount',
  '31-profile-collections',
  '32-cookie',
  '40-events',
  '41-boot',
];

function read(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\s+$/, '');
}

function build() {
  const header = read('_header.js');
  const parts = ORDER.map((name) => {
    const p = path.join(SRC, name + '.js');
    if (!fs.existsSync(p)) throw new Error('缺少源文件：src/' + name + '.js');
    return read(name + '.js');
  });

  const out = [header, '', '(function () {', "  'use strict';", '', parts.join('\n\n'), '', '})();', ''].join('\n');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, out, 'utf8');

  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
  const lines = out.split('\n').length;
  console.log(`✔ dist/content.js  ${lines} 行 / ${kb} KB  （${ORDER.length} 个源文件）`);
}

build();

if (process.argv.includes('--watch')) {
  console.log('… watching src/ ，Ctrl+C 结束');
  let timer = null;
  fs.watch(SRC, { persistent: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (err) {
        console.error('✖ 构建失败：', err.message);
      }
    }, 80);
  });
}
