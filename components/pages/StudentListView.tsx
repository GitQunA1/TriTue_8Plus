import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import type { ScheduleEvent } from "../../types";
import { DATABASE_URL_BASE } from "@/firebase";
import {
  Button,
  Input,
  Table,
  Card,
  Spin,
  DatePicker,
  Modal,
  Form,
  InputNumber,
  Select,
  Statistic,
  Typography,
  Row,
  Col,
  Space,
  Tag,
  message,
  Popconfirm,
  Dropdown,
  Tabs,
  Divider,
  Radio,
} from "antd";
import type { MenuProps } from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  ClearOutlined,
  UserOutlined,
  MoreOutlined,
  FileTextOutlined,
  DollarOutlined,
  StarOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import WrapperContent from "@/components/WrapperContent";
import Loader from "@/components/Loader";
import { Empty } from "antd/lib";
import StudentReportButton from "@/components/StudentReportButton";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { subjectMap, subjectOptions, studentGradeOptions } from "@/utils/selectOptions";

const { TabPane } = Tabs;
const { Text } = Typography;

// Component for editable stars input
const StarsInput: React.FC<{
  value: number;
  student: Student;
  onSave: (newValue: number) => void;
}> = ({ value, student, onSave }) => {
  const [localValue, setLocalValue] = useState<number>(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value && localValue !== null && localValue !== undefined) {
      onSave(localValue);
    }
  };

  return (
    <InputNumber
      min={0}
      step={1}
      value={localValue}
      onChange={(newValue) => {
        if (newValue !== null && newValue !== undefined) {
          setLocalValue(newValue);
        }
      }}
      onBlur={handleBlur}
      onPressEnter={(e) => {
        e.currentTarget.blur();
      }}
      addonAfter="⭐"
      style={{ width: "100%" }}
      onFocus={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

const STUDENT_LIST_URL = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh.json`;
const SCHEDULE_URL = `${DATABASE_URL_BASE}/datasheet/Th%E1%BB%9Di_kho%C3%A1_bi%E1%BB%83u.json`;
const ATTENDANCE_SESSIONS_URL = `${DATABASE_URL_BASE}/datasheet/%C4%90i%E1%BB%83m_danh_sessions.json`;
const EXTENSION_HISTORY_URL = `${DATABASE_URL_BASE}/datasheet/Gia_h%E1%BA%A1n.json`;
const STARS_HISTORY_URL = `${DATABASE_URL_BASE}/datasheet/L%E1%BB%8Bch_s%E1%BB%AD_sao_th%C6%B0%E1%BB%9Fng.json`;

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh"?: string;
  "Ngày sinh"?: string;
  "Số điện thoại"?: string;
  "SĐT phụ huynh"?: string;
  Email?: string;
  "Trạng thái"?: string;
  "Địa chỉ"?: string;
  "Số giờ đã gia hạn"?: number;
  "Số giờ còn lại"?: number;
  "Số giờ đã học"?: number;
  [key: string]: any;
}

const StudentListView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs | null>(dayjs());
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isExtendModalOpen, setExtendModalOpen] = useState(false);
  const [extendingStudent, setExtendingStudent] = useState<Student | null>(
    null
  );
  const [currentUsername, setCurrentUsername] = useState<string>("Admin"); // Will be updated with actual user
  const [extensionHistory, setExtensionHistory] = useState<any[]>([]);
  const [isEditExtensionModalOpen, setEditExtensionModalOpen] = useState(false);
  const [editingExtension, setEditingExtension] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("list");
  const [isClassModalOpen, setClassModalOpen] = useState(false);
  const [selectedStudentClasses, setSelectedStudentClasses] = useState<Array<{ className: string, subject: string }>>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [dateRangeFilter, setDateRangeFilter] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [quickFilter, setQuickFilter] = useState<'month' | 'week' | 'year' | 'custom'>('month');
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  // Stars editing states
  const [isEditStarsModalOpen, setEditStarsModalOpen] = useState(false);
  const [editingStarsStudent, setEditingStarsStudent] = useState<Student | null>(null);
  const [starsHistory, setStarsHistory] = useState<any[]>([]);

  // Form instances
  const [editStudentForm] = Form.useForm();
  const [extendHoursForm] = Form.useForm();
  const [editExtensionForm] = Form.useForm();
  const [editStarsForm] = Form.useForm();

  // Fetch students
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        // Add cache-busting parameter
        const response = await fetch(
          `${STUDENT_LIST_URL}?_=${new Date().getTime()}`,
          {
            cache: "no-cache",
          }
        );
        const data = await response.json();
        if (data) {
          const studentsArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }));
          console.log("📚 Students fetched:", studentsArray.length);
          console.log("📊 Sample student data:", studentsArray[0]);
          console.log(
            "🔑 Student IDs:",
            studentsArray.map((s) => ({ id: s.id, name: s["Họ và tên"] }))
          );
          setStudents(studentsArray);
        } else {
          console.warn("⚠️ No students data from Firebase");
        }
      } catch (error) {
        console.error("Error fetching students:", error);
      }
    };
    fetchStudents();
  }, []);

  // Fetch attendance sessions (for calculating hours and sessions)
  useEffect(() => {
    const fetchAttendanceSessions = async () => {
      try {
        const response = await fetch(ATTENDANCE_SESSIONS_URL);
        const data = await response.json();
        if (data) {
          const sessionsArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }));
          console.log("📊 Attendance sessions loaded:", sessionsArray.length);
          setAttendanceSessions(sessionsArray);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error fetching attendance sessions:", error);
        setLoading(false);
      }
    };
    fetchAttendanceSessions();
  }, []);

  // Fetch schedule events (for display purposes)
  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const response = await fetch(SCHEDULE_URL);
        const data = await response.json();
        if (data) {
          let eventsArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }));

          // 🔒 PERMISSION FILTER: Teachers only see their own events
          // ⚠️ TEMPORARILY DISABLED - Everyone can see all data
          // if (userProfile?.role === 'teacher' && currentUser?.email) {
          //     console.log('🔒 Filtering schedule for teacher:', currentUser.email);
          //     eventsArray = eventsArray.filter(event => {
          //         const eventEmail = event["Email giáo viên"]?.toLowerCase();
          //         const userEmail = currentUser.email?.toLowerCase();
          //         return eventEmail === userEmail;
          //     });
          // }

          setScheduleEvents(eventsArray);
        }
      } catch (error) {
        console.error("Error fetching schedule:", error);
      }
    };
    fetchSchedule();
  }, [userProfile, currentUser]);

  // Fetch extension history
  useEffect(() => {
    const fetchExtensionHistory = async () => {
      try {
        const response = await fetch(
          `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
          {
            cache: "no-cache",
          }
        );
        const data = await response.json();
        if (data) {
          const historyArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }));
          // Sort by timestamp descending
          historyArray.sort(
            (a, b) =>
              new Date(b.Timestamp || 0).getTime() -
              new Date(a.Timestamp || 0).getTime()
          );
          console.log("📋 Extension history fetched:", historyArray.length);
          setExtensionHistory(historyArray);
        }
      } catch (error) {
        console.error("Error fetching extension history:", error);
      }
    };
    fetchExtensionHistory();
  }, []);

  // Fetch classes
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await fetch(`${DATABASE_URL_BASE}/datasheet/Lớp_học.json`);
        const data = await response.json();
        if (data) {
          const classesArray = Object.entries(data).map(([id, cls]: [string, any]) => ({
            id,
            ...cls,
          }));
          console.log("📚 Classes fetched:", classesArray.length);
          setClasses(classesArray);
        }
      } catch (error) {
        console.error("Error fetching classes:", error);
      }
    };
    fetchClasses();
  }, []);

  // Fetch stars history
  useEffect(() => {
    const fetchStarsHistory = async () => {
      try {
        const response = await fetch(
          `${STARS_HISTORY_URL}?_=${new Date().getTime()}`,
          {
            cache: "no-cache",
          }
        );

        // If response is not ok or returns null, initialize empty array
        if (!response.ok) {
          console.log("⭐ Stars history table not found, initializing empty array");
          setStarsHistory([]);
          return;
        }

        const data = await response.json();
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
          const historyArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }));
          // Sort by timestamp descending
          historyArray.sort(
            (a, b) =>
              new Date(b.Timestamp || 0).getTime() -
              new Date(a.Timestamp || 0).getTime()
          );
          console.log("⭐ Stars history fetched:", historyArray.length);
          setStarsHistory(historyArray);
        } else {
          console.log("⭐ No stars history data, initializing empty array");
          setStarsHistory([]);
        }
      } catch (error) {
        console.log("⭐ Error fetching stars history (table may not exist yet):", error);
        // Initialize with empty array so the feature still works
        setStarsHistory([]);
      }
    };
    fetchStarsHistory();
  }, []);


  // Update edit student form when editingStudent changes
  useEffect(() => {
    if (editingStudent && isEditModalOpen) {
      // Determine registered class IDs from `classes` table where this student is enrolled
      const enrolledClassIds = classes
        .filter((c) => (c["Student IDs"] || []).includes(editingStudent.id))
        .map((c) => c.id);

      editStudentForm.setFieldsValue({
        name: editingStudent["Họ và tên"] || "",
        studentCode: editingStudent["Mã học sinh"] || "",
        dob: editingStudent["Ngày sinh"] || "",
        phone: editingStudent["Số điện thoại"] || "",
        parentPhone: editingStudent["SĐT phụ huynh"] || "",
        status: editingStudent["Trạng thái"] || "",
        address: editingStudent["Địa chỉ"] || "",
        password: editingStudent["Mật khẩu"] || "",
        grade: editingStudent["Khối"] || "",
        // registeredSubjects now holds class IDs
        registeredSubjects: enrolledClassIds,
      });
    } else if (!editingStudent && isEditModalOpen) {
      // Reset form when adding new student
      editStudentForm.resetFields();
    }
  }, [editingStudent, isEditModalOpen, editStudentForm, classes]);

  // Update extend hours form when extendingStudent changes
  useEffect(() => {
    if (extendingStudent && isExtendModalOpen) {
      extendHoursForm.setFieldsValue({
        studentName: extendingStudent["Họ và tên"] || "",
        additionalHours: 0,
      });
    } else if (!extendingStudent && isExtendModalOpen) {
      extendHoursForm.resetFields();
    }
  }, [extendingStudent, isExtendModalOpen, extendHoursForm]);

  // Update edit extension form when editingExtension changes
  useEffect(() => {
    if (editingExtension && isEditExtensionModalOpen) {
      editExtensionForm.setFieldsValue({
        newHours: editingExtension["Giờ nhập thêm"] || 0,
        reason: "",
      });
    } else if (!editingExtension && isEditExtensionModalOpen) {
      // Reset form
      editExtensionForm.resetFields();
    }
  }, [editingExtension, isEditExtensionModalOpen, editExtensionForm]);

  // Update edit stars form when editingStarsStudent changes
  useEffect(() => {
    if (editingStarsStudent && isEditStarsModalOpen) {
      const currentTotal = calculateTotalRewardStars(editingStarsStudent.id);
      editStarsForm.setFieldsValue({
        currentTotal: currentTotal,
        adjustment: 0,
        reason: "",
      });
    } else if (!editingStarsStudent && isEditStarsModalOpen) {
      editStarsForm.resetFields();
    }
  }, [editingStarsStudent, isEditStarsModalOpen, editStarsForm, starsHistory]);


  // Calculate total extended hours from Gia_hạn table
  const calculateTotalExtendedHours = (studentId: string): number => {
    let total = 0;
    extensionHistory.forEach((record) => {
      if (record.studentId === studentId) {
        total += Number(record["Giờ nhập thêm"]) || 0;
      }
    });
    return total;
  };

  // Calculate total reward stars for a student
  const calculateTotalRewardStars = (studentId: string): number => {
    let total = 0;

    // Sum stars from attendance sessions
    attendanceSessions.forEach((session) => {
      const studentRecord = session["Điểm danh"]?.find(
        (record: any) => record["Student ID"] === studentId
      );
      if (studentRecord && studentRecord["Điểm thưởng"]) {
        total += Number(studentRecord["Điểm thưởng"]) || 0;
      }
    });

    // Add adjustments from stars history
    starsHistory.forEach((record) => {
      if (record.studentId === studentId) {
        total += Number(record["Thay đổi"]) || 0;
      }
    });

    return total;
  };

  // Calculate total hours for a student from Điểm_danh_sessions (matching StudentReport logic)
  const calculateStudentHours = (
    studentId: string,
    fromDate?: Date,
    toDate?: Date
  ) => {
    // Filter attendance sessions where this student has a record
    let studentSessions = attendanceSessions.filter((session) => {
      // Check if student has attendance record in this session
      const hasAttendance = session["Điểm danh"]?.some(
        (record: any) => record["Student ID"] === studentId
      );
      return hasAttendance;
    });

    // Apply date filter if provided
    if (fromDate && toDate) {
      studentSessions = studentSessions.filter((session) => {
        if (!session["Ngày"]) return false;
        const sessionDate = new Date(session["Ngày"]);
        return sessionDate >= fromDate && sessionDate <= toDate;
      });
    }

    let totalMinutes = 0;
    let presentSessions = 0;
    let absentSessions = 0;

    studentSessions.forEach((session) => {
      const record = session["Điểm danh"]?.find(
        (r: any) => r["Student ID"] === studentId
      );

      if (record) {
        // Only count hours if student was present
        if (record["Có mặt"]) {
          const start = session["Giờ bắt đầu"] || "0:0";
          const end = session["Giờ kết thúc"] || "0:0";
          const [startH, startM] = start.split(":").map(Number);
          const [endH, endM] = end.split(":").map(Number);
          const minutes = endH * 60 + endM - (startH * 60 + startM);
          if (minutes > 0) totalMinutes += minutes;
          presentSessions++;
        } else {
          absentSessions++;
        }
      }
    });

    console.log(`📊 Student ${studentId} stats:`, {
      totalSessions: studentSessions.length,
      presentSessions,
      absentSessions,
      totalMinutes,
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    });

    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      totalSessions: studentSessions.length,
      presentSessions,
      absentSessions,
    };
  };

  // Get unique classes for a student with subject info from Lớp_học table
  const getStudentClasses = (studentId: string): Array<{ className: string, subject: string }> => {
    const studentClasses: Array<{ className: string, subject: string }> = [];

    // Find all classes where this student is enrolled
    classes.forEach((classInfo) => {
      const studentIds = classInfo["Student IDs"] || [];
      if (studentIds.includes(studentId)) {
        const subjectName = classInfo["Môn học"] || "Chưa xác định";
        studentClasses.push({
          className: classInfo["Tên lớp"] || "Chưa đặt tên",
          subject: subjectMap[subjectName] || subjectName
        });
      }
    });

    return studentClasses;
  };

  // Handle showing class list modal
  const handleShowClasses = (studentId: string, studentName: string) => {
    const studentClasses = getStudentClasses(studentId);
    setSelectedStudentClasses(studentClasses);
    setClassModalOpen(true);
  };

  // Get student events by date range (using student ID from attendance records)
  const getStudentEventsByDateRange = (
    studentId: string,
    fromDate?: Date,
    toDate?: Date
  ) => {
    // If no date range specified, use current month
    if (!fromDate || !toDate) {
      const now = new Date();
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return attendanceSessions
      .filter((session) => {
        // Check if student has attendance record in this session
        const hasAttendance = session["Điểm danh"]?.some(
          (record: any) => record["Student ID"] === studentId
        );
        if (!hasAttendance) return false;
        if (!session["Ngày"]) return false;
        const sessionDate = new Date(session["Ngày"]);
        return sessionDate >= fromDate! && sessionDate <= toDate!;
      })
      .sort((a, b) => {
        const dateA = new Date(a["Ngày"]);
        const dateB = new Date(b["Ngày"]);
        return dateA.getTime() - dateB.getTime();
      });
  };

  // Filter students data
  const displayStudents = useMemo(() => {
    console.log("🔍 StudentListView Permission Debug:", {
      userEmail: currentUser?.email,
      userProfile: userProfile,
      isAdmin: userProfile?.isAdmin,
      role: userProfile?.role,
      position: userProfile?.position,
    });

    let filteredStudents = students;

    // 🔒 PERMISSION FILTER: Admin sees all, Teacher sees only students in their classes
    if (!userProfile?.isAdmin && userProfile?.role === "teacher") {
      console.log("❌ TEACHER MODE ACTIVATED - Filtering students by classes");
      const teacherId = userProfile?.teacherId || userProfile?.uid;

      // Collect student IDs from classes where this teacher is assigned
      const teacherStudentIds = new Set<string>();
      classes.forEach((c) => {
        const match = c["Teacher ID"] === teacherId || c["Teacher ID"] === userProfile?.uid;
        if (match) {
          const sids = c["Student IDs"] || [];
          sids.forEach((id: string) => teacherStudentIds.add(id));
        }
      });

      console.log(`👨‍🏫 Teacher ${teacherId} student IDs:`, Array.from(teacherStudentIds));

      // Filter students to only those enrolled in teacher's classes
      filteredStudents = students.filter((student) => teacherStudentIds.has(student.id));
      console.log(`🔒 Filtered to ${filteredStudents.length} students for teacher`);
    } else {
      console.log("✅ ADMIN/MANAGER MODE - Showing all students");
    }
    // Admin sees all students

    console.log(
      `📊 Final student count: ${filteredStudents.length} / ${students.length}`
    );

    return filteredStudents
      .map((student) => {
        // Calculate date range from selected month
        let fromDate: Date | undefined;
        let toDate: Date | undefined;

        if (selectedMonth) {
          fromDate = selectedMonth.startOf('month').toDate();
          toDate = selectedMonth.endOf('month').toDate();
        }

        const stats = calculateStudentHours(
          student.id, // Use student ID instead of name
          fromDate,
          toDate
        );

        // Tính tổng giờ đã gia hạn từ bảng Gia_hạn (không dùng từ Students)
        const hoursExtendedFromHistory = calculateTotalExtendedHours(
          student.id
        );
        const totalStudiedHours = stats.hours + stats.minutes / 60;
        const hoursRemaining = Math.max(
          0,
          hoursExtendedFromHistory - totalStudiedHours
        );

        // Calculate total reward stars
        const totalStars = calculateTotalRewardStars(student.id);

        return {
          ...student,
          ...stats,
          hoursExtended: hoursExtendedFromHistory, // Override với giá trị từ bảng Gia_hạn
          hoursRemaining: hoursRemaining,
          totalStars: totalStars,
        };
      })
      .filter((student) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
          student["Họ và tên"]?.toLowerCase().includes(search) ||
          student["Mã học sinh"]?.toLowerCase().includes(search) ||
          student["Số điện thoại"]?.toLowerCase().includes(search) ||
          student["Email"]?.toLowerCase().includes(search)
        );
      });
  }, [
    students,
    attendanceSessions,
    selectedMonth,
    searchTerm,
    extensionHistory,
    starsHistory,
    userProfile,
    currentUser,
  ]);

  const handleStudentClick = (student: Student) => {
    setSelectedStudent(student);
    // Initialize date range filter to current month
    const now = dayjs();
    setDateRangeFilter([now.startOf('month'), now.endOf('month')]);
    setQuickFilter('month');
    setSubjectFilter(null); // Reset subject filter
    setModalOpen(true);
  };

  const handleEditStudent = (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    setEditingStudent(student);
    setEditModalOpen(true);
  };

  const handleDeleteStudent = async (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    Modal.confirm({
      title: "Xóa học sinh",
      content: `Bạn có chắc chắn muốn xóa học sinh "${student["Họ và tên"]}" không?`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          // Get auth token
          if (!currentUser) {
            message.error("Bạn phải đăng nhập để xóa học sinh");
            return;
          }

          const url = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh/${student.id}.json`;
          const response = await fetch(url, {
            method: "DELETE",
          });
          if (response.ok) {
            setStudents(students.filter((s) => s.id !== student.id));
            message.success("Xóa học sinh thành công!");
          }
        } catch (error) {
          console.error("Error deleting student:", error);
          message.error("Xóa học sinh thất bại. Vui lòng thử lại.");
        }
      },
    });
  };

  const handleDeleteMultiple = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một học sinh để xóa");
      return;
    }

    Modal.confirm({
      title: "Xóa nhiều học sinh",
      content: `Bạn có chắc chắn muốn xóa ${selectedRowKeys.length} học sinh đã chọn?`,
      okText: "Xóa",
      cancelText: "Hủy",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (!currentUser) {
            message.error("Bạn phải đăng nhập để xóa học sinh");
            return;
          }

          for (const studentId of selectedRowKeys) {
            const url = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh/${studentId}.json`;
            await fetch(url, {
              method: "DELETE",
            });
          }

          setStudents(students.filter((s) => !selectedRowKeys.includes(s.id)));
          setSelectedRowKeys([]);
          message.success(`Đã xóa ${selectedRowKeys.length} học sinh`);
        } catch (error) {
          console.error("Error deleting students:", error);
          message.error("Có lỗi xảy ra khi xóa học sinh");
        }
      },
    });
  };

  const handleSaveStudent = async (studentData: Partial<Student>, selectedClassIds: string[] = [], enrollmentDate?: string) => {
    try {
      const isNew = !studentData.id;

      console.log("💾 handleSaveStudent called:", {
        isNew,
        editingStudent,
        editingStudentId: editingStudent?.id,
        studentDataId: studentData.id,
        studentData,
      });

      if (isNew) {
        // Add new student - Remove id field from studentData
        if (!currentUser) {
          message.error("Bạn phải đăng nhập để thêm học sinh");
          return;
        }
        const { id, ...dataWithoutId } = studentData as any;

        console.log("📤 Sending new student data:", dataWithoutId);

        const response = await fetch(`${STUDENT_LIST_URL}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataWithoutId),
        });

        console.log(
          "📡 Response status:",
          response.status,
          response.statusText
        );

        if (response.ok) {
          const data = await response.json();
          console.log("✅ Student added to Firebase:", data);
          const newStudent = { id: data.name, ...dataWithoutId } as Student;
          setStudents([...students, newStudent]);
          setEditModalOpen(false);
          setEditingStudent(null);
          message.success("Thêm học sinh thành công!");

          // If selected classes provided, add this student to those classes
          if (selectedClassIds && selectedClassIds.length > 0) {
            try {
              // Use provided enrollment date or default to today
              const dateToUse = enrollmentDate || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
              for (const classId of selectedClassIds) {
                const cls = classes.find((c) => c.id === classId);
                if (!cls) continue;
                const currentIds = Array.isArray(cls["Student IDs"]) ? cls["Student IDs"] : [];
                if (!currentIds.includes(newStudent.id)) {
                  const updatedIds = [...currentIds, newStudent.id];
                  const currentEnrollments = cls["Student Enrollments"] || {};
                  const updatedEnrollments = {
                    ...currentEnrollments,
                    [newStudent.id]: { enrollmentDate: dateToUse }
                  };
                  const url = `${DATABASE_URL_BASE}/datasheet/Lớp_học/${classId}.json`;
                  await fetch(url, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      "Student IDs": updatedIds,
                      "Student Enrollments": updatedEnrollments
                    }),
                  });
                }
              }
              // Refresh classes locally
              const resp = await fetch(`${DATABASE_URL_BASE}/datasheet/Lớp_học.json`);
              const clsData = await resp.json();
              if (clsData) {
                const classesArray = Object.entries(clsData).map(([id, cls]: [string, any]) => ({ id, ...cls }));
                setClasses(classesArray);
              }
              message.success(`Đã thêm học sinh vào ${selectedClassIds.length} lớp (từ ngày ${dateToUse})`);
            } catch (err) {
              console.error("Error updating class membership for new student:", err);
            }
          }
        } else {
          const errorText = await response.text();
          console.error(
            "❌ Failed to add student. Status:",
            response.status,
            errorText
          );
          message.error(
            `Xảy ra lỗi khi thêm học sinh. Trạng thái: ${response.status}\n${errorText}`
          );
        }
      } else {
        // Check if Hours Extended changed
        const oldHours = Number(editingStudent["Số giờ đã gia hạn"]) || 0;
        const newHours = Number(studentData["Số giờ đã gia hạn"]) || 0;
        const hoursChanged = oldHours !== newHours;

        console.log("🔍 Checking Hours Extended change:", {
          oldHours,
          newHours,
          changed: hoursChanged,
        });

        // Update existing student
        if (!currentUser) {
          message.error("Bạn phải đăng nhập để cập nhật học sinh");
          return;
        }
        const url = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh/${studentData.id}.json`;
        console.log("📤 Updating student:", studentData.id, studentData);
        const response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(studentData),
        });

        if (response.ok) {
          console.log("✅ Student updated in Firebase successfully");

          // If Hours Extended changed, log it in Extension History
          if (hoursChanged) {
            console.log("📝 Creating adjustment log for Hours Extended change");

            // Calculate current studied hours
            const stats = calculateStudentHours(editingStudent["Họ và tên"]);
            const totalStudiedHours = stats.hours + stats.minutes / 60;
            const hoursRemaining = Math.max(0, newHours - totalStudiedHours);

            const now = new Date();
            const adjustmentLog = {
              studentId: studentData.id,
              "Giờ đã học": `${stats.hours}h ${stats.minutes}p`,
              "Giờ còn lại": hoursRemaining.toFixed(2),
              "Giờ nhập thêm": newHours - oldHours, // The difference (can be negative)
              "Người nhập": currentUsername,
              "Ngày nhập": now.toISOString().split("T")[0],
              "Giờ nhập": now.toTimeString().split(" ")[0],
              Timestamp: now.toISOString(),
              "Adjustment Type": "Manual Edit from Student Profile",
              "Old Total": oldHours,
              "New Total": newHours,
              Note: `Hours Extended manually adjusted from ${oldHours}h to ${newHours}h`,
            };

            try {
              const logResponse = await fetch(EXTENSION_HISTORY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(adjustmentLog),
              });

              if (logResponse.ok) {
                console.log("✅ Adjustment logged to Extension History");

                // Refresh extension history
                const refreshHistoryResponse = await fetch(
                  `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
                  {
                    cache: "no-cache",
                  }
                );
                const refreshHistoryData = await refreshHistoryResponse.json();
                if (refreshHistoryData) {
                  const historyArray = Object.keys(refreshHistoryData).map(
                    (key) => ({
                      id: key,
                      ...refreshHistoryData[key],
                    })
                  );
                  historyArray.sort(
                    (a, b) =>
                      new Date(b.Timestamp || 0).getTime() -
                      new Date(a.Timestamp || 0).getTime()
                  );
                  setExtensionHistory(historyArray);
                }
              } else {
                console.warn(
                  "⚠️ Failed to log adjustment, but student updated successfully"
                );
              }
            } catch (logError) {
              console.error("❌ Error logging adjustment:", logError);
              // Don't fail the whole operation
            }
          }

          // Refresh students from Firebase after update
          const refetchResponse = await fetch(
            `${STUDENT_LIST_URL}?_=${new Date().getTime()}`,
            {
              cache: "no-cache",
            }
          );
          const refetchData = await refetchResponse.json();
          if (refetchData) {
            const studentsArray = Object.keys(refetchData).map((key) => ({
              id: key,
              ...refetchData[key],
            }));
            console.log(
              "🔄 Students refetched after update:",
              studentsArray.length
            );
            setStudents(studentsArray);
          }

          setEditModalOpen(false);
          setEditingStudent(null);

          if (hoursChanged) {
            message.success(
              `Học sinh đã cập nhật và thay đổi Giờ mở rộng đã được ghi lại!\nCũ: ${oldHours}h → Mới: ${newHours}h`
            );
          } else {
            message.success("Học sinh đã được cập nhật thành công!");
          }
        } else {
          const errorText = await response.text();
          console.error(
            "❌ Không cập nhật được học sinh. Status:",
            response.status,
            errorText
          );
          message.error(
            `Không cập nhật được học sinh. Status: ${response.status}`
          );
        }
        // After updating student, update class membership according to selectedClassIds
        try {
          const studentId = studentData.id as string;
          // previous classes where student was enrolled
          const previousClassIds = classes.filter((c) => (c["Student IDs"] || []).includes(studentId)).map((c) => c.id);
          const toAdd = selectedClassIds.filter((id) => !previousClassIds.includes(id));
          const toRemove = previousClassIds.filter((id) => !selectedClassIds.includes(id));

          for (const classId of toAdd) {
            const cls = classes.find((c) => c.id === classId);
            if (!cls) continue;
            const currentIds = Array.isArray(cls["Student IDs"]) ? cls["Student IDs"] : [];
            if (!currentIds.includes(studentId)) {
              const updatedIds = [...currentIds, studentId];
              // Use provided enrollment date or default to today
              const dateToUse = enrollmentDate || new Date().toISOString().split('T')[0];
              const currentEnrollments = cls["Student Enrollments"] || {};
              const updatedEnrollments = {
                ...currentEnrollments,
                [studentId]: { enrollmentDate: dateToUse }
              };
              const url2 = `${DATABASE_URL_BASE}/datasheet/Lớp_học/${classId}.json`;
              await fetch(url2, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  "Student IDs": updatedIds,
                  "Student Enrollments": updatedEnrollments
                }),
              });
            }
          }
          for (const classId of toRemove) {
            const cls = classes.find((c) => c.id === classId);
            if (!cls) continue;
            const currentIds = Array.isArray(cls["Student IDs"]) ? cls["Student IDs"] : [];
            if (currentIds.includes(studentId)) {
              const updatedIds = currentIds.filter((sid: string) => sid !== studentId);
              const url3 = `${DATABASE_URL_BASE}/datasheet/Lớp_học/${classId}.json`;
              await fetch(url3, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "Student IDs": updatedIds }),
              });
            }
          }
          // Refresh classes
          const resp2 = await fetch(`${DATABASE_URL_BASE}/datasheet/Lớp_học.json`);
          const clsData2 = await resp2.json();
          if (clsData2) {
            const classesArray2 = Object.entries(clsData2).map(([id, cls]: [string, any]) => ({ id, ...cls }));
            setClasses(classesArray2);
          }
        } catch (err) {
          console.error("Error syncing class membership after student update:", err);
        }
      }
    } catch (error) {
      console.error("Error saving student:", error);
      message.error("Lỗi khi lưu học sinh: " + error);
    }
  };

  const handleAddStudent = () => {
    setEditingStudent(null);
    setEditModalOpen(true);
  };

  const handleExtendHours = (student: Student) => {
    setExtendingStudent(student);
    setExtendModalOpen(true);
  };

  // Handle direct stars editing
  const handleDirectStarsChange = async (student: Student, newTotal: number | null) => {
    if (newTotal === null || newTotal === undefined) return;

    const currentTotal = calculateTotalRewardStars(student.id);
    const adjustment = newTotal - currentTotal;

    // If no change, don't save
    if (adjustment === 0) return;

    try {
      const now = new Date();
      const starsRecord = {
        studentId: student.id,
        "Thay đổi": adjustment,
        "Số sao trước": currentTotal,
        "Số sao sau": newTotal,
        "Lý do": "Chỉnh sửa trực tiếp",
        "Người chỉnh sửa": userProfile?.displayName || currentUser?.email || "Admin",
        "Ngày chỉnh sửa": now.toISOString().split("T")[0],
        "Giờ chỉnh sửa": now.toTimeString().split(" ")[0],
        "Loại thay đổi": "Điều chỉnh",
        Timestamp: now.toISOString(),
      };

      const response = await fetch(STARS_HISTORY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(starsRecord),
      });

      if (response.ok) {
        const refreshResponse = await fetch(
          `${STARS_HISTORY_URL}?_=${new Date().getTime()}`,
          { cache: "no-cache" }
        );
        const refreshData = await refreshResponse.json();
        if (refreshData) {
          const historyArray = Object.keys(refreshData).map((key) => ({
            id: key,
            ...refreshData[key],
          }));
          historyArray.sort(
            (a, b) =>
              new Date(b.Timestamp || 0).getTime() -
              new Date(a.Timestamp || 0).getTime()
          );
          setStarsHistory(historyArray);
        }
        message.success(`Đã cập nhật số sao thưởng thành ${newTotal} ⭐`);
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to save stars:", response.status, errorText);
        message.error("Không lưu được số sao thưởng");
      }
    } catch (error) {
      console.error("❌ Error saving stars:", error);
      message.error("Không lưu được số sao thưởng");
    }
  };

  const handleEditStars = (student: Student) => {
    console.log("🌟 handleEditStars called for student:", student["Họ và tên"]);
    console.log("🌟 Student ID:", student.id);

    setEditingStarsStudent(student);
    const currentTotal = calculateTotalRewardStars(student.id);

    console.log("🌟 Current total stars:", currentTotal);
    console.log("🌟 Opening modal...");

    editStarsForm.setFieldsValue({
      currentTotal: currentTotal,
      adjustment: 0,
      reason: "",
    });
    setEditStarsModalOpen(true);

    console.log("🌟 Modal state set to true");
  };



  const handleEditExtension = (record: any) => {
    setEditingExtension(record);
    setEditExtensionModalOpen(true);
  };

  const handleSaveEditedExtension = async (
    newHours: number,
    reason: string
  ) => {
    if (!editingExtension) return;

    try {
      const oldHours = Number(editingExtension["Giờ nhập thêm"]) || 0;
      const studentId = editingExtension.studentId;

      // Update the existing record with new hours and edit history
      const now = new Date();
      const editHistory = editingExtension["Edit History"] || [];
      editHistory.push({
        "Old Hours": oldHours,
        "New Hours": newHours,
        Reason: reason,
        "Edited By": currentUsername,
        "Edited At": now.toISOString(),
        "Edited Date": now.toLocaleDateString("vi-VN"),
        "Edited Time": now.toTimeString().split(" ")[0],
      });

      const updatedRecord = {
        ...editingExtension,
        "Giờ nhập thêm": newHours,
        "Edit History": editHistory,
        "Last Edited": now.toISOString(),
        "Last Edited By": currentUsername,
      };

      // Update in Firebase
      const updateUrl = `${EXTENSION_HISTORY_URL}/${editingExtension.id}.json`;
      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRecord),
      });

      if (!updateResponse.ok) {
        throw new Error(`Failed to update: ${updateResponse.status}`);
      }

      // Recalculate total extended hours
      const historyResponse = await fetch(
        `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
        {
          cache: "no-cache",
        }
      );
      const historyData = await historyResponse.json();

      let totalExtended = 0;
      if (historyData) {
        Object.keys(historyData).forEach((key) => {
          const record = historyData[key];
          if (record.studentId === studentId) {
            totalExtended += Number(record["Giờ nhập thêm"]) || 0;
          }
        });
      }

      console.log("📊 Updated total extended hours:", totalExtended);

      // Update student's total extended hours
      if (!currentUser) {
        throw new Error("You must be logged in to update student hours");
      }
      const studentUrl = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh/${studentId}.json`;
      const studentUpdateResponse = await fetch(studentUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "Số giờ đã gia hạn": totalExtended }),
      });

      if (!studentUpdateResponse.ok) {
        throw new Error(
          `Không cập nhật được học sinh: ${studentUpdateResponse.status}`
        );
      }

      // Refresh all data
      const refetchResponse = await fetch(
        `${STUDENT_LIST_URL}?_=${new Date().getTime()}`,
        {
          cache: "no-cache",
        }
      );
      const refetchData = await refetchResponse.json();
      if (refetchData) {
        const studentsArray = Object.keys(refetchData).map((key) => ({
          id: key,
          ...refetchData[key],
        }));
        setStudents(studentsArray);
      }

      // Refresh extension history
      const refreshHistoryResponse = await fetch(
        `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
        {
          cache: "no-cache",
        }
      );
      const refreshHistoryData = await refreshHistoryResponse.json();
      if (refreshHistoryData) {
        const historyArray = Object.keys(refreshHistoryData).map((key) => ({
          id: key,
          ...refreshHistoryData[key],
        }));
        historyArray.sort(
          (a, b) =>
            new Date(b.Timestamp || 0).getTime() -
            new Date(a.Timestamp || 0).getTime()
        );
        setExtensionHistory(historyArray);
      }

      setEditExtensionModalOpen(false);
      setEditingExtension(null);
      message.success("Tiện ích mở rộng đã được cập nhật thành công!");
    } catch (error) {
      console.error("Error updating extension:", error);
      message.error("Không cập nhật được tiện ích mở rộng: " + error);
    }
  };

  const handleDeleteExtension = async (recordId: string, studentId: string) => {
    if (
      !confirm(
        "⚠️ Bạn có chắc chắn muốn xóa bản ghi tiện ích mở rộng này không?"
      )
    ) {
      return;
    }

    try {
      console.log("🗑️ Deleting extension record:", recordId);

      // Delete from Extension History table
      const deleteUrl = `${EXTENSION_HISTORY_URL}/${recordId}.json`;
      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE",
      });

      if (!deleteResponse.ok) {
        throw new Error(`Failed to delete: ${deleteResponse.status}`);
      }

      console.log("✅ Extension record deleted");

      // Recalculate total extended hours from remaining records
      const historyResponse = await fetch(
        `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
        {
          cache: "no-cache",
        }
      );
      const historyData = await historyResponse.json();

      let totalExtended = 0;
      if (historyData) {
        Object.keys(historyData).forEach((key) => {
          const record = historyData[key];
          if (record.studentId === studentId) {
            totalExtended += Number(record["Giờ nhập thêm"]) || 0;
          }
        });
      }

      console.log("📊 Updated total extended hours:", totalExtended);

      // Update student's total extended hours
      const studentUrl = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh/${studentId}.json`;
      const updateResponse = await fetch(studentUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "Số giờ đã gia hạn": totalExtended }),
      });

      if (!updateResponse.ok) {
        throw new Error(
          `Không cập nhật được học sinh: ${updateResponse.status}`
        );
      }

      // Refresh all data
      const refetchResponse = await fetch(
        `${STUDENT_LIST_URL}?_=${new Date().getTime()}`,
        {
          cache: "no-cache",
        }
      );
      const refetchData = await refetchResponse.json();
      if (refetchData) {
        const studentsArray = Object.keys(refetchData).map((key) => ({
          id: key,
          ...refetchData[key],
        }));
        setStudents(studentsArray);
      }

      // Refresh extension history
      const refreshHistoryResponse = await fetch(
        `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
        {
          cache: "no-cache",
        }
      );
      const refreshHistoryData = await refreshHistoryResponse.json();
      if (refreshHistoryData) {
        const historyArray = Object.keys(refreshHistoryData).map((key) => ({
          id: key,
          ...refreshHistoryData[key],
        }));
        historyArray.sort(
          (a, b) =>
            new Date(b.Timestamp || 0).getTime() -
            new Date(a.Timestamp || 0).getTime()
        );
        setExtensionHistory(historyArray);
      }

      message.success("Bản ghi mở rộng đã được xóa thành công!");
    } catch (error) {
      console.error("Error deleting extension:", error);
      message.error("Không xóa được bản ghi mở rộng: " + error);
    }
  };

  const handleSaveExtension = async (additionalHours: number) => {
    if (!extendingStudent) return;

    try {
      console.log("🔍 Extending student:", {
        id: extendingStudent.id,
        name: extendingStudent["Họ và tên"],
        currentExtended: extendingStudent["Số giờ đã gia hạn"],
      });

      if (!extendingStudent.id) {
        message.error("Lỗi: Học sinh không có ID!");
        console.error("❌ Học sinh thiếu ID:", extendingStudent);
        return;
      }

      // Tìm học sinh từ students state (đã có sẵn)
      console.log("🔍 Searching in students array:", {
        totalStudents: students.length,
        lookingForId: extendingStudent.id,
        availableIds: students.map((s) => s.id),
      });

      const currentStudent = students.find((s) => s.id === extendingStudent.id);

      if (!currentStudent) {
        message.error("Không tìm thấy học sinh trong danh sách!");
        console.error(
          "❌ Student not found in students array. ID:",
          extendingStudent.id
        );
        console.error("📋 Available students:", students);
        return;
      }

      console.log("✅ Found student in state:", currentStudent);

      const now = new Date();
      // Chỉ lưu studentId để nối với bảng Danh_sách_học_sinh
      const extensionRecord = {
        studentId: extendingStudent.id, // KEY để nối 2 bảng
        "Giờ đã học": `${extendingStudent.hours}h ${extendingStudent.minutes}p`,
        "Giờ còn lại": extendingStudent.hoursRemaining?.toFixed(2) || "0",
        "Giờ nhập thêm": additionalHours,
        "Người nhập": currentUsername,
        "Ngày nhập": now.toISOString().split("T")[0],
        "Giờ nhập": now.toTimeString().split(" ")[0],
        Timestamp: now.toISOString(),
      };

      // Save extension history
      const historyResponse = await fetch(EXTENSION_HISTORY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extensionRecord),
      });

      if (historyResponse.ok) {
        // Lấy lại TOÀN BỘ lịch sử gia hạn từ Firebase
        const refreshHistoryResponse = await fetch(
          `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
          {
            cache: "no-cache",
          }
        );
        const historyData = await refreshHistoryResponse.json();

        // Tính TỔNG tất cả giờ gia hạn của học sinh này từ bảng Gia_hạn
        let totalExtended = 0;
        if (historyData) {
          Object.keys(historyData).forEach((key) => {
            const record = historyData[key];
            if (record.studentId === extendingStudent.id) {
              totalExtended += Number(record["Giờ nhập thêm"]) || 0;
            }
          });
        }

        console.log("📤 Cập nhật tổng giờ từ bảng Gia_hạn:", {
          id: extendingStudent.id,
          name: currentStudent["Họ và tên"],
          totalFromHistory: totalExtended,
          justAdded: additionalHours,
        });

        // Cập nhật tổng vào bảng Danh_sách_học_sinh
        if (!currentUser) {
          throw new Error("You must be logged in to update student hours");
        }
        const studentUrl = `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh/${extendingStudent.id}.json`;
        const updateResponse = await fetch(studentUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "Số giờ đã gia hạn": totalExtended }),
        });

        if (updateResponse.ok) {
          const result = await updateResponse.json();
          console.log("✅ Extension saved successfully to Firebase:", result);

          // Refetch student data from Firebase to ensure accuracy
          const refetchResponse = await fetch(
            `${STUDENT_LIST_URL}?_=${new Date().getTime()}`,
            {
              cache: "no-cache",
            }
          );
          const refetchData = await refetchResponse.json();
          if (refetchData) {
            const studentsArray = Object.keys(refetchData).map((key) => ({
              id: key,
              ...refetchData[key],
            }));
            console.log("🔄 Students refetched after extension");
            setStudents(studentsArray);
          }

          // Refresh extension history - fetch ALL records again
          const refreshHistoryResponse2 = await fetch(
            `${EXTENSION_HISTORY_URL}?_=${new Date().getTime()}`,
            {
              cache: "no-cache",
            }
          );
          const refreshHistoryData = await refreshHistoryResponse2.json();
          if (refreshHistoryData) {
            const historyArray = Object.keys(refreshHistoryData).map((key) => ({
              id: key,
              ...refreshHistoryData[key],
            }));
            historyArray.sort(
              (a, b) =>
                new Date(b.Timestamp || 0).getTime() -
                new Date(a.Timestamp || 0).getTime()
            );
            console.log(
              "🔄 Extension history refetched:",
              historyArray.length,
              "records"
            );
            setExtensionHistory(historyArray);
          }

          setExtendModalOpen(false);
          setExtendingStudent(null);

          const action = additionalHours >= 0 ? "Thêm" : "Trừ";
          const absHours = Math.abs(additionalHours);
          message.success(
            `Thành công ${action} ${absHours} giờ cho ${extendingStudent["Họ và tên"]}!\nTổng mới: ${totalExtended}h`
          );
        } else {
          const errorText = await updateResponse.text();
          console.error(
            "❌ Failed to update Firebase:",
            updateResponse.status,
            errorText
          );
          message.error(
            `Không cập nhật được học sinh. Status: ${updateResponse.status}`
          );
        }
      }
    } catch (error) {
      console.error("❌ Error saving extension:", error);
      message.error(
        "Không lưu được tiện ích mở rộng. Kiểm tra bảng điều khiển để biết thêm chi tiết."
      );
    }
  };

  // Handle saving stars adjustment
  const handleSaveStars = async (adjustment: number, reason: string) => {
    if (!editingStarsStudent) return;

    try {
      console.log("⭐ Saving stars adjustment:", {
        studentId: editingStarsStudent.id,
        studentName: editingStarsStudent["Họ và tên"],
        adjustment,
        reason,
      });

      const currentTotal = calculateTotalRewardStars(editingStarsStudent.id);
      const newTotal = currentTotal + adjustment;

      const now = new Date();
      const starsRecord = {
        studentId: editingStarsStudent.id,
        "Thay đổi": adjustment,
        "Số sao trước": currentTotal,
        "Số sao sau": newTotal,
        "Lý do": reason,
        "Người chỉnh sửa": userProfile?.displayName || currentUser?.email || "Admin",
        "Ngày chỉnh sửa": now.toISOString().split("T")[0],
        "Giờ chỉnh sửa": now.toTimeString().split(" ")[0],
        "Loại thay đổi": "Điều chỉnh",
        Timestamp: now.toISOString(),
      };

      const response = await fetch(STARS_HISTORY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(starsRecord),
      });

      if (response.ok) {
        console.log("✅ Stars adjustment saved successfully");

        const refreshResponse = await fetch(
          `${STARS_HISTORY_URL}?_=${new Date().getTime()}`,
          { cache: "no-cache" }
        );
        const refreshData = await refreshResponse.json();
        if (refreshData) {
          const historyArray = Object.keys(refreshData).map((key) => ({
            id: key,
            ...refreshData[key],
          }));
          historyArray.sort(
            (a, b) =>
              new Date(b.Timestamp || 0).getTime() -
              new Date(a.Timestamp || 0).getTime()
          );
          setStarsHistory(historyArray);
        }

        setEditStarsModalOpen(false);
        setEditingStarsStudent(null);
        editStarsForm.resetFields();

        message.success(
          `Đã ${adjustment > 0 ? "thêm" : "trừ"} ${Math.abs(adjustment)} sao thưởng cho ${editingStarsStudent["Họ và tên"]}!\nTổng mới: ${newTotal} ⭐`
        );
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to save stars:", response.status, errorText);
        message.error(`Không lưu được điều chỉnh sao thưởng. Status: ${response.status}`);
      }
    } catch (error) {
      console.error("❌ Error saving stars:", error);
      message.error("Không lưu được điều chỉnh sao thưởng. Kiểm tra console để biết chi tiết.");
    }
  };

  const handleResetStars = async () => {
    if (!editingStarsStudent) return;

    Modal.confirm({
      title: "Xác nhận reset sao thưởng",
      content: `Bạn có chắc chắn muốn reset tất cả sao thưởng của ${editingStarsStudent["Họ và tên"]} về 0?`,
      okText: "Reset",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          console.log("⭐ Resetting stars for:", editingStarsStudent.id);

          const currentTotal = calculateTotalRewardStars(editingStarsStudent.id);

          const now = new Date();
          const resetRecord = {
            studentId: editingStarsStudent.id,
            "Thay đổi": -currentTotal,
            "Số sao trước": currentTotal,
            "Số sao sau": 0,
            "Lý do": "Reset toàn bộ sao thưởng về 0",
            "Người chỉnh sửa": userProfile?.displayName || currentUser?.email || "Admin",
            "Ngày chỉnh sửa": now.toISOString().split("T")[0],
            "Giờ chỉnh sửa": now.toTimeString().split(" ")[0],
            "Loại thay đổi": "Reset",
            Timestamp: now.toISOString(),
          };

          const response = await fetch(STARS_HISTORY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resetRecord),
          });

          if (response.ok) {
            console.log("✅ Stars reset successfully");

            const refreshResponse = await fetch(
              `${STARS_HISTORY_URL}?_=${new Date().getTime()}`,
              { cache: "no-cache" }
            );
            const refreshData = await refreshResponse.json();
            if (refreshData) {
              const historyArray = Object.keys(refreshData).map((key) => ({
                id: key,
                ...refreshData[key],
              }));
              historyArray.sort(
                (a, b) =>
                  new Date(b.Timestamp || 0).getTime() -
                  new Date(a.Timestamp || 0).getTime()
              );
              setStarsHistory(historyArray);
            }

            setEditStarsModalOpen(false);
            setEditingStarsStudent(null);
            editStarsForm.resetFields();

            message.success(
              `Đã reset sao thưởng của ${editingStarsStudent["Họ và tên"]} về 0!`
            );
          } else {
            const errorText = await response.text();
            console.error("❌ Failed to reset stars:", response.status, errorText);
            message.error(`Không reset được sao thưởng. Status: ${response.status}`);
          }
        } catch (error) {
          console.error("❌ Error resetting stars:", error);
          message.error("Không reset được sao thưởng. Kiểm tra console để biết chi tiết.");
        }
      },
    });
  };


  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Print score table function
  const handlePrintScoreTable = (student: Student, sessions: any[]) => {
    if (sessions.length === 0) {
      message.warning("Không có dữ liệu để in");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      message.error("Không thể mở cửa sổ in");
      return;
    }

    // Group by subject
    const sessionsBySubject: { [subject: string]: any[] } = {};
    sessions.forEach((session) => {
      const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
      if (!sessionsBySubject[subject]) {
        sessionsBySubject[subject] = [];
      }
      sessionsBySubject[subject].push(session);
    });

    let tablesHTML = "";
    Object.entries(sessionsBySubject).forEach(([subject, subjectSessions]) => {
      let tableRows = "";
      subjectSessions.forEach((session) => {
        const studentRecord = session["Điểm danh"]?.find(
          (r: any) => r["Student ID"] === student.id
        );
        if (!studentRecord) return;

        const attendance = studentRecord["Có mặt"]
          ? studentRecord["Đi muộn"]
            ? "Đi muộn"
            : "Có mặt"
          : studentRecord["Vắng có phép"]
            ? "Vắng có phép"
            : "Vắng";

        tableRows += `
      < tr >
            <td>${new Date(session["Ngày"]).toLocaleDateString("vi-VN")}</td>
            <td>${student["Họ và tên"]}</td>
            <td>${attendance}</td>
            <td>${studentRecord["% Hoàn thành BTVN"] ?? "-"}</td>
            <td>${studentRecord["Bài kiểm tra"] || "-"}</td>
            <td><strong>${studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? "-"}</strong></td>
            <td>${studentRecord["Điểm thưởng"] ?? "-"}</td>
            <td style="text-align: left;">${studentRecord["Ghi chú"] || "-"}</td>
          </tr >
  `;
      });

      tablesHTML += `
  < div class="subject-header" > Môn ${subject}</div >
    <table>
      <thead>
        <tr>
          <th>Ngày</th>
          <th>Tên HS</th>
          <th>Chuyên cần</th>
          <th>% BTVN</th>
          <th>Tên bài kiểm tra</th>
          <th>Điểm</th>
          <th>Điểm thưởng</th>
          <th>Nhận xét</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
`;
    });

    const htmlContent = `
  < !DOCTYPE html >
    <html>
      <head>
        <meta charset="UTF-8">
          <title>Bảng điểm - ${student["Họ và tên"]}</title>
          <style>
            @page {
              size: A4 landscape;
            margin: 15mm;
            }
            body {
              font - family: Arial, sans-serif;
            padding: 20px;
            }
            h1 {
              text - align: center;
            color: #1890ff;
            margin-bottom: 10px;
            }
            h2 {
              text - align: center;
            color: #333;
            margin-bottom: 20px;
            }
            .info {
              text - align: center;
            margin-bottom: 20px;
            color: #666;
            }
            table {
              width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            }
            th, td {
              border: 1px solid #000;
            padding: 8px;
            text-align: center;
            font-size: 11px;
            }
            th {
              background: #f0f0f0;
            font-weight: bold;
            }
            .subject-header {
              background: #e6f7ff;
            font-weight: bold;
            font-size: 14px;
            text-align: left;
            padding: 10px;
            margin-top: 20px;
            border-left: 4px solid #1890ff;
            }
            @media print {
              button {
              display: none;
              }
            }
          </style>
      </head>
      <body>
        <h1>BẢNG ĐIỂM CHI TIẾT</h1>
        <h2>Trung tâm Trí Tuệ 8+</h2>
        <div class="info">
          <p><strong>Học sinh:</strong> ${student["Họ và tên"]}</p>
          <p>Ngày xuất: ${new Date().toLocaleDateString("vi-VN")} ${new Date().toLocaleTimeString("vi-VN")}</p>
        </div>

        ${tablesHTML}

        <script>
          window.onload = function() {
            window.print();
            };
        </script>
      </body>
    </html>
`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Print report function
  const printReport = (student: Student, events: ScheduleEvent[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Use selectedMonth if available, otherwise use current month
    let fromDate: Date, toDate: Date;
    if (selectedMonth) {
      fromDate = selectedMonth.startOf('month').toDate();
      toDate = selectedMonth.endOf('month').toDate();
    } else {
      const now = new Date();
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    const totalHours = calculateStudentHours(
      student.id, // Use student ID instead of name
      fromDate,
      toDate
    );

    // Tính Hours Extended và Remaining từ bảng Gia_hạn
    const hoursExtendedFromHistory = calculateTotalExtendedHours(student.id);
    const totalStudiedHours = totalHours.hours + totalHours.minutes / 60;
    const hoursRemaining = Math.max(
      0,
      hoursExtendedFromHistory - totalStudiedHours
    );

    const reportHTML = `
  < !DOCTYPE html >
    <html>
      <head>
        <meta charset="UTF-8">
          <title>Phiếu báo học tập - ${student["Họ và tên"]}</title>
          <style>
            @page {
              size: A4 portrait;
            margin: 0.5cm;
                    }
            @media print {
              body {
              margin: 0;
            font-size: 12pt;
                        }
            h1 {font - size: 24pt !important; }
            .company-name {font - size: 16pt !important; }
            h2 {font - size: 16pt !important; }
            .info-label, .info-value {font - size: 13pt !important; }
            th, td {
              padding: 10px !important;
            font-size: 11pt !important;
                        }
                    }
            body {
              font - family: 'Arial', sans-serif;
            width: 100%;
            max-width: 20cm;
            margin: 0 auto;
            padding: 0.5cm;
            background: white;
            color: #000;
            font-size: 13pt;
                    }
            .header {
              display: flex;
            align-items: flex-start;
            justify-content: space-between;
            border-bottom: 4px solid #36797f;
            padding-bottom: 20px;
            margin-bottom: 30px;
                    }
            .logo {max - width: 140px; height: 140px; object-fit: contain; }
            .header-center {flex: 1; text-align: center; padding: 0 20px; }
            .header-right {text - align: right; min-width: 140px; }
            h1 {
              color: #36797f;
            margin: 15px 0 8px 0;
            font-size: 42px;
            font-weight: bold;
            text-transform: uppercase;
                    }
            .company-name {
              font - size: 28px;
            font-weight: bold;
            color: #000;
            margin: 5px 0;
                    }
            .month-year {
              font - size: 20px;
            color: #666;
            font-weight: normal;
                    }
            h2 {
              color: #36797f;
            font-size: 22px;
            margin-top: 35px;
            margin-bottom: 18px;
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 3px solid #36797f;
            padding-bottom: 8px;
                    }
            .info-grid {
              display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 35px;
            padding: 0;
                    }
            .info-item {margin: 10px 0; }
            .info-label {font - weight: bold; color: #333; font-size: 18px; }
            .info-value {color: #000; font-size: 20px; }
            table {
              width: 100%;
            border-collapse: collapse;
            margin: 25px 0;
                    }
            th, td {
              border: 2px solid #000;
            padding: 12px;
            text-align: left;
            font-size: 15px;
                    }
            th {
              background: #36797f;
            color: white;
            font-weight: bold;
            font-size: 16px;
                    }
            tr:nth-child(even) {background: #f9f9f9; }
            .summary {
              margin: 35px 0;
            padding: 0;
                    }
            .summary-title {
              font - size: 24px;
            font-weight: bold;
            color: #36797f;
            text-transform: uppercase;
            margin-bottom: 25px;
            border-bottom: 3px solid #36797f;
            padding-bottom: 8px;
                    }
            .summary-grid {
              display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 25px;
            text-align: center;
                    }
            .summary-item {
              padding: 20px;
            border: 3px solid #ddd;
                    }
            .summary-value {
              font - size: 42px;
            font-weight: bold;
            color: #36797f;
                    }
            .summary-label {
              color: #333;
            margin-top: 10px;
            font-size: 16px;
                    }
            .footer {
              margin - top: 60px;
            padding-top: 25px;
            border-top: 3px solid #36797f;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 50px;
                    }
            .signature {
              text - align: center;
                    }
            .signature p {
              font - size: 18px;
            font-weight: bold;
                    }
            .signature-line {
              margin - top: 70px;
            padding-top: 5px;
            font-size: 15px;
                    }
          </style>
      </head>
      <body>
        <div class="header">

          <span className="text-2xl text-white font-extrabold">Trí Tuệ 8+</span>
          <div class="header-center">
            <h1>BÁO CÁO HỌC THUẬT</h1>
            <p class="company-name">Trí Tuệ 8+</p>
          </div>
          <div class="header-right">
            <p class="month-year">${fromDate.toLocaleDateString(
      "vi-VN",
      { month: "long", year: "numeric" }
    )}</p>
            ${fromDate.getTime() !== toDate.getTime()
        ? `<p class="month-year">to ${toDate.toLocaleDateString(
          "vi-VN",
          { month: "short", day: "numeric" }
        )}</p>`
        : ""
      }
          </div>
        </div>

        <h2>Student Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Họ và tên:</span>
            <span class="info-value">${student["Họ và tên"]}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Mã học sinh:</span>
            <span class="info-value">${student["Mã học sinh"] || "N/A"
      }</span>
          </div>
          <div class="info-item">
            <span class="info-label">Sinh nhật:</span>
            <span class="info-value">${student["Ngày sinh"] || "N/A"
      }</span>
          </div>
          <div class="info-item">
            <span class="info-label">Số điện thoại:</span>
            <span class="info-value">${student["Số điện thoại"] || "N/A"
      }</span>
          </div>
        </div>

        <div class="summary">
          <div class="summary-title">TÓM TẮT HỌC THUẬT</div>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-value">${totalHours.totalSessions
      }</div>
              <div class="summary-label">Môn đăng ký</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">${totalHours.hours}h ${totalHours.minutes
      }m</div>
              <div class="summary-label">Tổng thời gian</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">${hoursExtendedFromHistory.toFixed(
        2
      )}h</div>
              <div class="summary-label">Giờ mở rộng</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">${hoursRemaining.toFixed(
        2
      )}h</div>
              <div class="summary-label">Giờ còn lại</div>
            </div>
          </div>
        </div>

        <h2>Chi tiết buổi học</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Ngày</th>
              <th>Thời gian</th>
              <th>Thời lượng</th>
              <th>Nội dung</th>
              <th>Giáo viên</th>
              <th>Nhận xét</th>
            </tr>
          </thead>
          <tbody>
            ${events
        .map((event, index) => {
          const start = event["Giờ bắt đầu"];
          const end = event["Giờ kết thúc"];
          let duration = "-";
          if (start && end) {
            const [startH, startM] = start
              .split(":")
              .map(Number);
            const [endH, endM] = end.split(":").map(Number);
            const totalMinutes =
              endH * 60 + endM - (startH * 60 + startM);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            duration =
              minutes > 0
                ? hours + "h " + minutes + "p"
                : hours + "h";
          }
          return `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${new Date(
            event["Ngày"]
          ).toLocaleDateString("vi-VN")}</td>
                                <td>${start} - ${end}</td>
                                <td style="font-weight: bold;">${duration}</td>
                                <td>${event["Tên công việc"]}</td>
                                <td>${event["Giáo viên phụ trách"]}</td>
                                <td style="font-size: 11px; max-width: 250px;">${event["Nhận xét"] || "-"
            }</td>
                            </tr>
                            `;
        })
        .join("")}
          </tbody>
        </table>

        <div class="footer">
          <div class="signature">
            <p><strong>Giáo viên phụ trách</strong></p>
            <div class="signature-line">Chữ ký</div>
          </div>
          <div class="signature">
            <p><strong>Phụ huynh/Người giám hộ</strong></p>
            <div class="signature-line">Chữ ký</div>
          </div>
        </div>

        <p style="text-align: center; margin-top: 30px; color: #64748b; font-size: 12px;">
          Ngày in phiếu: ${new Date().toLocaleDateString(
          "vi-VN"
        )} - Trí Tuệ 8+
        </p>
      </body>
    </html>
`;

    printWindow.document.write(reportHTML);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <WrapperContent
      isLoading={loading}
      title="Quản lý học sinh"
      toolbar={
        activeTab === "list" ? (
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDeleteMultiple}
              >
                Xóa {selectedRowKeys.length} học sinh đã chọn
              </Button>
            )}
            <Button
              type="primary"
              onClick={handleAddStudent}
              icon={<PlusOutlined />}
            >
              Thêm mới học sinh
            </Button>
          </Space>
        ) : null
      }
    >
      {/* Removed Tabs - showing all content directly */}
      <div>
        {/* Filters */}
        {/* Search Box */}
        <Card title="Tìm kiếm học sinh" className="mb-6">
          <Input
            placeholder="Nhập tên học sinh"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            prefix={<SearchOutlined />}
            suffix={
              searchTerm ? (
                <Button
                  type="text"
                  icon={<ClearOutlined />}
                  onClick={() => setSearchTerm("")}
                  size="small"
                />
              ) : null
            }
          />
          {searchTerm && (
            <p className="mt-2 text-sm text-gray-600">
              Tìm thấy{" "}
              <span className="font-bold text-[#36797f]">
                {displayStudents.length}
              </span>{" "}
              học sinh
            </p>
          )}
        </Card>

        <Card title="Bộ lọc" className="mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Chọn tháng
              </label>
              <DatePicker
                picker="month"
                value={selectedMonth}
                onChange={(date) => setSelectedMonth(date)}
                format="MM/YYYY"
                placeholder="Chọn tháng"
                className="w-full"
              />
            </div>
            <div className="pt-7">
              <Button
                onClick={() => setSelectedMonth(dayjs())}
                icon={<ClearOutlined />}
              >
                Tháng hiện tại
              </Button>
            </div>
          </div>
        </Card>

        {/* Students Table */}
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader />
          </div>
        ) : (
          <Card>
            <Table
              dataSource={displayStudents.map((student, index) => ({
                key: student.id,
                index: index + 1,
                name: student["Họ và tên"],
                grade: student["Khối"] || "-",
                code: student["Mã học sinh"] || "-",
                phone: student["Số điện thoại"] || "-",
                parentPhone: student["SĐT phụ huynh"] || "-",
                hours: `${student.hours}h ${student.minutes} p`,
                hoursExtended: `${student.hoursExtended || 0} h`,
                hoursRemaining: `${student.hoursRemaining ? student.hoursRemaining.toFixed(2) : "0.00"} h`,
                sessions: student.totalSessions,
                totalStars: student.totalStars || 0,
                student,
              }))}
              columns={[
                {
                  title: "#",
                  dataIndex: "index",
                  key: "index",
                  width: 60,
                  align: "center",
                  fixed: "left",
                },
                {
                  title: "Họ và tên",
                  dataIndex: "name",
                  fixed: "left",
                  key: "name",
                  render: (text) => <strong>{text}</strong>,
                },
                {
                  title: "Khối",
                  dataIndex: "grade",
                  key: "grade",
                  width: 100,
                  render: (text) => text || "-",
                },
                {
                  title: "Mã học sinh",
                  dataIndex: "code",
                  key: "code",
                  width: 120,
                },
                {
                  title: "SĐT HS",
                  dataIndex: "phone",
                  key: "phone",
                  width: 120,
                },
                {
                  title: "SĐT phụ huynh",
                  dataIndex: "parentPhone",
                  key: "parentPhone",
                  width: 120,
                },
                {
                  title: "Môn đăng ký",
                  dataIndex: "sessions",
                  key: "sessions",
                  align: "center",
                  render: (sessions, record) => {
                    const classes = getStudentClasses(record.student.id);
                    if (classes.length === 0) {
                      return <Tag>Chưa đăng ký</Tag>;
                    }
                    // Get unique subjects
                    const uniqueSubjects = Array.from(new Set(classes.map(c => c.subject)));
                    return (
                      <Space size={4} wrap>
                        {uniqueSubjects.map((subject, index) => (
                          <Tag
                            key={index}
                            color="purple"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleShowClasses(record.student.id, record.name)}
                          >
                            {subject}
                          </Tag>
                        ))}
                      </Space>
                    );
                  },
                },
                {
                  title: "Số sao thưởng",
                  dataIndex: "totalStars",
                  key: "totalStars",
                  align: "center",
                  width: 150,
                  render: (stars, record) => (
                    <StarsInput
                      value={stars || 0}
                      student={record.student}
                      onSave={(newValue) => handleDirectStarsChange(record.student, newValue)}
                    />
                  ),
                },
                {
                  title: "Cài đặt",
                  key: "actions",
                  align: "center",
                  fixed: "right",
                  width: 150,
                  render: (_, record) => (
                    <Space size={4}>
                      <Dropdown
                        menu={{
                          items: [
                            {
                              key: "view",
                              label: "Xem chi tiết",
                              icon: <EyeOutlined />,
                              onClick: () => handleStudentClick(record.student),
                            },
                            {
                              type: "divider",
                            },
                            {
                              key: "edit",
                              label: "Chỉnh sửa",
                              icon: <EditOutlined />,
                              onClick: () => {
                                // Create a synthetic event to satisfy the function signature
                                const syntheticEvent = {
                                  stopPropagation: () => { },
                                } as React.MouseEvent;
                                handleEditStudent(syntheticEvent, record.student);
                              },
                            },
                          ],
                        }}
                        trigger={["click"]}
                      >
                        <Button
                          type="text"
                          icon={<MoreOutlined />}
                          size="small"
                        />
                      </Dropdown>
                      <Popconfirm
                        title="Xóa học sinh"
                        description={`Bạn có chắc chắn muốn xóa học sinh "${record.student["Họ và tên"]}" không ? `}
                        onConfirm={(e) => {
                          const syntheticEvent = {
                            stopPropagation: () => { },
                          } as React.MouseEvent;
                          handleDeleteStudent(syntheticEvent, record.student);
                        }}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                        />
                      </Popconfirm>
                      <StudentReportButton
                        student={record.student}
                        type="link"
                        size="small"
                      />
                    </Space>
                  ),
                },
              ]}
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                getCheckboxProps: (record) => ({
                  name: record.student.id,
                }),
              }}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 1200 }}
            />
          </Card>
        )}

        {/* Student Detail Modal */}
        <Modal
          title={
            selectedStudent ? (
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-primary">
                    {selectedStudent["Họ và tên"]}
                  </h2>
                  <p className="text-primary text-sm">
                    Hồ sơ học sinh & báo cáo học tập
                  </p>
                </div>
              </div>
            ) : null
          }
          open={isModalOpen}
          onCancel={() => setModalOpen(false)}
          footer={null}
          width={1000}
          style={{ top: 20 }}
        >
          {selectedStudent && (
            <div className="p-6">
              {(() => {
                // Tính các thống kê từ attendance sessions
                const studentSessions = attendanceSessions.filter((session) =>
                  session["Điểm danh"]?.some(
                    (record: any) => record["Student ID"] === selectedStudent.id
                  )
                );

                // Tính phần trăm BTVN trung bình
                let totalHomeworkPercent = 0;
                let homeworkCount = 0;
                studentSessions.forEach((session) => {
                  const record = session["Điểm danh"]?.find(
                    (r: any) => r["Student ID"] === selectedStudent.id
                  );
                  if (record && record["% Hoàn thành BTVN"] !== undefined && record["% Hoàn thành BTVN"] !== null) {
                    totalHomeworkPercent += Number(record["% Hoàn thành BTVN"]) || 0;
                    homeworkCount++;
                  }
                });
                const avgHomeworkPercent = homeworkCount > 0
                  ? (totalHomeworkPercent / homeworkCount).toFixed(1)
                  : "0";

                // Tính tổng điểm thưởng
                let totalBonusPoints = 0;
                studentSessions.forEach((session) => {
                  const record = session["Điểm danh"]?.find(
                    (r: any) => r["Student ID"] === selectedStudent.id
                  );
                  if (record && record["Điểm thưởng"]) {
                    totalBonusPoints += Number(record["Điểm thưởng"]) || 0;
                  }
                });

                // Tính trung bình điểm kiểm tra
                let totalTestScores = 0;
                let testCount = 0;
                studentSessions.forEach((session) => {
                  const record = session["Điểm danh"]?.find(
                    (r: any) => r["Student ID"] === selectedStudent.id
                  );
                  if (record) {
                    const testScore = record["Điểm kiểm tra"] ?? record["Điểm"];
                    if (testScore !== undefined && testScore !== null) {
                      totalTestScores += Number(testScore) || 0;
                      testCount++;
                    }
                  }
                });
                const avgTestScore = testCount > 0
                  ? (totalTestScores / testCount).toFixed(1)
                  : "0";

                return (
                  <div>
                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      <Card className="border-l-4 border-[#36797f]">
                        <Statistic
                          title={
                            <span className="text-[#36797f] text-xs font-semibold uppercase tracking-wide">
                              Trung bình điểm kiểm tra
                            </span>
                          }
                          value={avgTestScore}
                          valueStyle={{
                            color: "#36797f",
                            fontSize: "24px",
                            fontWeight: "bold",
                          }}
                        />
                      </Card>
                      <Card className="border-l-4 border-[#36797f]">
                        <Statistic
                          title={
                            <span className="text-[#36797f] text-xs font-semibold uppercase tracking-wide">
                              Tổng buổi học
                            </span>
                          }
                          value={selectedStudent.totalSessions}
                          valueStyle={{
                            color: "#36797f",
                            fontSize: "24px",
                            fontWeight: "bold",
                          }}
                        />
                      </Card>
                      <Card className="border-l-4 border-green-600">
                        <Statistic
                          title={
                            <span className="text-green-600 text-xs font-semibold uppercase tracking-wide">
                              Phần trăm BTVN trung bình
                            </span>
                          }
                          value={`${avgHomeworkPercent}% `}
                          valueStyle={{
                            color: "#16a34a",
                            fontSize: "24px",
                            fontWeight: "bold",
                          }}
                        />
                      </Card>
                      <Card className="border-l-4 border-[#36797f]">
                        <Statistic
                          title={
                            <span className="text-[#36797f] text-xs font-semibold uppercase tracking-wide">
                              Tổng điểm thưởng
                            </span>
                          }
                          value={totalBonusPoints.toFixed(1)}
                          valueStyle={{
                            color: "#36797f",
                            fontSize: "24px",
                            fontWeight: "bold",
                          }}
                        />
                      </Card>
                    </div>

                    {/* Student Info */}
                    <Card
                      className="mb-6"
                      style={{ borderColor: "#36797f", borderWidth: "2px" }}
                    >
                      <Typography.Title
                        level={4}
                        style={{
                          color: "#36797f",
                          marginBottom: "16px",
                          borderBottom: "2px solid #36797f",
                          paddingBottom: "8px",
                        }}
                      >
                        Thông tin cá nhân
                      </Typography.Title>
                      <Row gutter={[24, 8]}>
                        {selectedStudent["Mã học sinh"] && (
                          <Col span={12}>
                            <div className="flex items-baseline gap-2">
                              <Typography.Text
                                strong
                                style={{ minWidth: "110px" }}
                              >
                                Mã học sinh:
                              </Typography.Text>
                              <Typography.Text
                                style={{ color: "#36797f", fontWeight: "bold" }}
                              >
                                {selectedStudent["Mã học sinh"]}
                              </Typography.Text>
                            </div>
                          </Col>
                        )}
                        {selectedStudent["Ngày sinh"] && (
                          <Col span={12}>
                            <div className="flex items-baseline gap-2">
                              <Typography.Text
                                strong
                                style={{ minWidth: "110px" }}
                              >
                                Ngày sinh:
                              </Typography.Text>
                              <Typography.Text
                                style={{ color: "#36797f", fontWeight: "bold" }}
                              >
                                {selectedStudent["Ngày sinh"]}
                              </Typography.Text>
                            </div>
                          </Col>
                        )}
                        {selectedStudent["Số điện thoại"] && (
                          <Col span={12}>
                            <div className="flex items-baseline gap-2">
                              <Typography.Text
                                strong
                                style={{ minWidth: "110px" }}
                              >
                                Số điện thoại:
                              </Typography.Text>
                              <Typography.Text
                                style={{ color: "#36797f", fontWeight: "bold" }}
                              >
                                {selectedStudent["Số điện thoại"]}
                              </Typography.Text>
                            </div>
                          </Col>
                        )}
                        {selectedStudent["Email"] && (
                          <Col span={12}>
                            <div className="flex items-baseline gap-2">
                              <Typography.Text
                                strong
                                style={{ minWidth: "110px" }}
                              >
                                Email:
                              </Typography.Text>
                              <Typography.Text
                                style={{ color: "#36797f", fontWeight: "bold" }}
                              >
                                {selectedStudent["Email"]}
                              </Typography.Text>
                            </div>
                          </Col>
                        )}
                      </Row>
                    </Card>

                    {/* Filter and Chart Section */}
                    <Card
                      className="mb-4"
                      style={{ borderColor: "#36797f", borderWidth: "2px" }}
                    >
                      <Typography.Title
                        level={4}
                        style={{ color: "#36797f", marginBottom: "16px" }}
                      >
                        Bộ lọc và Biểu đồ
                      </Typography.Title>

                      {/* Quick Filter */}
                      <div className="mb-4">
                        <Typography.Text strong style={{ marginRight: "16px" }}>
                          Bộ lọc nhanh:
                        </Typography.Text>
                        <Radio.Group
                          value={quickFilter}
                          onChange={(e) => {
                            setQuickFilter(e.target.value);
                            const now = dayjs();
                            if (e.target.value === 'month') {
                              setDateRangeFilter([now.startOf('month'), now.endOf('month')]);
                            } else if (e.target.value === 'week') {
                              setDateRangeFilter([now.startOf('isoWeek'), now.endOf('isoWeek')]);
                            } else if (e.target.value === 'year') {
                              setDateRangeFilter([now.startOf('year'), now.endOf('year')]);
                            } else {
                              setDateRangeFilter(null);
                            }
                          }}
                        >
                          <Radio.Button value="month">Theo tháng</Radio.Button>
                          <Radio.Button value="week">Theo tuần</Radio.Button>
                          <Radio.Button value="year">Theo năm</Radio.Button>
                          <Radio.Button value="custom">Tùy chỉnh</Radio.Button>
                        </Radio.Group>
                      </div>

                      {/* Date Range Picker */}
                      <div className="mb-4">
                        <Typography.Text strong style={{ marginRight: "16px" }}>
                          Lọc theo ngày:
                        </Typography.Text>
                        <DatePicker.RangePicker
                          value={dateRangeFilter}
                          onChange={(dates) => {
                            setDateRangeFilter(dates);
                            if (dates) {
                              setQuickFilter('custom');
                            }
                          }}
                          format="DD/MM/YYYY"
                          style={{ width: "300px" }}
                        />
                        {dateRangeFilter && (
                          <Button
                            type="link"
                            icon={<ClearOutlined />}
                            onClick={() => {
                              setDateRangeFilter(null);
                              setQuickFilter('month');
                            }}
                            style={{ marginLeft: "8px" }}
                          >
                            Xóa bộ lọc
                          </Button>
                        )}
                      </div>

                      {/* Subject Filter */}
                      <div className="mb-4">
                        <Typography.Text strong style={{ marginRight: "16px" }}>
                          Lọc theo môn học:
                        </Typography.Text>
                        {(() => {
                          // Get unique subjects from student's sessions
                          const studentSessions = attendanceSessions.filter((session) =>
                            session["Điểm danh"]?.some(
                              (record: any) => record["Student ID"] === selectedStudent.id
                            )
                          );
                          const uniqueSubjects = Array.from(
                            new Set(
                              studentSessions
                                .map((s) => s["Tên lớp"]?.split(" - ")[0] || s["Môn học"] || "Chưa phân loại")
                                .filter(Boolean)
                            )
                          ).sort();

                          return (
                            <Select
                              value={subjectFilter}
                              onChange={(value) => setSubjectFilter(value)}
                              placeholder="Chọn môn học"
                              allowClear
                              style={{ width: "300px" }}
                              options={[
                                { label: "Tất cả môn học", value: null },
                                ...uniqueSubjects.map((subject) => ({
                                  label: subject,
                                  value: subject,
                                })),
                              ]}
                            />
                          );
                        })()}
                        {subjectFilter && (
                          <Button
                            type="link"
                            icon={<ClearOutlined />}
                            onClick={() => setSubjectFilter(null)}
                            style={{ marginLeft: "8px" }}
                          >
                            Xóa bộ lọc môn
                          </Button>
                        )}
                      </div>

                      {/* Charts */}
                      {(() => {
                        // Get filtered sessions
                        let filteredSessions = attendanceSessions.filter((session) => {
                          const hasAttendance = session["Điểm danh"]?.some(
                            (record: any) => record["Student ID"] === selectedStudent.id
                          );
                          if (!hasAttendance) return false;
                          if (!session["Ngày"]) return false;

                          // Apply subject filter
                          if (subjectFilter) {
                            const sessionSubject = session["Tên lớp"]?.split(" - ")[0] || session["Môn học"] || "Chưa phân loại";
                            if (sessionSubject !== subjectFilter) return false;
                          }

                          // Apply date filter
                          if (dateRangeFilter && dateRangeFilter[0] && dateRangeFilter[1]) {
                            const sessionDate = dayjs(session["Ngày"]);
                            const startDate = dateRangeFilter[0].startOf('day');
                            const endDate = dateRangeFilter[1].endOf('day');
                            return (sessionDate.isAfter(startDate) || sessionDate.isSame(startDate)) &&
                              (sessionDate.isBefore(endDate) || sessionDate.isSame(endDate));
                          }

                          // Default to current month if no filter
                          const now = dayjs();
                          const sessionDate = dayjs(session["Ngày"]);
                          const monthStart = now.startOf('month');
                          const monthEnd = now.endOf('month');
                          return (sessionDate.isAfter(monthStart) || sessionDate.isSame(monthStart)) &&
                            (sessionDate.isBefore(monthEnd) || sessionDate.isSame(monthEnd));
                        }).sort((a, b) => {
                          const dateA = new Date(a["Ngày"]);
                          const dateB = new Date(b["Ngày"]);
                          return dateA.getTime() - dateB.getTime();
                        });

                        // Prepare chart data
                        const chartData = {
                          dates: filteredSessions.map(s => dayjs(s["Ngày"]).format("DD/MM")),
                          homework: filteredSessions.map(s => {
                            const record = s["Điểm danh"]?.find(
                              (r: any) => r["Student ID"] === selectedStudent.id
                            );
                            const value = record?.["% Hoàn thành BTVN"];
                            return value !== null && value !== undefined ? Number(value) : null;
                          }),
                          testScores: filteredSessions.map(s => {
                            const record = s["Điểm danh"]?.find(
                              (r: any) => r["Student ID"] === selectedStudent.id
                            );
                            const value = record?.["Điểm kiểm tra"] ?? record?.["Điểm"];
                            return value !== null && value !== undefined ? Number(value) : null;
                          }),
                          bonusPoints: filteredSessions.map(s => {
                            const record = s["Điểm danh"]?.find(
                              (r: any) => r["Student ID"] === selectedStudent.id
                            );
                            const value = record?.["Điểm thưởng"];
                            return value !== null && value !== undefined ? Number(value) : null;
                          }),
                        };

                        // Debug log
                        console.log("📊 Chart Data:", {
                          filteredSessionsCount: filteredSessions.length,
                          dates: chartData.dates,
                          homework: chartData.homework,
                          testScores: chartData.testScores,
                          bonusPoints: chartData.bonusPoints,
                        });

                        const chartOptions: ApexOptions = {
                          chart: {
                            type: 'line',
                            height: 350,
                            toolbar: {
                              show: true,
                              tools: {
                                download: true,
                                selection: true,
                                zoom: true,
                                zoomin: true,
                                zoomout: true,
                                pan: true,
                                reset: true,
                              },
                            },
                          },
                          stroke: {
                            curve: 'smooth',
                            width: 3,
                          },
                          xaxis: {
                            categories: chartData.dates,
                            title: { text: 'Ngày' },
                          },
                          yaxis: [
                            {
                              title: { text: '% BTVN / Điểm' },
                              labels: {
                                formatter: (value: number) => {
                                  return value !== null ? value.toFixed(1) : '';
                                },
                              },
                            },
                          ],
                          legend: {
                            position: 'top',
                          },
                          tooltip: {
                            shared: true,
                            intersect: false,
                            y: {
                              formatter: (value: number) => {
                                return value !== null ? value.toFixed(1) : '-';
                              },
                            },
                          },
                          dataLabels: {
                            enabled: false,
                          },
                          markers: {
                            size: 4,
                            hover: {
                              size: 6,
                            },
                          },
                        };

                        // Check if there's any data to display
                        const hasData = chartData.homework.some(v => v !== null) ||
                          chartData.testScores.some(v => v !== null) ||
                          chartData.bonusPoints.some(v => v !== null);

                        if (!hasData || filteredSessions.length === 0) {
                          return (
                            <Empty
                              description={
                                filteredSessions.length === 0
                                  ? "Không có dữ liệu trong khoảng thời gian đã chọn"
                                  : "Không có dữ liệu điểm để hiển thị"
                              }
                            />
                          );
                        }

                        return (
                          <div>
                            <ReactApexChart
                              options={{
                                ...chartOptions,
                                title: {
                                  text: 'Biến thiên BTVN, Điểm kiểm tra và Điểm thưởng',
                                  style: {
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                  },
                                },
                              }}
                              series={[
                                {
                                  name: '% BTVN',
                                  data: chartData.homework,
                                  color: '#16a34a',
                                },
                                {
                                  name: 'Điểm kiểm tra',
                                  data: chartData.testScores,
                                  color: '#36797f',
                                },
                                {
                                  name: 'Điểm thưởng',
                                  data: chartData.bonusPoints,
                                  color: '#fa8c16',
                                },
                              ]}
                              type="line"
                              height={350}
                            />
                          </div>
                        );
                      })()}
                    </Card>

                    {/* Score Table */}
                    <Card
                      className="mb-4"
                      style={{ borderColor: "#36797f", borderWidth: "2px" }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <Typography.Title
                            level={4}
                            style={{ color: "#36797f", margin: "0 0 4px 0" }}
                          >
                            Bảng điểm chi tiết
                          </Typography.Title>
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: "12px", fontWeight: "500" }}
                          >
                            {dateRangeFilter && dateRangeFilter[0] && dateRangeFilter[1]
                              ? `${dateRangeFilter[0].format('DD/MM/YYYY')} - ${dateRangeFilter[1].format('DD/MM/YYYY')} `
                              : selectedMonth
                                ? selectedMonth.format('MM/YYYY')
                                : `${months[new Date().getMonth()]} ${new Date().getFullYear()} `}
                          </Typography.Text>
                        </div>
                        <Button
                          type="primary"
                          icon={<FileTextOutlined />}
                          onClick={() => {
                            let fromDate: Date;
                            let toDate: Date;
                            if (dateRangeFilter && dateRangeFilter[0] && dateRangeFilter[1]) {
                              fromDate = dateRangeFilter[0].toDate();
                              toDate = dateRangeFilter[1].toDate();
                            } else if (selectedMonth) {
                              fromDate = selectedMonth.startOf('month').toDate();
                              toDate = selectedMonth.endOf('month').toDate();
                            } else {
                              const now = new Date();
                              fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
                              toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                            }
                            const events = getStudentEventsByDateRange(
                              selectedStudent.id,
                              fromDate,
                              toDate
                            );
                            handlePrintScoreTable(selectedStudent, events);
                          }}
                        >
                          In bảng điểm
                        </Button>
                      </div>
                      {(() => {
                        let fromDate: Date;
                        let toDate: Date;
                        if (dateRangeFilter && dateRangeFilter[0] && dateRangeFilter[1]) {
                          fromDate = dateRangeFilter[0].toDate();
                          toDate = dateRangeFilter[1].toDate();
                        } else if (selectedMonth) {
                          fromDate = selectedMonth.startOf('month').toDate();
                          toDate = selectedMonth.endOf('month').toDate();
                        } else {
                          const now = new Date();
                          fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
                          toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                        }
                        const sessions = attendanceSessions
                          .filter((session) => {
                            const hasAttendance = session["Điểm danh"]?.some(
                              (record: any) => record["Student ID"] === selectedStudent.id
                            );
                            if (!hasAttendance) return false;
                            if (!session["Ngày"]) return false;
                            const sessionDate = new Date(session["Ngày"]);
                            if (sessionDate < fromDate || sessionDate > toDate) return false;

                            // Check enrollment date - chỉ hiển thị sessions sau ngày đăng ký
                            const classId = session["Class ID"];
                            const classData = classes.find(c => c.id === classId);
                            if (classData) {
                              const enrollments = classData["Student Enrollments"] || {};
                              if (enrollments[selectedStudent.id]) {
                                const enrollmentDate = enrollments[selectedStudent.id].enrollmentDate;
                                const sessionDateStr = session["Ngày"];
                                // Chỉ hiển thị nếu học sinh đã đăng ký trước hoặc trong ngày session
                                if (enrollmentDate > sessionDateStr) return false;
                              }
                            }

                            return true;
                          })
                          .sort((a, b) => {
                            const dateA = new Date(a["Ngày"]);
                            const dateB = new Date(b["Ngày"]);
                            return dateA.getTime() - dateB.getTime();
                          });

                        if (sessions.length === 0) {
                          return (
                            <div className="bg-white rounded-xl p-10 text-center shadow-md border-2 border-gray-200">
                              <div className="text-lg font-semibold text-[#36797f]">
                                Không có buổi học trong tháng này
                              </div>
                            </div>
                          );
                        }

                        // Group by subject
                        const sessionsBySubject: { [subject: string]: any[] } = {};
                        sessions.forEach((session) => {
                          const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
                          if (!sessionsBySubject[subject]) {
                            sessionsBySubject[subject] = [];
                          }
                          sessionsBySubject[subject].push(session);
                        });

                        return (
                          <div className="space-y-4">
                            {Object.entries(sessionsBySubject).map(([subject, subjectSessions]) => (
                              <div key={subject}>
                                <h4 style={{
                                  background: "#e6f7ff",
                                  padding: "8px 12px",
                                  fontWeight: "bold",
                                  marginBottom: "8px",
                                  borderLeft: "4px solid #1890ff"
                                }}>
                                  Môn {subject}
                                </h4>
                                <div style={{ overflowX: "auto" }}>
                                  <table style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                    fontSize: "12px"
                                  }}>
                                    <thead>
                                      <tr style={{ background: "#f0f0f0" }}>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Ngày</th>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Tên HS</th>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Chuyên cần</th>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>% BTVN</th>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Tên bài kiểm tra</th>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Điểm</th>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Điểm thưởng</th>
                                        <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Nhận xét</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subjectSessions.map((session) => {
                                        const studentRecord = session["Điểm danh"]?.find(
                                          (r: any) => r["Student ID"] === selectedStudent.id
                                        );
                                        if (!studentRecord) return null;

                                        const attendance = studentRecord["Có mặt"]
                                          ? studentRecord["Đi muộn"]
                                            ? "Đi muộn"
                                            : "Có mặt"
                                          : studentRecord["Vắng có phép"]
                                            ? "Vắng có phép"
                                            : "Vắng";

                                        return (
                                          <tr key={session.id}>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                                              {new Date(session["Ngày"]).toLocaleDateString("vi-VN")}
                                            </td>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                                              {selectedStudent["Họ và tên"]}
                                            </td>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                                              {attendance}
                                            </td>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                                              {studentRecord["% Hoàn thành BTVN"] ?? "-"}
                                            </td>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                                              {studentRecord["Bài kiểm tra"] || "-"}
                                            </td>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center", fontWeight: "bold" }}>
                                              {studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? "-"}
                                            </td>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                                              {studentRecord["Điểm thưởng"] ?? "-"}
                                            </td>
                                            <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "left", paddingLeft: "12px" }}>
                                              {studentRecord["Ghi chú"] || "-"}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </Card>

                  </div>
                );
              })()}
            </div>
          )}
        </Modal>

        {/* Edit Student Modal */}
        <Modal
          title={
            <div
              style={{
                backgroundColor: "#36797f",
                padding: "24px",
                borderRadius: "12px 12px 0 0",
              }}
            >
              <Typography.Title level={3} style={{ color: "white", margin: 0 }}>
                {editingStudent && editingStudent.id
                  ? "Chỉnh sửa thông tin học sinh"
                  : "Thêm học sinh mới"}
              </Typography.Title>
            </div>
          }
          open={isEditModalOpen}
          onCancel={() => {
            setEditModalOpen(false);
            setEditingStudent(null);
            editStudentForm.resetFields();
          }}
          footer={null}
          width={600}
          style={{ top: 20 }}
        >
          <Form
            form={editStudentForm}
            onFinish={async (values) => {
              // Auto-generate Student Code if adding new student (only if not provided)
              let studentCode = values.studentCode || editingStudent?.["Mã học sinh"] || "";
              if (!editingStudent?.id && !studentCode) {
                // Generate new code: HS001, HS002, etc.
                const existingCodes = students
                  .map((s) => s["Mã học sinh"])
                  .filter((code) => code && code.startsWith("HS"))
                  .map((code) => parseInt(code.replace("HS", "")) || 0);
                const maxNumber =
                  existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
                studentCode = `HS${String(maxNumber + 1).padStart(3, "0")} `;
              }

              const studentData: Partial<Student> = {
                "Họ và tên": values.name,
                "Mã học sinh": studentCode,
                "Ngày sinh": values.dob,
                "Số điện thoại": values.phone,
                "SĐT phụ huynh": values.parentPhone,
                "Địa chỉ": values.address,
                "Mật khẩu": values.password || "",
                "Số giờ đã gia hạn": editingStudent?.["Số giờ đã gia hạn"] || 0,
                "Khối": values.grade || "",
                "Môn học đăng ký": values.registeredSubjects || [],
              };
              // Preserve the ID if editing an existing student
              if (editingStudent?.id) {
                studentData.id = editingStudent.id;
              }
              // Get enrollment date from form (format: YYYY-MM-DD)
              const enrollmentDateStr = values.enrollmentDate 
                ? dayjs(values.enrollmentDate).format('YYYY-MM-DD')
                : undefined;
              await handleSaveStudent(studentData, values.registeredSubjects || [], enrollmentDateStr);
            }}
            layout="vertical"
            style={{ padding: "24px" }}
          >
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item
                  label="Họ và tên"
                  name="name"
                  rules={[{ required: true, message: "Vui lòng nhập họ và tên" }]}
                >
                  <Input placeholder="Nhập họ và tên" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label="Mã học sinh"
                  name="studentCode"
                  extra={!editingStudent?.id ? "Để trống sẽ tự tạo" : undefined}
                >
                  <Input placeholder="VD: HS001" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Ngày sinh" name="dob">
                  <Input type="date" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Khối" name="grade">
                  <Select
                    placeholder="Chọn khối"
                    options={studentGradeOptions}
                    allowClear
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="SĐT học sinh" name="phone">
                  <Input placeholder="Nhập số điện thoại học sinh" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="SĐT phụ huynh" name="parentPhone">
                  <Input placeholder="Nhập số điện thoại phụ huynh" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Mật khẩu (Phụ huynh)"
                  name="password"
                  extra="Mật khẩu để phụ huynh đăng nhập xem thông tin học sinh"
                >
                  <Input.Password placeholder="Nhập mật khẩu" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item
                  label="Lớp đăng ký"
                  name="registeredSubjects"
                  extra="Chọn các lớp từ danh sách lớp học; chọn thêm sẽ thêm học sinh vào lớp"
                >
                  <Select
                    mode="multiple"
                    placeholder="Chọn lớp"
                    options={classes.map((c) => ({
                      label: `${c["Tên lớp"]} — ${subjectMap[c["Môn học"]] || c["Môn học"]} `,
                      value: c.id,
                    }))}
                    style={{ width: "100%" }}
                    optionFilterProp="label"
                    allowClear
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Ngày đăng ký lớp"
                  name="enrollmentDate"
                  extra="Ngày học sinh bắt đầu tham gia các lớp mới được chọn"
                >
                  <DatePicker
                    format="DD/MM/YYYY"
                    style={{ width: "100%" }}
                    placeholder="Chọn ngày đăng ký"
                  />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="Địa chỉ" name="address">
                  <Input.TextArea rows={2} placeholder="Nhập địa chỉ" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item style={{ marginBottom: 0, marginTop: "24px" }}>
              <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                <Button
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingStudent(null);
                    editStudentForm.resetFields();
                  }}
                >
                  Huỷ
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  style={{ backgroundColor: "#36797f", borderColor: "#36797f" }}
                >
                  Lưu
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        {/* Extend Hours Modal */}
        <Modal
          title={
            <div
              style={{
                backgroundColor: "#36797f",
                padding: "20px",
                borderRadius: "12px 12px 0 0",
              }}
            >
              <Typography.Title level={3} style={{ color: "white", margin: 0 }}>
                💰 Điều chỉnh số dư giờ
              </Typography.Title>
              <Typography.Text
                style={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "14px",
                  marginTop: "4px",
                  display: "block",
                }}
              >
                Thêm hoặc bớt giờ từ tài khoản học sinh
              </Typography.Text>
            </div>
          }
          open={isExtendModalOpen}
          onCancel={() => {
            setExtendModalOpen(false);
            setExtendingStudent(null);
            extendHoursForm.resetFields();
          }}
          footer={null}
          width={500}
          style={{ top: 20 }}
          bodyStyle={{ padding: 0 }}
        >
          <Form
            form={extendHoursForm}
            onFinish={(values) => {
              const additionalHours = Number(values.additionalHours) || 0;
              handleSaveExtension(additionalHours);
            }}
            layout="vertical"
            style={{ padding: "24px" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              {/* Họ và tên (auto) */}
              <Form.Item label="Họ và tên" name="studentName">
                <Input disabled />
              </Form.Item>

              {/* Giờ nhập thêm - CHO PHÉP SỐ ÂM */}
              <Form.Item
                label="Thêm hoặc bớt giờ"
                name="additionalHours"
                rules={[{ required: true, message: "Vui lòng nhập số giờ" }]}
                extra="+ để thêm, - để bớt (ví dụ: +50 hoặc -10)"
              >
                <InputNumber
                  step={0.5}
                  placeholder="+ để thêm, - để bớt"
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "18px",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                />
              </Form.Item>

              {/* Người nhập (auto) */}
              <Form.Item label="Người nhập">
                <Input value={currentUsername} disabled />
              </Form.Item>

              {/* Ngày nhập (auto) */}
              <Form.Item label="Ngày nhập">
                <Input value={new Date().toLocaleDateString("vi-VN")} disabled />
              </Form.Item>

              {/* Giờ nhập (auto) */}
              <Form.Item label="Giờ nhập">
                <Input value={new Date().toLocaleTimeString("vi-VN")} disabled />
              </Form.Item>
            </Space>

            <Form.Item style={{ marginBottom: 0, marginTop: "24px" }}>
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <Button
                  onClick={() => {
                    setExtendModalOpen(false);
                    setExtendingStudent(null);
                    extendHoursForm.resetFields();
                  }}
                  style={{ flex: 1 }}
                >
                  Hủy
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  style={{
                    backgroundColor: "#36797f",
                    borderColor: "#36797f",
                    flex: 1,
                  }}
                >
                  💾 Lưu thay đổi
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        {/* Edit Extension Modal */}
        <Modal
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "#1890ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "20px",
                }}
              >
                ✏️
              </div>
              <div>
                <Typography.Title level={3} style={{ color: "white", margin: 0 }}>
                  Chỉnh sửa bản ghi gia hạn
                </Typography.Title>
                <Typography.Text
                  style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px" }}
                >
                  Chỉnh sửa số giờ nhập thêm và ghi lại lý do
                </Typography.Text>
              </div>
            </div>
          }
          open={isEditExtensionModalOpen}
          onCancel={() => {
            setEditExtensionModalOpen(false);
            setEditingExtension(null);
            editExtensionForm.resetFields();
          }}
          footer={null}
          width={500}
          style={{ top: 20 }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              backgroundColor: "#1890ff",
              padding: "24px",
              borderRadius: "12px 12px 0 0",
            }}
          >
            <Typography.Title level={3} style={{ color: "white", margin: 0 }}>
              ✏️ Chỉnh sửa bản ghi gia hạn
            </Typography.Title>
            <Typography.Text
              style={{
                color: "rgba(255,255,255,0.8)",
                fontSize: "14px",
                marginTop: "4px",
                display: "block",
              }}
            >
              Chỉnh sửa số giờ nhập thêm và ghi lại lý do
            </Typography.Text>
          </div>

          <Form
            form={editExtensionForm}
            onFinish={(values) => {
              const newHours = Number(values.newHours) || 0;
              const reason = values.reason || "";
              handleSaveEditedExtension(newHours, reason);
            }}
            layout="vertical"
            style={{ padding: "24px" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              {/* Original Hours (read-only) */}
              <Card
                style={{
                  backgroundColor: "#f9fafb",
                  border: "2px solid #d1d5db",
                }}
              >
                <Typography.Text
                  strong
                  style={{ marginBottom: "8px", display: "block" }}
                >
                  Số giờ hiện tại
                </Typography.Text>
                <div
                  style={{
                    fontSize: "36px",
                    fontWeight: "bold",
                    color: "#36797f",
                  }}
                >
                  {editingExtension?.["Giờ nhập thêm"]} giờ
                </div>
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: "12px", marginTop: "4px" }}
                >
                  Được ghi lại trên: {editingExtension?.["Ngày nhập"]} at{" "}
                  {editingExtension?.["Giờ nhập"]}
                </Typography.Text>
              </Card>

              {/* New Hours */}
              <Form.Item
                label="Số giờ mới"
                name="newHours"
                rules={[{ required: true, message: "Vui lòng nhập số giờ mới" }]}
              >
                <InputNumber
                  min={0}
                  step={0.5}
                  placeholder="Nhập số giờ mới"
                  style={{ width: "100%" }}
                />
              </Form.Item>

              {/* Reason */}
              <Form.Item
                label="Lý do chỉnh sửa"
                name="reason"
                rules={[
                  {
                    required: true,
                    message: "Vui lòng cung cấp lý do chỉnh sửa",
                  },
                ]}
                extra="Ví dụ: Sửa lỗi nhập liệu, cập nhật số tiền thanh toán, v.v."
              >
                <Input.TextArea
                  rows={3}
                  placeholder="Ví dụ: Sửa lỗi nhập liệu, cập nhật số tiền thanh toán, v.v."
                />
              </Form.Item>

              {/* Edit History Preview */}
              {editingExtension?.["Edit History"] &&
                editingExtension["Edit History"].length > 0 && (
                  <Card
                    style={{
                      backgroundColor: "#fef3c7",
                      border: "2px solid #f59e0b",
                    }}
                  >
                    <Typography.Text
                      strong
                      style={{
                        color: "#92400e",
                        marginBottom: "8px",
                        display: "block",
                      }}
                    >
                      ⚠️ Các lần chỉnh sửa trước (
                      {editingExtension["Edit History"].length})
                    </Typography.Text>
                    <div
                      style={{
                        maxHeight: "128px",
                        overflowY: "auto",
                        fontSize: "12px",
                      }}
                    >
                      {editingExtension["Edit History"].map(
                        (edit: any, idx: number) => (
                          <div
                            key={idx}
                            style={{ color: "#374151", marginBottom: "4px" }}
                          >
                            {edit["Edited Date"]}: {edit["Old Hours"]}h →{" "}
                            {edit["New Hours"]}h
                            <span
                              style={{ color: "#6b7280", fontStyle: "italic" }}
                            >
                              {" "}
                              ({edit["Reason"]})
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </Card>
                )}

              {/* Current User */}
              <Form.Item label="Người chỉnh sửa">
                <Input value={currentUsername} disabled />
              </Form.Item>
            </Space>

            <Form.Item style={{ marginBottom: 0, marginTop: "24px" }}>
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <Button
                  onClick={() => {
                    setEditExtensionModalOpen(false);
                    setEditingExtension(null);
                    editExtensionForm.resetFields();
                  }}
                  style={{ flex: 1 }}
                >
                  Huỷ
                </Button>
                <Button type="primary" htmlType="submit" style={{ flex: 1 }}>
                  💾 Lưu thay đổi
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal hiển thị danh sách lớp */}
        <Modal
          title="Danh sách lớp học"
          open={isClassModalOpen}
          onCancel={() => setClassModalOpen(false)}
          footer={[
            <Button key="close" type="primary" onClick={() => setClassModalOpen(false)}>
              Đóng
            </Button>
          ]}
          width={700}
        >
          {selectedStudentClasses.length > 0 ? (
            <div style={{ padding: '16px 0' }}>
              {selectedStudentClasses.map((classInfo, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    marginBottom: '12px',
                    backgroundColor: '#f0f5ff',
                    borderRadius: '8px',
                    borderLeft: '4px solid #722ed1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#722ed1',
                    minWidth: '24px'
                  }}>
                    {index + 1}.
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: '#1f2937',
                      marginBottom: '4px'
                    }}>
                      {classInfo.className}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span style={{
                        backgroundColor: '#722ed1',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500
                      }}>
                        {classInfo.subject}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px', color: '#999' }}>
              Học sinh chưa đăng ký lớp nào
            </div>
          )}
        </Modal>


      </div>
    </WrapperContent>
  );
};

