# Migration to Server-Side Rendering (SSR)

## 📋 Giới thiệu

Dự án của bạn đã được cấu hình để hỗ trợ **Static Prerendering** - một dạng của Server-Side Rendering (SSR). Điều này có nghĩa là các trang HTML sẽ được sinh ra lúc build time thay vì lúc runtime.

### Lợi ích:
- ✅ **SEO tốt hơn** - Các trang HTML tĩnh được index dễ dàng bởi search engines
- ✅ **Tốc độ tải trang nhanh hơn** - HTML được serve trực tiếp thay vì phải render ở browser
- ✅ **Vẫn dùng GitHub Pages** - Không cần đổi hosting, vì đây là static files

### Cách nó hoạt động:
1. Build Angular app cho **cả browser lẫn server**
2. Script prerender tạo static HTML files từ template
3. Mỗi file HTML chứa enhanced meta tags (OG tags, descriptions, etc.)
4. Dùng hash-based routing để navigate trong app (`#/truyen/...`)

---

## 🚀 Cách sử dụng

### 1. **Cài dependencies**
```bash
npm install
```

### 2. **Build và Prerender**
```bash
npm run prerender
```

Hoặc từng bước:
```bash
npm run build:ssr    # Build browser + server
npm run prerender    # Generate static HTML files
```

### 3. **Test locally** (tùy chọn)
```bash
npm run build
npm start    # Serve from docs folder
```

---

## 📁 Các files được thêm/sửa

### Được thêm:
- `src/main.server.ts` - Server entry point
- `src/app/app.server.ts` - Server bootstrap
- `src/index-server.html` - Server HTML template
- `scripts/prerender.js` - Script sinh static HTML
- `server.ts` - Express server (tùy chọn)

### Được sửa:
- `angular.json` - Thêm server config
- `package.json` - Thêm dependencies + mới scripts

---

## 🔧 Cấu hình chi tiết

### angular.json
```json
{
  "build": {
    "options": {
      "server": "src/main.server.ts",      // Server entry point
      "prerender": true,                   // Enable prerendering
      "prerenderRoutes": ["/"]             // Routes to prerender
    }
  }
}
```

### Scripts mới
- `npm run build:ssr` - Build cho browser + server
- `npm run prerender` - Tạo static HTML files cho tất cả routes

---

## 📊 Kết quả

Sau khi chạy `npm run prerender`, bạn sẽ có:

```
docs/
  ├── index.html                          (Home page)
  ├── ban-nang-dan-ba/
  │   ├── index.html                     (Story list)
  │   ├── chuong-1.html                  (Chapter 1)
  │   ├── chuong-2.html                  (Chapter 2)
  │   └── ...
  ├── co-giao-thu/
  │   ├── index.html
  │   ├── chuong-1.html
  │   └── ...
  └── ...
```

**Mỗi HTML file sẽ có:**
- ✅ Proper `<title>` tag
- ✅ Meta descriptions
- ✅ OpenGraph tags (for social sharing)
- ✅ SEO-optimized structure

---

## 🎯 Deploy

### GitHub Pages
Không cần thay đổi gì - deploy bình thường:
```bash
npm run prerender
git add docs/
git commit -m "build: prerender static pages"
git push
```

### Vercel / Netlify (tùy chọn)
Nếu muốn dùng full SSR với server:
```bash
npm run build:ssr
npm run serve:ssr    # Chạy server version
```

---

## ⚠️ Lưu ý quan trọng

1. **Build time**: Với hàng trăm chapters, prerender sẽ mất 1-2 phút. Điều này là bình thường.

2. **Dynamic content**: Nếu bạn thêm chapters mới, phải chạy lại `npm run prerender`.

3. **Hash routing**: App vẫn dùng `#/truyen/...` routing, điều này hoạt động tốt với static files.

4. **Data files**: JSON files trong `public/data/` vẫn được load lúc runtime, giúp app chạy mượt mà hơn.

---

## 🔍 Troubleshooting

### Error: "Template not found"
```bash
npm run build:ssr   # Build first
npm run prerender   # Then prerender
```

### Files không được sinh ra
- Kiểm tra `public/data/stories-full.json` có tồn tại
- Chạy: `npm run generate` để tạo data files

### Performance chậm
- Prerendering hàng trăm files là bình thường
- Có thể cache kết quả để tăng tốc độ

---

## 📞 Support

Nếu gặp vấn đề:
1. Check console output từ `npm run prerender`
2. Verify `dist/web/browser/index.html` tồn tại
3. Check `public/data/stories-full.json` format

---

**✨ Enjoy your new SSR setup!**
