# 🔧 BUG FIX IMPLEMENTATION GUIDE

Tài liệu này mô tả chi tiết 13 lỗi cần sửa và hướng dẫn implement cho từng lỗi.

---

## 📋 Tổng quan các lỗi

| # | Tên lỗi | File cần sửa | Độ ưu tiên |
|---|---------|--------------|------------|
| 1 | Chỉnh sửa học sinh - Môn đăng ký & Khối | `StudentListView.tsx`, `selectOptions.ts` | Cao |
| 2 | Lịch tổng hợp - Sửa phòng học & màu giáo viên | `AdminSchedule.tsx` | Trung bình |
| 3 | Chỉnh sửa Mã học sinh | `StudentListView.tsx` | Cao |
| 4 | Lương giáo viên không cập nhật | `TeacherListView.tsx`, `ClassManagement.tsx` | Cao |
| 5 | Không điểm danh bù được hôm trước | `TeacherAttendance.tsx` | Cao |
| 6 | Lớp học khác hiện sai logic | `TeacherAttendance.tsx` | Cao |
| 7 | Upload tài liệu lỗi 401 | `bunnyStorage.ts`, `UploadDocumentModal.tsx` | Cao |
| 8 | Bài tập về nhà - Đính kèm tài liệu | `AttendanceSession.tsx` | Trung bình |
| 9 | Bài tập hoàn thành hiện sai | `AttendanceSession.tsx` | Trung bình |
| 10 | Lịch học hiện tiếng Anh thay vì tiếng Việt | `ParentPortal.tsx` | Thấp |
| 11 | Tab BTVN học sinh - Hiện tài liệu đính kèm | `ParentPortal.tsx` | Trung bình |
| 12 | Tab tài liệu học tập cho học sinh | `ParentPortal.tsx` | Trung bình |
| 13 | Cho phép chỉnh sửa check-in/check-out | `AttendanceSession.tsx` | Trung bình |

---

## 🐛 LỖI 1: Tab "Học sinh" - Chỉnh sửa môn đăng ký và thêm cột Khối

### Mô tả
- Khi ấn vào chỉnh sửa từng học sinh thì sẽ hiện cả môn đăng ký
- Có thể chọn các môn học sinh đó đăng ký, khi chọn thì tự động thêm vào danh sách môn đó
- Thêm 1 cột "Khối" vào tab "Học sinh" với các options: tiền tiểu học, khối 1-12

### Files cần sửa
1. `components/pages/StudentListView.tsx`
2. `utils/selectOptions.ts`

### Hướng dẫn implement

#### Bước 1: Cập nhật `selectOptions.ts` - Thêm gradeOptions mở rộng
```typescript
// Thêm vào file utils/selectOptions.ts
export const studentGradeOptions = [
  { value: "preschool", label: "Tiền tiểu học" },
  { value: 1, label: "Khối 1" },
  { value: 2, label: "Khối 2" },
  { value: 3, label: "Khối 3" },
  { value: 4, label: "Khối 4" },
  { value: 5, label: "Khối 5" },
  { value: 6, label: "Khối 6" },
  { value: 7, label: "Khối 7" },
  { value: 8, label: "Khối 8" },
  { value: 9, label: "Khối 9" },
  { value: 10, label: "Khối 10" },
  { value: 11, label: "Khối 11" },
  { value: 12, label: "Khối 12" },
];
```

#### Bước 2: Cập nhật `StudentListView.tsx`

**2.1. Thêm import:**
```typescript
import { subjectOptions, studentGradeOptions } from "@/utils/selectOptions";
```

**2.2. Thêm cột "Khối" vào table columns (khoảng dòng 1200-1400):**
Tìm nơi định nghĩa columns của table học sinh và thêm:
```typescript
{
  title: "Khối",
  dataIndex: "Khối",
  key: "grade",
  width: 100,
  render: (grade: string | number) => {
    if (grade === "preschool") return "Tiền tiểu học";
    return grade ? `Khối ${grade}` : "-";
  },
  filters: studentGradeOptions.map(opt => ({ text: opt.label, value: opt.value })),
  onFilter: (value: any, record: any) => record["Khối"] === value,
},
```

**2.3. Cập nhật Edit Student Modal (khoảng dòng 2800-2900):**
Tìm Modal chỉnh sửa học sinh và thêm các trường mới:

```tsx
{/* Thêm sau form item "Trạng thái" */}
<Col span={12}>
  <Form.Item label="Khối" name="grade">
    <Select
      placeholder="Chọn khối"
      options={studentGradeOptions}
      allowClear
    />
  </Form.Item>
</Col>

{/* Thêm field Môn đăng ký */}
<Col span={24}>
  <Form.Item label="Môn học đăng ký" name="registeredSubjects">
    <Select
      mode="multiple"
      placeholder="Chọn các môn đăng ký"
      options={subjectOptions}
      allowClear
      style={{ width: "100%" }}
    />
  </Form.Item>
</Col>
```

**2.4. Cập nhật useEffect populate form (khoảng dòng 250-280):**
```typescript
useEffect(() => {
  if (editingStudent && isEditModalOpen) {
    editStudentForm.setFieldsValue({
      name: editingStudent["Họ và tên"] || "",
      dob: editingStudent["Ngày sinh"] || "",
      phone: editingStudent["Số điện thoại"] || "",
      parentPhone: editingStudent["SĐT phụ huynh"] || "",
      status: editingStudent["Trạng thái"] || "",
      address: editingStudent["Địa chỉ"] || "",
      password: editingStudent["Password"] || "",
      // Thêm mới
      grade: editingStudent["Khối"] || null,
      registeredSubjects: editingStudent["Môn học đăng ký"] || [],
    });
  }
}, [editingStudent, isEditModalOpen, editStudentForm]);
```

