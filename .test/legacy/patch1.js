const fs = require('fs');
const p = 'pictExt.user.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace("  const homeAdapter = {\n    match:", "  const homeAdapter = {\n    kind: 'home',\n    match:");
s = s.replace("  const categoryAdapter = {\n    match:", "  const categoryAdapter = {\n    kind: 'category',\n    match:");
s = s.replace("  const searchAdapter = {\n    match:", "  const searchAdapter = {\n    kind: 'search',\n    match:");
fs.writeFileSync(p, s);
console.log('ok');