// Component Tab Học phí - HIDDEN per user request (kept unused)
const StudentTuitionTab: React.FC<{
  students: any[];
  extensionHistory: any[];
  attendanceSessions: any[];
}> = ({ students, extensionHistory, attendanceSessions }) => {
  const navigate = useNavigate();
  // Bỏ selectedMonth - không dùng tháng nữa, tính học phí cố định
  const [studentInvoices, setStudentInvoices] = useState<Record<string, any>>({});
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<any[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [editDiscount, setEditDiscount] = useState(0);

  // State cho inline editing
  const [editingCell, setEditingCell] = useState<{ id: string, field: string } | null>(null);
  const [tempValue, setTempValue] = useState<number | null>(null);

  // Filters for tuition tab
  const [tuitionClassFilter, setTuitionClassFilter] = useState<string>("all");
  const [tuitionStudentSearch, setTuitionStudentSearch] = useState<string>("");
  const [tuitionStudentSearchDebounced, setTuitionStudentSearchDebounced] = useState<string>("");
  const [selectedTuitionRowKeys, setSelectedTuitionRowKeys] = useState<React.Key[]>([]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setTuitionStudentSearchDebounced(tuitionStudentSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [tuitionStudentSearch]);

  // Load student invoices from Firebase
  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const response = await fetch(`${DATABASE_URL_BASE} /datasheet/Phiếu_thu_học_phí.json`);
        const data = await response.json();
        if (data) {
          setStudentInvoices(data);
        }
      } catch (error) {
        console.error("Error fetching invoices:", error);
      }
    };
    fetchInvoices();
  }, []);

  // Load courses
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await fetch(`${DATABASE_URL_BASE} /datasheet/Khóa_học.json`);
        const data = await response.json();
        if (data) {
          const coursesArray = Object.entries(data).map(([id, course]: [string, any]) => ({
            id,
            ...course,
          }));
          setCourses(coursesArray);
        }
      } catch (error) {
        console.error("Error fetching courses:", error);
      }
    };
    fetchCourses();
  }, []);

  // Load classes
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await fetch(`${DATABASE_URL_BASE} /datasheet/Lớp_học.json`);
        const data = await response.json();
        if (data) {
          const classesArray = Object.entries(data).map(([id, cls]: [string, any]) => ({
            id,
            ...cls,
          }));
          setClasses(classesArray);
        }
      } catch (error) {
        console.error("Error fetching classes:", error);
      }
    };
    fetchClasses();
  }, []);

  // Load timetable entries (Thời_khoá_biểu)
  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        const response = await fetch(`${DATABASE_URL_BASE} /datasheet/Thời_khoá_biểu.json`);
        const data = await response.json();
        if (data) {
          const timetableArray = Object.entries(data).map(([id, entry]: [string, any]) => ({
            id,
            ...entry,
          }));
          setTimetableEntries(timetableArray);
        }
      } catch (error) {
        console.error("Error fetching timetable:", error);
      }
    };
    fetchTimetable();
  }, []);

  // Tạo Map để lookup nhanh hơn
  const classesMap = useMemo(() => {
    const map = new Map<string, any>();
    classes.forEach((cls) => {
      map.set(cls.id, cls);
    });
    return map;
  }, [classes]);

  const coursesMap = useMemo(() => {
    const map = new Map<string, any>();
    courses.forEach((course) => {
      // Tạo key từ Khối và Môn học
      const key = `${course.Khối} -${course["Môn học"]} `;
      if (!map.has(key)) {
        map.set(key, course);
      }
    });
    return map;
  }, [courses]);

  // Helper function để tìm course nhanh (được định nghĩa trong useMemo)
  const getCoursePrice = (classInfo: any, coursesMap: Map<string, any>) => {
    if (!classInfo) return 0;

    // Lấy học phí mỗi buổi từ lớp (ưu tiên từ bảng Lớp học)
    const tuitionPerSession = classInfo["Học phí mỗi buổi"] || 0;

    // Nếu không có trong lớp, thử tìm từ courses
    if (!tuitionPerSession) {
      const directKey = `${classInfo.Khối} -${classInfo["Môn học"]} `;
      let course = coursesMap.get(directKey);

      // Nếu không tìm thấy, thử với subject options
      if (!course) {
        const classSubject = classInfo["Môn học"];
        const subjectOption = subjectOptions.find(
          (opt) => opt.label === classSubject || opt.value === classSubject
        );
        if (subjectOption) {
          const altKey1 = `${classInfo.Khối} -${subjectOption.label} `;
          const altKey2 = `${classInfo.Khối} -${subjectOption.value} `;
          course = coursesMap.get(altKey1) || coursesMap.get(altKey2);
        }
      }

      return course?.Giá || 0;
    }

    // Áp dụng mức giảm học phí từ lớp (nếu có)
    const classDiscount = classInfo["Mức giảm học phí"] || 0;
    let finalPrice = tuitionPerSession;

    if (classDiscount > 0) {
      // Nếu mức giảm là phần trăm (0-100)
      if (classDiscount <= 100) {
        finalPrice = tuitionPerSession * (1 - classDiscount / 100);
      } else {
        // Nếu mức giảm là số tiền cố định
        finalPrice = Math.max(0, tuitionPerSession - classDiscount);
      }
    }

    return finalPrice;
  };

  // Không filter theo tháng nữa - dùng tất cả dữ liệu
  const allAttendanceSessions = attendanceSessions;
  const allTimetableEntries = timetableEntries;

  // Lấy học sinh từ các lớp trong bảng Lớp_học (có thể filter theo lớp được chọn)
  const studentsFromClasses = useMemo(() => {
    const studentIdSet = new Set<string>();

    // Nếu có filter theo lớp, chỉ lấy học sinh từ lớp đó
    if (tuitionClassFilter && tuitionClassFilter !== "all") {
      const selectedClass = classes.find((cls) => cls.id === tuitionClassFilter);
      if (selectedClass) {
        const studentIds = selectedClass["Student IDs"] || [];
        if (Array.isArray(studentIds)) {
          studentIds.forEach((id: string) => {
            if (id) studentIdSet.add(id);
          });
        }
      }
    } else {
      // Lấy tất cả Student IDs từ tất cả các lớp
      classes.forEach((cls) => {
        const studentIds = cls["Student IDs"] || [];
        if (Array.isArray(studentIds)) {
          studentIds.forEach((id: string) => {
            if (id) studentIdSet.add(id);
          });
        }
      });
    }

    // Tìm học sinh từ danh sách students
    const studentsList = Array.from(studentIdSet).map((studentId) => {
      return students.find((s) => s.id === studentId);
    }).filter(Boolean) as any[];

    return studentsList;
  }, [classes, students, tuitionClassFilter]);

  // Tính toán học phí cố định (không theo tháng)
  const monthlyStats = useMemo(() => {
    // Sử dụng studentsFromClasses thay vì students
    const stats = studentsFromClasses.map((student) => {
      // Tính học phí từ Điểm danh (attendance sessions) - ưu tiên từ session
      const studentId = student.id;
      let totalRevenue = 0;
      let totalSessions = 0;

      // Lọc sessions có học sinh này tham gia
      const studentSessions = allAttendanceSessions.filter((session) => {
        const attendanceRecords = session["Điểm danh"] || [];
        return attendanceRecords.some(
          (record: any) => record["Student ID"] === studentId && 
          (record["Trạng thái"] === "present" || record["Trạng thái"] === "absent_with_permission")
        );
      });

      // Tính học phí từ từng session
      studentSessions.forEach((session) => {
        const classId = session["Class ID"];
        const classInfo = classesMap.get(classId);

        // Ưu tiên lấy giá từ session đã lưu, fallback về class/course
        // Ưu tiên: Session > Class > Course
        let pricePerSession = 0;

        if (session["Học phí mỗi buổi"]) {
          // Ưu tiên từ session (lớp mới thêm không có trong Lớp học)
          pricePerSession = parseFloat(String(session["Học phí mỗi buổi"])) || 0;
        } else if (classInfo) {
          // Fallback về class/course
          const coursePrice = getCoursePrice(classInfo, coursesMap);
          pricePerSession = coursePrice || 0;

          // Áp dụng mức giảm học phí từ lớp (nếu có)
          const classDiscount = classInfo["Mức giảm học phí"] || 0;
          if (classDiscount > 0 && pricePerSession > 0) {
            if (classDiscount <= 100) {
              // Phần trăm
              pricePerSession = pricePerSession * (1 - classDiscount / 100);
            } else {
              // Số tiền cố định
              pricePerSession = Math.max(0, pricePerSession - classDiscount);
            }
          }
        }

        if (pricePerSession > 0) {
          totalSessions += 1;
          totalRevenue += pricePerSession;
        }
      });

      // Tìm hóa đơn của học sinh (không theo tháng, dùng key đơn giản)
      const invoiceKey = student.id;
      const invoice = studentInvoices[invoiceKey];

      // Hiển thị tất cả học sinh, kể cả không có invoice
      let paidAmount = 0;
      let invoiceStatus = invoice && typeof invoice === "object" ? (invoice.status || "unpaid") : "no_data"; // "no_data" nếu chưa có
      let discount = 0;
      let invoiceRevenue = totalRevenue; // Tính từ bảng Lớp học (cố định)
      let invoiceSessions = totalSessions; // Số buổi tính từ lịch học

      // Nếu có invoice trong Firebase, lấy data từ invoice
      if (invoice && typeof invoice === "object") {
        invoiceStatus = invoice.status || "unpaid";
        paidAmount = invoice.status === "paid" ? (invoice.finalAmount || 0) : 0;
        discount = invoice.discount || 0;

        // Lấy revenue và sessions từ invoice nếu có
        if (invoice.totalAmount !== undefined && invoice.totalAmount > 0) {
          invoiceRevenue = invoice.totalAmount;
        }

        if (invoice.totalSessions !== undefined && invoice.totalSessions > 0) {
          invoiceSessions = invoice.totalSessions;
        }
      }

      // Tính tổng doanh thu đã thu (từ invoice đã paid)
      let totalPaidRevenue = 0;
      if (invoice && typeof invoice === "object" && invoice.status === "paid") {
        totalPaidRevenue = invoice.finalAmount || 0;
      }

      return {
        ...student,
        monthSessions: invoiceSessions,
        monthRevenue: invoiceRevenue,
        discount,
        finalMonthRevenue: Math.max(0, invoiceRevenue - discount),
        paidAmount,
        invoiceStatus,
        totalRevenue: totalPaidRevenue,
      };
    });

    // Hiển thị tất cả học sinh, không filter bỏ ai
    return stats;
  }, [studentsFromClasses, studentInvoices, classesMap, coursesMap, allAttendanceSessions, getCoursePrice]);

  // Filter monthly stats by student name (class filter đã được xử lý ở studentsFromClasses)
  const filteredMonthlyStats = useMemo(() => {
    console.log(`📊 Monthly Stats: `, {
      total: monthlyStats.length,
      statsWithSessions: monthlyStats.filter(s => s.monthSessions > 0).length,
      classFilter: tuitionClassFilter
    });

    return monthlyStats.filter((stat) => {
      // Filter by student name (sử dụng debounced value)
      if (tuitionStudentSearchDebounced) {
        const search = tuitionStudentSearchDebounced.toLowerCase();
        const studentName = stat["Họ và tên"]?.toLowerCase() || "";
        const studentCode = stat["Mã học sinh"]?.toLowerCase() || "";
        if (!studentName.includes(search) && !studentCode.includes(search)) {
          return false;
        }
      }

      return true;
    });
  }, [monthlyStats, tuitionStudentSearchDebounced]);

  // Handle update field inline
  const handleUpdateField = async (record: any, field: string, value: number | string | null) => {
    if (value === null && field !== "invoiceStatus") return;

    try {
      // Không dùng tháng nữa, dùng record.id làm key
      const invoiceKey = record.id;

      let updateData: any = {};

      if (field === "discount") {
        updateData.discount = value;
      } else if (field === "monthRevenue") {
        updateData.totalAmount = value;
      } else if (field === "monthSessions") {
        updateData.totalSessions = value;
      } else if (field === "finalMonthRevenue") {
        updateData.finalAmount = value;
      } else if (field === "invoiceStatus") {
        updateData.status = value === 1 || value === "paid" ? "paid" : "unpaid";
        if (value === 1 || value === "paid") {
          // Nếu chuyển sang đã thu, cập nhật paidAmount = finalAmount
          updateData.paidAmount = record.finalMonthRevenue || 0;
        } else {
          // Nếu chuyển sang chưa thu, reset paidAmount
          updateData.paidAmount = 0;
        }
      } else if (field === "totalRevenue") {
        // Tổng đã thu là tổng của tất cả các invoice đã paid, nên không thể sửa trực tiếp
        // Nhưng nếu muốn, có thể lưu vào một field riêng
        message.warning("Tổng đã thu được tính tự động từ tất cả các phiếu đã thanh toán");
        setEditingCell(null);
        setTempValue(null);
        return;
      }

      const response = await fetch(
        `${DATABASE_URL_BASE} /datasheet/Phiếu_thu_học_phí / ${invoiceKey}.json`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        }
      );

      if (response.ok) {
        message.success("Đã cập nhật");

        // Refresh invoices
        const refreshResponse = await fetch(
          `${DATABASE_URL_BASE} /datasheet/Phiếu_thu_học_phí.json ? _ = ${new Date().getTime()} `,
          { cache: "no-cache" }
        );
        const refreshData = await refreshResponse.json();
        if (refreshData) {
          setStudentInvoices(refreshData);
        }

        setEditingCell(null);
        setTempValue(null);
      } else {
        message.error("Lỗi khi cập nhật");
      }
    } catch (error) {
      console.error("Error updating field:", error);
      message.error("Lỗi khi cập nhật");
    }
  };

  // Handle bulk delete for tuition invoices
  const handleDeleteMultipleTuitionInvoices = async () => {
    if (selectedTuitionRowKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một phiếu thu để xóa");
      return;
    }

    Modal.confirm({
      title: "Xác nhận xóa",
      content: `Bạn có chắc chắn muốn xóa ${selectedTuitionRowKeys.length} phiếu thu đã chọn ? `,
      okText: "Xóa",
      cancelText: "Hủy",
      okType: "danger",
      onOk: async () => {
        try {
          const deletePromises = selectedTuitionRowKeys.map(async (key) => {
            const record = filteredMonthlyStats.find((s) => s.id === key);
            if (!record) return;

            const invoiceKey = record.id;
            const response = await fetch(
              `${DATABASE_URL_BASE} /datasheet/Phiếu_thu_học_phí / ${invoiceKey}.json`,
              { method: "DELETE" }
            );
            return response.ok;
          });

          await Promise.all(deletePromises);
          message.success(`Đã xóa ${selectedTuitionRowKeys.length} phiếu thu`);
          setSelectedTuitionRowKeys([]);

          // Reload invoices
          const invoicesRes = await fetch(`${DATABASE_URL_BASE} /datasheet/Phiếu_thu_học_phí.json`);
          const invoicesData = await invoicesRes.json();
          if (invoicesData) {
            setStudentInvoices(invoicesData);
          }
        } catch (error) {
          console.error("Error deleting invoices:", error);
          message.error("Lỗi khi xóa phiếu thu");
        }
      },
    });
  };

  // Row selection for tuition table
  const tuitionRowSelection = {
    selectedRowKeys: selectedTuitionRowKeys,
    onChange: (selectedKeys: React.Key[]) => {
      setSelectedTuitionRowKeys(selectedKeys);
    },
    getCheckboxProps: (record: any) => ({
      disabled: record.monthSessions === 0,
    }),
  };

  // Get unique classes for filter - lấy từ tất cả các lớp trong bảng Lớp_học
  const uniqueClasses = useMemo(() => {
    // Lấy tất cả các lớp từ bảng Lớp_học
    return classes.map((cls) => ({
      id: cls.id,
      name: cls["Mã lớp"] && cls["Tên lớp"]
        ? `${cls["Mã lớp"]} - ${cls["Tên lớp"]} `
        : cls["Tên lớp"] || cls.id,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const columns = [
    {
      title: "Họ và tên",
      dataIndex: ["Họ và tên"],
      key: "name",
      fixed: "left" as const,
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Khối",
      dataIndex: ["Khối"],
      key: "grade",
      width: 120,
      render: (text: string) => text || "-",
    },
    {
      title: "Lớp học",
      key: "classes",
      width: 250,
      render: (_: any, record: any) => {
        const studentClasses = record["Lớp học"] || [];
        if (!Array.isArray(studentClasses) || studentClasses.length === 0) {
          return <span style={{ color: "#ccc" }}>-</span>;
        }

        return (
          <div style={{ lineHeight: "1.5" }}>
            {studentClasses.map((classId: string, idx: number) => {
              const classInfo = classesMap.get(classId);
              if (!classInfo) return null;

              const className = classInfo["Tên lớp"] || "";
              const classCode = classInfo["Mã lớp"] || "";
              const subject = classInfo["Môn học"] || "";
              const pricePerSession = getCoursePrice(classInfo, coursesMap);

              // Format: "Tên lớp(Mã lớp) Môn học1 buổi[giá] đ/buổi"
              const priceText = pricePerSession ? pricePerSession.toLocaleString("vi-VN") : "0";

              return (
                <span key={classId}>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/ workspace / classes / ${classId}/grades`);
                    }}
                    style={{
                      cursor: "pointer",
                      color: "#1890ff",
                      textDecoration: "underline",
                    }}
                    title={`Click để xem lớp ${className}`}
                  >
                    {className}{classCode ? `(${classCode})` : ""}
                  </span >
                  <span style={{ marginLeft: "4px" }}>
                    {subject}1 buổi{priceText} đ/buổi
                  </span>
                  {idx < studentClasses.length - 1 && <span style={{ marginLeft: "8px" }}> </span>}
                </span >
              );
            })}
          </div >
        );
      },
    },
    {
      title: "Số buổi",
      dataIndex: "monthSessions",
      key: "monthSessions",
      align: "center" as const,
      width: 100,
      render: (sessions: number, record: any) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === "monthSessions";

        if (isEditing) {
          return (
            <InputNumber
              min={0}
              value={tempValue}
              onChange={(value) => setTempValue(value)}
              onPressEnter={() => handleUpdateField(record, "monthSessions", tempValue)}
              onBlur={() => handleUpdateField(record, "monthSessions", tempValue)}
              autoFocus
              style={{ width: 80 }}
            />
          );
        }

        return (
          <div
            onClick={() => {
              setEditingCell({ id: record.id, field: "monthSessions" });
              setTempValue(sessions);
            }}
            style={{ cursor: "pointer" }}
          >
            <Tag color="purple">{sessions} buổi</Tag>
          </div>
        );
      },
    },
    {
      title: "Học phí",
      dataIndex: "monthRevenue",
      key: "monthRevenue",
      align: "right" as const,
      width: 160,
      render: (amount: number, record: any) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === "monthRevenue";

        if (isEditing) {
          return (
            <InputNumber
              min={0}
              value={tempValue}
              onChange={(value) => setTempValue(value)}
              onPressEnter={() => handleUpdateField(record, "monthRevenue", tempValue)}
              onBlur={() => handleUpdateField(record, "monthRevenue", tempValue)}
              autoFocus
              style={{ width: 140 }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, ""))}
            />
          );
        }

        return (
          <div
            onClick={() => {
              setEditingCell({ id: record.id, field: "monthRevenue" });
              setTempValue(amount);
            }}
            style={{ cursor: "pointer" }}
          >
            <Text style={{ fontWeight: "bold", fontSize: 13 }}>
              {formatCurrency(amount)}
            </Text>
          </div>
        );
      },
    },
    {
      title: "Miễn giảm",
      dataIndex: "discount",
      key: "discount",
      align: "right" as const,
      width: 140,
      render: (amount: number, record: any) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === "discount";

        if (isEditing) {
          return (
            <InputNumber
              min={0}
              max={record.monthRevenue}
              value={tempValue}
              onChange={(value) => setTempValue(value)}
              onPressEnter={() => handleUpdateField(record, "discount", tempValue)}
              onBlur={() => handleUpdateField(record, "discount", tempValue)}
              autoFocus
              style={{ width: 120 }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, ""))}
            />
          );
        }

        return (
          <div
            onClick={() => {
              setEditingCell({ id: record.id, field: "discount" });
              setTempValue(amount || 0);
            }}
            style={{ cursor: "pointer" }}
          >
            <Text type={amount > 0 ? "warning" : "secondary"} style={{ fontSize: 12 }}>
              {amount > 0 ? `-${formatCurrency(amount)}` : "-"}
            </Text>
          </div>
        );
      },
    },
    {
      title: "Phải thu",
      dataIndex: "finalMonthRevenue",
      key: "finalMonthRevenue",
      align: "right" as const,
      width: 160,
      render: (amount: number, record: any) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === "finalMonthRevenue";

        if (isEditing) {
          return (
            <InputNumber
              min={0}
              value={tempValue}
              onChange={(value) => setTempValue(value)}
              onPressEnter={() => handleUpdateField(record, "finalMonthRevenue", tempValue)}
              onBlur={() => handleUpdateField(record, "finalMonthRevenue", tempValue)}
              autoFocus
              style={{ width: 140 }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, ""))}
            />
          );
        }

        return (
          <div
            onClick={() => {
              setEditingCell({ id: record.id, field: "finalMonthRevenue" });
              setTempValue(amount);
            }}
            style={{ cursor: "pointer" }}
          >
            <Tag color="orange" style={{ fontWeight: "bold", fontSize: 13 }}>
              {formatCurrency(amount)}
            </Tag>
          </div>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "invoiceStatus",
      key: "invoiceStatus",
      align: "center" as const,
      width: 120,
      render: (status: string, record: any) => {
        if (record.monthSessions === 0) {
          return <Tag color="default">Không học</Tag>;
        }

        const isEditing = editingCell?.id === record.id && editingCell?.field === "invoiceStatus";

        if (isEditing) {
          return (
            <Select
              value={status === "paid" ? "paid" : "unpaid"}
              onChange={(value) => {
                handleUpdateField(record, "invoiceStatus", value);
              }}
              autoFocus
              style={{ width: 100 }}
              onBlur={() => {
                setEditingCell(null);
                setTempValue(null);
              }}
            >
              <Select.Option value="unpaid">Chưa thu</Select.Option>
              <Select.Option value="paid">Đã thu</Select.Option>
            </Select>
          );
        }

        return (
          <div
            onClick={() => {
              setEditingCell({ id: record.id, field: "invoiceStatus" });
              setTempValue(status === "paid" ? 1 : 0);
            }}
            style={{ cursor: "pointer" }}
          >
            {status === "paid" ? (
              <Tag color="success">Đã thu</Tag>
            ) : status === "no_data" ? (
              <Tag color="default">Chưa có</Tag>
            ) : (
              <Tag color="error">Chưa thu</Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "Tổng đã thu",
      dataIndex: "totalRevenue",
      key: "totalRevenue",
      align: "right" as const,
      width: 160,
      render: (amount: number, record: any) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === "totalRevenue";

        if (isEditing) {
          return (
            <InputNumber
              min={0}
              value={tempValue}
              onChange={(value) => setTempValue(value)}
              onPressEnter={() => handleUpdateField(record, "totalRevenue", tempValue)}
              onBlur={() => handleUpdateField(record, "totalRevenue", tempValue)}
              autoFocus
              style={{ width: 140 }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, ""))}
            />
          );
        }

        return (
          <div
            onClick={() => {
              setEditingCell({ id: record.id, field: "totalRevenue" });
              setTempValue(amount);
            }}
            style={{ cursor: "pointer" }}
          >
            <Tag color="green" style={{ fontWeight: "bold", fontSize: 13 }}>
              {formatCurrency(amount)}
            </Tag>
          </div>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      align: "center" as const,
      width: 150,
      render: (_: any, record: any) => {
        return (
          <Space>
            <Button
              size="small"
              type="primary"
              icon={<EyeOutlined />}
              onClick={() => {
                navigate(`/workspace/students/${record.id}/profile`);
              }}
            >
              Xem chi tiết
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingStudent(record);
                setEditDiscount(record.discount || 0);
                setEditModalOpen(true);
              }}
            >
              Sửa
            </Button>
          </Space>
        );
      },
    },
  ];

  // Use filtered stats for calculations
  const totalMonthRevenue = filteredMonthlyStats.reduce(
    (sum, s) => sum + s.monthRevenue,
    0
  );
  const totalDiscount = filteredMonthlyStats.reduce(
    (sum, s) => sum + s.discount,
    0
  );
  const totalFinalMonthRevenue = filteredMonthlyStats.reduce(
    (sum, s) => sum + s.finalMonthRevenue,
    0
  );
  const totalPaidAmount = filteredMonthlyStats.reduce(
    (sum, s) => sum + s.paidAmount,
    0
  );
  const totalRevenue = filteredMonthlyStats.reduce(
    (sum, s) => sum + s.totalRevenue,
    0
  );

  // Dữ liệu cho biểu đồ cột so sánh (Top 10 học sinh có học phí cao nhất)
  const topStudents = [...filteredMonthlyStats]
    .filter(s => s.monthSessions > 0)
    .sort((a, b) => b.finalMonthRevenue - a.finalMonthRevenue)
    .slice(0, 10);

  const barChartOptions: ApexOptions = {
    chart: {
      type: "bar",
      height: 350,
      toolbar: { show: true },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        borderRadius: 4,
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    xaxis: {
      categories: topStudents.map((s) => s["Họ và tên"]),
      labels: {
        rotate: -45,
        style: {
          fontSize: "11px",
        },
      },
    },
    yaxis: {
      title: {
        text: "Triệu VNĐ",
      },
      labels: {
        formatter: (val: number) => val.toFixed(1) + "M",
      },
    },
    fill: {
      opacity: 1,
    },
    tooltip: {
      y: {
        formatter: (val: number) => formatCurrency(val * 1000000),
      },
    },
    legend: {
      position: "top",
    },
    colors: ["#fa8c16", "#52c41a"],
  };

  const barChartSeries = [
    {
      name: "Học phí tháng này",
      data: topStudents.map((s) => s.monthRevenue / 1000000), // Đổi sang triệu
    },
    {
      name: "Đã thu",
      data: topStudents.map((s) => s.paidAmount / 1000000),
    },
  ];

  // Dữ liệu cho biểu đồ tròn tổng quan
  const pieChartOptions: ApexOptions = {
    chart: {
      type: "donut",
      height: 350,
    },
    labels: ["Đã thu", "Chưa thu"],
    colors: ["#52c41a", "#ff4d4f"],
    legend: {
      position: "bottom",
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => val.toFixed(1) + "%",
    },
    tooltip: {
      y: {
        formatter: (val: number) => formatCurrency(val),
      },
    },
  };

  const pieChartSeries = [
    totalPaidAmount,
    totalFinalMonthRevenue - totalPaidAmount
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <div>
              <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>
                Lọc theo lớp:
              </label>
              <Select
                value={tuitionClassFilter}
                onChange={setTuitionClassFilter}
                style={{ width: "100%" }}
                placeholder="Tất cả các lớp"
                showSearch
                filterOption={(input, option) => {
                  const label = option?.label || option?.children || "";
                  return String(label).toLowerCase().includes(input.toLowerCase());
                }}
              >
                <Select.Option value="all">Tất cả các lớp</Select.Option>
                {uniqueClasses.map((cls) => (
                  <Select.Option key={cls.id} value={cls.id} label={cls.name}>
                    {cls.name}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div>
              <label style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>
                Tìm theo tên:
              </label>
              <Input
                placeholder="Nhập tên học sinh..."
                prefix={<SearchOutlined />}
                value={tuitionStudentSearch}
                onChange={(e) => setTuitionStudentSearch(e.target.value)}
                allowClear
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="Tổng học phí"
              value={formatCurrency(totalMonthRevenue)}
              valueStyle={{ color: "#fa8c16", fontSize: 16, fontWeight: "bold" }}
            />
          </Col>
        </Row>

        <Divider style={{ margin: "16px 0" }} />

        <Row gutter={[16, 16]}>
          <Col xs={12} sm={12} md={8} lg={4}>
            <Statistic
              title="Miễn giảm"
              value={formatCurrency(totalDiscount)}
              valueStyle={{ color: "#ff4d4f", fontSize: 16 }}
            />
          </Col>
          <Col xs={12} sm={12} md={8} lg={5}>
            <Statistic
              title="Phải thu"
              value={formatCurrency(totalFinalMonthRevenue)}
              valueStyle={{ color: "#1890ff", fontSize: 16, fontWeight: "bold" }}
            />
          </Col>
          <Col xs={12} sm={12} md={8} lg={5}>
            <Statistic
              title="Đã thu"
              value={formatCurrency(totalPaidAmount)}
              valueStyle={{ color: "#52c41a", fontSize: 16, fontWeight: "bold" }}
            />
          </Col>
          <Col xs={12} sm={12} md={8} lg={5}>
            <Statistic
              title="Chưa thu"
              value={formatCurrency(totalFinalMonthRevenue - totalPaidAmount)}
              valueStyle={{ color: "#ff4d4f", fontSize: 16 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={5}>
            <Statistic
              title="Tổng đã thu (Tất cả)"
              value={formatCurrency(totalRevenue)}
              valueStyle={{ color: "#52c41a", fontSize: 16, fontWeight: "bold" }}
            />
          </Col>
        </Row>
      </Card>

      <Card
        title="Danh sách học phí"
        extra={
          selectedTuitionRowKeys.length > 0 && (
            <Popconfirm
              title="Xác nhận xóa"
              description={`Bạn có chắc chắn muốn xóa ${selectedTuitionRowKeys.length} phiếu thu đã chọn?`}
              onConfirm={handleDeleteMultipleTuitionInvoices}
              okText="Xóa"
              cancelText="Hủy"
              okType="danger"
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                type="primary"
              >
                Xóa {selectedTuitionRowKeys.length} phiếu đã chọn
              </Button>
            </Popconfirm>
          )
        }
      >
        <Table
          dataSource={filteredMonthlyStats}
          columns={columns}
          rowKey="id"
          rowSelection={tuitionRowSelection}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} học sinh`,
          }}
          scroll={{ x: 1200, y: 600 }}
          size="middle"
          bordered
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ backgroundColor: "#fafafa", fontWeight: "bold" }}>
                <Table.Summary.Cell index={0} colSpan={1}>
                  <strong style={{ whiteSpace: "nowrap" }}>TỔNG CỘNG</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center" colSpan={1}>
                  <Tag color="purple" style={{ whiteSpace: "nowrap" }}>
                    {filteredMonthlyStats.reduce((sum, s) => sum + s.monthSessions, 0)} buổi
                  </Tag>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right" colSpan={1}>
                  <strong style={{ whiteSpace: "nowrap" }}>{formatCurrency(totalMonthRevenue)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right" colSpan={1}>
                  <strong style={{ color: "#ff4d4f", whiteSpace: "nowrap" }}>
                    {totalDiscount > 0 ? `-${formatCurrency(totalDiscount)}` : "-"}
                  </strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right" colSpan={1}>
                  <Tag color="orange" style={{ fontWeight: "bold", fontSize: 13, whiteSpace: "nowrap" }}>
                    {formatCurrency(totalFinalMonthRevenue)}
                  </Tag>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="center" colSpan={1}>
                  <span style={{ whiteSpace: "nowrap" }}>-</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right" colSpan={1}>
                  <Tag color="green" style={{ fontWeight: "bold", fontSize: 13, whiteSpace: "nowrap" }}>
                    {formatCurrency(totalRevenue)}
                  </Tag>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="center" colSpan={1}>
                  <span style={{ whiteSpace: "nowrap" }}>-</span>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      {/* Edit Discount Modal */}
      <Modal
        title="Chỉnh sửa miễn giảm học phí"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingStudent(null);
          setEditDiscount(0);
        }}
        onOk={async () => {
          if (!editingStudent) return;

          try {
            // Không dùng tháng nữa, dùng key đơn giản
            const invoiceKey = editingStudent.id;

            // Update discount in Firebase
            const response = await fetch(
              `${DATABASE_URL_BASE}/datasheet/Phiếu_thu_học_phí/${invoiceKey}.json`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ discount: editDiscount }),
              }
            );

            if (response.ok) {
              message.success("Đã cập nhật miễn giảm học phí");

              // Refresh invoices
              const refreshResponse = await fetch(
                `${DATABASE_URL_BASE}/datasheet/Phiếu_thu_học_phí.json?_=${new Date().getTime()}`,
                { cache: "no-cache" }
              );
              const refreshData = await refreshResponse.json();
              if (refreshData) {
                setStudentInvoices(refreshData);
              }

              setEditModalOpen(false);
              setEditingStudent(null);
              setEditDiscount(0);
            } else {
              message.error("Lỗi khi cập nhật miễn giảm");
            }
          } catch (error) {
            console.error("Error updating discount:", error);
            message.error("Lỗi khi cập nhật miễn giảm");
          }
        }}
        okText="Lưu"
        cancelText="Hủy"
      >
        {editingStudent && (
          <Space direction="vertical" style={{ width: "100%" }} size="large">
            <div>
              <Text strong>Học sinh: </Text>
              <Text>{editingStudent["Họ và tên"]}</Text>
            </div>
            <div>
              <Text strong>Môn đăng ký: </Text>
              <Text>{editingStudent.monthSessions} buổi</Text>
            </div>
            <div>
              <Text strong>Học phí: </Text>
              <Text style={{ color: "#36797f" }}>
                {formatCurrency(editingStudent.monthRevenue)}
              </Text>
            </div>
            <Divider />
            <div>
              <Text strong className="block mb-2">Miễn giảm học phí:</Text>
              <InputNumber
                style={{ width: "100%" }}
                value={editDiscount}
                onChange={(value) => setEditDiscount(value || 0)}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, ""))}
                addonAfter="đ"
                min={0}
                max={editingStudent.monthRevenue}
                placeholder="Nhập số tiền miễn giảm"
              />
            </div>
            <Divider />
            <div>
              <Text strong>Phải thu: </Text>
              <Text strong style={{ color: "#1890ff", fontSize: "16px" }}>
                {formatCurrency(Math.max(0, editingStudent.monthRevenue - editDiscount))}
              </Text>
            </div>
          </Space>
        )}
      </Modal>

      {/* Edit Stars Modal - Commented out due to missing dependencies */}
      {/*
      {console.log("🌟 Rendering Edit Stars Modal, isOpen:", isEditStarsModalOpen, "editingStudent:", editingStarsStudent?.["Họ và tên"])}
      <Modal
        title={`Chỉnh sửa sao thưởng - ${editingStarsStudent?.["Họ và tên"] || ""}`}
        open={isEditStarsModalOpen}
        onCancel={() => {
          console.log("🌟 Modal cancelled");
          setEditStarsModalOpen(false);
          setEditingStarsStudent(null);
          editStarsForm.resetFields();
        }}
        footer={null}
        width={700}
        getContainer={false}
        destroyOnClose={true}
      >
        <Form
          form={editStarsForm}
          layout="vertical"
          onFinish={(values) => {
            handleSaveStars(values.adjustment, values.reason);
          }}
        >
          <Form.Item label="Tổng sao hiện tại" name="currentTotal">
            <InputNumber
              disabled
              style={{ width: "100%" }}
              addonAfter="⭐"
            />
          </Form.Item>

          <Form.Item
            label="Điều chỉnh (số dương để thêm, số âm để trừ)"
            name="adjustment"
            rules={[
              { required: true, message: "Vui lòng nhập số sao điều chỉnh" },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="Nhập số sao (ví dụ: +5 hoặc -3)"
              addonAfter="⭐"
            />
          </Form.Item>

          <Form.Item
            label="Lý do"
            name="reason"
            rules={[{ required: true, message: "Vui lòng nhập lý do" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Nhập lý do điều chỉnh sao thưởng"
            />
          </Form.Item>

          <Space style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button
              danger
              onClick={handleResetStars}
            >
              Reset về 0
            </Button>
            <Button onClick={() => {
              setEditStarsModalOpen(false);
              setEditingStarsStudent(null);
              editStarsForm.resetFields();
            }}>
              Hủy
            </Button>
            <Button type="primary" htmlType="submit">
              Lưu
            </Button>
          </Space>
        </Form>

        <Divider>Lịch sử chỉnh sửa</Divider>

        <Table
          dataSource={starsHistory.filter(
            (record) => record.studentId === editingStarsStudent?.id
          )}
          columns={[
            {
              title: "Ngày",
              dataIndex: "Ngày chỉnh sửa",
              key: "date",
              width: 100,
            },
            {
              title: "Thay đổi",
              dataIndex: "Thay đổi",
              key: "change",
              width: 80,
              render: (change) => (
                <Tag color={change > 0 ? "green" : change < 0 ? "red" : "default"}>
                  {change > 0 ? `+${change}` : change} ⭐
                </Tag>
              ),
            },
            {
              title: "Trước → Sau",
              key: "beforeAfter",
              width: 100,
              render: (_, record) => (
                <span>
                  {record["Số sao trước"]} → {record["Số sao sau"]}
                </span>
              ),
            },
            {
              title: "Lý do",
              dataIndex: "Lý do",
              key: "reason",
            },
            {
              title: "Người sửa",
              dataIndex: "Người chỉnh sửa",
              key: "editor",
              width: 120,
            },
            {
              title: "Loại",
              dataIndex: "Loại thay đổi",
              key: "type",
              width: 80,
              render: (type) => (
                <Tag color={type === "Reset" ? "red" : "blue"}>
                  {type}
                </Tag>
              ),
            },
          ]}
          pagination={{ pageSize: 5 }}
          size="small"
        />
      </Modal>
      */}
    </div>

  );
};

export default StudentListView;
