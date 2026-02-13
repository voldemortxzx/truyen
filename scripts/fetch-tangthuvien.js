/**
 * Fetch chương truyện từ tangthuvien.net bằng Puppeteer (bypass Cloudflare)
 *
 * Usage:
 *   node scripts/fetch-tangthuvien.js [--out <dir>] [--delay <ms>] [--range <start-end>] <URL>
 *
 * Examples:
 *   node scripts/fetch-tangthuvien.js --out public/data/content/thau-huong-cao-thu --range 1220-1221 https://tangthuvien.net/doc-truyen/thau-huong-cao-thu/
 *   node scripts/fetch-tangthuvien.js --out public/data/content/abc https://tangthuvien.net/doc-truyen/abc/chuong-1
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArg(args, name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  const val = args[idx + 1];
  args.splice(idx, 2);
  return val;
}

/**
 * Làm sạch nội dung: xóa tất cả thẻ HTML trừ <br>
 */
function cleanContent(html) {
  let cleaned = html;
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/<(?!\/?br\s*\/?>)[^>]+>/gi, '');
  cleaned = cleaned.replace(/(\s*<br\s*\/?>\s*){3,}/gi, '<br><br>');
  cleaned = cleaned.replace(/\t+/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, '\n');
  return cleaned.trim();
}

/**
 * Tự tạo tên file từ URL
 */
function getOutputFileName(url, outputDir) {
  const parts = url.replace(/\/+$/, '').split('/');
  const slug = parts[parts.length - 1] || 'output';
  return path.join(outputDir, `${slug}.txt`);
}

async function main() {
  const args = process.argv.slice(2);

  const outputDir = parseArg(args, '--out', '.');
  const delay = parseInt(parseArg(args, '--delay', '5000'));
  const range = parseArg(args, '--range', null);

  let urls = [];

  if (range) {
    const [start, end] = range.split('-').map(Number);
    const baseUrl = args.find(a => a.startsWith('http'));
    if (!baseUrl || !start || !end) {
      console.error('Usage: node fetch-tangthuvien.js --range 1220-1230 https://tangthuvien.net/doc-truyen/abc/');
      process.exit(1);
    }
    const base = baseUrl.replace(/chuong-\d+\/?$/, '').replace(/\/+$/, '');
    for (let i = start; i <= end; i++) {
      urls.push(`${base}/chuong-${i}`);
    }
  } else {
    urls = args.filter(a => a.startsWith('http'));
  }

  if (urls.length === 0) {
    console.log('Usage: node scripts/fetch-tangthuvien.js [--out <dir>] [--delay <ms>] [--range <s-e>] <URL>');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/fetch-tangthuvien.js --out public/data/content/abc --range 1-50 https://tangthuvien.net/doc-truyen/abc/');
    process.exit(1);
  }

  // Tạo thư mục output
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`📚 Fetching ${urls.length} chapter(s) → ${path.resolve(outputDir)}`);
  console.log(`⏱ Delay: ${delay}ms between requests`);

  // Khởi tạo browser (stealth mode)
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let success = 0;
  let fail = 0;
  const failedUrls = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n[${i + 1}/${urls.length}] Fetching: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Đợi Cloudflare challenge hoàn tất — chờ đến khi page title thay đổi
      console.log('  ⏳ Waiting for Cloudflare challenge...');
      await page.waitForFunction(
        () => !document.title.includes('Just a moment'),
        { timeout: 45000 }
      ).catch(() => console.log('  ⚠ Cloudflare wait timeout, trying anyway...'));

      // Đợi thêm cho content load
      await sleep(3000);

      // Thử nhiều selector phổ biến cho content
      await page.waitForSelector('.box-chap, .chapter-content, .reading-detail, #chapter-c', { timeout: 15000 }).catch(() => null);

      // Thử nhiều selector phổ biến cho content
      const result = await page.evaluate(() => {
        // Lấy title
        const h2 = document.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : '';

        // Lấy nội dung — thử nhiều selector
        const selectors = ['.box-chap', '#box-chap', '.chapter-content', '#chapter-content', '.reading-detail', '.content-chapter'];
        let content = '';
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerHTML.length > 100) {
            content = el.innerHTML;
            break;
          }
        }

        return { title, content };
      });

      if (!result.content) {
        console.error('✗ Không tìm thấy nội dung chương');
        fail++;
        failedUrls.push(url);
        continue;
      }

      const cleaned = cleanContent(result.content);
      const output = `${result.title}\n${cleaned}`;
      const outputFile = getOutputFileName(url, outputDir);

      fs.writeFileSync(outputFile, output, 'utf-8');
      console.log(`✔ Title: ${result.title}`);
      console.log(`✔ Content: ${cleaned.length} chars`);
      console.log(`✔ Saved: ${outputFile}`);
      success++;

    } catch (err) {
      console.error(`✗ Error: ${err.message}`);
      fail++;
      failedUrls.push(url);
    }

    if (i < urls.length - 1) await sleep(delay);
  }

  await browser.close();

  console.log(`\n✔ Done: ${success} OK, ${fail} failed`);
  if (failedUrls.length > 0) {
    console.log(`\n✗ Failed chapters:`);
    failedUrls.forEach(u => console.log(`  ${u}`));
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
