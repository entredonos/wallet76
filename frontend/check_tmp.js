const parser = require('@babel/parser');
const fs = require('fs');
const files = [
  '/sessions/funny-youthful-fermat/mnt/Wallet76/frontend/src/pages/Dashboard.jsx',
  '/sessions/funny-youthful-fermat/mnt/Wallet76/frontend/src/components/dashboard/LightEvolutionCard.jsx'
];
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  try {
    parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'optionalChaining', 'nullishCoalescingOperator'] });
    console.log(f, 'OK');
  } catch (e) {
    console.log(f, 'FAIL', e.message);
  }
}
