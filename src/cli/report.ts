/** 利用記録を部署別に集計する。 npm run report [-- --log logs/demo-usage.jsonl] */
import { resolve } from 'node:path';
import { getConfig, PROJECT_ROOT } from '../config';
import { JsonlUsageLogger } from '../usage';
import { c, parseArgs } from './format';
import { departmentTable } from './summary';

const { flags } = parseArgs(process.argv.slice(2));
const path = typeof flags.log === 'string' ? resolve(PROJECT_ROOT, flags.log) : getConfig().logPath;
const records = new JsonlUsageLogger(path).readAll();

if (records.length === 0) {
  console.log(`記録がありません: ${path}\n先に npm run ask か npm run demo を実行してください。`);
  process.exit(0);
}
console.log(c.bold(`部署別の利用状況（${records.length} 件）`));
console.log(departmentTable(records));
