const fs = require('fs');
const [file, needle, before = 3000, after = 500] = process.argv.slice(2);
const s = fs.readFileSync(file, 'utf8');
const i = s.indexOf(needle);
if (i < 0) {
  console.log('NOT FOUND');
  process.exit(0);
}
console.log('len=' + s.length + ' idx=' + i);
console.log(s.slice(Math.max(0, i - Number(before)), i + Number(after)));
