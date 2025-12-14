# 🔧 HƯỚNG DẪN SETUP CONFIG BÊN THỨ 3

## 📋 Tổng quan các bug liên quan config bên thứ 3

| Bug | Vấn đề | Service hiện tại | Service thay thế (FREE) |
|-----|--------|------------------|-------------------------|
| **Lỗi 7** | Upload tài liệu lỗi 401 | Bunny CDN (trả phí) | **Cloudinary** (Free) |
| Lỗi 8 | Đính kèm tài liệu BTVN | Phụ thuộc Lỗi 7 | Cloudinary |
| Lỗi 11 | Hiển thị tài liệu BTVN | Phụ thuộc Lỗi 7 | Cloudinary |
| Lỗi 12 | Tab tài liệu học tập | Phụ thuộc Lỗi 7 | Cloudinary |

---

## 🎯 GIẢI PHÁP: SỬ DỤNG CLOUDINARY (FREE)

### Tại sao chọn Cloudinary?
- ✅ **Hoàn toàn MIỄN PHÍ** - không cần credit card
- ✅ Free tier: 25GB storage + 25GB bandwidth/tháng
- ✅ Hỗ trợ upload từ browser trực tiếp (không cần backend)
- ✅ CDN tự động
- ✅ Hỗ trợ mọi loại file (PDF, Word, Excel, images, v.v.)
- ✅ API đơn giản, dễ implement

---

## 📝 BƯỚC 1: TẠO TÀI KHOẢN CLOUDINARY (5 phút)

### 1.1. Đăng ký tài khoản

1. Truy cập: https://cloudinary.com/users/register/free
2. Điền thông tin:
   - Email: email của bạn
   - Password: mật khẩu mạnh
   - Cloud Name: **chọn tên duy nhất** (VD: `tritue-edu`, `learning-center-docs`)
     - ⚠️ **QUAN TRỌNG**: Tên này không thể đổi sau này, chọn kỹ!
3. Click "Create Account"
4. Xác nhận email (check inbox/spam)

### 1.2. Lấy thông tin credentials

Sau khi đăng nhập, vào Dashboard:

1. Vào **Dashboard** (trang chủ sau khi login)
2. Tìm phần **"Product Environment Credentials"**
3. Copy các thông tin sau:

```
Cloud Name: tritue-edu (ví dụ)
API Key: 123456789012345
API Secret: AbCdEfGhIjKlMnOpQrStUvWxYz
```

📸 **Hình ảnh tham khảo vị trí lấy credentials:**
```
┌─────────────────────────────────────┐
│ Dashboard > Product Environment     │
│                                     │
│ Cloud Name:    tritue-edu          │
│ API Key:       123456789012345      │
│ API Secret:    ****************     │ <- Click "Reveal" để xem
│                                     │
└─────────────────────────────────────┘
```

---

## 📝 BƯỚC 2: CẤU HÌNH UPLOAD PRESET (BẮT BUỘC)

Upload Preset cho phép upload từ browser mà không cần API Secret.

### 2.1. Tạo Upload Preset

1. Vào **Settings** (icon bánh răng góc trên phải)
2. Chọn tab **Upload**
3. Scroll xuống phần **"Upload presets"**
4. Click **"Add upload preset"**

### 2.2. Cấu hình preset

**Cài đặt cơ bản:**
- **Preset name**: `class_documents` (tên tùy chọn)
- **Signing Mode**: Chọn **"Unsigned"** ⚠️ (QUAN TRỌNG)
- **Use filename**: Bật ON (để giữ tên file gốc)
- **Unique filename**: Bật ON (để tránh trùng lặp)
- **Folder**: `class-documents` (thư mục mặc định)

**Cài đặt nâng cao (tùy chọn):**
- **Access mode**: Public (để link có thể truy cập)
- **Resource type**: Auto (tự động detect)

### 2.3. Lưu lại preset

Click **Save** ở góc trên phải.

📸 **Tóm tắt:**
```
Upload Preset Settings:
├── Preset name: class_documents
├── Signing Mode: Unsigned ✓
├── Use filename: ON
├── Unique filename: ON
└── Folder: class-documents
```

---

