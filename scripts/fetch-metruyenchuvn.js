// Fetch chapters from metruyenchuvn.com
//
// Usage:
//   node scripts/fetch-metruyenchuvn.js [--out <dir>] [--delay <ms>] [--range <start-end>] [--count <n>] [--merge <n>] <URL>
//
// Options:
//   --out <dir>      Output directory (default: current dir)
//   --delay <ms>     Delay between requests (default: 2000ms)
//   --range <s-e>    Fetch chapters from number s to e (follows "Chương tiếp" links)
//   --count <n>      Fetch exactly n chapters starting from the given URL
//   --merge <n>      Merge n chapters into one file (e.g. --merge 5 → chuong-1-5.txt)
//
// Note: URLs on this site have a hash suffix (e.g. chuong-2342-nNqBWNuqjvIn),
//       so navigation is done by following next-chapter links, not URL construction.
//
// Examples:
//   node scripts/fetch-metruyenchuvn.js --out public/data/content/thau-huong https://metruyenchuvn.com/thau-huong-cao-thu-cai-bien-convert/chuong-2342-nNqBWNuqjvIn
//   node scripts/fetch-metruyenchuvn.js --out public/data/content/xxx --range 2342-2400 https://metruyenchuvn.com/thau-huong-cao-thu-cai-bien-convert/chuong-2342-nNqBWNuqjvIn
//   node scripts/fetch-metruyenchuvn.js --out public/data/content/thau-huong --count 10 --merge 5 https://metruyenchuvn.com/thau-huong-cao-thu-cai-bien-convert/chuong-2342-nNqBWNuqjvIn

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Fetch page HTML (follows redirects, handles gzip via Buffer)
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
      }
    };
    client.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return fetchPage(redirectUrl).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Decode numeric HTML entities like &#253; → ý
 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Extract chapter title from <h2> tag
 */
function extractTitle(html) {
  const match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (!match) return '';
  return decodeEntities(match[1].replace(/<[^>]+>/g, '').trim());
}

/**
 * Extract chapter number from title string or URL slug
 * e.g. "Chương 2342: ..." → 2342, "chuong-2342-xxx" → 2342
 */
function extractChapterNumber(str) {
  const m = str.match(/chuong[-\s]+(\d+)/i) || str.match(/ch[uư][oơ]ng[-:\s]+(\d+)/i);
  if (m) return parseInt(m[1]);
  return null;
}

/**
 * Extract chapter slug from URL for use as filename
 * e.g. https://metruyenchuvn.com/story/chuong-2342-nNqBWNuqjvIn → chuong-2342
 */
function getChapterSlug(url) {
  const parts = url.replace(/\/+$/, '').split('/');
  const last = parts[parts.length - 1];
  // chuong-2342-nNqBWNuqjvIn → chuong-2342
  const m = last.match(/^(chuong-\d+)/i);
  return m ? m[1] : last;
}

/**
 * Extract the content div from HTML.
 * On metruyenchuvn.com the content is inside <div class="truyen">
 */
