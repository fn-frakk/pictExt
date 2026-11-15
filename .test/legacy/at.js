const fs = require('fs');
const [file, needle, before = 0, after = 1500] = process.argv.slice(2);
const s = fs.readFileSync(file, 'utf8');
const i = s.indexOf(needle);
if (i < 0) {
  console.log('NOT FOUND');
  process.exit(0);
}
console.log('idx=' + i + ' len=' + s.length);
console.log(s.slice(Math.max(0, i - Number(before)), i + Number(after)));
