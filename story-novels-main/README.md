# Story Novels Extension - Công Cụ Cứu Hộ Tủ Truyện 📚

Extension Chrome/Edge mạnh mẽ giúp bạn sao lưu danh sách truyện từ các nền tảng cũ và tự động tìm nguồn mới (nhà mới) trên internet. Giao diện hiện đại, tối ưu cho trải nghiệm người dùng với "Power by NHTS".

---

## 🚀 Hướng Dẫn Cài Đặt (Cho người dùng Chrome/Edge)

Vì extension đang trong quá trình phát triển (dạng Dev), bạn cần cài đặt thủ công theo các bước sau:

1.  **Tải mã nguồn**: 
    - Click nút **Code** -> **Download ZIP** và giải nén.
    - Hoặc dùng git: `git clone https://github.com/nhts2004/Story-novels.git` (nếu bạn có link git).
2.  **Truy cập trang quản lý Extension**:
    - Mở Chrome/Edge và nhập địa chỉ: `chrome://extensions/`
3.  **Bật Chế độ nhà phát triển (Developer Mode)**:
    - Tìm công tắc **Developer mode** ở góc trên bên phải màn hình và bật nó lên.
4.  **Cài đặt Extension**:
    - Click vào nút **Load unpacked** (Tải tiện ích đã giải nén).
    - Chọn thư mục `Story-novels` (thư mục chứa file `manifest.json`).
5.  **Ghim Extension**:
    - Click vào biểu tượng mảnh ghép (Extensions) trên thanh công cụ trình duyệt.
    - Tìm "Story Novels" và nhấn icon 📌 để ghim ra ngoài cho dễ sử dụng.

---

## 📖 Hướng Dẫn Sử Dụng

### 1. Mở Giao Diện Side Panel
- Click vào icon extension trên thanh công cụ. Một bảng điều khiển (Side Panel) sẽ hiện ra ở bên phải trình duyệt.

### 2. Nạp Dữ Liệu Ban Đầu
- **Cách 1: Nhập file CSV**: Nhấn nút **📂 (Import)** để chọn file CSV lưu trong máy tính của bạn.
- **Cách 2: Quét trực tiếp**: Nếu trang nguồn còn hoạt động, truy cập trang tủ truyện (ví dụ: `https://metruyencv.com/tai-khoan/tu-truyen`) và nhấn **"Quét Trang-Lấy truyện"**.

---

## 📊 Cấu Trúc File CSV Chuẩn

Để đảm bảo extension hoạt động chính xác khi nhập file (Import), file CSV của bạn cần có cấu trúc như sau (dựa theo mẫu `list_truyen.csv`):

**Tiêu đề (Header):**
`Tên Truyện,Link Gốc,Chương Đang Đọc,Tổng Chương,Ảnh,Link Mới`

**Ví dụ:**
```csv
"Tên Truyện","https://metruyencv.com/truyen/...","0","0","https://.../150.jpg",""
```

*Lưu ý: Các trường dữ liệu nên được đặt trong dấu ngoặc kép `""` để tránh lỗi định dạng khi tên truyện chứa ký tự đặc biệt.*

---

### 3. Tìm "Nhà Mới" Tự Động
- **Tìm từng truyện**: Nhấn nút **🔍 Tìm** trên thẻ truyện tương ứng.
- **Tìm hàng loạt**: Nhấn nút **🔍 Tìm Tất Cả** ở phía dưới cùng.
    - Hệ thống sẽ tự động mở Google để tìm kiếm nguồn từ các trang uy tín (TruyenFull, WikiDich, SangTacViet...).
    - **Lưu ý**: Hệ thống sẽ mở tab tìm kiếm và tự động đóng sau khi lấy được dữ liệu. Vui lòng không tắt trình duyệt trong quá trình này.

### 4. Lưu Trữ Dữ Liệu
- **Lưu ảnh bìa**: Nhấn nút **💾 (Save Images)** để lưu toàn bộ ảnh bìa truyện xuống bộ nhớ local của máy, giúp hiển thị nhanh hơn và không lo mất ảnh.
- **Xuất file CSV**: Nhấn **"Xuất CSV Mới"** để tải về danh sách truyện đã kèm theo link mới tìm được.

---

## ✨ Điểm Đặc Biệt
- **Get truyện từ trang web**: Lấy truyện từ trang metruyencv tự động.
- **Dark Mode**: Giao diện tối mượt mà, bảo vệ mắt khi sử dụng ban đêm.
- **Fuzzy Search**: Tìm kiếm truyện trong danh sách cực nhanh và thông minh.
- **Tìm kiếm đa nguồn**: Tìm kiếm truyện từ các trang web khác nhau (TruyenFull, WikiDich, SangTacViet...).
---

## 🛠 Cấu Trúc Dự Án
- `manifest.json`: Cấu hình quyền và thành phần extension.
- `service_worker.js`: Xử lý ngầm, quản lý database, tìm kiếm tự động.
- `sidepanel/`: Layout và logic của bảng điều khiển bên phải.
- `content_scripts/`: Các bộ điều hợp (adapter) để quét dữ liệu từ các trang web.
- `lib/`: Các thư viện hỗ trợ xử lý ảnh, URL và cache.

---
*Chúc bạn tìm lại được tủ truyện yêu thích của mình!*