**2.5. Cập nhật handleSaveStudent function:**
Tìm function handleSaveStudent và thêm:
```typescript
const studentData: any = {
  "Họ và tên": values.name?.trim(),
  "Ngày sinh": values.dob || "",
  "Số điện thoại": values.phone || "",
  "SĐT phụ huynh": values.parentPhone || "",
  "Trạng thái": values.status || "",
  "Địa chỉ": values.address || "",
  "Password": values.password || "",
  // Thêm mới
  "Khối": values.grade || "",
  "Môn học đăng ký": values.registeredSubjects || [],
};
```

---

## 🐛 LỖI 2: Tab "Lịch tổng hợp" - Sửa phòng học theo ca và màu giáo viên

### Mô tả
- Khi nhấn vào nút "sửa lịch" cần thêm chỉnh sửa địa điểm (Phòng) theo từng ca học
- Phần lịch hiện mỗi thầy/cô là 1 màu cho dễ nhìn

### Files cần sửa
1. `components/pages/AdminSchedule.tsx`

### Hướng dẫn implement

#### Bước 1: Thêm bản đồ màu sắc giáo viên (đầu file sau các imports, khoảng dòng 50)
```typescript
// Màu sắc cho từng giáo viên
const TEACHER_COLORS: { [key: string]: { bg: string; text: string; border: string } } = {};
const COLOR_PALETTE = [
  { bg: "#e6f7ff", text: "#1890ff", border: "#91d5ff" },
  { bg: "#fff7e6", text: "#fa8c16", border: "#ffd591" },
  { bg: "#f6ffed", text: "#52c41a", border: "#b7eb8f" },
  { bg: "#fff0f6", text: "#eb2f96", border: "#ffadd2" },
  { bg: "#f9f0ff", text: "#722ed1", border: "#d3adf7" },
  { bg: "#e6fffb", text: "#13c2c2", border: "#87e8de" },
  { bg: "#fffbe6", text: "#faad14", border: "#ffe58f" },
  { bg: "#f0f5ff", text: "#2f54eb", border: "#adc6ff" },
  { bg: "#fcffe6", text: "#a0d911", border: "#d3f261" },
  { bg: "#fff1f0", text: "#f5222d", border: "#ffa39e" },
];

let colorIndex = 0;
const getTeacherColor = (teacherId: string): { bg: string; text: string; border: string } => {
  if (!TEACHER_COLORS[teacherId]) {
    TEACHER_COLORS[teacherId] = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
    colorIndex++;
  }
  return TEACHER_COLORS[teacherId];
};
```

#### Bước 2: Cập nhật Edit Modal Form (khoảng dòng 520-550)
Tìm Modal "Chỉnh sửa lịch học" và thêm field Phòng học:
```tsx
<Form.Item
  name="Phòng học"
  label="Phòng học"
>
  <Select
    placeholder="Chọn phòng học"
    allowClear
    options={Array.from(rooms.values()).map((room: any) => ({
      value: room["Tên phòng"] || room.id,
      label: room["Tên phòng"] || room.id,
    }))}
  />
</Form.Item>
```

#### Bước 3: Cập nhật render event card để hiển thị màu (khoảng dòng 800-900)
Tìm nơi render event card và cập nhật style:
```tsx
const teacherColor = getTeacherColor(event.class["Teacher ID"]);

<div
  className="event-card"
  style={{
    backgroundColor: teacherColor.bg,
    borderLeft: `4px solid ${teacherColor.border}`,
    color: teacherColor.text,
    // ... other styles
  }}
>
  {/* Event content */}
</div>
```

#### Bước 4: Cập nhật saveScheduleThisDateOnly để lưu phòng học (khoảng dòng 578)
```typescript
const saveScheduleThisDateOnly = async (event: ScheduleEvent, values: any) => {
  // ... existing code
  const timetableData: Omit<TimetableEntry, "id"> = {
    "Class ID": event.class.id,
    "Mã lớp": event.class["Mã lớp"],
    "Tên lớp": event.class["Tên lớp"],
    "Ngày": dateStr,
    "Thứ": dayOfWeek,
    "Giờ bắt đầu": values["Giờ bắt đầu"].format("HH:mm"),
    "Giờ kết thúc": values["Giờ kết thúc"].format("HH:mm"),
    "Phòng học": values["Phòng học"] || event.class["Phòng học"] || "", // Thêm dòng này
    "Ghi chú": values["Ghi chú"] || "",
  };
  // ... rest of code
};
```

---

## 🐛 LỖI 3: Tab "Học sinh" - Cho phép chỉnh sửa Mã học sinh

### Mô tả
Khi nhấn chỉnh sửa học sinh cần thêm field "Mã học sinh" để cho phép chỉnh sửa

### Files cần sửa
1. `components/pages/StudentListView.tsx`

### Hướng dẫn implement