function extractContentHtml(html) {
  // Primary: <div class="truyen"> – the main reading area on metruyenchuvn.com
  const truyenIdx = html.search(/<div[^>]+class=["'][^"']*\btruyen\b[^"']*["'][^>]*>/i);
  if (truyenIdx > -1) {
    // Extract all <p> tags from this point until the next nav/control div
    const afterDiv = html.slice(truyenIdx);
    const pTags = afterDiv.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    if (pTags.length > 0) return pTags.join('\n');
  }

  // Fallback selectors
  const selectors = [
    /<div[^>]+id="chapter-c"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="chapter-c[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+id="noi-dung"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*reading-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
  ];

  for (const re of selectors) {
    const m = html.match(re);
    if (m && m[1] && m[1].replace(/<[^>]+>/g, '').trim().length > 100) {
      return m[1];
    }
  }

  // Last resort: all <p> tags between h2 and next-chapter nav
  const bodyStart = html.search(/<h2[^>]*>/i);
  const navEnd = html.search(/ch[uư][oơ]ng\s+ti[eế]p/i);
  if (bodyStart > -1 && navEnd > bodyStart) {
    const segment = html.slice(bodyStart, navEnd);
    const pTags = segment.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    if (pTags.length > 0) return pTags.join('\n');
  }

  return '';
}

/**
 * Clean HTML content to plain text
 */
function cleanContent(html) {
  let text = html;
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Remove scripts and styles
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  // Convert <br> to newline
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Convert <p> closing to double newline
  text = text.replace(/<\/p>/gi, '\n');
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Normalize whitespace
  text = text.replace(/\t+/g, '');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Extract next chapter URL from HTML
 */
function extractNextChapterUrl(html, baseUrl) {
  // Primary: class='next' anchor (metruyenchuvn.com uses single quotes)
  const m1 = html.match(/<a[^>]+href=["']([^"']*chuong-[^"']+)["'][^>]+class=["'][^"']*next[^"']*["']/i)
    || html.match(/<a[^>]+class=["'][^"']*next[^"']*["'][^>]+href=["']([^"']*chuong-[^"']+)["']/i);
  if (m1) {
    const href = m1[1];
    return href.startsWith('http') ? href : new URL(href, baseUrl).href;
  }

  // Secondary: find "Chương tiếp" then look for preceding href (single or double quotes)
  const idx = html.search(/Ch[uư][oơ]ng\s+ti[eế]p/i);
  if (idx > -1) {
    const before = html.slice(Math.max(0, idx - 400), idx);
    const hrefMatch = before.match(/href=["']([^"']*chuong-[^"']+)["']/i);
    if (hrefMatch) {
      const href = hrefMatch[1];
      return href.startsWith('http') ? href : new URL(href, baseUrl).href;
    }
  }

  return null;
}

/**
 * Fetch a single chapter, returning { title, content, nextUrl, chapterNum }
 */
async function fetchChapter(url) {
  console.log(`\nFetching: ${url}`);
  const html = await fetchPage(url);

  const title = extractTitle(html);
  if (!title) console.warn('  ⚠ Không tìm thấy thẻ <h2>');
  else console.log(`  ✔ Title: ${title}`);

  const chapterNum = extractChapterNumber(getChapterSlug(url)) || extractChapterNumber(title);

  const contentHtml = extractContentHtml(html);
  if (!contentHtml) {
    console.error('  ✗ Không tìm thấy nội dung chương');
    return null;
  }

  const content = cleanContent(contentHtml);
  if (content.length < 50) {
    console.error('  ✗ Nội dung quá ngắn, có thể parse sai');
    return null;
  }

  console.log(`  ✔ Content: ${content.length} chars`);

  const nextUrl = extractNextChapterUrl(html, url);
  if (nextUrl) console.log(`  ✔ Next: ${nextUrl}`);
  else console.log(`  ℹ Không có chương tiếp theo`);

  return { title, content, nextUrl, chapterNum };
}

/**
 * Save content to file
 */
function saveToFile(outputFile, content) {
  const dir = path.dirname(outputFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputFile, content, 'utf-8');
  console.log(`  ✔ Saved: ${outputFile}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArg(args, name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultVal;
  const val = args[idx + 1];
  args.splice(idx, 2);
  return val;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node fetch-metruyenchuvn.js [options] <URL>');
    console.log('');
    console.log('Options:');
    console.log('  --out <dir>        Output directory (default: .)');
    console.log('  --delay <ms>       Delay between requests (default: 2000ms)');
    console.log('  --range <start-end> Fetch chapters from start to end number');
    console.log('  --count <n>        Fetch n chapters from starting URL');
    console.log('  --merge <n>        Merge n chapters into one file');
    console.log('');
    console.log('Examples:');
    console.log('  node fetch-metruyenchuvn.js --out content/thau-huong --range 2342-2400 https://metruyenchuvn.com/.../chuong-2342-xxx');
    console.log('  node fetch-metruyenchuvn.js --out content/thau-huong --count 5 https://metruyenchuvn.com/.../chuong-2342-xxx');
    process.exit(0);
  }

  const outputDir = parseArg(args, '--out', '.');
  const delay = parseInt(parseArg(args, '--delay', '2000'));
  const merge = parseInt(parseArg(args, '--merge', '0')) || 0;
  const range = parseArg(args, '--range', null);
  const count = parseInt(parseArg(args, '--count', '0')) || 0;

  const startUrl = args.find(a => a.startsWith('http'));
  if (!startUrl) {
    console.error('✗ Cần cung cấp URL bắt đầu');
    process.exit(1);
  }

  // Determine stop condition
  let rangeStart = null, rangeEnd = null;
  if (range) {
    [rangeStart, rangeEnd] = range.split('-').map(Number);
    console.log(`📚 Fetching chapters ${rangeStart}–${rangeEnd} → ${path.resolve(outputDir)}`);
  } else if (count > 0) {
    console.log(`📚 Fetching ${count} chapter(s) → ${path.resolve(outputDir)}`);
  } else {
    console.log(`📚 Fetching single chapter → ${path.resolve(outputDir)}`);
  }
  console.log(`⏱ Delay: ${delay}ms between requests`);
  if (merge > 1) console.log(`📦 Merge: ${merge} chương/file`);

  let currentUrl = startUrl;
  let fetched = 0;
  let success = 0;
  let fail = 0;
  const failedUrls = [];
  const mergeBuffer = [];  // for merge mode: { title, content, slug }[]

  const maxChapters = rangeEnd && rangeStart ? (rangeEnd - rangeStart + 1) : (count > 0 ? count : 1);

  while (currentUrl && fetched < maxChapters) {
    // Skip chapters before rangeStart
    const slugNum = extractChapterNumber(getChapterSlug(currentUrl));
    if (rangeStart && slugNum && slugNum < rangeStart) {
      console.log(`⏩ Skipping chapter ${slugNum} (before range start ${rangeStart})`);
      try {
        const html = await fetchPage(currentUrl);
        const nextUrl = extractNextChapterUrl(html, currentUrl);
        if (!nextUrl) break;
        currentUrl = nextUrl;
        await sleep(delay);
        continue;
      } catch (err) {
        console.error(`✗ Error fetching ${currentUrl}: ${err.message}`);
        break;
      }
    }

    let result = null;
    try {
      result = await fetchChapter(currentUrl);
    } catch (err) {
      console.error(`✗ Error: ${err.message}`);
      fail++;
      failedUrls.push(currentUrl);
      // Try to continue if we have a predictable next URL - we don't, so stop
      break;
    }

    fetched++;

    if (!result) {
      fail++;
      failedUrls.push(currentUrl);
    } else {
      const slug = getChapterSlug(currentUrl);

      if (merge > 1) {
        mergeBuffer.push({ title: result.title, content: result.content, slug });
        success++;

        if (mergeBuffer.length === merge || fetched === maxChapters) {
          // Save merged file
          const firstSlug = mergeBuffer[0].slug;
          const lastSlug = mergeBuffer[mergeBuffer.length - 1].slug;
          const firstNum = firstSlug.match(/\d+/)?.[0];
          const lastNum = lastSlug.match(/\d+/)?.[0];
          const fileName = firstNum && lastNum
            ? `chuong-${firstNum}-${lastNum}.txt`
            : `${firstSlug}-to-${lastSlug}.txt`;
          const separator = '\n\n' + '='.repeat(60) + '\n\n';
          const merged = mergeBuffer.map(b => `${b.title}\n${b.content}`).join(separator);
          saveToFile(path.join(outputDir, fileName), merged);
          mergeBuffer.length = 0;
        }
      } else {
        // Save individual file
        const outputFile = path.join(outputDir, `${slug}.txt`);
        saveToFile(outputFile, `${result.title}\n${result.content}`);
        success++;
      }

      // Stop if reached end of range
      if (rangeEnd && result.chapterNum && result.chapterNum >= rangeEnd) {
        console.log(`\n✔ Reached end of range (chapter ${result.chapterNum})`);
        break;
      }

      currentUrl = result.nextUrl;
    }

    if (currentUrl && fetched < maxChapters) await sleep(delay);
  }

  // Save any remaining merge buffer
  if (merge > 1 && mergeBuffer.length > 0) {
    const firstSlug = mergeBuffer[0].slug;
    const lastSlug = mergeBuffer[mergeBuffer.length - 1].slug;
    const firstNum = firstSlug.match(/\d+/)?.[0];
    const lastNum = lastSlug.match(/\d+/)?.[0];
    const fileName = firstNum && lastNum
      ? `chuong-${firstNum}-${lastNum}.txt`
      : `${firstSlug}-to-${lastSlug}.txt`;
    const separator = '\n\n' + '='.repeat(60) + '\n\n';
    const merged = mergeBuffer.map(b => `${b.title}\n${b.content}`).join(separator);
    saveToFile(path.join(outputDir, fileName), merged);
  }

  console.log(`\n✔ Done: ${success} OK, ${fail} failed`);
  if (merge > 1) console.log(`📦 Files: ${Math.ceil(success / merge)} merged files`);
  if (failedUrls.length > 0) {
    console.log('\n✗ Failed chapters:');
    failedUrls.forEach(u => console.log(`  ${u}`));
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
