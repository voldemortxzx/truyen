// Fetch truyện từ doctruyen14.net (WordPress paginated posts)
// Usage:
//   node scripts/fetch-doctruyen14.js --out public/data/content/vo-bi-hiep-tap-the --pages 14 https://doctruyen14.net/vo-bi-hiep-tap-the-truyen-sex-2024/
//   node scripts/fetch-doctruyen14.js --out public/data/content/abc --pages 5 --merge 5 https://doctruyen14.net/abc/

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Fetch nội dung HTML từ một URL (tự follow redirect, bỏ qua SSL)
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      rejectUnauthorized: false, // Bỏ qua SSL cert check
    };
    client.get(url, options, (res) => {
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
 * Lấy title từ <h1 class="entry-title">
 */
function extractTitle(html) {
  const match = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return '';
  return match[1].replace(/<[^>]+>/g, '').replace(/&#8211;/g, '-').replace(/&#\d+;/g, '').trim();
}

/**
 * Lấy tổng số trang từ pagination
 */
function extractTotalPages(html) {
  // Tìm link "Cuối »" có số trang cuối
  const lastMatch = html.match(/class="last"[^>]*href="[^"]*\/(\d+)\/"[^>]*>/);
  if (lastMatch) return parseInt(lastMatch[1]);
  // Fallback: tìm số lớn nhất trong page-numbers
  const pages = [...html.matchAll(/title="Page (\d+)"/g)].map(m => parseInt(m[1]));
  return pages.length > 0 ? Math.max(...pages) : 1;
}

/**
 * Trích xuất nội dung từ entry-content div
 */
function extractContent(html) {
  // Lấy phần entry-content
  const match = html.match(/<div[^>]*class="entry-content"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class='wp-pagenavi'|<!-- \.entry-content)/i);
  if (!match) {
    // Fallback: lấy tất cả giữa entry-content và wp-pagenavi
    const fallback = html.match(/class="entry-content">([\s\S]*?)(?:<div class='wp-pagenavi'|<!-- \.entry-content)/i);
    if (!fallback) return '';
    return fallback[1];
  }
  return match[1];
}

/**
 * Làm sạch HTML content → text thuần với <br>
 */
function cleanContent(html) {
  let cleaned = html;
  // Xóa phần mô tả truyện (div mo-ta-truyen) nếu có
  cleaned = cleaned.replace(/<div[^>]*class="mo-ta-truyen"[^>]*>[\s\S]*?<\/div>/gi, '');
  // Xóa HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  // Xóa &nbsp;
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  // Decode HTML entities
  cleaned = cleaned.replace(/&#8211;/g, '-');
  cleaned = cleaned.replace(/&#8220;/g, '"');
  cleaned = cleaned.replace(/&#8221;/g, '"');
  cleaned = cleaned.replace(/&#8216;/g, "'");
  cleaned = cleaned.replace(/&#8217;/g, "'");
  cleaned = cleaned.replace(/&#8230;/g, '...');
  cleaned = cleaned.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
  // Chuyển </p><p> thành <br><br>
  cleaned = cleaned.replace(/<\/p>\s*<p>/gi, '<br><br>');
  // Xóa thẻ <p> còn lại
  cleaned = cleaned.replace(/<\/?p[^>]*>/gi, '');
  // Xóa tất cả thẻ HTML trừ <br>
  cleaned = cleaned.replace(/<(?!\/?br\s*\/?>)[^>]+>/gi, '');
  // Chuẩn hóa <br> liên tiếp
  cleaned = cleaned.replace(/(\s*<br\s*\/?>\s*){3,}/gi, '<br><br>');
  // Xóa khoảng trắng thừa
  cleaned = cleaned.replace(/\t+/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, '\n');
  return cleaned.trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArg(args, name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  const val = args[idx + 1];
  args.splice(idx, 2);
  return val;
}

function saveToFile(outputFile, content) {
  const dir = path.dirname(outputFile);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputFile, content, 'utf-8');
  console.log(`✔ Saved: ${outputFile}`);
}

async function main() {
  const args = process.argv.slice(2);

  const outputDir = parseArg(args, '--out', '.');
  const delay = parseInt(parseArg(args, '--delay', '2000'));
  const merge = parseInt(parseArg(args, '--merge', '0')) || 0;
  let totalPages = parseInt(parseArg(args, '--pages', '0')) || 0;

  const baseUrl = args.find(a => a.startsWith('http'));
  if (!baseUrl) {
    console.log('Usage: node fetch-doctruyen14.js [--out <dir>] [--pages <n>] [--merge <n>] [--delay <ms>] <URL>');
    console.log('');
    console.log('Options:');
    console.log('  --out <dir>      Output directory (default: current dir)');
    console.log('  --pages <n>      Total pages (auto-detect if 0)');
    console.log('  --merge <n>      Gộp n trang vào 1 file');
    console.log('  --delay <ms>     Delay between requests (default: 2000ms)');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/fetch-doctruyen14.js --out public/data/content/vo-bi-hiep-tap-the --pages 14 https://doctruyen14.net/vo-bi-hiep-tap-the-truyen-sex-2024/');
    process.exit(1);
  }

  // Chuẩn hóa base URL (chỉ bỏ trailing slash, giữ nguyên slug)
  const base = baseUrl.replace(/\/+$/, '');

  // Auto-detect số trang nếu chưa chỉ định
  if (!totalPages) {
    console.log('🔍 Auto-detecting total pages...');
    const html = await fetchPage(`${base}/`);
    totalPages = extractTotalPages(html);
    console.log(`📄 Found ${totalPages} pages`);
  }

  // Tạo danh sách URLs
  const urls = [];
  for (let i = 1; i <= totalPages; i++) {
    urls.push(i === 1 ? `${base}/` : `${base}/${i}/`);
  }

  console.log(`📚 Fetching ${urls.length} page(s) → ${path.resolve(outputDir)}`);
  console.log(`⏱ Delay: ${delay}ms between requests`);
  if (merge > 1) console.log(`📦 Merge: ${merge} trang/file`);

  let success = 0;
  let fail = 0;
  const failedUrls = [];

  /**
   * Fetch 1 trang, trả về { pageNum, content } hoặc null
   */
  async function fetchOnePage(url, pageNum) {
    console.log(`\nFetching page ${pageNum}: ${url}`);
    const html = await fetchPage(url);

    if (pageNum === 1) {
      const title = extractTitle(html);
      if (title) console.log(`📖 Title: ${title}`);
    }

    const rawContent = extractContent(html);
    if (!rawContent) {
      console.error('✗ Không trích xuất được nội dung');
      return null;
    }

    const content = cleanContent(rawContent);
    console.log(`✔ Page ${pageNum}: ${content.length} chars`);
    return { pageNum, content };
  }

  if (merge > 1) {
    // === MERGE MODE ===
    for (let i = 0; i < urls.length; i += merge) {
      const batch = urls.slice(i, i + merge);
      const parts = [];

      for (let j = 0; j < batch.length; j++) {
        const pageNum = i + j + 1;
        try {
          const result = await fetchOnePage(batch[j], pageNum);
          if (result) {
            parts.push(`Trang ${result.pageNum}\n${result.content}`);
            success++;
          } else {
            fail++;
            failedUrls.push(batch[j]);
          }
        } catch (err) {
          console.error(`✗ Error: ${err.message}`);
          fail++;
          failedUrls.push(batch[j]);
        }
        if (j < batch.length - 1 || i + merge < urls.length) await sleep(delay);
      }

      if (parts.length > 0) {
        const firstPage = i + 1;
        const lastPage = Math.min(i + merge, totalPages);
        const fileName = `chuong-${firstPage}-${lastPage}.txt`;
        const outputFile = path.join(outputDir, fileName);
        const separator = '\n\n' + '='.repeat(60) + '\n\n';
        saveToFile(outputFile, parts.join(separator));
      }
    }
  } else {
    // === NORMAL MODE: mỗi trang 1 file ===
    for (let i = 0; i < urls.length; i++) {
      const pageNum = i + 1;
      try {
        const result = await fetchOnePage(urls[i], pageNum);
        if (result) {
          const outputFile = path.join(outputDir, `chuong-${pageNum}.txt`);
          saveToFile(outputFile, `Trang ${pageNum}\n${result.content}`);
          success++;
        } else {
          fail++;
          failedUrls.push(urls[i]);
        }
      } catch (err) {
        console.error(`✗ Error: ${err.message}`);
        fail++;
        failedUrls.push(urls[i]);
      }
      if (i < urls.length - 1) await sleep(delay);
    }
  }

  console.log(`\n✔ Done: ${success} OK, ${fail} failed`);
  if (merge > 1) console.log(`📦 Files: ${Math.ceil(success / merge)} merged files`);
  if (failedUrls.length > 0) {
    console.log(`\n✗ Failed pages:`);
    failedUrls.forEach(u => console.log(`  ${u}`));
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