#### Bước 1: Thêm Form.Item trong Edit Modal (khoảng dòng 2810)
Tìm Modal chỉnh sửa học sinh và thêm ngay sau "Họ và tên":
```tsx
<Col span={12}>
  <Form.Item
    label="Mã học sinh"
    name="studentCode"
    rules={[{ required: true, message: "Vui lòng nhập mã học sinh" }]}
  >
    <Input 
      placeholder="Nhập mã học sinh (VD: HS001)" 
      disabled={!editingStudent?.id} // Chỉ disable khi thêm mới (auto-generate)
    />
  </Form.Item>
</Col>
```

#### Bước 2: Cập nhật populate form (khoảng dòng 250)
```typescript
editStudentForm.setFieldsValue({
  // ... existing fields
  studentCode: editingStudent["Mã học sinh"] || "",
});
```

#### Bước 3: Cập nhật handleSaveStudent
```typescript
const studentData: any = {
  // ... existing fields
  "Mã học sinh": values.studentCode || editingStudent?.["Mã học sinh"] || "",
};
```

---

## 🐛 LỖI 4: Lương giáo viên không tự động cập nhật

### Mô tả
Khi update Học phí/buổi và Lương GV trong tab "Quản lý lớp học" thì ở tab "Giáo viên" phải tự cập nhật đúng lại tổng lương

### Files cần sửa
1. `components/pages/TeacherListView.tsx`

### Hướng dẫn implement

Lương giáo viên được tính dựa trên số buổi dạy * lương mỗi buổi. Logic cần kiểm tra:

#### Bước 1: Tìm logic tính lương (khoảng dòng 400-600 trong TeacherListView.tsx)
Tìm nơi tính `Buổi dạy`, `Lương/buổi`, `Tổng lương` và cập nhật:

```typescript
// Tính tổng lương cho giáo viên
const calculateTeacherSalary = (teacher: Teacher, classes: any[], attendanceSessions: any[]) => {
  const teacherId = teacher.id;
  const teacherName = teacher["Họ và tên"] || teacher["Tên giáo viên"] || "";
  
  let totalSessions = 0;
  let totalSalary = 0;
  
  // Lấy tất cả lớp của giáo viên này
  const teacherClasses = classes.filter(c => c["Teacher ID"] === teacherId);
  
  teacherClasses.forEach(cls => {
    // Đếm số buổi dạy từ attendance sessions
    const classSessions = attendanceSessions.filter(
      session => session["Class ID"] === cls.id && 
                 session["Teacher ID"] === teacherId &&
                 session["Trạng thái"] === "completed"
    );
    
    const sessionCount = classSessions.length;
    const salaryPerSession = cls["Lương GV"] || 0;
    
    totalSessions += sessionCount;
    totalSalary += sessionCount * salaryPerSession;
  });
  
  return {
    sessions: totalSessions,
    salaryPerSession: teacherClasses.length > 0 
      ? (totalSalary / totalSessions) || 0 
      : 0,
    totalSalary: totalSalary,
  };
};
```

#### Bước 2: Load classes data trong TeacherListView
Thêm state và useEffect để load classes:
```typescript
const [classes, setClasses] = useState<any[]>([]);

useEffect(() => {
  const fetchClasses = async () => {
    try {
      const response = await fetch(`${DATABASE_URL_BASE}/datasheet/Lớp_học.json`);
      const data = await response.json();
      if (data) {
        const classesArray = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setClasses(classesArray);
      }
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };
  fetchClasses();
}, []);
```

#### Bước 3: Cập nhật columns để hiển thị lương đúng
```typescript
{
  title: "Lương/buổi",
  key: "salaryPerSession",
  render: (_, record: Teacher) => {
    const salary = calculateTeacherSalary(record, classes, attendanceSessions);
    return salary.salaryPerSession > 0 
      ? `${salary.salaryPerSession.toLocaleString()} đ` 
      : "-";
  },
},
{
  title: "Tổng lương",
  key: "totalSalary",
  render: (_, record: Teacher) => {
    const salary = calculateTeacherSalary(record, classes, attendanceSessions);
    return salary.totalSalary > 0 
      ? `${salary.totalSalary.toLocaleString()} đ` 
      : "-";
  },
},
```

---

## 🐛 LỖI 5: Không điểm danh bù được hôm trước

### Mô tả
Hiện tại không điểm danh bù được hôm trước. Không điểm danh được các lớp khác nếu chưa điểm danh kịp.

### Files cần sửa
1. `components/pages/TeacherAttendance.tsx`

### Hướng dẫn implement

#### Bước 1: Thêm DatePicker cho phép chọn ngày điểm danh (khoảng dòng 450-500)
```tsx
// Thêm state
const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<Dayjs>(dayjs());

// Trong phần render, thêm DatePicker
<Card style={{ marginBottom: 16 }}>
  <Space>
    <span style={{ fontWeight: 600 }}>Chọn ngày điểm danh:</span>
    <DatePicker
      value={selectedAttendanceDate}
      onChange={(date) => setSelectedAttendanceDate(date || dayjs())}
      format="DD/MM/YYYY"
      allowClear={false}
      disabledDate={(current) => current && current > dayjs().endOf('day')}
    />
    <Button 
      type="link" 
      onClick={() => setSelectedAttendanceDate(dayjs())}
    >
      Hôm nay
    </Button>
  </Space>
</Card>
```

#### Bước 2: Cập nhật logic lọc classes theo ngày được chọn
Thay đổi `todayDate` và `todayDayOfWeek` để sử dụng `selectedAttendanceDate`:
```typescript
const selectedDate = selectedAttendanceDate.format("YYYY-MM-DD");
const selectedDayOfWeek = selectedAttendanceDate.day() === 0 ? 8 : selectedAttendanceDate.day() + 1;
```

