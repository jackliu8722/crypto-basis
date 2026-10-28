import { openDb } from './db.js';
import { createRepository } from './repository.js';
import { createPriceService } from './priceService.js';
import { createApp } from './server.js';

const args = process.argv.slice(2);

/** 取出 --flag 后的值；未出现返回 undefined */
function readArg(flag) {
  const i = args.indexOf(flag);
  return i === -1 || i + 1 >= args.length ? undefined : args[i + 1];
}

// --no-proxy 显式禁用代理，--proxy <url> 指定代理，都不给则回退环境变量与设置面板
const proxy = args.includes('--no-proxy') ? '' : readArg('--proxy');
const port = Number(readArg('--port') ?? process.env.PORT ?? 3001);

const db = openDb();
const priceService = createPriceService(db, { proxy });
const app = createApp({ repo: createRepository(db), priceService });

app.listen(port, '127.0.0.1', () => {
  console.log(`server:  http://127.0.0.1:${port}`);
  console.log(`行情代理: ${priceService.currentProxy() ?? '未配置'}（取不到行情时用 --proxy http://127.0.0.1:7890 指定）`);
});