## 📝 BƯỚC 3: CẤU HÌNH TRONG CODE

### 3.1. Tạo file `.env.local` (nếu chưa có)

Tạo file `.env.local` ở root project với nội dung:

```bash
# Cloudinary Configuration
VITE_CLOUDINARY_CLOUD_NAME=tritue-edu
VITE_CLOUDINARY_UPLOAD_PRESET=class_documents
```

⚠️ **Thay thế**:
- `tritue-edu` → Cloud Name của bạn (từ Bước 1.2)
- `class_documents` → Upload Preset name của bạn (từ Bước 2.2)

### 3.2. Restart dev server

```bash
# Stop server (Ctrl+C)
# Start lại
npm run dev
```

---

## 📝 BƯỚC 4: KIỂM TRA CẤU HÌNH

### 4.1. Test upload trong code

Sau khi implement file `cloudinaryStorage.ts`, test bằng cách:

1. Vào trang có chức năng upload (VD: "Lớp học của tôi" > "Thêm tài liệu")
2. Upload 1 file thử nghiệm (PDF, Word, hoặc ảnh)
3. Check console log để xem kết quả

### 4.2. Verify trên Cloudinary Dashboard

1. Vào Cloudinary Dashboard
2. Click **Media Library** (menu bên trái)
3. Check thư mục `class-documents`
4. File vừa upload phải xuất hiện ở đây

---

## 📝 BƯỚC 5: GHI CHÚ QUAN TRỌNG

### ⚠️ Lưu ý bảo mật

**KHÔNG BAO GIỜ** commit các thông tin sau lên Git:
- ❌ API Secret
- ❌ File `.env.local`

**Đã được gitignore:**
```gitignore
.env.local
.env*.local
```

### 📊 Giới hạn Free Tier

Cloudinary Free tier:
- ✅ 25GB storage
- ✅ 25GB bandwidth/tháng
- ✅ 25 credits/tháng (mỗi credit = 1000 transformations)

**Nếu vượt giới hạn:**
- Cloudinary sẽ gửi email cảnh báo
- Có thể upgrade hoặc optimize storage

### 🔄 Migration từ Bunny CDN

Nếu đã có files trên Bunny CDN:
1. Download files từ Bunny
2. Upload lại lên Cloudinary
3. Update URLs trong database

---

## 🎯 CHECKLIST HOÀN THÀNH

- [ ] Đã tạo tài khoản Cloudinary
- [ ] Đã lấy Cloud Name và API Key
- [ ] Đã tạo Upload Preset (Unsigned)
- [ ] Đã tạo file `.env.local` với đúng thông tin
- [ ] Đã restart dev server
- [ ] Đã implement file `cloudinaryStorage.ts`
- [ ] Đã test upload thành công
- [ ] Đã verify file xuất hiện trên Cloudinary Dashboard

---

## 📚 TÀI LIỆU THAM KHẢO

- Cloudinary Dashboard: https://console.cloudinary.com/
- Cloudinary Upload Widget Docs: https://cloudinary.com/documentation/upload_widget
- Unsigned Upload: https://cloudinary.com/documentation/upload_images#unsigned_upload

---

## 🆘 TROUBLESHOOTING

### Lỗi: "Upload failed: Invalid upload preset"
**Nguyên nhân**: Upload preset chưa được tạo hoặc tên sai  
**Giải pháp**: Check lại Bước 2, đảm bảo preset name khớp với `.env.local`

### Lỗi: "Upload failed: Invalid cloud name"
**Nguyên nhân**: Cloud name sai hoặc chưa được cấu hình  
**Giải pháp**: Check lại `.env.local`, restart dev server

### Lỗi: "Upload failed: Access denied"
**Nguyên nhân**: Upload preset không phải Unsigned mode  
**Giải pháp**: Vào Settings > Upload > Edit preset > Đổi thành "Unsigned"

### Files không hiển thị trên Dashboard
**Nguyên nhân**: Upload thành công nhưng vào sai thư mục  
**Giải pháp**: Check Media Library > All folders > Tìm file theo tên

---

*Hướng dẫn được tạo: 14/12/2025*
*Version: 1.0 - Cloudinary Free Tier*