#### Bước 3: Cập nhật helper functions
```typescript
// Helper: Check if class has schedule for selected date
const hasScheduleForDate = (classData: Class, date: Dayjs): boolean => {
  const dateStr = date.format("YYYY-MM-DD");
  const dayOfWeek = date.day() === 0 ? 8 : date.day() + 1;
  
  // Check custom schedule first
  const hasCustom = timetableEntries.some(
    (entry) => entry["Class ID"] === classData.id && entry["Ngày"] === dateStr
  );
  if (hasCustom) return true;
  
  // Check if default schedule was replaced
  const isReplaced = timetableEntries.some(
    (entry) => 
      entry["Class ID"] === classData.id && 
      entry["Thay thế ngày"] === dateStr
  );
  if (isReplaced) return false;
  
  // Check default schedule
  return classData["Lịch học"]?.some((s) => s["Thứ"] === dayOfWeek) || false;
};
```

#### Bước 4: Cập nhật handleStartAttendance để sử dụng ngày được chọn
```typescript
const handleStartAttendance = (classData: Class) => {
  navigate(`/workspace/attendance/session/${classData.id}`, {
    state: { classData, date: selectedAttendanceDate.format("YYYY-MM-DD") },
  });
};
```

---

## 🐛 LỖI 6: "Lớp học khác" hiện sai logic cho giáo viên

### Mô tả
Ở tab "Điểm danh" của teacher, phần "lớp học khác" đang hiện những lớp thầy/cô đó không phụ trách mà lại không hiện lớp mà thầy cô phụ trách chính.

### Files cần sửa
1. `components/pages/TeacherAttendance.tsx`

### Hướng dẫn implement

#### Tìm và sửa logic `otherClasses` (khoảng dòng 215-250)
Logic hiện tại SAI - đang filter `isNotMyClass`. Cần sửa lại:

```typescript
// Get other classes - CHỈ hiện lớp của giáo viên này mà KHÔNG có lịch hôm nay
// (để giáo viên có thể điểm danh bù hoặc điểm danh lớp có lịch học khác)
const otherClasses = useMemo(() => {
  if (isAdmin) {
    // Admin: hiển thị tất cả lớp chưa có lịch hôm nay (để điểm danh bù)
    return classes
      .filter((c) => {
        const isActive = c["Trạng thái"] === "active";
        const startDate = c["Ngày bắt đầu"] ? dayjs(c["Ngày bắt đầu"]) : null;
        const endDate = c["Ngày kết thúc"] ? dayjs(c["Ngày kết thúc"]) : null;
        const isWithinDateRange =
          (!startDate || today.isSameOrAfter(startDate, "day")) &&
          (!endDate || today.isSameOrBefore(endDate, "day"));
        
        // Lớp không có lịch hôm nay nhưng vẫn đang hoạt động
        return !hasScheduleToday(c) && isActive && isWithinDateRange;
      })
      .sort((a, b) => a["Tên lớp"].localeCompare(b["Tên lớp"]));
  } else {
    // Giáo viên: CHỈ hiện lớp CỦA MÌNH mà không có lịch hôm nay
    // (để điểm danh bù cho các buổi đã lỡ)
    return classes
      .filter((c) => {
        const isMyClass = c["Teacher ID"] === teacherId; // SỬA: phải là lớp của mình
        const isActive = c["Trạng thái"] === "active";
        const startDate = c["Ngày bắt đầu"] ? dayjs(c["Ngày bắt đầu"]) : null;
        const endDate = c["Ngày kết thúc"] ? dayjs(c["Ngày kết thúc"]) : null;
        const isWithinDateRange =
          (!startDate || today.isSameOrAfter(startDate, "day")) &&
          (!endDate || today.isSameOrBefore(endDate, "day"));
        
        // Lớp của mình nhưng không có lịch hôm nay
        return !hasScheduleToday(c) && isMyClass && isActive && isWithinDateRange;
      })
      .sort((a, b) => a["Tên lớp"].localeCompare(b["Tên lớp"]));
  }
}, [classes, todayClasses, todayDayOfWeek, isAdmin, teacherId, today, timetableEntries]);
```

---

## 🐛 LỖI 7: Upload tài liệu lỗi 401 Unauthorized

### Mô tả
Khi nhấn nút "Thêm tài liệu" và tải file lên thì đang trả về lỗi: `Upload thất bại: 401 - {"HttpCode":401,"Message":"Unauthorized"}`

### Files cần sửa
1. `utils/bunnyStorage.ts`

### Hướng dẫn implement

#### Phân tích nguyên nhân
Lỗi 401 từ Bunny CDN có thể do:
1. API Key không đúng hoặc hết hạn
2. CORS issue khi gọi từ browser
3. Storage zone name không khớp

#### Bước 1: Kiểm tra và cập nhật credentials (bunnyStorage.ts dòng 5-9)
```typescript
// QUAN TRỌNG: Cần xác nhận lại các thông tin này từ Bunny dashboard
// Vào https://panel.bunny.net → Storage → [zone name] → FTP & API Access
const BUNNY_STORAGE_ZONE = "webvideonhatbang"; // Kiểm tra lại tên zone
const BUNNY_STORAGE_PASSWORD = "xxxx-xxxx-xxxx-xxxx"; // LẤY API KEY MỚI TỪ DASHBOARD
const BUNNY_STORAGE_HOSTNAME = "storage.bunnycdn.com"; // Có thể cần đổi sang region cụ thể
const BUNNY_CDN_URL = "webxemvideo.b-cdn.net";
```

