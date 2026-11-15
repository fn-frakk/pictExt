const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');
const a = Number(process.argv[3]);
const b = Number(process.argv[4]);
console.log(s.slice(a, b));
