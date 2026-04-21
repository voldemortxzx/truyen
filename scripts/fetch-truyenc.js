// Fetch truyện từ truyenc.com
// Usage:
//   node scripts/fetch-truyenc.js --out public/data/content/cuong-dam-co-giao https://truyenc.com/truyen/cuong-dam-co-giao-1612
//   node scripts/fetch-truyenc.js --out public/data/content/abc --merge 5 https://truyenc.com/truyen/abc-123

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
      rejectUnauthorized: false,
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
 * Lấy title truyện từ trang index
 */
function extractStoryTitle(html) {
  // <h1 class="...">Title</h1> hoặc og:title
  const match = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (match) return match[1].replace(/ - .*$/, '').trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]+>/g, '').trim();
  return '';
}

/**
 * Lấy danh sách chapter URLs từ trang index truyện
 * Trả về [{url, title}]
 */
function extractChapterList(html, baseUrl) {
  const chapters = [];
  // Tìm tất cả link chương: href=".../<slug>-<id>" title="<title>"
  const regex = /<a\s+href="(https?:\/\/truyenc\.com\/truyen\/[^"]+)"\s+title="([^"]+)"/gi;
  let m;
  const seen = new Set();
  while ((m = regex.exec(html)) !== null) {
    const url = m[1];
    const title = m[2];
    // Chỉ lấy link chương (có dạng /truyen/slug/phan-N-ID hoặc /truyen/slug/chuong-N-ID)
    if (url.match(/\/truyen\/[^/]+\/[^/]+-\d+$/) && !seen.has(url)) {
      seen.add(url);
      chapters.push({ url, title });
    }
  }
  return chapters;
}

/**
 * Trích xuất nội dung chương từ div.story-content
 */
function extractContent(html) {
  const match = html.match(/<div\s+class="story-content">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  if (!match) {
    // Fallback: lấy từ story-content đến hết
    const fb = html.match(/class="story-content">([\s\S]*?)(?:<div\s+class="(?:text-center|navigator|comment|footer))/i);
    if (fb) return fb[1];
    return '';
  }
  return match[1];
}

/**
 * Lấy title chương từ trang chương
 */
function extractChapterTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  if (!match) return '';
  return match[1].replace(/ - TruyenC$/i, '').trim();
}

/**
 * Làm sạch HTML content
 */
function cleanContent(html) {
  let cleaned = html;
  // Xóa các script tags và nội dung
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Xóa style tags
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Xóa div quảng cáo
  cleaned = cleaned.replace(/<div[^>]*id="M\d+[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // Xóa HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  // Xóa &nbsp;
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  // Decode HTML entities
  cleaned = cleaned.replace(/&#8211;/g, '–');
  cleaned = cleaned.replace(/&#8220;/g, '"');
  cleaned = cleaned.replace(/&#8221;/g, '"');
  cleaned = cleaned.replace(/&#8216;/g, "'");
  cleaned = cleaned.replace(/&#8217;/g, "'");
  cleaned = cleaned.replace(/&#8230;/g, '...');
  cleaned = cleaned.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  // Chuyển </p><p> thành <br><br>
  cleaned = cleaned.replace(/<\/p>\s*<p[^>]*>/gi, '<br><br>');
  // Xóa thẻ <p> còn lại
  cleaned = cleaned.replace(/<\/?p[^>]*>/gi, '');
  // Chuyển <br/> thành <br>
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '<br>');
  // Xóa tất cả thẻ HTML trừ <br>
  cleaned = cleaned.replace(/<(?!\/?br\s*\/?>)[^>]+>/gi, '');
  // Chuẩn hóa <br> liên tiếp
  cleaned = cleaned.replace(/(\s*<br\s*\/?>\s*){3,}/gi, '<br><br>');
  // Xóa khoảng trắng thừa
  cleaned = cleaned.replace(/\t+/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, '\n');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
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

  const storyUrl = args.find(a => a.startsWith('http'));
  if (!storyUrl) {
    console.log('Usage: node fetch-truyenc.js [--out <dir>] [--merge <n>] [--delay <ms>] <story-URL>');
    console.log('');
    console.log('  story-URL: trang chính của truyện (VD: https://truyenc.com/truyen/abc-123)');
    console.log('             hoặc link chương đầu tiên');
    console.log('');
    console.log('Options:');
    console.log('  --out <dir>      Output directory (default: current dir)');
    console.log('  --merge <n>      Gộp n chương vào 1 file');
    console.log('  --delay <ms>     Delay between requests (default: 2000ms)');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/fetch-truyenc.js --out public/data/content/cuong-dam-co-giao https://truyenc.com/truyen/cuong-dam-co-giao-1612');
    process.exit(1);
  }

  // Nếu URL là link chương, lấy link truyện từ page
  let indexUrl = storyUrl;
  // Nếu URL có dạng /truyen/slug/phan-N-ID → đây là link chương, cần tìm link index
  if (storyUrl.match(/\/truyen\/[^/]+\/[^/]+-\d+$/)) {
    console.log('🔍 Đây là link chương, đang tìm trang index truyện...');
    const chapterHtml = await fetchPage(storyUrl);
    const indexMatch = chapterHtml.match(/href="(https?:\/\/truyenc\.com\/truyen\/[^"]+)"[^>]*class="header-title"/i)
      || chapterHtml.match(/href="(https?:\/\/truyenc\.com\/truyen\/[^"/]+-\d+)"[^>]*title="Trở về truyện"/i);
    if (indexMatch) {
      indexUrl = indexMatch[1];
      console.log(`📖 Trang index: ${indexUrl}`);
    } else {
      console.error('✗ Không tìm được trang index truyện');
      process.exit(1);
    }
  }

  // Fetch trang index để lấy danh sách chương
  console.log(`\n🔍 Fetching story index: ${indexUrl}`);
  const indexHtml = await fetchPage(indexUrl);
  const storyTitle = extractStoryTitle(indexHtml);
  console.log(`📖 Title: ${storyTitle}`);

  const chapters = extractChapterList(indexHtml, indexUrl);
  if (chapters.length === 0) {
    console.error('✗ Không tìm thấy chương nào');
    process.exit(1);
  }

  // Sắp xếp chương theo số trong URL (phan-1, phan-2, ...)
  chapters.sort((a, b) => {
    const numA = parseInt((a.url.match(/(\d+)$/) || [0, 0])[1]);
    const numB = parseInt((b.url.match(/(\d+)$/) || [0, 0])[1]);
    return numA - numB;
  });

  console.log(`📚 Found ${chapters.length} chapter(s) → ${path.resolve(outputDir)}`);
  console.log(`⏱ Delay: ${delay}ms between requests`);
  if (merge > 1) console.log(`📦 Merge: ${merge} chương/file`);

  let success = 0;
  let fail = 0;
  const failedUrls = [];

  async function fetchOneChapter(chapter, idx) {
    console.log(`\nFetching [${idx + 1}/${chapters.length}]: ${chapter.title} - ${chapter.url}`);
    const html = await fetchPage(chapter.url);
    const title = extractChapterTitle(html) || chapter.title;
    const rawContent = extractContent(html);
    if (!rawContent) {
      console.error('✗ Không trích xuất được nội dung');
      return null;
    }
    const content = cleanContent(rawContent);
    console.log(`✔ ${title}: ${content.length} chars`);
    return { title, content };
  }

  if (merge > 1) {
    for (let i = 0; i < chapters.length; i += merge) {
      const batch = chapters.slice(i, i + merge);
      const parts = [];

      for (let j = 0; j < batch.length; j++) {
        const idx = i + j;
        try {
          const result = await fetchOneChapter(batch[j], idx);
          if (result) {
            parts.push(`${result.title}\n${result.content}`);
            success++;
          } else {
            fail++;
            failedUrls.push(batch[j].url);
          }
        } catch (err) {
          console.error(`✗ Error: ${err.message}`);
          fail++;
          failedUrls.push(batch[j].url);
        }
        if (j < batch.length - 1 || i + merge < chapters.length) await sleep(delay);
      }

      if (parts.length > 0) {
        const firstNum = i + 1;
        const lastNum = Math.min(i + merge, chapters.length);
        const fileName = `chuong-${firstNum}-${lastNum}.txt`;
        const outputFile = path.join(outputDir, fileName);
        const separator = '\n\n' + '='.repeat(60) + '\n\n';
        saveToFile(outputFile, parts.join(separator));
      }
    }
  } else {
    for (let i = 0; i < chapters.length; i++) {
      try {
        const result = await fetchOneChapter(chapters[i], i);
        if (result) {
          const outputFile = path.join(outputDir, `chuong-${i + 1}.txt`);
          saveToFile(outputFile, `${result.title}\n${result.content}`);
          success++;
        } else {
          fail++;
          failedUrls.push(chapters[i].url);
        }
      } catch (err) {
        console.error(`✗ Error: ${err.message}`);
        fail++;
        failedUrls.push(chapters[i].url);
      }
      if (i < chapters.length - 1) await sleep(delay);
    }
  }

  console.log(`\n✔ Done: ${success} OK, ${fail} failed`);
  if (merge > 1) console.log(`📦 Files: ${Math.ceil(success / merge)} merged files`);
  if (failedUrls.length > 0) {
    console.log(`\n✗ Failed chapters:`);
    failedUrls.forEach(u => console.log(`  ${u}`));
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