#### Bước 2: Sử dụng backend proxy thay vì gọi trực tiếp từ frontend
Tạo API endpoint để xử lý upload (nếu có backend):
```typescript
// Nếu không có backend, có thể sử dụng Vercel serverless function
// Tạo file: api/upload-to-bunny.ts

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const path = formData.get('path') as string;

  const uploadUrl = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${path}`;
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'AccessKey': process.env.BUNNY_API_KEY!,
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ 
    url: `https://${BUNNY_CDN_URL}/${path}` 
  }));
}
```

#### Bước 3: Cập nhật bunnyStorage.ts để sử dụng proxy (nếu có)
```typescript
export const uploadToBunny = async (
  file: File,
  path: string
): Promise<UploadResult> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const response = await fetch('/api/upload-to-bunny', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Upload failed',
      };
    }

    const data = await response.json();
    return {
      success: true,
      url: data.url,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Lỗi kết nối: ${error.message}`,
    };
  }
};
```

---

## 🐛 LỖI 8: Bài tập về nhà - Thêm đính kèm tài liệu

### Mô tả
Ở màn "Bài tập về nhà" trong AttendanceSession cần thêm chỗ để đính kèm tài liệu hoặc ảnh cho bài tập buổi hôm đó.

### Files cần sửa
1. `components/pages/AttendanceSession.tsx`
2. `types.ts`

### Hướng dẫn implement

#### Bước 1: Cập nhật types.ts - Thêm field attachments
```typescript
export interface HomeworkAssignment {
  "Mô tả": string;
  "Tổng số bài": number;
  "Người giao": string;
  "Thời gian giao": string;
  "Tài liệu đính kèm"?: HomeworkAttachment[]; // THÊM MỚI
}

export interface HomeworkAttachment {
  name: string;
  url: string;
  type: "file" | "image" | "link";
  uploadedAt: string;
}
```

#### Bước 2: Thêm state và UI trong AttendanceSession.tsx (khoảng dòng 60)
```typescript
// Thêm imports
import { UploadOutlined, PaperClipOutlined, DeleteOutlined } from "@ant-design/icons";
import { Upload } from "antd";
import { uploadToBunny, generateFilePath } from "@/utils/bunnyStorage";

// Thêm state
const [homeworkAttachments, setHomeworkAttachments] = useState<any[]>([]);
const [uploadingAttachment, setUploadingAttachment] = useState(false);
```

#### Bước 3: Thêm UI upload trong phần Bài tập về nhà (tìm Step "Bài tập")
```tsx
{/* Thêm sau Input "Tổng số bài tập" */}
<div style={{ marginTop: 16 }}>
  <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>
    <PaperClipOutlined /> Tài liệu đính kèm
  </label>
  
  <Upload
    beforeUpload={async (file) => {
      setUploadingAttachment(true);
      try {
        const filePath = generateFilePath(classData.id, file.name);
        const result = await uploadToBunny(file, filePath);
        
        if (result.success) {
          setHomeworkAttachments(prev => [...prev, {
            name: file.name,
            url: result.url,
            type: file.type.startsWith('image/') ? 'image' : 'file',
            uploadedAt: new Date().toISOString(),
          }]);
          message.success(`Đã tải lên: ${file.name}`);
        } else {
          message.error(result.error || "Lỗi tải file");
        }
      } catch (error) {
        message.error("Lỗi tải file");
      }
      setUploadingAttachment(false);
      return false; // Prevent default upload
    }}
    showUploadList={false}
    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
  >
    <Button icon={<UploadOutlined />} loading={uploadingAttachment}>
      Tải lên tài liệu
    </Button>
  </Upload>
  
  {/* Hiển thị danh sách đã upload */}
  {homeworkAttachments.length > 0 && (
    <List
      style={{ marginTop: 12 }}
      bordered
      size="small"
      dataSource={homeworkAttachments}
      renderItem={(item, index) => (
        <List.Item
          actions={[
            <Button
              type="link"
              href={item.url}
              target="_blank"
            >
              Xem
            </Button>,
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setHomeworkAttachments(prev => prev.filter((_, i) => i !== index));
              }}
            />
          ]}
        >
          <PaperClipOutlined /> {item.name}
        </List.Item>
      )}
    />
  )}
</div>
```

#### Bước 4: Cập nhật khi lưu session - thêm attachments vào Bài tập
```typescript
// Trong function saveSession hoặc handleSave
const sessionData = {
  // ... existing fields
  "Bài tập": {
    "Mô tả": homeworkDescription,
    "Tổng số bài": totalExercises,
    "Người giao": userProfile?.displayName || userProfile?.email || "",
    "Thời gian giao": new Date().toISOString(),
    "Tài liệu đính kèm": homeworkAttachments, // THÊM
  },
};
```

---

## 🐛 LỖI 9: Bài tập hoàn thành hiện sai

### Mô tả
Phần "Bài tập hoàn thành" trong màn điểm danh sẽ hiện tổng số bài buổi HÔM TRƯỚC, không phải hiện trên buổi hôm nay giao bao nhiêu bài.

### Files cần sửa
1. `components/pages/AttendanceSession.tsx`

### Hướng dẫn implement

#### Bước 1: Thêm state lưu bài tập buổi trước (khoảng dòng 70)
```typescript
const [previousTotalExercises, setPreviousTotalExercises] = useState<number>(0);
const [previousHomeworkDescription, setPreviousHomeworkDescription] = useState<string>("");
```

#### Bước 2: Load bài tập buổi trước khi component mount (khoảng dòng 150)
```typescript
// Load previous session homework
useEffect(() => {
  if (!classData?.id) return;

  const sessionsRef = ref(database, "datasheet/Điểm_danh_sessions");
  onValue(sessionsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Lấy tất cả sessions của lớp này
      const classSessions = Object.entries(data)
        .map(([id, value]) => ({ id, ...(value as any) }))
        .filter((s) => s["Class ID"] === classData.id && s["Trạng thái"] === "completed")
        .sort((a, b) => new Date(b["Ngày"]).getTime() - new Date(a["Ngày"]).getTime());
      
      // Tìm session gần nhất TRƯỚC ngày hiện tại
      const previousSession = classSessions.find((s) => s["Ngày"] < sessionDate);
      
      if (previousSession && previousSession["Bài tập"]) {
        setPreviousTotalExercises(previousSession["Bài tập"]["Tổng số bài"] || 0);
        setPreviousHomeworkDescription(previousSession["Bài tập"]["Mô tả"] || "");
      }
    }
  }, { onlyOnce: true });
}, [classData?.id, sessionDate]);
```

#### Bước 3: Cập nhật column "Bài tập hoàn thành" (khoảng dòng 1100)
```typescript
{
  title: "Bài tập hoàn thành",
  key: "exercises",
  width: 140,
  render: (_: any, record: Student) => {
    const attendanceRecord = attendanceRecords.find(
      (r) => r["Student ID"] === record.id
    );
    if (!attendanceRecord?.["Có mặt"]) return "-";

    const completed = attendanceRecord?.["Bài tập hoàn thành"] ?? 0;
    // SỬA: Sử dụng số bài tập của BUỔI TRƯỚC
    const total = previousTotalExercises || 0;

    return (
      <Space.Compact style={{ width: "100%" }}>
        <InputNumber
          min={0}
          max={total || 100}
          placeholder="0"
          value={completed || null}
          onChange={(value) =>
            handleExercisesCompletedChange(record.id, value)
          }
          style={{ width: "50%" }}
          disabled={isReadOnly}
        />
        <Input
          value={`/ ${total}`}
          disabled
          style={{ 
            width: "50%", 
            textAlign: "center",
            backgroundColor: "#f5f5f5",
            color: "#000"
          }}
        />
      </Space.Compact>
    );
  },
},
```

#### Bước 4: Thêm thông tin hiển thị bài tập buổi trước
```tsx
{/* Thêm Card hiển thị bài tập buổi trước */}
{previousTotalExercises > 0 && (
  <Card size="small" style={{ marginBottom: 16, background: "#fffbe6" }}>
    <Space direction="vertical" size={0}>
      <Text strong>📋 Bài tập buổi trước:</Text>
      <Text>{previousHomeworkDescription || "Không có mô tả"}</Text>
      <Text type="secondary">Tổng số bài: {previousTotalExercises}</Text>
    </Space>
  </Card>
)}
```

---

## 🐛 LỖI 10: Lịch học hiển thị tiếng Anh thay vì tiếng Việt

### Mô tả
Ở tab "Lịch học" của role học sinh (ParentPortal), môn học đang hiển thị tiếng Anh (Mathematics) thay vì tiếng Việt (Toán)

### Files cần sửa
1. `components/pages/ParentPortal.tsx`

### Hướng dẫn implement

#### Bước 1: Import subjectMap (đầu file)
```typescript
import { subjectMap } from "@/utils/selectOptions";
```

#### Bước 2: Tìm nơi hiển thị lịch học và wrap môn học qua subjectMap
Tìm trong Calendar hoặc List render lịch học:
```tsx
// Thay vì hiển thị trực tiếp subject
<span>{cls["Môn học"]}</span>

// Sửa thành:
<span>{subjectMap[cls["Môn học"]] || cls["Môn học"]}</span>
```

#### Bước 3: Cập nhật tất cả các nơi hiển thị môn học
Tìm tất cả occurrences của `["Môn học"]` hoặc `session["Môn học"]` và wrap:
```tsx
// Ví dụ trong Calendar cell
{subjectMap[event["Môn học"]] || event["Môn học"]}

// Trong Table
{
  title: "Môn học",
  dataIndex: "Môn học",
  render: (subject: string) => subjectMap[subject] || subject,
}
```

---

## 🐛 LỖI 11: Tab BTVN học sinh - Hiển thị tài liệu đính kèm

### Mô tả
Trong tab "bài tập về nhà" của role học sinh cần chia thành 3 phần:
1. Nội dung (đã có)
2. Tài liệu (ảnh, file, tệp đính kèm - học sinh có thể ấn vào tải về)
3. Phần kết quả bài hoàn thành (đã có)

### Files cần sửa
1. `components/pages/ParentPortal.tsx`

### Hướng dẫn implement

#### Bước 1: Tìm tab "Bài tập về nhà" trong ParentPortal (khoảng dòng 1200-1500)
Tìm Tabs item với label "Bài tập về nhà"

#### Bước 2: Cập nhật render để hiển thị 3 phần
```tsx
{/* Tab Bài tập về nhà */}
<Tabs.TabPane key="homework" tab={<span><EditOutlined /> Bài tập về nhà</span>}>
  <List
    itemLayout="vertical"
    dataSource={/* homework data từ sessions */}
    renderItem={(session: any) => {
      const studentRecord = session["Điểm danh"]?.find(
        (r: any) => r["Student ID"] === userProfile?.studentId
      );
      const homework = session["Bài tập"];
      const attachments = homework?.["Tài liệu đính kèm"] || [];
      
      return (
        <Card style={{ marginBottom: 16 }}>
          {/* Header */}
          <Space style={{ marginBottom: 12 }}>
            <Tag color="blue">{session["Tên lớp"]}</Tag>
            <Text type="secondary">{dayjs(session["Ngày"]).format("DD/MM/YYYY")}</Text>
          </Space>
          
          {/* 1. Nội dung bài tập */}
          <div style={{ marginBottom: 16 }}>
            <Text strong>📝 Mô tả:</Text>
            <Paragraph style={{ marginTop: 8 }}>
              {homework?.["Mô tả"] || "Không có mô tả"}
            </Paragraph>
          </div>
          
          {/* 2. Tài liệu đính kèm */}
          {attachments.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>📎 Tài liệu đính kèm:</Text>
              <List
                style={{ marginTop: 8 }}
                bordered
                size="small"
                dataSource={attachments}
                renderItem={(att: any) => (
                  <List.Item
                    actions={[
                      <Button
                        type="primary"
                        size="small"
                        icon={<DownloadOutlined />}
                        href={att.url}
                        target="_blank"
                        download
                      >
                        Tải về
                      </Button>
                    ]}
                  >
                    <Space>
                      {att.type === "image" ? <FileImageOutlined /> : <FileTextOutlined />}
                      <span>{att.name}</span>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          )}
          
          {/* 3. Kết quả hoàn thành */}
          <div>
            <Text strong>✅ Hoàn thành:</Text>
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={
                  homework?.["Tổng số bài"] > 0
                    ? Math.round(
                        ((studentRecord?.["Bài tập hoàn thành"] || 0) /
                          homework["Tổng số bài"]) *
                          100
                      )
                    : 0
                }
                format={() =>
                  `${studentRecord?.["Bài tập hoàn thành"] || 0} / ${homework?.["Tổng số bài"] || 0}`
                }
              />
            </div>
          </div>
        </Card>
      );
    }}
  />
</Tabs.TabPane>
```

---

## 🐛 LỖI 12: Tab "Tài liệu học tập" cho học sinh

### Mô tả
Khi học sinh ở lớp nào có ảnh hay file đính kèm cho bài tập sẽ được tổng hợp theo lớp trong tab này để học sinh có thể tải về.

### Files cần sửa
1. `components/pages/ParentPortal.tsx`

### Hướng dẫn implement

#### Bước 1: Tìm hoặc tạo tab "Tài liệu học tập" trong Tabs
```tsx
<Tabs.TabPane 
  key="documents" 
  tab={<span><FileTextOutlined /> Tài liệu học tập</span>}
>
  {/* Content */}
</Tabs.TabPane>
```

#### Bước 2: Tổng hợp tài liệu từ tất cả sessions của học sinh
```tsx
// Tính toán trong useMemo
const allDocuments = useMemo(() => {
  const docsByClass: { [classId: string]: { className: string; documents: any[] } } = {};
  
  attendanceSessions.forEach((session) => {
    const classId = session["Class ID"];
    const className = session["Tên lớp"];
    const attachments = session["Bài tập"]?.["Tài liệu đính kèm"] || [];
    
    if (attachments.length > 0) {
      if (!docsByClass[classId]) {
        docsByClass[classId] = { className, documents: [] };
      }
      
      attachments.forEach((att: any) => {
        docsByClass[classId].documents.push({
          ...att,
          sessionDate: session["Ngày"],
          homeworkDesc: session["Bài tập"]?.["Mô tả"] || "",
        });
      });
    }
  });
  
  return docsByClass;
}, [attendanceSessions]);
```

#### Bước 3: Render UI
```tsx
<Tabs.TabPane key="documents" tab={<span><FileTextOutlined /> Tài liệu học tập</span>}>
  {Object.keys(allDocuments).length === 0 ? (
    <Empty description="Chưa có tài liệu nào" />
  ) : (
    <Collapse>
      {Object.entries(allDocuments).map(([classId, { className, documents }]) => (
        <Collapse.Panel 
          key={classId} 
          header={
            <Space>
              <BookOutlined />
              <span style={{ fontWeight: 600 }}>{className}</span>
              <Badge count={documents.length} style={{ backgroundColor: "#1890ff" }} />
            </Space>
          }
        >
          <List
            dataSource={documents}
            renderItem={(doc: any) => (
              <List.Item
                actions={[
                  <Button
                    type="primary"
                    size="small"
                    icon={<DownloadOutlined />}
                    href={doc.url}
                    target="_blank"
                    download
                  >
                    Tải về
                  </Button>
                ]}
              >
                <List.Item.Meta
                  avatar={
                    doc.type === "image" 
                      ? <FileImageOutlined style={{ fontSize: 24 }} /> 
                      : <FileTextOutlined style={{ fontSize: 24 }} />
                  }
                  title={doc.name}
                  description={
                    <Space direction="vertical" size={0}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Ngày: {dayjs(doc.sessionDate).format("DD/MM/YYYY")}
                      </Text>
                      {doc.homeworkDesc && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Bài tập: {doc.homeworkDesc}
                        </Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Collapse.Panel>
      ))}
    </Collapse>
  )}
</Tabs.TabPane>
```

---

## 🐛 LỖI 13: Cho phép chỉnh sửa Check-in & Check-out

### Mô tả
Trong tab "Điểm danh" của teacher, admin cần cho phép chỉnh sửa được giờ check-in và check-out

### Files cần sửa
1. `components/pages/AttendanceSession.tsx`

### Hướng dẫn implement

#### Bước 1: Thêm state cho editing mode (khoảng dòng 70)
```typescript
const [editingCheckTime, setEditingCheckTime] = useState<{
  studentId: string;
  type: "checkin" | "checkout";
} | null>(null);
const [tempCheckTime, setTempCheckTime] = useState<string>("");
```

#### Bước 2: Cập nhật column "Giờ check-in" (khoảng dòng 1030)
```tsx
{
  title: "Giờ check-in",
  key: "checkin",
  width: 130,
  render: (_: any, record: Student) => {
    const attendanceRecord = attendanceRecords.find(
      (r) => r["Student ID"] === record.id
    );
    if (!attendanceRecord?.["Có mặt"]) return "-";
    
    const isEditing = editingCheckTime?.studentId === record.id && 
                      editingCheckTime?.type === "checkin";
    
    if (isEditing) {
      return (
        <Space.Compact>
          <TimePicker
            format="HH:mm:ss"
            value={tempCheckTime ? dayjs(tempCheckTime, "HH:mm:ss") : null}
            onChange={(time) => setTempCheckTime(time?.format("HH:mm:ss") || "")}
            style={{ width: 100 }}
          />
          <Button
            size="small"
            type="primary"
            onClick={() => {
              handleUpdateCheckTime(record.id, "Giờ check-in", tempCheckTime);
              setEditingCheckTime(null);
            }}
          >
            ✓
          </Button>
          <Button
            size="small"
            onClick={() => setEditingCheckTime(null)}
          >
            ✗
          </Button>
        </Space.Compact>
      );
    }
    
    return (
      <Space>
        {attendanceRecord?.["Giờ check-in"] ? (
          <Tag icon={<LoginOutlined />} color="success" style={{ fontSize: "11px" }}>
            {attendanceRecord["Giờ check-in"]}
          </Tag>
        ) : (
          <Tag color="default" style={{ fontSize: "11px" }}>Chưa check-in</Tag>
        )}
        {!isReadOnly && (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingCheckTime({ studentId: record.id, type: "checkin" });
              setTempCheckTime(attendanceRecord?.["Giờ check-in"] || "");
            }}
          />
        )}
      </Space>
    );
  },
},
```

#### Bước 3: Tương tự cho column "Check-out" (khoảng dòng 1055)
Áp dụng logic tương tự cho cột Check-out với type "checkout"

#### Bước 4: Thêm function handleUpdateCheckTime
```typescript
const handleUpdateCheckTime = async (
  studentId: string, 
  field: "Giờ check-in" | "Giờ check-out", 
  newTime: string
) => {
  if (!sessionId || !newTime) return;
  
  const updatedRecords = attendanceRecords.map((record) => {
    if (record["Student ID"] === studentId) {
      return {
        ...record,
        [field]: newTime,
      };
    }
    return record;
  });
  
  setAttendanceRecords(updatedRecords);
  
  // Save to Firebase
  try {
    const sessionRef = ref(database, `datasheet/Điểm_danh_sessions/${sessionId}/Điểm danh`);
    await set(sessionRef, updatedRecords);
    message.success(`Đã cập nhật ${field}`);
  } catch (error) {
    console.error("Error updating check time:", error);
    message.error("Lỗi cập nhật thời gian");
  }
};
```

---

## 📝 Ghi chú chung

### Thứ tự ưu tiên implement
1. **Cao**: Lỗi 3, 4, 5, 6, 7 (ảnh hưởng trực tiếp đến chức năng chính)
2. **Trung bình**: Lỗi 1, 2, 8, 9, 11, 12, 13 (cải thiện UX)
3. **Thấp**: Lỗi 10 (cosmetic)

### Testing checklist sau khi implement
- [ ] Lỗi 1: Chỉnh sửa học sinh với môn đăng ký và khối
- [ ] Lỗi 2: Lịch tổng hợp có màu sắc giáo viên và sửa phòng học
- [ ] Lỗi 3: Chỉnh sửa được mã học sinh
- [ ] Lỗi 4: Lương giáo viên tự cập nhật khi thay đổi trong lớp học
- [ ] Lỗi 5: Điểm danh bù được các ngày trước
- [ ] Lỗi 6: "Lớp học khác" hiện đúng lớp của giáo viên
- [ ] Lỗi 7: Upload tài liệu không còn lỗi 401
- [ ] Lỗi 8: Đính kèm được tài liệu trong bài tập về nhà
- [ ] Lỗi 9: Bài tập hoàn thành hiện số bài buổi trước
- [ ] Lỗi 10: Môn học hiển thị tiếng Việt
- [ ] Lỗi 11: Tab BTVN hiện tài liệu đính kèm
- [ ] Lỗi 12: Tab tài liệu học tập tổng hợp theo lớp
- [ ] Lỗi 13: Chỉnh sửa được check-in/check-out

---

*Tài liệu được tạo: 14/12/2025*
