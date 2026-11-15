const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');
const start = s.indexOf('slots:{root:`relative flex items-start`');
if (start < 0) {
  console.log('NOT FOUND');
  process.exit(0);
}
console.log(s.slice(start, start + 2400));
