// 运行时验证：加载游戏、捕获控制台错误、截图。
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'art/verify_game.png';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const errors = [];
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`REQ_FAIL ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000)); // 让游戏跑 6 秒
await page.screenshot({ path: out });

console.log('=== 页面错误 ===');
console.log(errors.length ? errors.join('\n') : '(无 pageerror)');
console.log('=== 控制台(错误类) ===');
const errLogs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[warning]'));
console.log(errLogs.length ? errLogs.slice(0, 20).join('\n') : '(无 error/warning 日志)');
console.log('=== 截图 ===', out);

await browser.close();
