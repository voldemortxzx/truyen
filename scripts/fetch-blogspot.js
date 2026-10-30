// Fetch truyện từ một blog Blogspot (lấy danh sách bài qua sitemap.xml)
// Mỗi --group "folder=regex" gom các bài có tiêu đề khớp regex vào một thư mục truyện.
// Chạy lại sẽ tải lại toàn bộ (ghi đè), nên cũng lấy được chương mới.
// Usage:
//   node scripts/fetch-blogspot.js https://abc.blogspot.com \
//     --group "local-my-daisy=my daisy" --group "local-phan-1=đã từng\s*-\s*chap"

const https = require('https');
const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '..', 'public', 'data', 'content');

function fetchPage(url, retries = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location, retries).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  }).catch(async (err) => {
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return fetchPage(url, retries - 1);
  });
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

async function fetchPostUrls(blogUrl) {
  const urls = [];
  for (let page = 1; ; page++) {
    const xml = await fetchPage(`${blogUrl}/sitemap.xml?page=${page}`);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (!locs.length) break;
    urls.push(...locs);
  }
  return urls;
}

function extractPost(html) {
  const titleMatch = html.match(/<h3 class='post-title entry-title'[^>]*>([\s\S]*?)<\/h3>/);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '')).trim() : '';

  const start = html.search(/<div class='post-body entry-content'/);
  if (start < 0) return { title, body: '' };
  const end = html.indexOf("<div class='post-footer'", start);
  let body = html.slice(start, end > 0 ? end : undefined);

  body = body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  body = decodeEntities(body)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n\n');
  return { title, body };
}

function chapterNumber(title) {
  const m = title.match(/(?:chap|chương|chuong)\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const blogUrl = args.find((a) => a.startsWith('http'))?.replace(/\/$/, '');
  const groups = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--group') {
      const [folder, ...rest] = args[++i].split('=');
      groups.push({ folder, regex: new RegExp(rest.join('='), 'i') });
    }
  }
  if (!blogUrl || !groups.length) {
    console.error('Usage: node scripts/fetch-blogspot.js <blogUrl> --group "folder=regex" [...]');
    process.exit(1);
  }

  const urls = await fetchPostUrls(blogUrl);
  console.log(`Tìm thấy ${urls.length} bài trong sitemap`);

  // Tải song song vài bài một lúc
  const posts = [];
  let done = 0;
  const queue = [...urls];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const post = extractPost(await fetchPage(url));
        posts.push({ url, ...post });
      } catch (err) {
        console.warn(`  ✗ ${err.message}`);
      }
      if (++done % 25 === 0) console.log(`  ... ${done}/${urls.length}`);
    }
  }));

  const skipped = [];
  for (const group of groups) {
    const outDir = path.join(contentDir, group.folder);
    fs.mkdirSync(outDir, { recursive: true });
    const matched = posts
      .filter((p) => group.regex.test(p.title))
      .sort((a, b) => (chapterNumber(a.title) ?? 0) - (chapterNumber(b.title) ?? 0) || a.url.localeCompare(b.url));

    const used = new Set();
    let written = 0;
    for (const post of matched) {
      post.grouped = true;
      const num = chapterNumber(post.title) ?? 0;
      // Hai bài trùng số chương thì thêm hậu tố b, c, ...
      let file = `chuong-${num}.txt`;
      for (let s = 98; used.has(file); s++) file = `chuong-${num}${String.fromCharCode(s)}.txt`;
      used.add(file);
      if (!post.body) {
        console.warn(`  ⚠ Không có nội dung: ${post.url}`);
        continue;
      }
      fs.writeFileSync(path.join(outDir, file), `${post.title}\n\n${post.body}\n`, 'utf-8');
      written++;
    }
    console.log(`✔ ${group.folder}: ${written} chương`);
  }

  for (const p of posts) if (!p.grouped) skipped.push(p);
  if (skipped.length) {
    console.log(`Bỏ qua ${skipped.length} bài không thuộc nhóm nào:`);
    skipped.forEach((p) => console.log(`  - ${p.title} (${p.url})`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
