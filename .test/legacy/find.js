const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');
const needle = process.argv[3];
let i = s.indexOf(needle);
let n = 0;
while (i > 0 && n < 8) {
  console.log('--- idx=' + i);
  console.log(s.slice(Math.max(0, i - 300), i + 700));
  i = s.indexOf(needle, i + 1);
  n++;
}
