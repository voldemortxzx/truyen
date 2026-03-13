# ✅ SSR Migration Checklist & Summary

## 📝 Tóm tắt thay đổi

### Được thêm/sửa trong `package.json`:
```diff
"scripts": {
  ...
+ "build:ssr": "ng build && ng run web:server",
+ "prerender": "npm run build:ssr && node scripts/prerender.js",
}

"dependencies": {
+ "@angular/platform-server": "^21.1.0",
+ "@angular/ssr": "^21.1.0",
+ "express": "^4.18.2",
}

"devDependencies": {
+ "@types/express": "^4.17.21",
+ "@types/node": "^20.10.6",
}
```

### Được thêm/sửa trong `angular.json`:
```diff
"build": {
  "options": {
+   "server": "src/main.server.ts",
+   "prerender": true,
+   "prerenderRoutes": ["/"]
  }
}
```

---

## 📂 Files được tạo mới

| File | Mục đích |
|------|---------|
| `src/main.server.ts` | Server entry point cho SSR |
| `src/app/app.server.ts` | Server-side bootstrap |
| `src/index-server.html` | HTML template cho server |
| `scripts/prerender.js` | Script sinh static HTML |
| `server.ts` | Express server (tùy chọn) |
| `SSR_GUIDE.md` | Hướng dẫn chi tiết |
| `setup-ssr.sh` | Setup script (Linux/Mac) |
| `setup-ssr.bat` | Setup script (Windows) |

---

## 🎯 Các bước tiếp theo

### Bước 1: Cài Node.js (nếu chưa có)
Tải từ: https://nodejs.org/ (LTS version)

### Bước 2: Cài dependencies
```bash
npm install
```

### Bước 3: Build & Prerender (chọn 1 cách)

**Cách 1: Automatic (đơn giản nhất)**
```bash
# Windows
setup-ssr.bat

# Linux/Mac
bash setup-ssr.sh
```

**Cách 2: Manual (bước này)**
```bash
npm run generate      # Tạo data files
npm run build:ssr     # Build browser + server
npm run prerender     # Sinh static HTML
```

### Bước 4: Verify kết quả
```bash
# Kiểm tra docs/ folder
ls docs/              # Có index.html + story folders?

# Test locally
npm start
# Mở: http://localhost:4200/truyen
```

### Bước 5: Deploy
```bash
git add -A
git commit -m "chore: configure static prerendering"
git push
```

---

## 🔍 Kiểm tra công việc

✅ **Kiểm tra sau khi build:**

- [ ] `dist/web/browser/index.html` tồn tại
- [ ] `dist/web/server/main.js` tồn tại (nếu build server)
- [ ] `docs/index.html` được sinh ra
- [ ] `docs/[story-folder]/index.html` tồn tại
- [ ] `docs/[story-folder]/chuong-*.html` được sinh ra

✅ **Kiểm tra HTML files:**
```bash
# Windows PowerShell
(Get-Content docs/index.html) | Select-String '<title>' -First 1

# Linux/Mac
head -50 docs/index.html | grep -E '<title>|<meta'
```

---

## 📊 Kỳ vọng kết quả

Sau khi prerender thành công:

```
📊 Prerendering [với số routes]...
  ✓ index.html
  ✓ ban-nang-dan-ba/index.html
  ✓ ban-nang-dan-ba/chuong-1.html
  ✓ ban-nang-dan-ba/chuong-2.html
  ... (hàng trăm files)

✅ Prerender complete!
   Generated: [số files] static HTML files
   Time: [seconds]s
   Output: E:\Programming\truyen\docs
```

---

## ⚠️ Thường gặp

| Vấn đề | Giải pháp |
|--------|----------|
| "npm: command not found" | Cài Node.js từ nodejs.org |
| "Template not found error" | Chạy `npm run build:ssr` trước |
| Build quá lâu | Bình thường với ~500+ files |
| Meta tags không hiển thị | Check `scripts/prerender.js` |

---

## 📚 Thêm tài liệu

- Hướng dẫn chi tiết: `SSR_GUIDE.md`
- Angular SSR docs: https://angular.io/guide/ssr
- Prerendering: https://angular.io/guide/prerendering

---

## 🎉 Hoàn thành!

Sau khi hoàn tất các bước, dự án của bạn sẽ:
- ✅ Render HTML ở server (lúc build time)
- ✅ Có SEO tốt hơn với proper meta tags
- ✅ Tải nhanh hơn cho users
- ✅ Vẫn hoạt động tốt trên GitHub Pages

**Happy coding! 🚀**
