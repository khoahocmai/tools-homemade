# Library Modules

Thư mục này chứa các module được tách ra từ `service_worker.js` để dễ bảo trì.

## Cấu trúc

### `image_cache.js`
- **ImageCache class**: Quản lý cache ảnh bìa truyện trong IndexedDB
- **Exports**: `imageCache` (instance), `IMG_CACHE_DB` (constant)
- **Methods**:
  - `init()`: Khởi tạo IndexedDB
  - `saveImage(url, base64Data)`: Lưu ảnh
  - `getImage(url)`: Lấy ảnh đã cache
  - `deleteImage(url)`: Xóa ảnh
  - `downloadAndCache(url)`: Download và cache ảnh

### `db.js`
- **Database helpers**: Quản lý chrome.storage.local
- **Exports**: `loadDB()`, `saveDB()`, `upsertStories()`, `STORE_KEY`
- **Features**:
  - Auto migration & cleaning (chống trùng lặp)
  - Normalize URLs tự động
  - Merge duplicate stories

### `url_utils.js`
- **URL utilities**: Chuẩn hóa URL và tạo slug
- **Exports**: `normalizeUrl()`, `createSlug()`
- **Features**:
  - Normalize protocol, host, path
  - Remove trailing slashes
  - Vietnamese slug generation

### `link_checker.js`
- **Link checking & search**: Kiểm tra link sống và tìm kiếm nâng cao
- **Exports**: `checkUrlAlive()`, `findAllCandidates()`
- **Features**:
  - **Parallel search**: Direct links + Search by name chạy song song
  - **9 sources**: 6 direct sites + 3 search sites
  - **Smart detection**: Phát hiện 404, redirect, error pages

## Flow tìm kiếm

```
findAllCandidates(storyName)
    ↓
Promise.allSettled([
    // Direct links (6 sites)
    checkDirectLink(xtruyen.vn/truyen/{slug}),
    checkDirectLink(metruyenchu.com.vn/{slug}),
    checkDirectLink(tangthuvien.net/doc-truyen/{slug}),
    checkDirectLink(truyenchuth.info/truyen-{slug}),
    checkDirectLink(truyenaudiocv.org/{slug}),
    checkDirectLink(bachngocsach.com.vn/truyen/{slug}),
    
    // Search by name (3 sites)
    searchChivi(storyName),
    searchTiemTruyenChu(storyName),
    searchSangTacViet(storyName)
])
    ↓
Merge results, remove duplicates
    ↓
Return candidates[]
```

## Import trong service_worker.js

```javascript
import { imageCache, IMG_CACHE_DB } from './lib/image_cache.js';
import { normalizeUrl, createSlug } from './lib/url_utils.js';
import { loadDB, saveDB, upsertStories, STORE_KEY } from './lib/db.js';
import { findAllCandidates } from './lib/link_checker.js';
```

## Lưu ý

- Tất cả modules sử dụng **ES Module** syntax (`export`/`import`)
- `manifest.json` phải có `"type": "module"` trong `background` config
- `scanController()` và `runTestClickMode()` vẫn giữ inline trong `service_worker.js` vì chúng được inject vào page
