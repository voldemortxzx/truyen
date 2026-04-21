/**
 * Script để extract chapters từ file .docx
 * Chạy: node scripts/extract-docx.js <docx-file> <output-folder> <story-title>
 * 
 * Ví dụ:
 * node scripts/extract-docx.js "Tam Thốn Nhân Gian C887-end.docx" "public/data/content/tam-thon-nhan-gian" "Tam Thốn Nhân Gian"
 */

const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

async function extractDocx(docxPath, outputDir, storyTitle) {
  try {
    // Kiểm tra file tồn tại
    if (!fs.existsSync(docxPath)) {
      console.error(`❌ File không tồn tại: ${docxPath}`);
      process.exit(1);
    }

    // Đọc file docx
    console.log(`📖 Đang đọc file: ${docxPath}`);
    const result = await mammoth.extractRawText({ path: docxPath });
    const text = result.value;
    const messages = result.messages;

    if (messages.length > 0) {
      console.log('⚠️  Cảnh báo trong quá trình đọc:');
      messages.forEach(msg => console.log(`   - ${msg.message}`));
    }

    // Tạo folder output nếu chưa tồn tại
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 Tạo folder: ${outputDir}`);
    }

    // Phân tách chapters - tìm pattern heading/chapters
    // Giả sử mỗi chapter bắt đầu bằng "Chương X" hoặc tương tự
    const lines = text.split(/\r?\n/);
    
    let chapters = [];
    let currentChapter = null;
    let chapterCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Kiểm tra xem dòng này có phải là tiêu đề chương không
      // Pattern: Chương 1, Chương 2, Chapter 1, etc.
      if (/^(chương|chapter|ch\.?|c\.)\s*(\d+|[ivxlcdm]+)/i.test(line)) {
        // Lưu chapter trước đó
        if (currentChapter) {
          chapters.push(currentChapter);
        }

        chapterCount++;
        currentChapter = {
          number: chapterCount,
          title: line,
          content: [line]
        };
      } else if (currentChapter) {
        currentChapter.content.push(line);
      }
    }

    // Lưu chapter cuối cùng
    if (currentChapter) {
      chapters.push(currentChapter);
    }

    // Nếu không tìm thấy chapters, bảng như file không có cấu trúc
    if (chapters.length === 0) {
      console.warn('⚠️  Không tìm thấy cấu trúc chapter, sẽ tạo file đơn giản...');
      const filename = path.join(outputDir, 'chuong-1.txt');
      fs.writeFileSync(filename, text, 'utf-8');
      console.log(`✔ Đã tạo: ${filename}`);
      return;
    }

    // Lưu từng chapter thành file
    console.log(`\n📝 Đang tạo ${chapters.length} file chương...`);
    chapters.forEach(chapter => {
      const paddedNum = String(chapter.number).padStart(3, '0');
      const filename = path.join(outputDir, `chuong-${chapter.number}.txt`);
      const content = chapter.content.join('\n').trim();
      
      fs.writeFileSync(filename, content, 'utf-8');
      console.log(`   ✔ ${path.basename(filename)} (${chapter.title})`);
    });

    console.log(`\n✅ Hoàn tất! Đã tạo ${chapters.length} file chương trong ${outputDir}`);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    process.exit(1);
  }
}

// Lấy arguments từ command line
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('❌ Sử dụng: node scripts/extract-docx.js <docx-file> <output-folder> [story-title]');
  console.error('Ví dụ: node scripts/extract-docx.js "Tam Thốn Nhân Gian.docx" "public/data/content/tam-thon-nhan-gian"');
  process.exit(1);
}

const docxFile = args[0];
const outputFolder = args[1];
const storyTitle = args[2] || 'Story';

extractDocx(docxFile, outputFolder, storyTitle);
