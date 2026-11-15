const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');
const names = [...s.matchAll(/__name:`([^`]+)`/g)].map((m) => m[1]);
console.log('组件:', names.join(', '));
const labels = [...s.matchAll(/-label:`([^`]+)`/g)].map((m) => m[1]);
console.log('label:', [...new Set(labels)].join(' | '));
