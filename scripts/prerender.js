const fs = require('fs');
const path = require('path');

// Prerender configuration
const basePath = '/truyen/';
const outputDir = path.join(__dirname, '../docs');
const templatePath = path.join(__dirname, '../docs/index.html');

/**
 * Generate enhanced meta tags for a page
 */
function generateMetaTags(title, description = '', ogImage = '') {
  return `<meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta name="description" content="${escapeHtml(description)}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
  <meta property="og:url" content="https://example.com${basePath}">
  <meta property="og:type" content="website">`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Generate static HTML files with enhanced meta tags
 */
function prerender() {
  try {
    if (!fs.existsSync(templatePath)) {
      console.error(`❌ Template not found: ${templatePath}`);
      console.log('Please run: npm run build:ssr');
      process.exit(1);
    }

    let template = fs.readFileSync(templatePath, 'utf-8');

    // Load stories data
    const storiesPath = path.join(__dirname, '../public/data/stories-full.json');
    const stories = JSON.parse(fs.readFileSync(storiesPath, 'utf-8'));

    const routes = [
      {
        path: 'index.html',
        title: 'Truyện Online - Thư Viện Truyện Hay',
        description: 'Đọc truyện online miễn phí. Thư viện truyện đa dạng với hàng ngàn tác phẩm.'
      }
    ];

    // Add story routes
    stories.forEach(story => {
      const storyDir = path.join(outputDir, story.folder);
      if (!fs.existsSync(storyDir)) {
        fs.mkdirSync(storyDir, { recursive: true });
      }

      routes.push({
        path: path.join(story.folder, 'index.html'),
        title: story.title,
        description: `Đọc ${story.title} online. ${story.chapters.length} chương.`,
        hash: `#/truyen/${story.folder}`
      });

      // Add chapter routes
      story.chapters.forEach(chapter => {
        const chapterSlug = chapter.file.replace('.txt', '');
        routes.push({
          path: path.join(story.folder, `${chapterSlug}.html`),
          title: `${story.title} - ${chapter.title}`,
          description: `${story.title} - ${chapter.title}. Đọc chapter này online.`,
          hash: `#/truyen/${story.folder}/${chapterSlug}`
        });
      });
    });

    console.log(`📄 Prerendering ${routes.length} pages with enhanced meta tags...\n`);

    let successCount = 0;
    const startTime = Date.now();

    // Generate each route
    for (const route of routes) {
      let html = template;

      // Add title
      html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(route.title)}</title>`);

      // Add meta tags
      const metaTags = generateMetaTags(
        route.title,
        route.description || ''
      );
      html = html.replace(
        /<meta name="viewport"[^>]*>/,
        `$&\n  ${metaTags}`
      );

      // Write file
      const filePath = path.join(outputDir, route.path);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, html, 'utf-8');
      successCount++;

      const shortPath = route.path.replace(/\\/g, '/');
      console.log(`  ✓ ${shortPath}`);
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Prerender complete!`);
    console.log(`   Generated: ${successCount} static HTML files`);
    console.log(`   Time: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   Output: ${outputDir}`);
  } catch (error) {
    console.error('❌ Prerender error:', error.message);
    process.exit(1);
  }
}

// Run prerender
prerender();
