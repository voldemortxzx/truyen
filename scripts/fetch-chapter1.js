//node scripts/fetch-chapter.js --out public/data/content/thau-huong-cao-thu --range 101-200 https://xtruyen.vn/truyen/thau-huong-cao-thu-cai-bien/
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const pako = require('pako');

// Bảng ký tự dùng để giải mã (từ website)
const CUSTOM_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
const BASE64_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Fetch nội dung HTML từ một URL (tự follow redirect)
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Lấy nội dung bên trong thẻ <h2> đầu tiên
 */
function extractH2(html) {
  const match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (!match) return '';
  return match[1].replace(/<[^>]+>/g, '').trim();
}

/**
 * Giải mã nội dung chương từ script-x:
 * 1. Character substitution (custom charset → base64 charset)
 * 2. Base64 decode
 * 3. Pako inflate (decompress)
 */
function decodeChapterContent(html) {
  // Tìm script id="script-x"
  const scriptMatch = html.match(/<script id="script-x">([\s\S]*?)<\/script>/);
  if (!scriptMatch) return '';

  const script = scriptMatch[1];

  // Tìm data_x
  const dataMatch = script.match(/data_x\s*=\s*"([^"]+)"/);
  if (!dataMatch) return '';

  const dataX = dataMatch[1];

  // Bước 1: Character substitution
  let translated = '';
  for (const char of dataX) {
    const idx = CUSTOM_CHARSET.indexOf(char);
    translated += idx > -1 ? BASE64_CHARSET[idx] : char;
  }

  // Bước 2: Base64 decode
  const binary = Buffer.from(translated, 'base64');

  // Bước 3: Pako inflate
  const text = pako.inflate(binary, { to: 'string' });

  return text;
}

/**
 * Làm sạch nội dung: xóa tất cả thẻ HTML trừ <br>
 */
function cleanContent(html) {
  let cleaned = html;
  // Xóa HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  // Xóa &nbsp;
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  // Xóa tất cả thẻ HTML trừ <br>
  cleaned = cleaned.replace(/<(?!\/?br\s*\/?>)[^>]+>/gi, '');
  // Chuẩn hóa <br> liên tiếp
  cleaned = cleaned.replace(/(\s*<br\s*\/?>\s*){3,}/gi, '<br><br>');
  // Xóa khoảng trắng thừa
  cleaned = cleaned.replace(/\t+/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, '\n');
  return cleaned.trim();
}

/**
 * Tự động tạo tên file từ URL
 * VD: https://xtruyen.vn/truyen/abc/chuong-1/ → chuong-1.txt
 */
function getOutputFileName(url, outputDir) {
  // Lấy phần cuối của URL (bỏ trailing slash)
  const parts = url.replace(/\/+$/, '').split('/');
  const slug = parts[parts.length - 1] || 'output';
  return path.join(outputDir, `${slug}.txt`);
}

/**
 * Fetch và lưu một chương
 */
async function fetchAndSave(url, outputDir) {
  console.log(`\nFetching: ${url}`);
  const html = await fetchPage(url);

  // Lấy tiêu đề từ <h2>
  const title = extractH2(html);
  if (!title) console.warn('⚠ Không tìm thấy thẻ <h2>');

  // Giải mã nội dung từ script-x
  const rawContent = decodeChapterContent(html);
  if (!rawContent) {
    console.error('✗ Không giải mã được nội dung');
    return false;
  }

  // Làm sạch HTML (chỉ giữ <br>)
  const content = cleanContent(rawContent);
  const output = `${title}\n${content}`;

  const outputFile = getOutputFileName(url, outputDir);

  // Tạo thư mục nếu chưa có
  const dir = path.dirname(outputFile);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputFile, output, 'utf-8');
  console.log(`✔ Title: ${title}`);
  console.log(`✔ Content: ${content.length} chars`);
  console.log(`✔ Saved: ${outputFile}`);
  return true;
}

/**
 * Main: fetch nhiều URL lần lượt → tự động tạo tên file từ URL
 *
 * Usage:
 *   node fetch-chapter.js [--out <dir>] <URL1> <URL2> ...
 *
 * Examples:
 *   node fetch-chapter.js https://xtruyen.vn/truyen/abc/chuong-1 https://xtruyen.vn/truyen/abc/chuong-2
 *   node fetch-chapter.js --out public/data/content/abc https://xtruyen.vn/truyen/abc/chuong-1
 */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArg(args, name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  const val = args[idx + 1];
  args.splice(idx, 2);
  return val;
}

/**
 * Main: fetch nhiều URL lần lượt → tự động tạo tên file từ URL
 *
 * Usage:
 *   node fetch-chapter.js [--out <dir>] [--delay <ms>] [--range <start-end>] <base-URL or URL1 URL2 ...>
 *
 * Options:
 *   --out <dir>      Output directory (default: current dir)
 *   --delay <ms>     Delay between requests in ms (default: 2000)
 *   --range <s-e>    Auto-generate URLs from chapter s to e (e.g. 23-100)
 *
 * Examples:
 *   node fetch-chapter.js --out content/abc --range 1-50 https://xtruyen.vn/truyen/abc/
 *   node fetch-chapter.js --out content/abc https://xtruyen.vn/truyen/abc/chuong-1 https://xtruyen.vn/truyen/abc/chuong-2
 */
async function main() {
  const args = process.argv.slice(2);

  const outputDir = parseArg(args, '--out', '.');
  const delay = parseInt(parseArg(args, '--delay', '2000'));
  const range = parseArg(args, '--range', null);

  let urls = [];

  if (range) {
    // --range 23-100 <base-url>
    const [start, end] = range.split('-').map(Number);
    const baseUrl = args.find(a => a.startsWith('http'));
    if (!baseUrl || !start || !end) {
      console.error('Usage with --range: node fetch-chapter.js --range 23-100 https://xtruyen.vn/truyen/abc/');
      process.exit(1);
    }
    // Xóa trailing chuong-X nếu có, giữ base path
    const base = baseUrl.replace(/chuong-\d+\/?$/, '').replace(/\/+$/, '');
    for (let i = start; i <= end; i++) {
      urls.push(`${base}/chuong-${i}`);
    }
  } else {
    urls = args.filter(a => a.startsWith('http'));
  }

  if (urls.length === 0) {
    console.log('Usage: node fetch-chapter.js [--out <dir>] [--delay <ms>] [--range <start-end>] <URL ...>');
    console.log('');
    console.log('Options:');
    console.log('  --out <dir>      Output directory (default: current dir)');
    console.log('  --delay <ms>     Delay between requests (default: 2000ms)');
    console.log('  --range <s-e>    Generate chapter URLs from s to e');
    console.log('');
    console.log('Examples:');
    console.log('  node fetch-chapter.js --out content/abc --range 1-50 https://xtruyen.vn/truyen/abc/');
    console.log('  node fetch-chapter.js --out content/abc https://xtruyen.vn/truyen/abc/chuong-1');
    process.exit(1);
  }

  console.log(`📚 Fetching ${urls.length} chapter(s) → ${path.resolve(outputDir)}`);
  console.log(`⏱ Delay: ${delay}ms between requests`);

  let success = 0;
  let fail = 0;
  const failedUrls = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const ok = await fetchAndSave(url, outputDir);
      if (ok) success++; else { fail++; failedUrls.push(url); }
    } catch (err) {
      console.error(`✗ Error: ${err.message}`);
      fail++;
      failedUrls.push(url);
    }
    // Delay giữa các request để tránh bị rate limit
    if (i < urls.length - 1) await sleep(delay);
  }

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
