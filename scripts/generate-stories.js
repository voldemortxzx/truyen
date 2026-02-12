/**
 * Script quét folder content/, đọc danh sách chương từ các file .txt,
 * và sinh ra file stories-full.json hoàn chỉnh.
 *
 * Quy ước:
 *   - Dòng đầu tiên của mỗi file .txt là tên chương
 *   - File được sắp xếp theo tên (chuong-1.txt, chuong-2.txt, ...)
 *
 * Chạy: node scripts/generate-stories.js
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const contentDir = path.join(dataDir, 'content');
const storiesFile = path.join(dataDir, 'stories.json');
const outputFile = path.join(dataDir, 'stories-full.json');

// Đọc danh sách truyện cơ bản
const stories = JSON.parse(fs.readFileSync(storiesFile, 'utf-8'));

const result = stories.map(story => {
  const storyDir = path.join(contentDir, story.folder);

  if (!fs.existsSync(storyDir)) {
    console.warn(`⚠ Folder không tồn tại: ${story.folder}`);
    return { ...story, chapters: [] };
  }

  // Lọc file .txt và sắp xếp theo số chương
  const files = fs.readdirSync(storyDir)
    .filter(f => f.endsWith('.txt'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  const chapters = files.map((file, index) => {
    const filePath = path.join(storyDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const firstLine = content.split(/\r?\n/)[0].trim();

    return {
      id: index + 1,
      title: firstLine || `Chương ${index + 1}`,
      file: file
    };
  });

  return { ...story, chapters };
});

fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');
console.log(`✔ Đã sinh ${outputFile}`);
console.log(`  Tổng: ${result.length} truyện, ${result.reduce((s, r) => s + r.chapters.length, 0)} chương`);
