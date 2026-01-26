import WrapperContent from "@/components/WrapperContent";
import { DATABASE_URL_BASE, database } from "@/firebase";
import { ref, onValue, update, remove, set } from "firebase/database";
import { subjectMap, subjectOptions } from "@/utils/selectOptions";
import {
  Tabs,
  Table,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Tag,
  Space,
  Modal,
  Card,
  Typography,
  Row,
  Col,
  message,
  Upload,
  Image,
  Popconfirm,
  Dropdown,
  Menu,
} from "antd";
import type { UploadFile } from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  PrinterOutlined,
  FileImageOutlined,
  DeleteOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { EditOutlined } from "@ant-design/icons";
import React, { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import DiscountInput from "../DiscountInput";

const { Title, Text } = Typography;
const { Option } = Select;

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh"?: string;
  "Số điện thoại"?: string;
  Email?: string;
  [key: string]: any;
}

interface Teacher {
  id: string;
  "Họ và tên": string;
  "Mã giáo viên"?: string;
  "Biên chế"?: string;
  "Số điện thoại"?: string;
  Email?: string;
  "Ngân hàng"?: string;
  STK?: string;
  [key: string]: any;
}

interface AttendanceSession {
  id: string;
  Ngày: string;
  "Giờ bắt đầu": string;
  "Giờ kết thúc": string;
  "Mã lớp": string;
  "Tên lớp": string;
  "Teacher ID": string;
  "Giáo viên": string;
  "Student IDs"?: string[];
  "Điểm danh"?: any[];
  "Phụ cấp di chuyển"?: number;
  [key: string]: any;
}

interface Course {
  id: string;
  Khối: number;
  "Môn học": string;
  Giá: number;
  "Lương GV Part-time": number;
  "Lương GV Full-time": number;
  [key: string]: any;
}

interface StudentInvoice {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  month: number;
  year: number;
  totalSessions: number;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  status: "paid" | "unpaid";
  sessions: AttendanceSession[];
  invoiceImage?: string; // Base64 image data
  // Class information
  className?: string;
  classCode?: string;
  subject?: string;
  pricePerSession?: number;
}

// Grouped invoice by student (for expandable rows)
interface GroupedStudentInvoice {
  studentId: string;
  studentName: string;
  studentCode: string;
  month: number;
  year: number;
  invoices: StudentInvoice[]; // Multiple invoices if student has multiple classes
  totalSessions: number; // Sum of all classes
  totalAmount: number; // Sum of all classes
  discount: number; // Total discount
  finalAmount: number; // Total final amount
  status: "paid" | "unpaid"; // "paid" only if all invoices are paid
}

interface TeacherSalary {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  bienChe: string;
  month: number;
  year: number;
  totalSessions: number;
  salaryPerSession: number;
  totalSalary: number;
  totalAllowance: number;
  totalHours: number;
  totalMinutes: number;
  status: "paid" | "unpaid";
  sessions: AttendanceSession[];
  invoiceImage?: string; // Base64 image data
}

const InvoicePage = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Student invoice filters
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [studentMonth, setStudentMonth] = useState(dayjs().month());
  const [studentYear, setStudentYear] = useState(dayjs().year());
  const [studentStatusFilter, setStudentStatusFilter] = useState<
    "all" | "paid" | "unpaid"
  >("unpaid");
  const [studentClassFilter, setStudentClassFilter] = useState<string[]>([]); // Nhiều lớp
  const [studentTeacherFilter, setStudentTeacherFilter] = useState<string>("all"); // Lọc theo giáo viên

  // Trigger to force recalculation after discount update
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Row selection state for bulk delete (unpaid tab)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Row selection state for bulk delete (paid tab)
  const [selectedPaidRowKeys, setSelectedPaidRowKeys] = useState<React.Key[]>([]);

  // State for QR preference in invoice modal
  const [includeQRInInvoice, setIncludeQRInInvoice] = useState(true);

  // Track active tab to auto-apply status filters
  const [activeTab, setActiveTab] = useState<string>("students");

  // State for QR preference per invoice (for table)
  const [invoiceQRPreferences, setInvoiceQRPreferences] = useState<Record<string, boolean>>({});

  // Edit invoice modal state (restore edit functionality)
  const [editingInvoice, setEditingInvoice] = useState<StudentInvoice | null>(
    null
  );
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editInvoiceModalOpen, setEditInvoiceModalOpen] =
    useState<boolean>(false);
  // State to track individual session prices when editing
  const [editSessionPrices, setEditSessionPrices] = useState<{ [sessionId: string]: number }>({});

  // Helpers to handle keys that are invalid in Firebase paths (like containing '/')
  const sanitizeKey = (key: string) => key.replace(/[.#$\/[\]]/g, "_");

  const sanitizeObjectKeys = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(sanitizeObjectKeys);
    if (obj !== null && typeof obj === "object") {
      return Object.entries(obj).reduce((acc: any, [k, v]) => {
        acc[sanitizeKey(k)] = sanitizeObjectKeys(v);
        return acc;
      }, {});
    }
    return obj;
  };

  const getSafeField = (obj: any, field: string) => {
    if (!obj) return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, field)) return obj[field];
    const sk = sanitizeKey(field);
    if (Object.prototype.hasOwnProperty.call(obj, sk)) return obj[sk];
    return undefined;
  };

  // Teacher salary filters
  const [teacherSearchTerm, setTeacherSearchTerm] = useState("");
  const [teacherMonth, setTeacherMonth] = useState(dayjs().month());
  const [teacherYear, setTeacherYear] = useState(dayjs().year());
  const [teacherBienCheFilter, setTeacherBienCheFilter] =
    useState<string>("all");
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<
    "all" | "paid" | "unpaid"
  >("all");

  // Invoice status storage in Firebase
  const [studentInvoiceStatus, setStudentInvoiceStatus] = useState<
    Record<
      string,
      | {
        status: "paid" | "unpaid";
        discount?: number;
        // Full invoice data for paid records
        studentId?: string;
        studentName?: string;
        studentCode?: string;
        month?: number;
        year?: number;
        totalSessions?: number;
        totalAmount?: number;
        finalAmount?: number;
        paidAt?: string;
        sessions?: any[];
        invoiceImage?: string;
        sessionPrices?: { [sessionId: string]: number }; // Custom prices per session
      }
      | "paid"
      | "unpaid"
    >
  >({});
  const [teacherSalaryStatus, setTeacherSalaryStatus] = useState<
    Record<
      string,
      | "paid"
      | "unpaid"
      | {
        status: "paid" | "unpaid";
        // Full salary data for paid records
        teacherId?: string;
        teacherName?: string;
        teacherCode?: string;
        bienChe?: string;
        month?: number;
        year?: number;
        totalSessions?: number;
        salaryPerSession?: number;
        totalHours?: number;
        totalMinutes?: number;
        totalSalary?: number;
        totalAllowance?: number;
        paidAt?: string;
        bankInfo?: {
          bank: string | null;
          accountNo: string | null;
          accountName: string | null;
        };
        invoiceImage?: string;
        sessions?: any[];
      }
    >
  >({});

  // Load payment status from Firebase
  useEffect(() => {
    const studentInvoicesRef = ref(database, "datasheet/Phiếu_thu_học_phí");
    const teacherSalariesRef = ref(database, "datasheet/Phiếu_lương_giáo_viên");

    const unsubscribeStudents = onValue(studentInvoicesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStudentInvoiceStatus(data);
      }
    });

    const unsubscribeTeachers = onValue(teacherSalariesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTeacherSalaryStatus(data);
      }
    });

    return () => {
      unsubscribeStudents();
      unsubscribeTeachers();
    };
  }, []);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch students
        const studentsRes = await fetch(
          `${DATABASE_URL_BASE}/datasheet/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh.json`
        );
        const studentsData = await studentsRes.json();
        if (studentsData) {
          setStudents(
            Object.entries(studentsData).map(([id, data]: [string, any]) => ({
              id,
              ...data,
            }))
          );
        }

        // Fetch teachers
        const teachersRes = await fetch(
          `${DATABASE_URL_BASE}/datasheet/Gi%C3%A1o_vi%C3%AAn.json`
        );
        const teachersData = await teachersRes.json();
        if (teachersData) {
          setTeachers(
            Object.entries(teachersData).map(([id, data]: [string, any]) => ({
              id,
              ...data,
            }))
          );
        }

        // Fetch attendance sessions
        const sessionsRes = await fetch(
          `${DATABASE_URL_BASE}/datasheet/%C4%90i%E1%BB%83m_danh_sessions.json`
        );
        const sessionsData = await sessionsRes.json();
        if (sessionsData) {
          setSessions(
            Object.entries(sessionsData).map(([id, data]: [string, any]) => ({
              id,
              ...data,
            }))
          );
        }

        // Fetch courses
        const coursesRes = await fetch(
          `${DATABASE_URL_BASE}/datasheet/Kh%C3%B3a_h%E1%BB%8Dc.json`
        );
        const coursesData = await coursesRes.json();
        if (coursesData) {
          setCourses(
            Object.entries(coursesData).map(([id, data]: [string, any]) => ({
              id,
              ...data,
            }))
          );
        }

        // Fetch classes
        const classesRes = await fetch(
          `${DATABASE_URL_BASE}/datasheet/L%E1%BB%9Bp_h%E1%BB%8Dc.json`
        );
        const classesData = await classesRes.json();
        if (classesData) {
          setClasses(
            Object.entries(classesData).map(([id, data]: [string, any]) => ({
              id,
              ...data,
            }))
          );
        }

        // Fetch timetable entries (Thời_khoá_biểu)
        const timetableRes = await fetch(
          `${DATABASE_URL_BASE}/datasheet/Th%E1%BB%9Di_kho%C3%A1_bi%E1%BB%83u.json`
        );
        const timetableData = await timetableRes.json();
        if (timetableData) {
          setTimetableEntries(
            Object.entries(timetableData).map(([id, data]: [string, any]) => ({
              id,
              ...data,
            }))
          );
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        message.error("Lỗi khi tải dữ liệu");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // No longer need calculateTravelAllowance - using salary per session instead

  // Load student invoices directly from Firebase (populated by attendance save)
  const studentInvoices = useMemo(() => {
    console.log(`📋 Loading invoices from Firebase for month ${studentMonth + 1}/${studentYear}`);

    const invoicesList: StudentInvoice[] = [];

    // Load all invoices from Firebase that match the selected month/year
    Object.entries(studentInvoiceStatus).forEach(([key, data]) => {
      if (!data) return;

      // Skip deleted invoices
      if (typeof data === "object" && data !== null && (data as any).deleted === true) {
        console.log(`⏭️ Skipping deleted invoice: ${key}`);
        return;
      }

      // Parse invoice data
      let invoiceData: any = {};
      if (typeof data === "object" && data !== null) {
        invoiceData = data;
      } else {
        // If data is just a status string, create minimal object
        invoiceData = { status: data };
      }

      const status = invoiceData.status || "unpaid";
      const month = invoiceData.month ?? 0;
      const year = invoiceData.year ?? 0;

      // Only include invoices matching selected month/year
      if (month !== studentMonth || year !== studentYear) {
        return;
      }

      // Get student info
      const studentId = invoiceData.studentId || key.split("-")[0];
      const student = students.find((s) => String(s.id) === String(studentId));

      // Get class/course info from sessions
      let className = "";
      let classCode = "";
      let subject = "";
      let pricePerSession = 0;

      if (invoiceData.sessions && invoiceData.sessions.length > 0) {
        const firstSession = invoiceData.sessions[0];
        className = firstSession["Tên lớp"] || "";
        classCode = firstSession["Mã lớp"] || "";

        // Get subject from class info
        const classId = firstSession["Class ID"];
        const classInfo = classes.find((c) => c.id === classId);
        if (classInfo) {
          subject = classInfo["Môn học"] || "";

          // Get price from course
          const course = courses.find((c) => {
            if (c.Khối !== classInfo.Khối) return false;
            const classSubject = classInfo["Môn học"];
            const courseSubject = c["Môn học"];
            if (classSubject === courseSubject) return true;
            const subjectOption = subjectOptions.find(
              (opt) => opt.label === classSubject || opt.value === classSubject
            );
            if (subjectOption) {
              return courseSubject === subjectOption.label || courseSubject === subjectOption.value;
            }
            return false;
          });
          pricePerSession = course?.Giá || classInfo?.["Học phí mỗi buổi"] || 0;
        }
      }

      invoicesList.push({
        id: key,
        studentId: studentId,
        studentName: invoiceData.studentName || student?.["Họ và tên"] || "",
        studentCode: invoiceData.studentCode || student?.["Mã học sinh"] || "",
        month: month,
        year: year,
        totalSessions: invoiceData.totalSessions ?? 0,
        totalAmount: invoiceData.totalAmount ?? 0,
        discount: invoiceData.discount ?? 0,
        finalAmount: invoiceData.finalAmount ?? 0,
        status: status as "paid" | "unpaid",
        sessions: invoiceData.sessions || [],
        invoiceImage: invoiceData.invoiceImage,
        className,
        classCode,
        subject,
        pricePerSession,
      });
    });

    console.log(`📊 Total invoices loaded from Firebase: ${invoicesList.length}`);
    console.log(`📊 Unpaid: ${invoicesList.filter(i => i.status !== "paid").length}`);
    console.log(`📊 Paid: ${invoicesList.filter(i => i.status === "paid").length}`);

    return invoicesList;
  }, [
    studentInvoiceStatus,
    students,
    classes,
    courses,
    studentMonth,
    studentYear,
    refreshTrigger,
  ]);

  // Calculate teacher salaries
  const teacherSalaries = useMemo(() => {
    const salariesMap: Record<string, TeacherSalary> = {};

    // First, load all paid salaries from Firebase (these are immutable)
    Object.entries(teacherSalaryStatus).forEach(([key, data]) => {
      if (!data) return;

      const status = typeof data === "string" ? data : data.status;

      // If paid and has complete data in Firebase, use it directly
      if (status === "paid" && typeof data === "object" && data.teacherId) {
        // Only include if it matches the selected month/year
        if (data.month === teacherMonth && data.year === teacherYear) {
          salariesMap[key] = {
            id: key,
            teacherId: data.teacherId,
            teacherName: data.teacherName || "",
            teacherCode: data.teacherCode || "",
            bienChe: data.bienChe || "Chưa phân loại",
            month: data.month ?? 0,
            year: data.year ?? 0,
            totalSessions: data.totalSessions ?? 0,
            salaryPerSession: data.salaryPerSession ?? 0,
            totalSalary: data.totalSalary ?? 0,
            totalAllowance: data.totalAllowance ?? 0,
            totalHours: data.totalHours ?? 0,
            totalMinutes: data.totalMinutes ?? 0,
            status: "paid",
            sessions: data.sessions || [],
          };
        }
      }
    });

    // Then calculate unpaid salaries from sessions
    sessions.forEach((session) => {
      const sessionDate = new Date(session["Ngày"]);
      const sessionMonth = sessionDate.getMonth();
      const sessionYear = sessionDate.getFullYear();

      if (sessionMonth === teacherMonth && sessionYear === teacherYear) {
        const teacherId = session["Teacher ID"];
        if (!teacherId) return;

        const key = `${teacherId}-${sessionMonth}-${sessionYear}`;

        // Skip if already loaded from Firebase as paid
        if (salariesMap[key]?.status === "paid") return;

        const teacher = teachers.find((t) => t.id === teacherId);
        if (!teacher) return;

        const bienChe = teacher["Biên chế"] || "Chưa phân loại";

        // Prefer per-session salary from class, fallback to session then teacher info
        const parseCurrency = (value: unknown) => {
          if (value === undefined || value === null) return 0;
          const num = Number(String(value).replace(/[^0-9.-]+/g, ""));
          return Number.isFinite(num) ? num : 0;
        };

        const classId = session["Class ID"];
        const classInfo = classes.find((c) => c.id === classId);
        // Lấy Lương GV - ưu tiên từ session, fallback về class, cuối cùng là teacher
        // Ưu tiên: Session > Class > Teacher
        const salaryPerSession =
          parseCurrency(session["Lương GV"]) ||          // 1. Từ Session (ưu tiên)
          parseCurrency(classInfo?.["Lương GV"]) ||       // 2. Từ Lớp học (fallback)
          parseCurrency(teacher["Lương theo buổi"]);     // 3. Từ Giáo viên (fallback cuối)

        if (!salariesMap[key]) {
          // Normalize status - handle both direct value and nested object
          const statusValue = teacherSalaryStatus[key];
          const status =
            typeof statusValue === "object" && statusValue?.status
              ? statusValue.status
              : (statusValue as "paid" | "unpaid") || "unpaid";

          salariesMap[key] = {
            id: key,
            teacherId,
            teacherName: teacher["Họ và tên"] || "",
            teacherCode: teacher["Mã giáo viên"] || "",
            bienChe,
            month: sessionMonth,
            year: sessionYear,
            totalSessions: 0,
            salaryPerSession: salaryPerSession,
            totalSalary: 0,
            totalAllowance: 0,
            totalHours: 0,
            totalMinutes: 0,
            status,
            sessions: [],
          };
        }

        salariesMap[key].totalSessions++;
        salariesMap[key].totalSalary += salaryPerSession;

        // Calculate hours and minutes from session
        const startTime = session["Giờ bắt đầu"];
        const endTime = session["Giờ kết thúc"];
        if (startTime && endTime) {
          const [startHour, startMin] = startTime.split(":").map(Number);
          const [endHour, endMin] = endTime.split(":").map(Number);
          const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
          salariesMap[key].totalMinutes += durationMinutes;
        }

        // Calculate travel allowance
        const travelAllowance = Number(session["Phụ cấp di chuyển"]) || 0;
        salariesMap[key].totalAllowance += travelAllowance;

        salariesMap[key].sessions.push(session);
      }
    });

    // Convert total minutes to hours and minutes
    Object.values(salariesMap).forEach((salary) => {
      if (salary.status !== "paid") {
        salary.totalHours = Math.floor(salary.totalMinutes / 60);
        salary.totalMinutes = salary.totalMinutes % 60;
      }
    });

    return Object.values(salariesMap);
  }, [
    sessions,
    teachers,
    classes,
    teacherMonth,
    teacherYear,
    teacherSalaryStatus,
  ]);

  // Get unique classes for filter
  const uniqueClasses = useMemo(() => {
    return classes.map((cls) => ({
      id: cls.id,
      name: cls["Mã lớp"] && cls["Tên lớp"]
        ? `${cls["Mã lớp"]} - ${cls["Tên lớp"]}`
        : cls["Tên lớp"] || cls.id,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  // Get unique teachers for filter
  const uniqueTeachers = useMemo(() => {
    return teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher["Họ và tên"] || teacher["Tên giáo viên"] || teacher.id,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers]);

  // Filter student invoices with all filters (tab "Chưa thanh toán")
  const filteredStudentInvoices = useMemo(() => {
    if (!studentInvoices || !Array.isArray(studentInvoices)) {
      return [];
    }

    try {
      return studentInvoices.filter((invoice) => {
        if (!invoice) return false;

        // Filter by search term (name)
        const matchSearch =
          !studentSearchTerm ||
          (invoice.studentName &&
            invoice.studentName
              .toLowerCase()
              .includes(studentSearchTerm.toLowerCase())) ||
          (invoice.studentCode &&
            invoice.studentCode
              .toLowerCase()
              .includes(studentSearchTerm.toLowerCase()));

        // Filter by month
        const matchMonth = invoice.month !== undefined && invoice.month === studentMonth;

        // Filter by year
        const matchYear = invoice.year !== undefined && invoice.year === studentYear;

        // Filter by status
        const matchStatus =
          invoice.status !== "paid" &&
          studentStatusFilter !== "paid";

        // Filter by class - check if invoice has sessions in selected classes
        const matchClass =
          studentClassFilter.length === 0 ||
          (invoice.sessions && Array.isArray(invoice.sessions) && invoice.sessions.some((session: any) => {
            if (!session) return false;
            const classId = session["Class ID"];
            return classId && studentClassFilter.includes(classId);
          }));

        // Filter by teacher - check if invoice has sessions with selected teacher
        const matchTeacher =
          studentTeacherFilter === "all" ||
          (invoice.sessions && Array.isArray(invoice.sessions) && invoice.sessions.some((session: any) => {
            if (!session) return false;
            const classId = session["Class ID"];
            if (!classId) return false;
            const classData = classes.find(c => c && c.id === classId);
            if (!classData) return false;
            const teacherId = classData["Teacher ID"];
            return teacherId === studentTeacherFilter;
          }));

        return matchSearch && matchMonth && matchYear && matchStatus && matchClass && matchTeacher;
      });
    } catch (error) {
      console.error("Error filtering student invoices:", error);
      return [];
    }
  }, [studentInvoices, studentSearchTerm, studentMonth, studentYear, studentStatusFilter, studentClassFilter, studentTeacherFilter, classes]);

  // Group unpaid invoices by student
  const groupedStudentInvoices = useMemo(() => {
    const groupMap = new Map<string, GroupedStudentInvoice>();

    filteredStudentInvoices.forEach((invoice) => {
      const key = invoice.studentId;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          studentId: invoice.studentId,
          studentName: invoice.studentName,
          studentCode: invoice.studentCode,
          month: invoice.month,
          year: invoice.year,
          invoices: [],
          totalSessions: 0,
          totalAmount: 0,
          discount: 0,
          finalAmount: 0,
          status: "unpaid",
        });
      }

      const group = groupMap.get(key)!;
      group.invoices.push(invoice);
      group.totalSessions += invoice.totalSessions;
      group.totalAmount += invoice.totalAmount;
      group.discount += invoice.discount;
      group.finalAmount += invoice.finalAmount;
    });

    return Array.from(groupMap.values());
  }, [filteredStudentInvoices]);

  // Filter paid student invoices (for paid tab)
  const filteredPaidStudentInvoices = useMemo(() => {
    return studentInvoices.filter((invoice) => {
      const matchSearch =
        !studentSearchTerm ||
        invoice.studentName
          .toLowerCase()
          .includes(studentSearchTerm.toLowerCase()) ||
        invoice.studentCode
          .toLowerCase()
          .includes(studentSearchTerm.toLowerCase());

      // Only show paid invoices
      const matchStatus = invoice.status === "paid";

      return matchSearch && matchStatus;
    });
  }, [studentInvoices, studentSearchTerm]);

  // Filter teacher salaries
  const filteredTeacherSalaries = useMemo(() => {
    return teacherSalaries.filter((salary) => {
      const matchSearch =
        !teacherSearchTerm ||
        salary.teacherName
          .toLowerCase()
          .includes(teacherSearchTerm.toLowerCase()) ||
        salary.teacherCode
          .toLowerCase()
          .includes(teacherSearchTerm.toLowerCase());

      const matchBienChe =
        teacherBienCheFilter === "all" ||
        salary.bienChe === teacherBienCheFilter;

      const matchStatus =
        teacherStatusFilter === "all" || salary.status === teacherStatusFilter;

      return matchSearch && matchBienChe && matchStatus;
    });
  }, [
    teacherSalaries,
    teacherSearchTerm,
    teacherBienCheFilter,
    teacherStatusFilter,
  ]);

  // Delete student invoices (bulk delete - unpaid tab) - removed, use individual delete instead
  const handleDeleteMultipleInvoices = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một phiếu thu để xóa");
      return;
    }

    // selectedRowKeys ở tab chưa thanh toán là studentId (do bảng group theo học sinh)
    const groupedByStudent = new Map(groupedStudentInvoices.map((g) => [g.studentId, g]));

    Modal.confirm({
      title: "Xác nhận xóa",
      content: `Bạn có chắc chắn muốn xóa ${selectedRowKeys.length} phiếu thu đã chọn? Dữ liệu sẽ bị xóa vĩnh viễn.`,
      okText: "Xóa",
      cancelText: "Hủy",
      okType: "danger",
      onOk: async () => {
        try {
          const deletePromises: Promise<void>[] = [];
          let totalDeleted = 0;

          selectedRowKeys.forEach((studentIdKey) => {
            const group = groupedByStudent.get(String(studentIdKey));
            if (!group) return;
            group.invoices.forEach((invoice) => {
              const invoiceRef = ref(
                database,
                `datasheet/Phiếu_thu_học_phí/${invoice.id}`
              );
              deletePromises.push(remove(invoiceRef));
              totalDeleted += 1;
            });
          });

          await Promise.all(deletePromises);
          message.success(`Đã xóa ${totalDeleted} phiếu thu`);
          setSelectedRowKeys([]);
          setRefreshTrigger((prev) => prev + 1);
        } catch (error) {
          console.error("Error deleting invoices:", error);
          message.error("Lỗi khi xóa phiếu thu");
        }
      },
    });
  };

  // Delete paid student invoices (bulk delete - paid tab)
  const handleDeleteMultiplePaidInvoices = async () => {
    if (selectedPaidRowKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một phiếu thu để xóa");
      return;
    }

    Modal.confirm({
      title: "Xác nhận xóa",
      content: `Bạn có chắc chắn muốn xóa ${selectedPaidRowKeys.length} phiếu thu đã thanh toán đã chọn? Dữ liệu sẽ bị xóa vĩnh viễn.`,
      okText: "Xóa",
      cancelText: "Hủy",
      okType: "danger",
      onOk: async () => {
        try {
          const deletePromises = selectedPaidRowKeys.map(async (invoiceId) => {
            const invoiceIdStr = String(invoiceId);
            const invoiceRef = ref(
              database,
              `datasheet/Phiếu_thu_học_phí/${invoiceIdStr}`
            );
            // Permanently delete
            await remove(invoiceRef);
          });

          await Promise.all(deletePromises);
          message.success(`Đã xóa ${selectedPaidRowKeys.length} phiếu thu`);
          setSelectedPaidRowKeys([]);
          setRefreshTrigger((prev) => prev + 1);
        } catch (error) {
          console.error("Error deleting invoices:", error);
          message.error("Lỗi khi xóa phiếu thu");
        }
      },
    });
  };

  // Delete single invoice - permanently remove from database
  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const invoiceRef = ref(
        database,
        `datasheet/Phiếu_thu_học_phí/${invoiceId}`
      );
      // Permanently delete the invoice from Firebase
      await remove(invoiceRef);
      message.success("Đã xóa phiếu thu");
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Error deleting invoice:", error);
      message.error("Lỗi khi xóa phiếu thu");
    }
  };

  // Update payment status
  const updateStudentInvoiceStatus = async (
    invoiceId: string,
    status: "paid" | "unpaid"
  ) => {
    Modal.confirm({
      title:
        status === "paid" ? "Xác nhận thanh toán" : "Hủy xác nhận thanh toán",
      content:
        status === "paid"
          ? "Bạn có chắc chắn muốn đánh dấu phiếu thu này đã thanh toán?"
          : "Bạn có chắc chắn muốn hủy trạng thái thanh toán?",
      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          // Find the invoice data
          const invoice = studentInvoices.find((inv) => inv.id === invoiceId);
          if (!invoice) {
            message.error("Không tìm thấy thông tin phiếu thu");
            return;
          }

          const invoiceRef = ref(
            database,
            `datasheet/Phiếu_thu_học_phí/${invoiceId}`
          );

          // When marking as paid, save complete invoice data
          if (status === "paid") {
            await update(invoiceRef, {
              status,
              studentId: invoice.studentId,
              studentName: invoice.studentName,
              studentCode: invoice.studentCode,
              month: invoice.month,
              year: invoice.year,
              totalSessions: invoice.totalSessions,
              totalAmount: invoice.totalAmount,
              discount: invoice.discount,
              finalAmount: invoice.finalAmount,
              paidAt: new Date().toISOString(),
              sessions: invoice.sessions.map((s) => ({
                Ngày: s["Ngày"],
                "Tên lớp": s["Tên lớp"],
                "Mã lớp": s["Mã lớp"],
                "Class ID": s["Class ID"],
              })),
            });
          } else {
            // Only allow unpaid if not yet marked as paid
            await update(invoiceRef, {
              status,
            });
          }

          message.success(
            status === "paid"
              ? "Đã đánh dấu đã thanh toán"
              : "Đã đánh dấu chưa thanh toán"
          );
        } catch (error) {
          console.error("Error updating student invoice status:", error);
          message.error("Lỗi khi cập nhật trạng thái");
        }
      },
    });
  };

  // Inline update total amount for grouped invoices
  const handleInlineUpdateTotalAmount = async (
    record: GroupedStudentInvoice,
    newTotalAmount: number
  ) => {
    try {
      const safeTotal = Math.max(0, Math.round(newTotalAmount || 0));
      const currentTotal = record.invoices.reduce(
        (sum, inv) => sum + (inv.totalAmount || 0),
        0
      );

      if (currentTotal === 0) {
        message.warning("Tổng hiện tại bằng 0, không thể phân bổ");
        return;
      }

      const factor = safeTotal / currentTotal;

      const updatePromises = record.invoices.map((invoice) => {
        const newInvoiceTotal = Math.max(
          0,
          Math.round((invoice.totalAmount || 0) * factor)
        );
        const newFinal = Math.max(
          0,
          Math.round(newInvoiceTotal - (invoice.discount || 0))
        );
        const invoiceRef = ref(
          database,
          `datasheet/Phiếu_thu_học_phí/${invoice.id}`
        );
        return update(invoiceRef, {
          totalAmount: newInvoiceTotal,
          finalAmount: newFinal,
        }).then(() => ({
          id: invoice.id,
          totalAmount: newInvoiceTotal,
          finalAmount: newFinal,
        }));
      });

      const updated = await Promise.all(updatePromises);

      // Update local state immediately for printing
      setStudentInvoiceStatus((prev) => {
        const next = { ...prev } as any;
        updated.forEach((item) => {
          const current = next[item.id];
          if (typeof current === "object" && current !== null) {
            next[item.id] = {
              ...current,
              totalAmount: item.totalAmount,
              finalAmount: item.finalAmount,
            };
          }
        });
        return next;
      });

      // Trigger UI refresh
      setRefreshTrigger((prev) => prev + 1);
      message.success("Đã cập nhật tổng tiền");
    } catch (error) {
      console.error("Error updating total amount:", error);
      message.error("Lỗi khi cập nhật tổng tiền");
    }
  };

  // Helper function to get price for a session
  const getSessionPrice = (session: AttendanceSession): number => {
    const classId = session["Class ID"];
    const classInfo = classes.find((c) => c.id === classId);

    if (!classInfo) return 0;

    const course = courses.find((c) => {
      if (c.Khối !== classInfo.Khối) return false;
      const classSubject = classInfo["Môn học"];
      const courseSubject = c["Môn học"];
      if (classSubject === courseSubject) return true;
      const subjectOption = subjectOptions.find(
        (opt) => opt.label === classSubject || opt.value === classSubject
      );
      if (subjectOption) {
        return courseSubject === subjectOption.label || courseSubject === subjectOption.value;
      }
      return false;
    });

    return course?.Giá || classInfo?.["Học phí mỗi buổi"] || 0;
  };

  // Update invoice with custom session prices
  const updateStudentInvoiceWithSessionPrices = async (
    invoiceId: string,
    sessionPrices: { [sessionId: string]: number },
    discount: number,
    updatedSessions?: AttendanceSession[]
  ) => {
    try {
      const currentData = studentInvoiceStatus[invoiceId];
      const currentStatus =
        typeof currentData === "object" ? currentData.status : currentData;

      if (currentStatus === "paid") {
        message.error("Không thể cập nhật phiếu đã thanh toán.");
        return;
      }

      // Determine sessions to update: prefer provided updatedSessions, else use current invoice sessions
      const currentInvoice = studentInvoices.find((inv) => inv.id === invoiceId);
      if (!currentInvoice) {
        message.error("Không tìm thấy thông tin phiếu thu");
        return;
      }

      const sessionsToUse: AttendanceSession[] = updatedSessions && updatedSessions.length > 0
        ? updatedSessions
        : (currentInvoice.sessions || []).map((session: AttendanceSession) => {
          const newPrice = sessionPrices[session.id];
          if (newPrice !== undefined) {
            // Store price under sanitized key to avoid invalid Firebase keys
            return { ...session, [sanitizeKey("Giá/buổi")]: newPrice } as AttendanceSession;
          }
          return session;
        });

      // Calculate new total from sessionsToUse
      const newTotalAmount = sessionsToUse.reduce((sum, s) => sum + (Number(getSafeField(s, "Giá/buổi") || 0)), 0);
      const newFinalAmount = Math.max(0, newTotalAmount - discount);

      const invoiceRef = ref(database, `datasheet/Phiếu_thu_học_phí/${invoiceId}`);

      const updateData = {
        ...(typeof currentData === "object" ? currentData : { status: currentStatus || "unpaid" }),
        discount,
        sessions: sessionsToUse, // Update sessions array with new prices
        sessionPrices, // Store custom prices mapping
        totalAmount: newTotalAmount,
        finalAmount: newFinalAmount,
      };

      console.log("💾 Updating invoice:", {
        invoiceId,
        oldTotalAmount: currentInvoice.totalAmount,
        newTotalAmount,
        oldDiscount: currentInvoice.discount,
        newDiscount: discount,
        oldFinalAmount: currentInvoice.finalAmount,
        newFinalAmount,
        sessionsUpdated: updatedSessions.length,
      });

      // Use set() to write the full invoice object. Using update() here
      // can fail if any nested keys contain characters forbidden by
      // Firebase path validation (e.g. "/", ".", "$", "[", "]", "#").
      // Sanitize keys before writing to Firebase to avoid invalid characters
      const safeData = sanitizeObjectKeys(updateData);
      await set(invoiceRef, safeData);
      message.success("Đã cập nhật phiếu thu học phí");
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Error updating invoice:", error);
      message.error("Lỗi khi cập nhật phiếu thu");
    }
  };

  // Update discount
  const updateStudentDiscount = async (invoiceId: string, discount: number) => {
    console.log(invoiceId, discount, ">>>>>>>>>");
    try {
      const currentData = studentInvoiceStatus[invoiceId];
      const currentStatus =
        typeof currentData === "object" ? currentData.status : currentData;

      // Không cho phép cập nhật nếu đã thanh toán
      if (currentStatus === "paid") {
        message.error(
          "Không thể cập nhật phiếu đã thanh toán. Dữ liệu đã được lưu cố định."
        );
        return;
      }

      // Find the invoice to get totalAmount
      const invoice = studentInvoices.find((inv) => inv.id === invoiceId);
      if (!invoice) {
        message.error("Không tìm thấy thông tin phiếu thu");
        return;
      }

      // Calculate new finalAmount
      const finalAmount = Math.max(0, invoice.totalAmount - discount);

      const invoiceRef = ref(
        database,
        `datasheet/Phiếu_thu_học_phí/${invoiceId}`
      );
      const updateData =
        typeof currentData === "object"
          ? { ...currentData, discount, finalAmount }
          : { status: currentStatus || "unpaid", discount, finalAmount };

      await update(invoiceRef, updateData);

      // Trigger recalculation of table
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Error updating discount:", error);
      message.error("Lỗi khi cập nhật miễn giảm");
    }
  };

  const updateTeacherSalaryStatus = async (
    salaryId: string,
    status: "paid" | "unpaid"
  ) => {
    Modal.confirm({
      title:
        status === "paid" ? "Xác nhận thanh toán" : "Hủy xác nhận thanh toán",
      content:
        status === "paid"
          ? "Bạn có chắc chắn muốn đánh dấu phiếu lương này đã thanh toán?"
          : "Bạn có chắc chắn muốn hủy trạng thái thanh toán?",
      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          console.log("🔄 Updating teacher salary status:", {
            salaryId,
            status,
          });

          // Find the salary data
          const salary = teacherSalaries.find((sal) => sal.id === salaryId);
          if (!salary) {
            message.error("Không tìm thấy thông tin phiếu lương");
            return;
          }

          const salaryRef = ref(
            database,
            `datasheet/Phiếu_lương_giáo_viên/${salaryId}`
          );

          console.log(
            "📍 Firebase path:",
            `datasheet/Phiếu_lương_giáo_viên/${salaryId}`
          );

          // When marking as paid, save complete salary data
          if (status === "paid") {
            const teacher = teachers.find((t) => t.id === salary.teacherId);
            await update(salaryRef, {
              status,
              teacherId: salary.teacherId,
              teacherName: salary.teacherName,
              teacherCode: salary.teacherCode,
              bienChe: salary.bienChe,
              month: salary.month,
              year: salary.year,
              totalSessions: salary.totalSessions,
              salaryPerSession: salary.salaryPerSession,
              totalSalary: salary.totalSalary,
              totalAllowance: salary.totalAllowance,
              totalHours: salary.totalHours,
              totalMinutes: salary.totalMinutes,
              paidAt: new Date().toISOString(),
              bankInfo: {
                bank: teacher?.["Ngân hàng"] || null,
                accountNo: teacher?.STK || null,
                accountName: teacher?.["Họ và tên"] || null,
              },
              sessions: salary.sessions.map((s) => ({
                id: s.id,
                Ngày: s["Ngày"],
                "Giờ bắt đầu": s["Giờ bắt đầu"],
                "Giờ kết thúc": s["Giờ kết thúc"],
                "Tên lớp": s["Tên lớp"],
                "Mã lớp": s["Mã lớp"],
              })),
            });
          } else {
            // Only allow unpaid if not yet marked as paid
            await update(salaryRef, { status });
          }

          console.log("✅ Firebase updated successfully");

          // Update local state to trigger re-render
          setTeacherSalaryStatus((prev) => ({
            ...prev,
            [salaryId]: status,
          }));

          message.success(
            status === "paid"
              ? "Đã đánh dấu đã thanh toán"
              : "Đã đánh dấu chưa thanh toán"
          );
        } catch (error) {
          console.error("❌ Error updating teacher salary status:", error);
          message.error("Lỗi khi cập nhật trạng thái");
        }
      },
    });
  };

  // View and export invoice
  const viewStudentInvoice = (invoice: StudentInvoice) => {
    let currentInvoiceData = { ...invoice };
    const currentIncludeQR = invoiceQRPreferences[invoice.id] !== false; // Get QR preference from list
    let modal: any = null;

    // Get the latest data from state
    const getLatestInvoiceData = () => {
      const latestInvoiceData = studentInvoiceStatus[invoice.id];
      let updatedInvoice = { ...currentInvoiceData };

      // Merge with latest data if available
      if (typeof latestInvoiceData === "object" && latestInvoiceData !== null) {
        updatedInvoice = {
          ...currentInvoiceData,
          studentName: latestInvoiceData.studentName || currentInvoiceData.studentName,
          studentCode: latestInvoiceData.studentCode || currentInvoiceData.studentCode,
          totalSessions: latestInvoiceData.totalSessions || currentInvoiceData.totalSessions,
          totalAmount: latestInvoiceData.totalAmount || currentInvoiceData.totalAmount,
          discount: latestInvoiceData.discount || currentInvoiceData.discount,
          finalAmount: latestInvoiceData.finalAmount || currentInvoiceData.finalAmount,
          sessions: latestInvoiceData.sessions || currentInvoiceData.sessions
        };
      }
      return updatedInvoice;
    };

    const refreshModal = () => {
      currentInvoiceData = getLatestInvoiceData();
      const freshContent = generateStudentInvoiceHTML(currentInvoiceData, currentIncludeQR);

      // Update modal content
      const modalElement = document.getElementById(`student-invoice-${invoice.id}`);
      if (modalElement) {
        modalElement.innerHTML = freshContent;
      }

      // Update modal title
      if (modal) {
        modal.update({
          title: `Phiếu thu học phí - ${currentInvoiceData.studentName}`,
        });
      }
    };

    const initialInvoiceData = getLatestInvoiceData();
    const content = generateStudentInvoiceHTML(initialInvoiceData, currentIncludeQR);
    const isPaid = initialInvoiceData.status === "paid";

    // Add message listener for auto-save from iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SAVE_INVOICE_DATA') {
        const updatedData = event.data.data;
        console.log('Received invoice data update:', updatedData);

        // Update Firebase with the changes
        updateInvoiceFromEditableForm(updatedData);

        // Update current invoice data
        currentInvoiceData = {
          ...currentInvoiceData,
          studentName: updatedData.studentName || currentInvoiceData.studentName,
          studentCode: updatedData.studentCode || currentInvoiceData.studentCode
        };

        // Refresh modal with new data after a short delay to allow Firebase update
        setTimeout(() => {
          refreshModal();
        }, 1000);
      }
    };

    window.addEventListener('message', handleMessage);

    modal = Modal.info({
      title: `Phiếu thu học phí - ${initialInvoiceData.studentName}`,
      width: 900,
      maskClosable: true,
      closable: true,
      content: (
        <div
          id={`student-invoice-${invoice.id}`}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ),
      footer: (
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {!isPaid && (
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={() => {
                // Always get the latest data before printing
                const latestData = getLatestInvoiceData();
                printInvoice(latestData, currentIncludeQR);
              }}
            >
              In phiếu
            </Button>
          )}
          <Button onClick={() => {
            window.removeEventListener('message', handleMessage);
            modal.destroy();
          }}>Đóng</Button>
        </Space>
      ),
    });
  };

  // Function to update invoice data from editable form
  const updateInvoiceFromEditableForm = async (updatedData: any) => {
    try {
      const invoiceRef = ref(database, `datasheet/Phiếu_thu_học_phí/${updatedData.id}`);

      // Get current data first
      const currentData = studentInvoiceStatus[updatedData.id];
      if (typeof currentData === "object" && currentData !== null) {
        // Update only the changed fields
        const updateFields: any = {};

        if (updatedData.studentName !== currentData.studentName) {
          updateFields.studentName = updatedData.studentName;
        }
        if (updatedData.studentCode !== currentData.studentCode) {
          updateFields.studentCode = updatedData.studentCode;
        }

        if (Object.keys(updateFields).length > 0) {
          await update(invoiceRef, updateFields);
          message.success('Đã lưu thay đổi tự động');

          // Update local state immediately so print function uses new data
          setStudentInvoiceStatus(prev => ({
            ...prev,
            [updatedData.id]: {
              ...currentData,
              ...updateFields
            }
          }));

          // Refresh the invoice list
          setRefreshTrigger(prev => prev + 1);
        }
      }
    } catch (error) {
      console.error('Error updating invoice from form:', error);
      message.error('Lỗi khi lưu thay đổi');
    }
  };

  const viewTeacherSalary = (salary: TeacherSalary) => {
    const modal = Modal.info({
      title: `Phiếu lương giáo viên - ${salary.teacherName}`,
      width: 800,
      maskClosable: true,
      closable: true,
      content: (
        <div
          id={`teacher-salary-${salary.id}`}
          dangerouslySetInnerHTML={{ __html: generateTeacherSalaryHTML(salary) }}
        />
      ),
      footer: (
        <Space>
          <Button onClick={() => modal.destroy()}>Đóng</Button>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => {
              // Generate fresh content for printing
              const freshContent = generateTeacherSalaryHTML(salary);
              const printWindow = window.open("", "_blank");
              if (!printWindow) return;
              printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8">
                  <title>In phiếu lương</title>
                  <style>
                    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
                    @media print { body { margin: 0; } }
                  </style>
                </head>
                <body>${freshContent}</body>
                </html>
              `);
              printWindow.document.close();
              setTimeout(() => printWindow.print(), 500);
            }}
          >
            In phiếu
          </Button>
        </Space>
      ),
    });
  };

  // Calculate total accumulated debt for a student across all previous months
  const calculateStudentTotalDebt = (studentId: string, currentMonth: number, currentYear: number): number => {
    let totalDebt = 0;

    // Check persisted invoices from Firebase
    Object.entries(studentInvoiceStatus).forEach(([key, data]) => {
      if (!data || typeof data === "string") return;
      const sid = data.studentId;
      const m = data.month ?? null;
      const y = data.year ?? null;
      if (!sid || m === null || y === null) return;

      // Only consider invoices for the current student
      if (sid !== studentId) return;

      // Only consider months strictly before the current month/year
      if (y < currentYear || (y === currentYear && m < currentMonth)) {
        const status = data.status || "unpaid";
        if (status !== "paid") {
          const amt = data.finalAmount ?? data.totalAmount ?? 0;
          totalDebt += amt;
        }
      }
    });

    // Also check sessions that may not have persisted invoices
    sessions.forEach((session) => {
      if (!session["Ngày"] || !session["Điểm danh"]) return;
      const sessionDate = new Date(session["Ngày"]);
      const sMonth = sessionDate.getMonth();
      const sYear = sessionDate.getFullYear();

      // Only consider months strictly before current month/year
      if (!(sYear < currentYear || (sYear === currentYear && sMonth < currentMonth))) return;

      // Check if student was present in this session
      const present = Array.isArray(session["Điểm danh"]) &&
        session["Điểm danh"].some(
          (r: any) => r["Student ID"] === studentId && r["Có mặt"]
        );
      if (!present) return;

      // Find class/course price
      const classId = session["Class ID"];
      const classInfo = classes.find((c) => c.id === classId);
      let pricePerSession = 0;
      if (classInfo) {
        const course = courses.find((c) => {
          if (c.Khối !== classInfo.Khối) return false;
          const classSubject = classInfo["Môn học"];
          const courseSubject = c["Môn học"];
          if (classSubject === courseSubject) return true;
          const subjectOption = subjectOptions.find(
            (opt) => opt.label === classSubject || opt.value === classSubject
          );
          if (subjectOption) {
            return (
              courseSubject === subjectOption.label ||
              courseSubject === subjectOption.value
            );
          }
          return false;
        });
        pricePerSession = course?.Giá || 0;
      }

      // Check if there's a persisted invoice for this month and it's paid
      const persistedKey = `${studentId}-${sMonth}-${sYear}`;
      const persisted = studentInvoiceStatus[persistedKey];
      const persistedStatus = typeof persisted === "object" ? persisted.status : persisted;
      if (persistedStatus === "paid") return;

      totalDebt += pricePerSession;
    });

    return totalDebt;
  };

  // Generate VietQR URL with hardcoded bank info for students
  const generateVietQR = (
    amount: string,
    studentName: string,
    month: string
  ): string => {
    const bankId = "VPB"; // VPBank
    const accountNo = "4319888";
    const accountName = "NGUYEN THI HOA";
    const numericAmount = amount.replace(/[^0-9]/g, "");
    const description = `HP T${month} ${studentName}`;
    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${numericAmount}&addInfo=${encodeURIComponent(
      description
    )}&accountName=${encodeURIComponent(accountName)}`;
  };

  // Generate VietQR URL for teacher salary payment
  const generateTeacherVietQR = (
    amount: number,
    teacherName: string,
    month: number,
    bankName: string,
    accountNo: string,
    accountName: string
  ): string => {
    // Extract bank code from bank name (simple mapping)
    const bankCodeMap: Record<string, string> = {
      VPBank: "VPB",
      Vietcombank: "VCB",
      Techcombank: "TCB",
      BIDV: "BIDV",
      Agribank: "ABB",
      VietinBank: "CTG",
      MBBank: "MB",
      ACB: "ACB",
      Sacombank: "STB",
      VIB: "VIB",
    };

    const bankId = bankCodeMap[bankName] || "VCB"; // Default to VCB if not found
    const numericAmount = amount.toString().replace(/[^0-9]/g, "");
    const description = `Luong T${month + 1} ${teacherName}`;

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${numericAmount}&addInfo=${encodeURIComponent(
      description
    )}&accountName=${encodeURIComponent(accountName)}`;
  };

  const generateStudentInvoiceHTML = (invoice: StudentInvoice, includeQR: boolean = true) => {
    // Helper to generate decor border HTML
    const generateDecorIcons = () => {
      let html = "";
      const schoolIcons = [
        "fa-book",
        "fa-book-open",
        "fa-ruler-horizontal",
        "fa-pencil-alt",
        "fa-drafting-compass",
        "fa-briefcase",
        "fa-chalkboard",
        "fa-calculator",
        "fa-eraser",
        "fa-pen-nib",
        "fa-graduation-cap",
      ];
      const grayColors = ["c-gray-1", "c-gray-2", "c-gray-3", "c-gray-4"];
      const countH = 9;
      const countV = 12;

      const createIcon = (style: string) => {
        const iconClass =
          schoolIcons[Math.floor(Math.random() * schoolIcons.length)];
        const colorClass =
          grayColors[Math.floor(Math.random() * grayColors.length)];
        const rot = Math.random() * 60 - 30;
        return `<i class="fas ${iconClass} decor-icon ${colorClass}" style="${style}; transform: rotate(${rot}deg);"></i>`;
      };

      for (let i = 0; i < countH; i++)
        html += createIcon(`top: 5px; left: ${(i / countH) * 100 + 4}%`);
      for (let i = 0; i < countH; i++)
        html += createIcon(`bottom: 5px; left: ${(i / countH) * 100 + 4}%`);
      for (let i = 0; i < countV; i++)
        html += createIcon(`left: 5px; top: ${(i / countV) * 100 + 4}%`);
      for (let i = 0; i < countV; i++)
        html += createIcon(`right: 5px; top: ${(i / countV) * 100 + 4}%`);

      return html;
    };

    // Group sessions by class and calculate totals
    const classSummary: Record<
      string,
      {
        className: string;
        classCode: string;
        subject: string;
        sessionCount: number;
        pricePerSession: number;
        totalPrice: number;
      }
    > = {};

    // Process each session and group by subject, preserving actual price per subject
    invoice.sessions.forEach((session) => {
      const className = session["Tên lớp"] || "";
      const classCode = session["Mã lớp"] || "";
      const classId = session["Class ID"];
      const classInfo = classes.find((c) => c.id === classId);
      const subject = classInfo?.["Môn học"] || "N/A";

      // Get the actual price for this session.
      // Preference order: stored invoice session price (may be sanitized key) -> session/course/class default -> invoice average
      let pricePerSession =
        Number(getSafeField(session, "Giá/buổi")) ||
        getSessionPrice(session) ||
        invoice.pricePerSession ||
        (invoice.totalSessions > 0 ? invoice.totalAmount / invoice.totalSessions : 0);

      const key = `${classCode}-${className}-${subject}`;

      if (!classSummary[key]) {
        classSummary[key] = {
          className,
          classCode,
          subject,
          sessionCount: 0,
          pricePerSession: pricePerSession,
          totalPrice: 0,
        };
      } else if (!classSummary[key].pricePerSession && pricePerSession) {
        classSummary[key].pricePerSession = pricePerSession;
      }

      classSummary[key].sessionCount++;
      classSummary[key].totalPrice =
        classSummary[key].pricePerSession * classSummary[key].sessionCount;
    });

    const classRows = Object.values(classSummary);

    // Compute a compact subjects list and attempt to determine the student's grade (Khối)
    const subjects = Array.from(new Set(classRows.map((r) => r.subject))).join(
      ", "
    );
    const subjectDisplay =
      subjectMap[subjects] ||
      subjects
        .split(",")
        .map((item) => subjectMap[item.trim()] || item.trim())
        .join(", ");
    const firstSession =
      invoice.sessions && invoice.sessions.length > 0
        ? invoice.sessions[0]
        : null;
    const firstClassId = firstSession ? firstSession["Class ID"] : null;
    const firstClassInfo = classes.find((c) => c.id === firstClassId);
    const grade = firstClassInfo?.["Khối"] || "";

    // Calculate previous unpaid months (debt) for this student across ALL months
    const debtMap: Record<
      string,
      { month: number; year: number; amount: number }
    > = {};

    // 1) Include persisted invoices from Firebase (studentInvoiceStatus)
    Object.entries(studentInvoiceStatus).forEach(([key, data]) => {
      if (!data || typeof data === "string") return;
      const sid = data.studentId;
      const m = data.month ?? null;
      const y = data.year ?? null;
      if (!sid || m === null || y === null) return;
      // Only consider invoices for the current student
      if (sid !== invoice.studentId) return;
      // Only consider months strictly before the invoice month/year
      if (y < invoice.year || (y === invoice.year && m < invoice.month)) {
        const status = data.status || "unpaid";
        if (status !== "paid") {
          const amt = data.finalAmount ?? data.totalAmount ?? 0;
          const mapKey = `${y}-${m}`;
          debtMap[mapKey] = {
            month: m,
            year: y,
            amount: (debtMap[mapKey]?.amount || 0) + amt,
          };
        }
      }
    });

    // 2) Derive unpaid amounts from sessions for months that may not have persisted invoice entries
    sessions.forEach((session) => {
      if (!session["Ngày"] || !session["Điểm danh"]) return;
      const sessionDate = new Date(session["Ngày"]);
      const sMonth = sessionDate.getMonth();
      const sYear = sessionDate.getFullYear();
      // only consider months strictly before current invoice month/year
      if (
        !(
          sYear < invoice.year ||
          (sYear === invoice.year && sMonth < invoice.month)
        )
      )
        return;

      // check if student was present in this session
      const present =
        Array.isArray(session["Điểm danh"]) &&
        session["Điểm danh"].some(
          (r: any) => r["Student ID"] === invoice.studentId && r["Có mặt"]
        );
      if (!present) return;

      // find class/course price
      const classId = session["Class ID"];
      const classInfo = classes.find((c) => c.id === classId);
      let pricePerSession = 0;
      if (classInfo) {
        const course = courses.find((c) => {
          if (c.Khối !== classInfo.Khối) return false;
          const classSubject = classInfo["Môn học"];
          const courseSubject = c["Môn học"];
          if (classSubject === courseSubject) return true;
          const subjectOption = subjectOptions.find(
            (opt) => opt.label === classSubject || opt.value === classSubject
          );
          if (subjectOption) {
            return (
              courseSubject === subjectOption.label ||
              courseSubject === subjectOption.value
            );
          }
          return false;
        });
        pricePerSession = course?.Giá || 0;
      }

      const mapKey = `${sYear}-${sMonth}`;
      // If there's a persisted invoice for this month and it's marked paid, skip adding
      const persistedKey = `${invoice.studentId}-${sMonth}-${sYear}`;
      const persisted = studentInvoiceStatus[persistedKey];
      const persistedStatus =
        typeof persisted === "object" ? persisted.status : persisted;
      if (persistedStatus === "paid") return;

      debtMap[mapKey] = debtMap[mapKey] || {
        month: sMonth,
        year: sYear,
        amount: 0,
      };
      debtMap[mapKey].amount += pricePerSession;
    });

    // Convert debtMap to sorted array, filter out months with amount = 0
    const debtDetails = Object.values(debtMap)
      .filter((d) => d.amount > 0)
      .sort((a, b) => a.year - b.year || a.month - b.month);
    const totalDebt = debtDetails.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Build debt summary for display in receipt (simplified version)
    const debtSummary = debtDetails.length > 0
      ? `Nợ lũy kế ${debtDetails.length} tháng: ${totalDebt.toLocaleString("vi-VN")} đ`
      : "Không có nợ cũ";

    const debtDetail1 = debtDetails.length > 0
      ? `Nợ các tháng: ${debtDetails.map(d => `T${d.month + 1}/${d.year}`).join(", ")}`
      : "";

    const debtDetail2 = debtDetails.length > 0
      ? `Tổng nợ lũy kế: ${totalDebt.toLocaleString("vi-VN")} đ`
      : "";

    // Build debt details table (per unpaid month) with totals
    const debtDetailsHtml =
      debtDetails.length > 0
        ? `
      <div style="margin:14px 0;">
        <strong style="color:#1a3353; font-size:15px;">Chi tiết nợ:</strong>
        <table style="width:100%; border-collapse: collapse; margin-top:8px; font-size:14px; border:1px solid #d9d9d9;">
          <thead>
            <tr style="background:#1a3353; color:#ffffff;">
              <th style="text-align:left; padding:10px 12px; border:1px solid #d9d9d9; font-weight:600;">Tháng</th>
              <th style="text-align:right; padding:10px 12px; border:1px solid #d9d9d9; font-weight:600;">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            ${debtDetails
          .map(
            (d, idx) => `
              <tr style="background:${idx % 2 === 0 ? '#f0f5ff' : '#ffffff'};">
                <td style="padding:10px 12px; border:1px solid #e8e8e8;">Tháng ${d.month + 1}/${d.year}</td>
                <td style="padding:10px 12px; text-align:right; border:1px solid #e8e8e8; color:#c40000; font-weight:600;">${d.amount.toLocaleString("vi-VN")} đ</td>
              </tr>`
          )
          .join("")}
            <tr style="font-weight:700; background:#fff1f0; border-top:2px solid #c40000;">
              <td style="padding:12px; border:1px solid #e8e8e8; color:#c40000;">Tổng nợ lũy kế</td>
              <td style="padding:12px; text-align:right; border:1px solid #e8e8e8; color:#c40000; font-size:16px;">${totalDebt.toLocaleString("vi-VN")} đ</td>
            </tr>
          </tbody>
        </table>
      </div>`
        : `<p style="margin:14px 0;"><strong style="color:#1a3353; font-size:15px;">Chi tiết nợ:</strong> <span style="color:#666;">Không có nợ cũ</span></p>`;
    // Build current month breakdown HTML (classes and totals)
    const currentMonthRows = classRows.map((r) => ({
      subject: r.subject,
      className: r.className,
      sessions: r.sessionCount,
      pricePerSession: r.pricePerSession,
      totalPrice: r.totalPrice,
    }));

    const currentMonthTotal =
      currentMonthRows.reduce((s, r) => s + (r.totalPrice || 0), 0) ||
      invoice.totalAmount ||
      0;

    const discountAmount = invoice.discount || 0;
    const discountPercent = currentMonthTotal > 0 ? (discountAmount / currentMonthTotal) * 100 : 0;
    const discountLabel = discountAmount > 0
      ? `- ${discountAmount.toLocaleString("vi-VN")} đ${discountPercent > 0 ? ` (${discountPercent.toFixed(1)}%)` : ""}`
      : "";
    const netCurrentMonth = Math.max(0, currentMonthTotal - discountAmount);

    const currentMonthHtml =
      currentMonthRows.length > 0
        ? `
      <div style="margin:14px 0;">
        <strong style="color:#1a3353; font-size:15px;">Chi tiết tháng ${invoice.month + 1}:</strong>
        <table style="width:100%; border-collapse: collapse; margin-top:8px; font-size:14px; border:1px solid #d9d9d9;">
          <thead>
            <tr style="background:#1a3353; color:#ffffff;">
              <th style="text-align:left; padding:10px 12px; border:1px solid #d9d9d9; font-weight:600;">Môn học</th>
              <th style="text-align:left; padding:10px 12px; border:1px solid #d9d9d9; font-weight:600;">Lớp</th>
              <th style="text-align:center; padding:10px 12px; border:1px solid #d9d9d9; font-weight:600;">Số buổi</th>
              <th style="text-align:right; padding:10px 12px; border:1px solid #d9d9d9; font-weight:600;">Giá/buổi</th>
              <th style="text-align:right; padding:10px 12px; border:1px solid #d9d9d9; font-weight:600;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${currentMonthRows
          .map(
            (r, idx) => `
              <tr style="background:${idx % 2 === 0 ? '#f0f5ff' : '#ffffff'};">
                <td style="padding:10px 12px; border:1px solid #e8e8e8;">${subjectMap[r.subject] || r.subject}</td>
                <td style="padding:10px 12px; border:1px solid #e8e8e8;">${r.className}</td>
                <td style="padding:10px 12px; text-align:center; border:1px solid #e8e8e8; font-weight:600;">${r.sessions}</td>
                <td style="padding:10px 12px; text-align:right; border:1px solid #e8e8e8;">${r.pricePerSession.toLocaleString("vi-VN")} đ</td>
                <td style="padding:10px 12px; text-align:right; border:1px solid #e8e8e8; font-weight:600; color:#1890ff;">${r.totalPrice.toLocaleString("vi-VN")} đ</td>
              </tr>`
          )
          .join("")}
          </tbody>
        </table>
        ${discountAmount > 0
          ? `
        <div style="margin-top:8px; padding:10px 12px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#003a8c; font-size:14px; font-weight:600;">Miễn giảm học phí</span>
            <span style="color:#003a8c; font-size:15px; font-weight:700;">${discountLabel}</span>
          </div>
        </div>`
          : ""
        }
      </div>`
        : `<p style="margin:14px 0;"><strong style="color:#1a3353; font-size:15px;">Chi tiết tháng ${invoice.month + 1}:</strong> <span style="color:#666;">Không có buổi học</span></p>`;

    const combinedTotalDue = totalDebt + netCurrentMonth;

    // Get subject icons mapping
    const getSubjectIcon = (subject: string) => {
      const lowerSubject = subject.toLowerCase();
      if (lowerSubject.includes("toán") || lowerSubject.includes("math")) return "fa-calculator";
      if (lowerSubject.includes("văn") || lowerSubject.includes("literature")) return "fa-pen-nib";
      if (lowerSubject.includes("anh") || lowerSubject.includes("english")) return "fa-language";
      if (lowerSubject.includes("khoa") || lowerSubject.includes("science")) return "fa-flask";
      if (lowerSubject.includes("thuyết trình") || lowerSubject.includes("presentation")) return "fa-user-tie";
      if (lowerSubject.includes("kỹ năng") || lowerSubject.includes("skill")) return "fa-gear";
      return "fa-book";
    };

    // Prepare subjects array for table
    const subjectsForTable = currentMonthRows.map((r) => ({
      subject: r.subject,
      className: r.className || "Lớp",
      sessions: r.sessions,
      pricePerSession: r.pricePerSession,
      total: r.totalPrice,
    }));

    // Get bank info
    const bankId = "VPB";
    const accountNo = "4319888";
    const accountName = "NGUYEN THI HOA";

    const qrUrl = generateVietQR(
      combinedTotalDue.toString(),
      invoice.studentName,
      (invoice.month + 1).toString()
    );

    const decorIconsHtml = generateDecorIcons();
    const logoUrl =
      "https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png";
    const watermarkUrl =
      "https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F5efd9944.%E1%BA%A2nh.120320.png";

    return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Phiếu Thu A5</title>
          <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
          <style>
              /* --- CẤU HÌNH MÀU SẮC --- */
              :root {
                  --primary-navy: #003366;
                  --accent-yellow: #FFD700;
                  --accent-red: #D32F2F;
                  --accent-orange: #d35400;
                  --border-color: #ced6e0;
                  --page-width: 148mm;
                  --page-height: 210mm;
                  
                  /* Palette Xám Nhạt cho Viền */
                  --gray-1: #bdc3c7; --gray-2: #cfd8dc; --gray-3: #b0bec5; --gray-4: #90a4ae;
              }
      
              .invoice-body {
                  background-color: #333; font-family: 'Montserrat', sans-serif;
                  margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 30px;
                  -webkit-print-color-adjust: exact;
              }
      
              /* --- TRANG GIẤY A5 --- */
              .page {
                  width: var(--page-width); min-height: var(--page-height);
                  background: white; position: relative; overflow: hidden; box-sizing: border-box;
                  display: flex; flex-direction: column; 
                  padding: 12px; /* Giảm lề để vừa khít A5 */
                  box-shadow: none;
                  margin: 0;
              }
      
              /* --- VIỀN DECOR --- */
              .school-border-layer {
                  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                  pointer-events: none; z-index: 1; overflow: hidden;
              }
              .decor-icon {
                  position: absolute; display: flex; align-items: center; justify-content: center;
                  font-size: 22px; opacity: 0.4; filter: drop-shadow(1px 1px 0px white);
              }
              .c-gray-1 { color: var(--gray-1); } .c-gray-2 { color: var(--gray-2); }
              .c-gray-3 { color: var(--gray-3); } .c-gray-4 { color: var(--gray-4); }
              /* --- WATERMARK --- */
              .watermark-layer {
                  position: absolute; top: 55%; left: 50%; transform: translate(-50%, -50%);
                  width: 80%; opacity: 0.12; z-index: 0; pointer-events: none;
                  display: flex; justify-content: center; align-items: center;
              }
              .watermark-img { width: 100%; height: auto; object-fit: contain; }
      
              /* --- HEADER --- */
              .header {
                  background-color: var(--primary-navy); color: white; padding: 12px 15px;
                  position: relative; z-index: 2; border-bottom: 4px solid var(--accent-yellow);
                  display: flex; align-items: center; justify-content: space-between;
                  border-radius: 8px 8px 0 0; margin-bottom: 10px;
                  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
              }
              .header-left { display: flex; flex-direction: column; gap: 2px; }
              .brand-name { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
              .doc-title { font-size: 18px; font-weight: 700; margin-top: 4px; color: var(--accent-yellow); }
              .sub-title { font-size: 10px; opacity: 0.9; font-style: italic; }
      
              .logo-container {
                  width: 65px; height: 65px; background: white; border-radius: 50%;
                  border: 3px solid var(--accent-yellow);
                  display: flex; align-items: center; justify-content: center;
                  overflow: hidden; cursor: pointer; position: relative; z-index: 10;
                  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
              }
              .logo-img { width: 100%; height: 100%; object-fit: contain; }
      
              /* --- CONTENT --- */
              .content { padding: 0; position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column;}
      
              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
              .info-box {
                  background: #fff; border: 1px solid #ced6e0; border-radius: 8px;
                  padding: 8px 12px; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.03);
              }
              .info-box::before {
                  content: ''; position: absolute; top: 10px; bottom: 10px; left: 0;
                  width: 3px; background: var(--primary-navy); border-radius: 0 4px 4px 0;
              }
              .box-title {
                  font-size: 11px; font-weight: 700; color: var(--primary-navy);
                  text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 5px;
              }
              .info-row {
                  display: flex; justify-content: space-between; margin-bottom: 4px;
                  font-size: 10px; border-bottom: 1px dashed #eee; padding-bottom: 2px;
              }
              .info-label { color: #666; font-weight: 500; }
              .info-val { font-weight: 600; color: #333; text-align: right; }
      
              /* --- BẢNG --- */
              .table-container { margin-bottom: ${includeQR ? '10px' : '5px'}; border-radius: 8px; overflow: hidden; border: 1px solid var(--primary-navy); }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              thead { background-color: var(--primary-navy); color: white; }
              th { padding: 8px 5px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 9px; border-right: 1px solid rgba(255,255,255,0.2); }
              th:last-child { border-right: none; }
              td { padding: 6px 5px; border-bottom: 1px solid var(--border-color); border-right: 1px solid var(--border-color); color: #444; vertical-align: middle; }
              td:last-child { border-right: none; }
              tr:last-child td { border-bottom: none; }
              tr:nth-child(even) { background-color: #f9f9f9; }
              .row-icon { color: var(--primary-navy); margin-right: 3px; opacity: 0.7; font-size: 10px; }
              .text-right { text-align: right; } .text-center { text-align: center; }
              .text-red { color: var(--accent-red); font-weight: 700; }
              .text-orange { color: #d35400; font-weight: 700; }
              .total-row-highlight { font-size: 12px; font-weight: 800; color: var(--accent-red); text-transform: uppercase; }
      
              /* --- FOOTER --- */
              .bottom-layout { display: flex; gap: 15px; margin-top: auto; padding-bottom: 0px; align-items: flex-start; }
              
              .debt-container { flex: 1; background: white; border: 1px solid var(--primary-navy); border-radius: 8px; overflow: hidden; }
              .debt-header { background: var(--primary-navy); color: white; padding: 5px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; display: flex; align-items: center; gap: 5px; }
              .debt-table { width: 100%; font-size: 9px; border-collapse: collapse; }
              .debt-table th { background: #f0f4f8; color: var(--primary-navy); padding: 5px; border-bottom: 1px solid #ddd; border-right: 1px solid #eee; text-align: center; }
              .debt-table td { padding: 5px; border-bottom: 1px solid #eee; border-right: 1px solid #eee; text-align: center; color: #333; }
              
              .payment-column { width: 150px; display: flex; flex-direction: column; gap: 10px; }
              .grand-total-box { background: var(--primary-navy); color: white; padding: 10px; border-radius: 8px; text-align: center; box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
              .grand-total-label { font-size: 9px; text-transform: uppercase; opacity: 0.9; margin-bottom: 2px; line-height: 1.2; }
              .grand-total-val { font-size: 18px; font-weight: 800; color: var(--accent-yellow); line-height: 1.1; }
      
              .qr-block-stack { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 5px; text-align: center; }
              .qr-placeholder-stack { width: 100%; aspect-ratio: 1/1; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 4px; overflow: hidden; margin-bottom: 5px; }
              .qr-img { width: 100%; height: 100%; object-fit: cover; }
              .qr-note { font-size: 9px; color: #555; line-height: 1.3; font-weight: 600; word-break: break-word; }
              [contenteditable]:hover { background: rgba(255, 215, 0, 0.1); outline: none; border-radius: 2px;}
              [contenteditable]:focus { background: #fff; outline: 1px solid var(--primary-navy); }
      
              @media print {
                  .invoice-body { background: white; padding: 0; gap: 0; display: block; }
                  .toolbar { display: none !important; }
                  .page { box-shadow: none; width: 100%; height: 100%; margin: 0; border: none; page-break-after: always; }
                  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              }
          </style>
          <script>
              // Auto-save functionality for contenteditable fields
              let saveTimeout;
              let invoiceData = ${JSON.stringify({
      id: invoice.id,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      studentCode: invoice.studentCode,
      month: invoice.month,
      year: invoice.year,
      totalSessions: invoice.totalSessions,
      totalAmount: invoice.totalAmount,
      discount: invoice.discount,
      finalAmount: invoice.finalAmount
    })};

              function saveInvoiceData() {
                console.log('Saving invoice data...', invoiceData);
                // Show saving indicator
                showSaveIndicator('Đang lưu...');
                
                // Trigger parent window to save data
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({
                    type: 'SAVE_INVOICE_DATA',
                    data: invoiceData
                  }, '*');
                }
              }

              function showSaveIndicator(text) {
                let indicator = document.getElementById('save-indicator');
                if (!indicator) {
                  indicator = document.createElement('div');
                  indicator.id = 'save-indicator';
                  indicator.style.cssText = \`
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: #52c41a;
                    color: white;
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 9999;
                    transition: all 0.3s;
                  \`;
                  document.body.appendChild(indicator);
                }
                indicator.textContent = text;
                indicator.style.display = 'block';
                
                setTimeout(() => {
                  if (text === 'Đang lưu...') {
                    indicator.textContent = '✓ Đã lưu';
                    indicator.style.background = '#52c41a';
                  }
                  setTimeout(() => {
                    indicator.style.opacity = '0';
                    setTimeout(() => {
                      indicator.style.display = 'none';
                      indicator.style.opacity = '1';
                    }, 300);
                  }, 1000);
                }, 500);
              }

              function debounceSubmit() {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                  saveInvoiceData();
                }, 1000); // Save after 1 second of no changes
              }

              document.addEventListener('DOMContentLoaded', function() {
                // Add event listeners to all contenteditable fields
                const editableFields = document.querySelectorAll('[contenteditable="true"]');
                
                editableFields.forEach(field => {
                  field.addEventListener('input', function(e) {
                    const target = e.target;
                    const text = target.textContent.trim();
                    
                    // Visual feedback for editing
                    target.style.background = 'rgba(255, 215, 0, 0.2)';
                    target.style.transition = 'background 0.3s';
                    
                    // Update invoice data based on field type
                    if (target.closest('.info-val') && target.closest('.info-row')) {
                      const label = target.closest('.info-row').querySelector('.info-label').textContent;
                      if (label.includes('Họ tên')) {
                        invoiceData.studentName = text;
                      } else if (label.includes('Mã HS')) {
                        invoiceData.studentCode = text;
                      }
                    }
                    
                    debounceSubmit();
                  });

                  // Show save indicator and tooltip
                  field.addEventListener('focus', function(e) {
                    e.target.title = 'Chỉnh sửa trực tiếp - tự động lưu sau 1 giây';
                    e.target.style.background = 'rgba(24, 144, 255, 0.1)';
                  });

                  field.addEventListener('blur', function(e) {
                    e.target.style.background = '';
                  });
                });

                // Add edit hint
                const hint = document.createElement('div');
                hint.innerHTML = '<i class="fas fa-edit"></i> Có thể chỉnh sửa trực tiếp - tự động lưu';
                hint.style.cssText = \`
                  position: fixed;
                  bottom: 10px;
                  left: 10px;
                  background: rgba(0,0,0,0.7);
                  color: white;
                  padding: 6px 12px;
                  border-radius: 20px;
                  font-size: 11px;
                  z-index: 9999;
                  opacity: 0.8;
                \`;
                document.body.appendChild(hint);
              });
          </script>
          </style>
      </head>
      <body>
          <!-- TRANG A5 -->
          <div class="invoice-body">
              <div class="page" id="page-final">
                  <!-- Viền Decor (Gray) -->
                  <div class="school-border-layer" id="border-layer">
                      ${decorIconsHtml}
                  </div>
      
                  <!-- Watermark (Có Sẵn Logo) -->
                  <div class="watermark-layer">
                      <img class="watermark-img" src="${watermarkUrl}">
                  </div>
      
                  <!-- Header -->
                  <div class="header">
                      <!-- Logo Container (Có Sẵn Logo) - Moved to Left -->
                      <div class="logo-container">
                          <img class="logo-img" src="${logoUrl}">
                      </div>
                      <div class="header-left">
                          <div class="brand-name">TRUNG TÂM PHÁT TRIỂN TƯ DUY - TRÍ TUỆ 8+</div>
                          <div class="doc-title">PHIẾU THU HỌC PHÍ</div>
                          <div class="sub-title" contenteditable="true">Tháng ${invoice.month + 1
      } / ${invoice.year}</div>
                      </div>
                  </div>
      
                  <div class="content">
                      <div class="info-grid">
                          <div class="info-box">
                              <div class="box-title"><i class="fas fa-user-graduate"></i> Học sinh</div>
                              <div class="info-row"><span class="info-label">Họ tên:</span><span class="info-val" contenteditable="true">${invoice.studentName
      }</span></div>
                              <div class="info-row"><span class="info-label">Lớp:</span><span class="info-val" contenteditable="true">${grade}</span></div>
                              <div class="info-row"><span class="info-label">Mã HS:</span><span class="info-val" contenteditable="true">${invoice.studentCode || "..."
      }</span></div>
                          </div>
                          ${includeQR ? `<div class="info-box">
                              <div class="box-title"><i class="fas fa-credit-card"></i> Thanh toán</div>
                              <div class="info-row"><span class="info-label">Người nhận:</span><span class="info-val">${accountName}</span></div>
                              <div class="info-row"><span class="info-label">NH:</span><span class="info-val" contenteditable="true">${bankId}</span></div>
                              <div class="info-row"><span class="info-label">STK:</span><span class="info-val" contenteditable="true">${accountNo}</span></div>
                          </div>` : `<div class="info-box">
                              <div class="box-title"><i class="fas fa-bell"></i> Ghi chú</div>
                              <div style="padding: 10px; color: #000; font-size: 13px; line-height: 1.6;">
                                  Phụ huynh vui lòng để học phí trong phong bì dán kín. Học sinh nộp tận tay cho bộ phận trực hoặc Thầy/Cô giáo tại lớp.
                              </div>
                          </div>`}
                      </div>
      
                      <div class="table-container">
                          <table>
                              <thead>
                                  <tr>
                                      <th style="width: 35%;">Môn học</th>
                                      <th class="text-center" style="width: 15%;">Lớp</th>
                                      <th class="text-center" style="width: 12%;">Buổi</th>
                                      <th class="text-right" style="width: 18%;">Đơn giá</th>
                                      <th class="text-right" style="width: 20%;">Thành tiền</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  ${subjectsForTable
        .map(
          (item) => `
                                  <tr>
                                      <td><i class="fas ${getSubjectIcon(
            item.subject
          )} row-icon"></i> <span contenteditable="true">${subjectMap[item.subject] || item.subject
            }</span></td>
                                      <td class="text-center" contenteditable="true">${item.className
            }</td>
                                      <td class="text-center" contenteditable="true">${item.sessions
            }</td>
                                      <td class="text-right" contenteditable="true">${item.pricePerSession.toLocaleString(
              "vi-VN"
            )}</td>
                                      <td class="text-right" contenteditable="true">${item.total.toLocaleString(
              "vi-VN"
            )}</td>
                                  </tr>
                                  `
        )
        .join("")}
                                  
                                  ${discountAmount > 0
        ? `
                                  <tr style="background-color: #fff0f0;">
                                      <td colspan="4" class="text-right text-red"><i>Miễn giảm:</i></td>
                                      <td class="text-right text-red" contenteditable="true">${discountLabel}</td>
                                  </tr>
                                  `
        : ""
      }
                                  <tr style="background-color: #e8f0fe;">
                                      <td colspan="4" class="text-right total-row-highlight">TỔNG THÁNG NÀY:</td>
                                      <td class="text-right total-row-highlight" contenteditable="true">${currentMonthTotal.toLocaleString(
        "vi-VN"
      )} đ</td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
      
                      <div class="bottom-layout">
                          <div class="debt-container">
                              <div class="debt-header"><i class="fas fa-clipboard-list"></i> NỢ LŨY KẾ CÁC THÁNG TRƯỚC</div>
                              <table class="debt-table">
                                  <thead><tr><th style="width:40%">Tháng</th><th>Số tiền</th></tr></thead>
                                  <tbody>
                                      ${debtDetails.length > 0
        ? debtDetails
          .map(
            (d) => `
                                          <tr>
                                              <td contenteditable="true">T${d.month + 1
              }/${d.year}</td>
                                              <td contenteditable="true">${d.amount.toLocaleString(
                "vi-VN"
              )} đ</td>
                                          </tr>
                                      `
          )
          .join("")
        : `<tr><td colspan="2" class="text-center" style="color: #999;">Không có nợ</td></tr>`
      }
                                      ${debtDetails.length > 0
        ? `
                                      <tr style="font-weight: bold; background: #fff8e1;">
                                          <td class="text-center">TỔNG NỢ LŨY KẾ</td>
                                          <td>${totalDebt.toLocaleString(
          "vi-VN"
        )} đ</td>
                                      </tr>
                                      `
        : ""
      }
                                  </tbody>
                              </table>
                          </div>
                              <div class="payment-column">
                              <div class="grand-total-box">
                                  <div class="grand-total-label">TỔNG PHẢI THU (NỢ CŨ + THÁNG NÀY)</div>
                                  <div class="grand-total-val" contenteditable="true">${combinedTotalDue.toLocaleString(
        "vi-VN"
      )} đ</div>
                              </div>
                              ${includeQR ? `
                              <div class="qr-block-stack">
                                  <div class="qr-placeholder-stack">
                                      <img class="qr-img" src="${qrUrl}" style="display:block;">
                                  </div>
                                  <div class="qr-note" contenteditable="true">${invoice.studentName
        } - ${grade} - T${invoice.month + 1}${totalDebt > 0 ? ` (có nợ ${debtDetails.length} tháng)` : ""}</div>
                              </div>
                              ` : ''}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  };

  const generateTeacherSalaryHTML = (salary: TeacherSalary) => {
    const teacher = teachers.find((t) => t.id === salary.teacherId);

    const parseCurrency = (value: unknown) => {
      if (value === undefined || value === null) return 0;
      const num = Number(String(value).replace(/[^0-9.-]+/g, ""));
      return Number.isFinite(num) ? num : 0;
    };

    // Group sessions by class
    const classSummary: Record<
      string,
      {
        classId: string;
        className: string;
        classCode: string;
        subject: string;
        sessionCount: number;
        totalSalary: number;
        totalAllowance: number;
      }
    > = {};

    salary.sessions.forEach((session) => {
      const classId = session["Class ID"];
      const className = session["Tên lớp"] || "";
      const classCode = session["Mã lớp"] || "";

      // Find class info to get subject and salary per session
      const classInfo = classes.find((c) => c.id === classId);
      const subject = classInfo?.["Môn học"] || "";

      if (!classSummary[classId]) {
        classSummary[classId] = {
          classId,
          className,
          classCode,
          subject,
          sessionCount: 0,
          totalSalary: 0,
          totalAllowance: 0,
        };
      }

      // Lấy Lương GV - ưu tiên từ session, fallback về class, cuối cùng là teacher
      // Ưu tiên: Session > Class > Teacher
      const salaryPerSession =
        parseCurrency(session["Lương GV"]) ||          // 1. Từ Session (ưu tiên)
        parseCurrency(classInfo?.["Lương GV"]) ||     // 2. Từ Lớp học (fallback)
        parseCurrency(teacher?.["Lương theo buổi"]);  // 3. Từ Giáo viên (fallback cuối)

      const allowancePerSession = parseCurrency(session["Phụ cấp di chuyển"]);

      classSummary[classId].sessionCount++;
      classSummary[classId].totalSalary += salaryPerSession;
      classSummary[classId].totalAllowance += allowancePerSession;
    });

    const classData = Object.values(classSummary).sort((a, b) =>
      a.className.localeCompare(b.className)
    );

    const totalSessions = salary.totalSessions || salary.sessions?.length || 0;
    const totalAllowanceAll = classData.reduce((sum, item) => sum + item.totalAllowance, 0);

    // Build a compact table similar to the provided image
    const subjects = Array.from(
      new Set(
        salary.sessions
          .map((s) => classes.find((c) => c.id === s["Class ID"])?.["Môn học"])
          .filter(Boolean)
      )
    ).join(", ");

    // Layout: left details + right QR/bank block (if available)

    // totalSessions already calculated above

    const logoUrl = "https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png";
    const watermarkUrl = logoUrl;
    const bankName = teacher?.["Ngân hàng"] || "N/A";
    const bankAcc = teacher?.STK || "N/A";
    const note = teacher?.["Ghi chú"] || "Thầy/Cô vui lòng kiểm tra thông tin và liên hệ ngay nếu có sai sót.";
    const subjectDisplay =
      subjectMap[subjects] ||
      subjects
        ?.split(",")
        .map((s) => subjectMap[s.trim()] || s.trim())
        .join(", ") ||
      teacher?.["Môn phụ trách"] ||
      "N/A";

    const classRows = classData
      .map(
        (c, idx) => `
          <tr class="${idx % 2 === 1 ? "pl-tr-even" : ""}">
            <td class="pl-td">
              <div style="font-weight:700;">${c.className}${c.classCode ? ` (${c.classCode})` : ""}</div>
              ${c.subject ? `<div style="font-size:11px;color:#666;">${subjectMap[c.subject] || c.subject}</div>` : ""}
            </td>
            <td class="pl-td pl-text-center">${c.sessionCount}</td>
            <td class="pl-td pl-text-right">${(c.totalSalary + c.totalAllowance).toLocaleString("vi-VN")}</td>
          </tr>
        `
      )
      .join("");

    return `
      <div class="pl-wrapper">
        <style>
          .pl-wrapper { --primary-color: #003366; --secondary-color: #f8f9fa; --accent-color: #d32f2f; --success-color: #2e7d32; font-family: 'Montserrat', sans-serif; }
          .pl-page { width: 148mm; min-height: 210mm; background: white; box-shadow: none; position: relative; overflow: hidden; display: flex; flex-direction: column; box-sizing: border-box; margin: 0; }
          .pl-watermark-container { position: absolute; top: 55%; left: 50%; transform: translate(-50%, -50%); width: 70%; z-index: 0; pointer-events: none; opacity: 0.08; display: flex; justify-content: center; align-items: center; }
          .pl-watermark-img { width: 100%; height: auto; filter: grayscale(0%); }
          .pl-header { background-color: var(--primary-color); color: white; padding: 10px 16px; border-bottom: 4px solid rgba(0,0,0,0.2); position: relative; z-index: 1; }
          .pl-brand-section { margin-bottom: 6px; display: flex; align-items: center; gap: 12px; }
          .pl-logo-header { height: 55px; width: auto; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
          .pl-brand-info { display: flex; flex-direction: column; }
          .pl-brand-name { font-size: 10px; opacity: 0.9; letter-spacing: 0.4px; margin-bottom: 1px; text-transform: uppercase; font-family: 'Times New Roman', Times, serif; }
          .pl-brand-main { font-size: 16px; font-weight: 800; line-height: 1.2; font-family: 'Times New Roman', Times, serif; }
          .pl-title-section { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 6px; }
          .pl-main-title { font-size: 15px; font-weight: 700; text-transform: uppercase; }
          .pl-sub-title { font-size: 11px; opacity: 0.85; font-style: italic; }
          .pl-content { padding: 10px 16px; flex: 1; position: relative; z-index: 1; display: flex; flex-direction: column; gap: 10px; }
          .pl-info-grid { display: grid; grid-template-columns: 0.7fr 0.3fr; gap: 8px; }
          .pl-info-card { background: var(--secondary-color); padding: 10px 12px; border-radius: 8px; border-left: 4px solid var(--primary-color); }
          .pl-card-header { font-size: 11px; font-weight: 700; color: var(--primary-color); margin-bottom: 6px; text-transform: uppercase; font-family: 'Times New Roman', Times, serif; }
          .pl-info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; border-bottom: 1px dashed #d1d9e6; padding-bottom: 2px; }
          .pl-info-row:last-child { border-bottom: none; }
          .pl-label { color: #555; font-weight: 500; font-size: 10px; }
          .pl-value { font-weight: 700; color: #222; text-align: right; }
          .pl-table-container { border-radius: 6px; overflow: hidden; border: 1px solid #e0e0e0; }
          .pl-table { width: 100%; border-collapse: collapse; font-size: 10px; }
          .pl-thead { background-color: var(--primary-color); color: white; }
          .pl-th { padding: 8px 5px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 9px; }
          .pl-td { padding: 8px 5px; border-bottom: 1px solid #e0e0e0; color: #444; vertical-align: middle; }
          .pl-tr-even { background-color: #f8f9fa; }
          .pl-text-center { text-align: center; }
          .pl-text-right { text-align: right; }
          .pl-total-section { background-color: #fff7f7; border: 2px dashed var(--accent-color); border-radius: 8px; padding: 12px; text-align: center; }
          .pl-total-label { font-size: 11px; color: #555; text-transform: uppercase; }
          .pl-total-amount { font-size: 20px; font-weight: 800; color: var(--accent-color); }
          .pl-footer { display: flex; justify-content: space-between; padding-top: 10px; margin-top: auto; }
          .pl-sign-box { text-align: center; width: 45%; }
          .pl-sign-title { font-size: 9px; font-weight: 700; margin-bottom: 3px; color: var(--primary-color); text-transform: uppercase; }
          .pl-sign-date { font-size: 9px; font-style: italic; color: #666; margin-bottom: 40px; }
          .pl-sign-placeholder { font-size: 9px; color: #aaa; font-style: italic; border-top: 1px solid #ccc; padding-top: 5px; width: 80%; margin: 0 auto; }
          @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
        </style>

        <div class="pl-page" id="salarySlip">
          <div class="pl-watermark-container">
            <img src="${watermarkUrl}" alt="Watermark" class="pl-watermark-img" />
          </div>

          <div class="pl-header">
            <div class="pl-brand-section">
              <img src="${logoUrl}" alt="Logo" class="pl-logo-header" />
              <div class="pl-brand-info">
                <div class="pl-brand-name">TRUNG TÂM TRI TUỆ 8+</div>
                <div class="pl-brand-main">Phiếu Lương Giáo Viên</div>
              </div>
            </div>
            <div class="pl-title-section">
              <div class="pl-main-title">THÁNG ${salary.month + 1}/${salary.year}</div>
              <div class="pl-sub-title">Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}</div>
            </div>
          </div>

          <div class="pl-content">
            <div class="pl-info-grid">
              <div class="pl-info-card">
                <div class="pl-card-header">Thông tin giáo viên</div>
                <div class="pl-info-row"><span class="pl-label">Họ và tên</span><span class="pl-value">${salary.teacherName}</span></div>
                <div class="pl-info-row"><span class="pl-label">Môn phụ trách</span><span class="pl-value">${subjectDisplay}</span></div>
                <div class="pl-info-row"><span class="pl-label">Tổng số buổi</span><span class="pl-value">${totalSessions} buổi</span></div>
              </div>
              <div class="pl-info-card">
                <div class="pl-card-header">Ngân hàng</div>
                <div class="pl-info-row"><span class="pl-label">Ngân hàng</span><span class="pl-value">${bankName}</span></div>
                <div class="pl-info-row"><span class="pl-label">Số tài khoản</span><span class="pl-value">${bankAcc}</span></div>
                <div class="pl-info-row"><span class="pl-label">Tổng trợ cấp</span><span class="pl-value">${totalAllowanceAll.toLocaleString("vi-VN")} đ</span></div>
              </div>
            </div>

            <div class="pl-table-container">
              <table class="pl-table">
                <thead class="pl-thead">
                  <tr>
                    <th class="pl-th">Lớp học</th>
                    <th class="pl-th pl-text-center">Số buổi</th>
                    <th class="pl-th pl-text-right">Tổng lương</th>
                  </tr>
                </thead>
                <tbody>
                  ${classRows}
                </tbody>
              </table>
            </div>

            <div class="pl-info-row" style="margin-top:4px;">
              <span class="pl-label">Ghi chú</span>
              <span class="pl-value" style="text-align:left; flex:1; margin-left:8px;">${note}</span>
            </div>

            <div class="pl-footer">
              <div class="pl-sign-box">
                <div class="pl-sign-title">Trung tâm xác nhận</div>
                <div class="pl-sign-date">Ngày ....... / ....... / .......</div>
                <div class="pl-sign-placeholder">(Ký và ghi rõ họ tên)</div>
              </div>
              <div class="pl-sign-box">
                <div class="pl-sign-title">Giáo viên</div>
                <div class="pl-sign-date">Ngày ....... / ....... / .......</div>
                <div class="pl-sign-placeholder">(Ký và ghi rõ họ tên)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const exportToImage = async (elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${elementId}-${new Date().getTime()}.png`;
      link.click();
      message.success("Đã xuất ảnh thành công");
    } catch (error) {
      console.error("Error exporting image:", error);
      message.error("Lỗi khi xuất ảnh");
    }
  };

  const printInvoice = (invoice: StudentInvoice, includeQR: boolean = true) => {
    console.log('🖨️ Printing invoice with QR:', includeQR);
    // Get the latest data from state instead of using the passed invoice object
    const latestInvoiceData = studentInvoiceStatus[invoice.id];
    let updatedInvoice = { ...invoice };

    // Merge with latest data if available
    if (typeof latestInvoiceData === "object" && latestInvoiceData !== null) {
      updatedInvoice = {
        ...invoice,
        studentName: latestInvoiceData.studentName || invoice.studentName,
        studentCode: latestInvoiceData.studentCode || invoice.studentCode,
        totalSessions: latestInvoiceData.totalSessions || invoice.totalSessions,
        totalAmount: latestInvoiceData.totalAmount || invoice.totalAmount,
        discount: latestInvoiceData.discount || invoice.discount,
        finalAmount: latestInvoiceData.finalAmount || invoice.finalAmount,
        sessions: latestInvoiceData.sessions || invoice.sessions
      };
    }

    // Always regenerate HTML with latest data to include any edits
    const freshContent = generateStudentInvoiceHTML(updatedInvoice, includeQR);

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>In phiếu</title>
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        ${freshContent}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // Bulk print invoices
  const handleBulkPrintInvoices = () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một phiếu thu để in");
      return;
    }

    // Get all invoices for selected students
    const groupedByStudent = new Map(groupedStudentInvoices.map((g) => [g.studentId, g]));
    const invoicesToPrint: StudentInvoice[] = [];

    selectedRowKeys.forEach((studentIdKey) => {
      const group = groupedByStudent.get(String(studentIdKey));
      if (group) {
        invoicesToPrint.push(...group.invoices);
      }
    });

    if (invoicesToPrint.length === 0) {
      message.warning("Không tìm thấy phiếu thu để in");
      return;
    }

    // Create a new window with all invoices
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      message.error("Không thể mở cửa sổ in. Vui lòng cho phép mở popup.");
      return;
    }

    // Generate HTML for all invoices
    const allInvoiceHTML = invoicesToPrint
      .map((invoice) => {
        const latestInvoiceData = studentInvoiceStatus[invoice.id];
        let updatedInvoice = { ...invoice };

        if (typeof latestInvoiceData === "object" && latestInvoiceData !== null) {
          updatedInvoice = {
            ...invoice,
            studentName: latestInvoiceData.studentName || invoice.studentName,
            studentCode: latestInvoiceData.studentCode || invoice.studentCode,
            totalSessions: latestInvoiceData.totalSessions || invoice.totalSessions,
            totalAmount: latestInvoiceData.totalAmount || invoice.totalAmount,
            discount: latestInvoiceData.discount || invoice.discount,
            finalAmount: latestInvoiceData.finalAmount || invoice.finalAmount,
            sessions: latestInvoiceData.sessions || invoice.sessions,
          };
        }

        const hasQR = invoiceQRPreferences[updatedInvoice.id] !== false;
        const freshContent = generateStudentInvoiceHTML(updatedInvoice, hasQR);
        return `
          <div style="page-break-after: always; margin-bottom: 20px;">
            ${freshContent}
          </div>
        `;
      })
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>In hàng loạt phiếu thu</title>
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        ${allInvoiceHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);

    message.success(`Đang in ${invoicesToPrint.length} phiếu thu...`);
  };

  // Expandable row render for student invoice details
  const expandedRowRender = (record: StudentInvoice) => {
    // Group sessions by class
    const classSummary: Record<
      string,
      {
        className: string;
        classCode: string;
        subject: string;
        sessionCount: number;
        pricePerSession: number;
        totalPrice: number;
      }
    > = {};

    // If invoice is paid, use sessions data from Firebase (already saved)
    if (record.status === "paid") {
      const firebaseData = studentInvoiceStatus[record.id];
      if (
        firebaseData &&
        typeof firebaseData === "object" &&
        firebaseData.sessions
      ) {
        // Use saved sessions from Firebase
        firebaseData.sessions.forEach((session: any) => {
          const className = session["Tên lớp"] || "";
          const classCode = session["Mã lớp"] || "";
          const classId = session["Class ID"];
          const classInfo = classes.find((c) => c.id === classId);
          const subject = classInfo?.["Môn học"] || "N/A";
          const key = `${classCode}-${className}-${subject}`;

          if (!classSummary[key]) {
            classSummary[key] = {
              className,
              classCode,
              subject,
              sessionCount: 0,
              pricePerSession: 0,
              totalPrice: 0,
            };
          }

          classSummary[key].sessionCount++;
        });

        // Calculate prices from saved totalAmount
        const totalSessions = firebaseData.totalSessions || 1;
        const avgPrice = (firebaseData.totalAmount || 0) / totalSessions;

        Object.values(classSummary).forEach((summary) => {
          summary.pricePerSession = avgPrice;
          summary.totalPrice = avgPrice * summary.sessionCount;
        });
      }
    } else {
      // For unpaid invoices, calculate from current data
      record.sessions.forEach((session) => {
        const className = session["Tên lớp"] || "";
        const classCode = session["Mã lớp"] || "";

        // Find class info using Class ID from session
        const classId = session["Class ID"];
        const classInfo = classes.find((c) => c.id === classId);
        const subject = classInfo?.["Môn học"] || "N/A";
        const key = `${classCode}-${className}-${subject}`;

        // Find course using Khối and Môn học from class info
        const course = classInfo
          ? courses.find((c) => {
            if (c.Khối !== classInfo.Khối) return false;
            const classSubject = classInfo["Môn học"];
            const courseSubject = c["Môn học"];
            // Direct match
            if (classSubject === courseSubject) return true;
            // Try matching with subject options (label <-> value)
            const subjectOption = subjectOptions.find(
              (opt) =>
                opt.label === classSubject || opt.value === classSubject
            );
            if (subjectOption) {
              return (
                courseSubject === subjectOption.label ||
                courseSubject === subjectOption.value
              );
            }
            return false;
          })
          : undefined;

        const pricePerSession = course?.Giá || 0;

        if (!classSummary[key]) {
          classSummary[key] = {
            className,
            classCode,
            subject,
            sessionCount: 0,
            pricePerSession,
            totalPrice: 0,
          };
        }

        classSummary[key].sessionCount++;
        classSummary[key].totalPrice += pricePerSession;
      });
    }

    const classData = Object.values(classSummary);

    const expandColumns = [
      {
        title: "Tên lớp",
        dataIndex: "className",
        key: "className",
        width: 200,
      },
      {
        title: "Mã lớp",
        dataIndex: "classCode",
        key: "classCode",
        width: 100,
      },
      {
        title: "Môn học",
        dataIndex: "subject",
        key: "subject",
        width: 120,
      },
      {
        title: "Số buổi",
        dataIndex: "sessionCount",
        key: "sessionCount",
        width: 100,
        align: "center" as const,
        render: (count: number) => <Tag color="blue">{count} buổi</Tag>,
      },
      {
        title: "Giá/buổi",
        dataIndex: "pricePerSession",
        key: "pricePerSession",
        width: 130,
        align: "right" as const,
        render: (price: number) => (
          <Text style={{ color: "#52c41a" }}>
            {price.toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
      {
        title: "Tổng tiền",
        dataIndex: "totalPrice",
        key: "totalPrice",
        width: 130,
        align: "right" as const,
        render: (total: number) => (
          <Text strong style={{ color: "#1890ff" }}>
            {total.toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
    ];

    return (
      <Table
        columns={expandColumns}
        dataSource={classData}
        pagination={false}
        rowKey={(row) => `${row.classCode}-${row.className}-${row.subject}`}
        size="small"
        style={{ margin: "0 48px" }}
      />
    );
  };

  // State for image upload
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<string | null>(
    null
  );
  const [previewImage, setPreviewImage] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Convert file to base64
  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle image upload for student invoice
  const handleStudentImageUpload = async (file: File, invoiceId: string) => {
    try {
      const base64 = await getBase64(file);
      const invoiceRef = ref(
        database,
        `datasheet/Phiếu_thu_học_phí/${invoiceId}`
      );
      const currentData = studentInvoiceStatus[invoiceId] || {};

      await update(invoiceRef, {
        ...currentData,
        invoiceImage: base64,
      });

      message.success("Đã tải ảnh hóa đơn lên");
      return false; // Prevent default upload behavior
    } catch (error) {
      console.error("Error uploading image:", error);
      message.error("Lỗi khi tải ảnh lên");
      return false;
    }
  };

  // Handle image upload for teacher salary
  const handleTeacherImageUpload = async (file: File, salaryId: string) => {
    try {
      const base64 = await getBase64(file);
      const salaryRef = ref(
        database,
        `datasheet/Phiếu_lương_giáo_viên/${salaryId}`
      );
      const currentData = teacherSalaryStatus[salaryId] || {};

      await update(salaryRef, {
        ...currentData,
        invoiceImage: base64,
      });

      message.success("Đã tải ảnh phiếu lương lên");
      return false; // Prevent default upload behavior
    } catch (error) {
      console.error("Error uploading image:", error);
      message.error("Lỗi khi tải ảnh lên");
      return false;
    }
  };

  // Student invoice columns (grouped by student) - for unpaid tab
  const groupedStudentColumns = useMemo(
    () => [
      {
        title: "Mã HS",
        dataIndex: "studentCode",
        key: "studentCode",
        width: 100,
      },
      {
        title: "Họ tên",
        dataIndex: "studentName",
        key: "studentName",
        width: 200,
      },
      {
        title: "Số buổi",
        dataIndex: "totalSessions",
        key: "totalSessions",
        width: 100,
        align: "center" as const,
      },
      {
        title: "Tổng tiền",
        dataIndex: "totalAmount",
        key: "totalAmount",
        width: 150,
        render: (_: any, record: GroupedStudentInvoice) => (
          <InputNumber
            value={record.totalAmount}
            min={0}
            size="small"
            style={{ width: "100%" }}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(v) => Number((v || "0").toString().replace(/,/g, ""))}
            onChange={(val) => {
              const newTotal = typeof val === "number" ? val : 0;
              handleInlineUpdateTotalAmount(record, newTotal);
            }}
          />
        ),
      },
      {
        title: "Miễn giảm",
        key: "discount",
        width: 150,
        render: (_: any, record: GroupedStudentInvoice) => {
          // Show grouped discount input (editable for all invoices in this student)
          return (
            <InputNumber
              value={record.discount}
              min={0}
              max={record.totalAmount}
              onChange={(value) => {
                const discount = value || 0;
                // Update all invoices for this student with the same discount
                record.invoices.forEach((invoice) => {
                  updateStudentDiscount(invoice.id, discount);
                });
              }}
              onBlur={() => {
                // Trigger refresh after blur
                setRefreshTrigger((prev) => prev + 1);
              }}
              style={{ width: "100%" }}
              size="small"
              placeholder="0"
            />
          );
        },
      },
      {
        title: "Thành tiền",
        key: "finalAmount",
        width: 130,
        render: (_: any, record: GroupedStudentInvoice) => (
          <Text strong style={{ color: "#1890ff", fontSize: "14px" }}>
            {record.finalAmount.toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
      {
        title: "Nợ học phí",
        key: "debt",
        width: 130,
        render: (_: any, record: GroupedStudentInvoice) => {
          // Nợ học phí = nợ từ các tháng trước (không bao gồm tháng hiện tại)
          // Nếu không có tháng trước thì = 0đ
          const debt = calculateStudentTotalDebt(record.studentId, record.month, record.year);
          return (
            <Text strong style={{ color: debt > 0 ? "#ff4d4f" : "#52c41a", fontSize: "14px" }}>
              {debt.toLocaleString("vi-VN")} đ
            </Text>
          );
        },
      },
      {
        title: "Tổng nợ lũy kế",
        key: "totalDebt",
        width: 140,
        render: (_: any, record: GroupedStudentInvoice) => {
          const totalDebt = calculateStudentTotalDebt(record.studentId, record.month, record.year);
          const currentDebt = record.status === "unpaid" ? record.finalAmount : 0;
          const combinedDebt = totalDebt + currentDebt;
          return (
            <Text strong style={{ color: combinedDebt > 0 ? "#ff4d4f" : "#52c41a", fontSize: "14px" }}>
              {combinedDebt.toLocaleString("vi-VN")} đ
            </Text>
          );
        },
      },
      {
        title: "QR",
        key: "qr",
        width: 80,
        align: "center" as const,
        render: (_: any, record: GroupedStudentInvoice) => {
          const firstInvoice = record.invoices[0];
          const hasQR = invoiceQRPreferences[firstInvoice.id] !== false;
          return (
            <Button
              size="small"
              type={hasQR ? "primary" : "default"}
              onClick={() => {
                setInvoiceQRPreferences(prev => ({
                  ...prev,
                  [firstInvoice.id]: !hasQR
                }));
              }}
            >
              {hasQR ? "✓" : "✗"}
            </Button>
          );
        },
      },
      {
        title: "Thao tác",
        key: "actions",
        width: 80,
        align: "center" as const,
        render: (_: any, record: GroupedStudentInvoice) => {
          const firstInvoice = record.invoices[0];
          const hasQR = invoiceQRPreferences[firstInvoice.id] !== false;

          const menu = (
            <Menu>
              <Menu.Item
                key="view"
                icon={<EyeOutlined />}
                onClick={() => viewStudentInvoice(firstInvoice)}
              >
                Xem
              </Menu.Item>
              <Menu.Item
                key="edit"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingInvoice(firstInvoice);
                  const prices: Record<string, number> = {};
                  firstInvoice.sessions?.forEach((session: AttendanceSession) => {
                    const classId = session["Class ID"];
                    const classData = classes.find(c => c.id === classId);
                    const subject = classData?.["Môn học"] || session["Môn học"] || "Chưa xác định";
                    if (prices[subject] === undefined) {
                      prices[subject] = Number(getSafeField(session, "Giá/buổi")) || 0;
                    }
                  });
                  setEditSessionPrices(prices);
                  setEditDiscount(firstInvoice.discount || 0);
                  setEditInvoiceModalOpen(true);
                }}
              >
                Sửa
              </Menu.Item>
              <Menu.Item
                key="print"
                icon={<PrinterOutlined />}
                onClick={() => printInvoice(firstInvoice, hasQR)}
              >
                In
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                key="confirm"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  record.invoices.forEach((invoice) => {
                    updateStudentInvoiceStatus(invoice.id, "paid");
                  });
                }}
              >
                Xác nhận TT
              </Menu.Item>
              <Menu.Item
                key="delete"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: "Xác nhận xóa",
                    content: "Bạn có chắc chắn muốn xóa tất cả phiếu thu của học sinh này?",
                    okText: "Xóa",
                    cancelText: "Hủy",
                    okType: "danger",
                    onOk: () => {
                      record.invoices.forEach((invoice) => {
                        handleDeleteInvoice(invoice.id);
                      });
                    },
                  });
                }}
              >
                Xóa
              </Menu.Item>
            </Menu>
          );

          return (
            <Dropdown overlay={menu} trigger={['click']}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          );
        },
      },
    ],
    [viewStudentInvoice, updateStudentDiscount, updateStudentInvoiceStatus, handleDeleteInvoice, setEditingInvoice, setEditSessionPrices, setEditDiscount, setEditInvoiceModalOpen]
  );

  // Paid student invoice columns (flat, not grouped)
  const paidStudentColumns = useMemo(
    () => [
      {
        title: "Mã HS",
        dataIndex: "studentCode",
        key: "studentCode",
        width: 100,
      },
      {
        title: "Họ tên",
        dataIndex: "studentName",
        key: "studentName",
        width: 200,
      },
      {
        title: "Tên lớp",
        dataIndex: "className",
        key: "className",
        width: 150,
      },
      {
        title: "Mã lớp",
        dataIndex: "classCode",
        key: "classCode",
        width: 100,
      },
      {
        title: "Môn học",
        dataIndex: "subject",
        key: "subject",
        width: 120,
      },
      {
        title: "Số buổi",
        dataIndex: "totalSessions",
        key: "totalSessions",
        width: 100,
        align: "center" as const,
      },
      {
        title: "Tổng tiền",
        dataIndex: "totalAmount",
        key: "totalAmount",
        width: 130,
        render: (amount: number) => (
          <Text style={{ color: "#36797f" }}>
            {amount.toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
      {
        title: "Miễn giảm",
        dataIndex: "discount",
        key: "discount",
        width: 130,
        render: (discount: number) => (
          <Text>{discount.toLocaleString("vi-VN")} đ</Text>
        ),
      },
      {
        title: "Thành tiền",
        key: "finalAmount",
        width: 130,
        render: (_: any, record: StudentInvoice) => (
          <Text strong style={{ color: "#52c41a", fontSize: "14px" }}>
            {record.finalAmount.toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
      {
        title: "Trạng thái",
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (status: "paid" | "unpaid") => (
          <Tag color={status === "paid" ? "green" : "red"}>
            {status === "paid" ? "Đã thu" : "Chưa thu"}
          </Tag>
        ),
      },
      {
        title: "Nợ học phí",
        key: "debt",
        width: 130,
        render: (_: any, record: StudentInvoice) => {
          // Nợ học phí = nợ từ các tháng trước (không bao gồm tháng hiện tại)
          // Nếu không có tháng trước thì = 0đ
          const debt = calculateStudentTotalDebt(record.studentId, record.month, record.year);
          return (
            <Text strong style={{ color: debt > 0 ? "#ff4d4f" : "#52c41a", fontSize: "14px" }}>
              {debt.toLocaleString("vi-VN")} đ
            </Text>
          );
        },
      },
      {
        title: "Tổng nợ lũy kế",
        key: "totalDebt",
        width: 140,
        render: (_: any, record: StudentInvoice) => {
          const totalDebt = calculateStudentTotalDebt(record.studentId, record.month, record.year);
          const currentDebt = record.status === "unpaid" ? record.finalAmount : 0;
          const combinedDebt = totalDebt + currentDebt;
          return (
            <Text strong style={{ color: combinedDebt > 0 ? "#ff4d4f" : "#52c41a", fontSize: "14px" }}>
              {combinedDebt.toLocaleString("vi-VN")} đ
            </Text>
          );
        },
      },
      {
        title: "Thao tác",
        key: "actions",
        width: 200,
        render: (_: any, record: StudentInvoice) => (
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => viewStudentInvoice(record)}
            >
              Xem
            </Button>
            <Popconfirm
              title="Xác nhận xóa"
              description="Bạn có chắc chắn muốn xóa phiếu thu này?"
              onConfirm={() => handleDeleteInvoice(record.id)}
              okText="Xóa"
              cancelText="Hủy"
              okType="danger"
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
              >
                Xóa
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [viewStudentInvoice, handleDeleteInvoice]
  );

  // Columns for expanded row (class details)
  const expandedStudentColumns = [
    {
      title: "Tên lớp",
      dataIndex: "className",
      key: "className",
      width: 150,
    },
    {
      title: "Mã lớp",
      dataIndex: "classCode",
      key: "classCode",
      width: 100,
    },
    {
      title: "Môn học",
      dataIndex: "subject",
      key: "subject",
      width: 120,
    },
    {
      title: "Số buổi",
      dataIndex: "totalSessions",
      key: "totalSessions",
      width: 80,
      align: "center" as const,
    },
    {
      title: "Giá/buổi",
      dataIndex: "pricePerSession",
      key: "pricePerSession",
      width: 120,
      render: (price: number) => (
        <Text>{price.toLocaleString("vi-VN")} đ</Text>
      ),
    },
    {
      title: "Tổng tiền",
      dataIndex: "totalAmount",
      key: "totalAmount",
      width: 130,
      render: (amount: number) => (
        <Text style={{ color: "#36797f" }}>
          {amount.toLocaleString("vi-VN")} đ
        </Text>
      ),
    },
    {
      title: "Miễn giảm",
      dataIndex: "discount",
      key: "discount",
      width: 150,
      render: (discount: number) => (
        <Text>{discount.toLocaleString("vi-VN")} đ</Text>
      ),
    },
    {
      title: "Thành tiền",
      key: "finalAmount",
      width: 130,
      render: (_: any, record: StudentInvoice) => (
        <Text strong style={{ color: "#1890ff", fontSize: "14px" }}>
          {record.finalAmount.toLocaleString("vi-VN")} đ
        </Text>
      ),
    },
  ];

  // Expandable row render for grouped student invoices
  const expandedStudentRowRender = (record: GroupedStudentInvoice) => {
    // If only 1 invoice, no need to expand
    if (record.invoices.length <= 1) {
      return null;
    }

    return (
      <Table
        columns={expandedStudentColumns}
        dataSource={record.invoices}
        pagination={false}
        rowKey="id"
        size="small"
      />
    );
  };

  // Expandable row render for teacher salary details
  const expandedTeacherRowRender = (record: TeacherSalary) => {
    // Find teacher info to get travel allowance per session
    const teacher = teachers.find((t) => t.id === record.teacherId);
    const travelAllowancePerSession = teacher?.["Trợ cấp đi lại"] || 0;

    // Group sessions by class
    const classSummary: Record<
      string,
      {
        className: string;
        classCode: string;
        sessionCount: number;
        salaryPerSession: number;
        totalSalary: number;
        totalAllowance: number;
      }
    > = {};

    // If salary is paid, use sessions data from Firebase (already saved)
    if (record.status === "paid") {
      const firebaseData = teacherSalaryStatus[record.id];
      if (
        firebaseData &&
        typeof firebaseData === "object" &&
        firebaseData.sessions
      ) {
        // Use saved sessions from Firebase
        firebaseData.sessions.forEach((session: any) => {
          const className = session["Tên lớp"] || "";
          const classCode = session["Mã lớp"] || "";
          const key = `${classCode}-${className}`;

          if (!classSummary[key]) {
            classSummary[key] = {
              className,
              classCode,
              sessionCount: 0,
              salaryPerSession: 0,
              totalSalary: 0,
              totalAllowance: 0,
            };
          }

          classSummary[key].sessionCount++;
        });

        // Calculate from saved data
        const totalSessions = firebaseData.totalSessions || 1;
        const avgSalary = (firebaseData.totalSalary || 0) / totalSessions;
        const avgAllowance = (firebaseData.totalAllowance || 0) / totalSessions;

        Object.values(classSummary).forEach((summary) => {
          summary.salaryPerSession = avgSalary;
          summary.totalSalary = avgSalary * summary.sessionCount;
          summary.totalAllowance = avgAllowance * summary.sessionCount;
        });
      }
    } else {
      // For unpaid salaries, calculate from current data
      record.sessions.forEach((session) => {
        const className = session["Tên lớp"] || "";
        const classCode = session["Mã lớp"] || "";
        const key = `${classCode}-${className}`;

        // Find class info using Class ID from session
        const classId = session["Class ID"];
        const classInfo = classes.find((c) => c.id === classId);

        // Find course using Khối and Môn học from class info
        const course = classInfo
          ? courses.find(
            (c) =>
              c.Khối === classInfo.Khối &&
              c["Môn học"] === classInfo["Môn học"]
          )
          : undefined;

        const salaryPerSession =
          record.bienChe === "Full-time"
            ? course?.["Lương GV Full-time"] || 0
            : course?.["Lương GV Part-time"] || 0;

        if (!classSummary[key]) {
          classSummary[key] = {
            className,
            classCode,
            sessionCount: 0,
            salaryPerSession,
            totalSalary: 0,
            totalAllowance: 0,
          };
        }

        classSummary[key].sessionCount++;
        classSummary[key].totalSalary += salaryPerSession;
        // Calculate allowance = allowancePerSession * sessionCount for this class
        classSummary[key].totalAllowance =
          travelAllowancePerSession * classSummary[key].sessionCount;
      });
    }

    const classData = Object.values(classSummary);

    const expandColumns = [
      {
        title: "Tên lớp",
        dataIndex: "className",
        key: "className",
        width: 250,
      },
      {
        title: "Mã lớp",
        dataIndex: "classCode",
        key: "classCode",
        width: 120,
      },
      {
        title: "Số buổi",
        dataIndex: "sessionCount",
        key: "sessionCount",
        width: 100,
        align: "center" as const,
        render: (count: number) => <Tag color="blue">{count} buổi</Tag>,
      },
      {
        title: "Lương/buổi",
        dataIndex: "salaryPerSession",
        key: "salaryPerSession",
        width: 150,
        align: "right" as const,
        render: (salary: number) => (
          <Text style={{ color: "#52c41a" }}>
            {salary.toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
      {
        title: "Phụ cấp",
        dataIndex: "totalAllowance",
        key: "totalAllowance",
        width: 150,
        align: "right" as const,
        render: (allowance: number) => (
          <Text style={{ color: "#fa8c16" }}>
            {allowance.toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
      {
        title: "Tổng lương",
        key: "totalPay",
        width: 150,
        align: "right" as const,
        render: (_: any, row: any) => (
          <Text strong style={{ color: "#1890ff" }}>
            {(row.totalSalary + row.totalAllowance).toLocaleString("vi-VN")} đ
          </Text>
        ),
      },
    ];

    return (
      <Table
        columns={expandColumns}
        dataSource={classData}
        pagination={false}
        rowKey={(row) => `${row.classCode}-${row.className}`}
        size="small"
        style={{ margin: "0 48px" }}
      />
    );
  };

  // Teacher salary columns
  const teacherColumns = [
    {
      title: "Mã GV",
      dataIndex: "teacherCode",
      key: "teacherCode",
      width: 100,
    },
    {
      title: "Họ tên",
      dataIndex: "teacherName",
      key: "teacherName",
      width: 180,
    },
    {
      title: "Biên chế",
      dataIndex: "bienChe",
      key: "bienChe",
      width: 120,
    },
    {
      title: "Số buổi",
      dataIndex: "totalSessions",
      key: "totalSessions",
      width: 80,
      align: "center" as const,
    },
    // {
    //   title: "Giờ dạy",
    //   key: "hours",
    //   width: 100,
    //   render: (_: any, record: TeacherSalary) => (
    //     <Text>
    //       {record.totalHours}h {record.totalMinutes}p
    //     </Text>
    //   ),
    // },
    {
      title: "Lương",
      key: "totalPay",
      width: 150,
      render: (_: any, record: TeacherSalary) => (
        <Text strong style={{ color: "#36797f" }}>
          {(record.totalSalary + record.totalAllowance).toLocaleString("vi-VN")}{" "}
          đ
        </Text>
      ),
    },
    {
      title: "Hóa đơn",
      key: "invoiceImage",
      width: 120,
      align: "center" as const,
      render: (_: any, record: TeacherSalary) => {
        const salaryData = teacherSalaryStatus[record.id];
        const hasImage =
          salaryData &&
          typeof salaryData === "object" &&
          salaryData.invoiceImage;

        return (
          <Space direction="vertical" size="small">
            {hasImage ? (
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => {
                  setPreviewImage(salaryData.invoiceImage!);
                  setPreviewOpen(true);
                }}
              >
                Xem
              </Button>
            ) : (
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) =>
                  handleTeacherImageUpload(file, record.id)
                }
              >
                <Button size="small" icon={<FileImageOutlined />}>
                  Tải lên
                </Button>
              </Upload>
            )}
          </Space>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: "paid" | "unpaid") => (
        <Tag color={status === "paid" ? "green" : "red"}>
          {status === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}
        </Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 200,
      render: (_: any, record: TeacherSalary) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => viewTeacherSalary(record)}
          >
            Xem
          </Button>
          {record.status !== "paid" && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => updateTeacherSalaryStatus(record.id, "paid")}
            >
              Đã TT
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const studentTab = (
    <Space direction="vertical" className="w-full">
      {/* Filters */}
      <Card className="mb-4">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Lọc theo lớp
            </Text>
            <Select
              mode="multiple"
              value={studentClassFilter}
              onChange={setStudentClassFilter}
              style={{ width: "100%" }}
              placeholder="Tất cả các lớp"
              showSearch
              filterOption={(input, option) => {
                const label = option?.label || option?.children || "";
                return String(label).toLowerCase().includes(input.toLowerCase());
              }}
            >
              {uniqueClasses.map((cls) => (
                <Select.Option key={cls.id} value={cls.id} label={cls.name}>
                  {cls.name}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Tìm theo tên
            </Text>
            <Input
              placeholder="Nhập tên học sinh..."
              prefix={<SearchOutlined />}
              value={studentSearchTerm}
              onChange={(e) => setStudentSearchTerm(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Text strong className="block mb-2">
              Tháng
            </Text>
            <Select
              value={studentMonth + 1}
              onChange={(month) => setStudentMonth(month - 1)}
              style={{ width: "100%" }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <Option key={i + 1} value={i + 1}>
                  Tháng {i + 1}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Text strong className="block mb-2">
              Năm
            </Text>
            <Select
              value={studentYear}
              onChange={setStudentYear}
              style={{ width: "100%" }}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = dayjs().year() - 2 + i;
                return (
                  <Option key={year} value={year}>
                    {year}
                  </Option>
                );
              })}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Text strong className="block mb-2">
              Giáo viên
            </Text>
            <Select
              value={studentTeacherFilter}
              onChange={setStudentTeacherFilter}
              style={{ width: "100%" }}
            >
              <Option value="all">Tất cả</Option>
              {uniqueTeachers.map((teacher) => (
                <Option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </Option>
              ))}
            </Select>
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Trạng thái
            </Text>
            <Select
              value={studentStatusFilter}
              onChange={setStudentStatusFilter}
              style={{ width: "100%" }}
            >
              <Option value="all">Tất cả</Option>
              <Option value="unpaid">Chưa thanh toán</Option>
              <Option value="paid">Đã thanh toán</Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* Summary */}
      <Row gutter={16} className="mb-4">
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng học sinh</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#36797f" }}>
              {groupedStudentInvoices.length}
            </Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng số buổi</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#1890ff" }}>
              {groupedStudentInvoices
                .reduce((sum, i) => sum + i.totalSessions, 0)
                .toLocaleString("vi-VN")}
            </Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng thu</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#36797f" }}>
              {groupedStudentInvoices
                .reduce((sum, i) => sum + i.finalAmount, 0)
                .toLocaleString("vi-VN")}{" "}
              đ
            </Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng tiền (trước giảm)</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#52c41a" }}>
              {groupedStudentInvoices
                .reduce((sum, i) => sum + i.totalAmount, 0)
                .toLocaleString("vi-VN")}{" "}
              đ
            </Title>
          </Card>
        </Col>
      </Row>

      {/* Bulk delete button */}
      {selectedRowKeys.length > 0 && (
        <div className="mb-4">
          <Space>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handleBulkPrintInvoices}
            >
              In {selectedRowKeys.length} phiếu đã chọn
            </Button>
            <Button
              type="primary"
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeleteMultipleInvoices}
            >
              Xóa {selectedRowKeys.length} phiếu đã chọn
            </Button>
          </Space>
        </div>
      )}

      {/* Table */}
      <Table
        columns={groupedStudentColumns}
        dataSource={groupedStudentInvoices}
        loading={loading}
        rowKey="studentId"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        rowSelection={{
          selectedRowKeys: selectedRowKeys,
          onChange: (newSelectedRowKeys) => {
            setSelectedRowKeys(newSelectedRowKeys);
          },
        }}
        expandable={{
          expandedRowRender: expandedStudentRowRender,
          rowExpandable: (record) => record.invoices.length > 1,
        }}
      />
    </Space>
  );

  const paidStudentTab = (
    <Space direction="vertical" className="w-full">
      {/* Filters */}
      <Card className="mb-4">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Tháng
            </Text>
            <DatePicker
              picker="month"
              value={dayjs().month(studentMonth).year(studentYear)}
              onChange={(date) => {
                if (date) {
                  setStudentMonth(date.month());
                  setStudentYear(date.year());
                }
              }}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} sm={12} md={18}>
            <Text strong className="block mb-2">
              Tìm kiếm
            </Text>
            <Input
              placeholder="Tìm theo tên hoặc mã học sinh..."
              prefix={<SearchOutlined />}
              value={studentSearchTerm}
              onChange={(e) => setStudentSearchTerm(e.target.value.trim())}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {/* Summary */}
      <Row gutter={16} className="mb-4">
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng phiếu đã thanh toán</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#52c41a" }}>
              {filteredPaidStudentInvoices.length}
            </Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng số buổi</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#1890ff" }}>
              {filteredPaidStudentInvoices
                .reduce((sum, i) => sum + (i.totalSessions || 0), 0)
                .toLocaleString("vi-VN")}
            </Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng đã thu</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#52c41a" }}>
              {filteredPaidStudentInvoices
                .reduce((sum, i) => sum + (i.finalAmount || 0), 0)
                .toLocaleString("vi-VN")}{" "}
              đ
            </Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">Tổng tiền (trước giảm)</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#52c41a" }}>
              {filteredPaidStudentInvoices
                .reduce((sum, i) => sum + (i.totalAmount || 0), 0)
                .toLocaleString("vi-VN")}{" "}
              đ
            </Title>
          </Card>
        </Col>
      </Row>

      {/* Bulk delete button */}
      {selectedPaidRowKeys.length > 0 && (
        <div className="mb-4">
          <Button
            type="primary"
            danger
            icon={<DeleteOutlined />}
            onClick={handleDeleteMultiplePaidInvoices}
          >
            Xóa {selectedPaidRowKeys.length} phiếu đã chọn
          </Button>
        </div>
      )}

      {/* Table - Read only, no print button and no edit */}
      <Table
        columns={paidStudentColumns}
        dataSource={filteredPaidStudentInvoices}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        rowSelection={{
          selectedRowKeys: selectedPaidRowKeys,
          onChange: (newSelectedRowKeys) => {
            setSelectedPaidRowKeys(newSelectedRowKeys);
          },
        }}
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => record.sessions.length > 0,
        }}
      />
    </Space>
  );

  const teacherTab = (
    <Space direction="vertical" className="w-full">
      {/* Filters */}
      <Card className="mb-4">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Tháng
            </Text>
            <DatePicker
              picker="month"
              value={dayjs().month(teacherMonth).year(teacherYear)}
              onChange={(date) => {
                if (date) {
                  setTeacherMonth(date.month());
                  setTeacherYear(date.year());
                }
              }}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Biên chế
            </Text>
            <Select
              value={teacherBienCheFilter}
              onChange={setTeacherBienCheFilter}
              style={{ width: "100%" }}
            >
              <Option value="all">Tất cả</Option>
              <Option value="Full-time">Full-time</Option>
              <Option value="Part-time">Part-time</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Trạng thái
            </Text>
            <Select
              value={teacherStatusFilter}
              onChange={setTeacherStatusFilter}
              style={{ width: "100%" }}
            >
              <Option value="all">Tất cả</Option>
              <Option value="unpaid">Chưa thanh toán</Option>
              <Option value="paid">Đã thanh toán</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Text strong className="block mb-2">
              Tìm kiếm
            </Text>
            <Input
              placeholder="Tìm theo tên hoặc mã giáo viên..."
              prefix={<SearchOutlined />}
              value={teacherSearchTerm}
              onChange={(e) => setTeacherSearchTerm(e.target.value)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {/* Summary */}
      <Row gutter={16} className="mb-4">
        <Col span={8}>
          <Card>
            <Text type="secondary">Tổng phiếu lương</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#36797f" }}>
              {filteredTeacherSalaries.length}
            </Title>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Text type="secondary">Đã thanh toán</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#52c41a" }}>
              {
                filteredTeacherSalaries.filter((s) => s.status === "paid")
                  .length
              }
            </Title>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Text type="secondary">Tổng chi</Text>
            <Title level={3} style={{ margin: "10px 0", color: "#36797f" }}>
              {filteredTeacherSalaries
                .reduce((sum, s) => sum + s.totalSalary + s.totalAllowance, 0)
                .toLocaleString("vi-VN")}{" "}
              đ
            </Title>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Table
        columns={teacherColumns}
        dataSource={filteredTeacherSalaries}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        expandable={{
          expandedRowRender: expandedTeacherRowRender,
          rowExpandable: (record) => record.sessions.length > 0,
        }}
      />
    </Space>
  );

  return (
    <WrapperContent title="Hóa đơn & Biên nhận">
      <Tabs
        activeKey={activeTab}
        defaultActiveKey="students"
        onChange={(key) => {
          setActiveTab(key);
          if (key === "students") {
            setStudentStatusFilter("unpaid");
            setSelectedRowKeys([]);
          } else if (key === "paid") {
            setStudentStatusFilter("paid");
            setSelectedPaidRowKeys([]);
          }
        }}
        items={[
          {
            key: "students",
            label: "Phiếu thu học phí (Chưa thanh toán)",
            children: studentTab,
          },
          {
            key: "paid",
            label: "Đã thanh toán",
            children: paidStudentTab,
          },
          {
            key: "teachers",
            label: "Phiếu lương giáo viên",
            children: teacherTab,
          },
        ]}
      />

      {/* Edit Invoice Modal - Group by Subject */}
      <Modal
        title="Chỉnh sửa phiếu thu học phí"
        open={editInvoiceModalOpen}
        width={800}
        onCancel={() => {
          setEditInvoiceModalOpen(false);
          setEditingInvoice(null);
          setEditDiscount(0);
          setEditSessionPrices({});
        }}
        onOk={async () => {
          if (!editingInvoice) return;

          // Build updated sessions array where each session in the invoice
          // gets the price defined by its subject in editSessionPrices.
          // Also build a sessionPrices map keyed by session.id when available,
          // otherwise keyed by an index token so we can still compute totals.
          const sessionBasedPrices: Record<string, number> = {};
          const updatedSessions: AttendanceSession[] = [];

          editingInvoice.sessions.forEach((session: AttendanceSession, idx: number) => {
            const classId = session["Class ID"];
            const classData = classes.find(c => c.id === classId);
            const subject = classData?.["Môn học"] || session["Môn học"] || "Chưa xác định";

            const priceForSubject = editSessionPrices[subject];
            const newPrice = priceForSubject !== undefined ? priceForSubject : (getSafeField(session, "Giá/buổi") || 0);

            // Clone session and set new price
            const updated = {
              ...session,
              [sanitizeKey("Giá/buổi")]: newPrice,
            } as AttendanceSession;
            updatedSessions.push(updated);

            const key = session.id || `__idx_${idx}`;
            sessionBasedPrices[key] = newPrice;
          });

          await updateStudentInvoiceWithSessionPrices(
            editingInvoice.id,
            sessionBasedPrices,
            editDiscount,
            updatedSessions
          );

          setEditInvoiceModalOpen(false);
          setEditingInvoice(null);
          setEditDiscount(0);
          setEditSessionPrices({});
        }}
        okText="Lưu"
        cancelText="Hủy"
      >
        {editingInvoice && (() => {
          // Group sessions by subject (Môn học)
          const subjectGroups: Record<string, {
            subject: string;
            sessionCount: number;
            sessions: AttendanceSession[];
            currentPrice: number;
          }> = {};

          editingInvoice.sessions.forEach((session: AttendanceSession) => {
            const classId = session["Class ID"];
            const classData = classes.find(c => c.id === classId);
            const subject = classData?.["Môn học"] || session["Môn học"] || "Chưa xác định";

            if (!subjectGroups[subject]) {
              subjectGroups[subject] = {
                subject,
                sessionCount: 0,
                sessions: [],
                currentPrice: editSessionPrices[subject] || (getSafeField(session, "Giá/buổi") || 0),
              };
            }

            subjectGroups[subject].sessionCount++;
            subjectGroups[subject].sessions.push(session);
          });

          const totalBySubject = Object.entries(subjectGroups).map(([subject, data]) => ({
            subject,
            ...data,
            total: (editSessionPrices[subject] || data.currentPrice || 0) * data.sessionCount,
          }));

          return (
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <Row gutter={16}>
                <Col span={12}>
                  <Text strong>Học sinh: </Text>
                  <Text>{editingInvoice.studentName}</Text>
                </Col>
                <Col span={12}>
                  <Text strong>Tháng: </Text>
                  <Text>{`${editingInvoice.month + 1}/${editingInvoice.year}`}</Text>
                </Col>
              </Row>

              <div>
                <Text strong style={{ display: "block", marginBottom: 8 }}>
                  Chi tiết theo môn học ({Object.keys(subjectGroups).length} môn):
                </Text>
                <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #d9d9d9", borderRadius: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#fafafa", position: "sticky", top: 0 }}>
                        <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #d9d9d9", width: "35%" }}>Môn học</th>
                        <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #d9d9d9", width: "15%" }}>Số buổi</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #d9d9d9", width: "25%" }}>Giá/buổi (đ)</th>
                        <th style={{ padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #d9d9d9", width: "25%" }}>Tổng tiền (đ)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {totalBySubject.map((item, index) => (
                        <tr key={item.subject} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "12px" }}>
                            <Text>{item.subject}</Text>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <Tag color="blue">{item.sessionCount} buổi</Tag>
                          </td>
                          <td style={{ padding: "12px", textAlign: "right" }}>
                            <InputNumber
                              size="small"
                              min={0}
                              value={editSessionPrices[item.subject] ?? item.currentPrice}
                              onChange={(value) => {
                                setEditSessionPrices((prev) => ({
                                  ...prev,
                                  [item.subject]: value || 0,
                                }));
                              }}
                              formatter={(value) =>
                                `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                              }
                              parser={(value) =>
                                Number(value!.replace(/\$\s?|(,*)/g, ""))
                              }
                              style={{ width: 140 }}
                            />
                          </td>
                          <td style={{ padding: "12px", textAlign: "right" }}>
                            <Text strong style={{ color: "#1890ff" }}>
                              {((editSessionPrices[item.subject] ?? item.currentPrice) * item.sessionCount).toLocaleString("vi-VN")} đ
                            </Text>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Row gutter={16}>
                <Col span={12}>
                  <Text strong>Tổng học phí: </Text>
                  <Text style={{ color: "#36797f", fontSize: 15 }}>
                    {totalBySubject
                      .reduce((sum, item) => sum + (item.total || 0), 0)
                      .toLocaleString("vi-VN")}{" "}
                    đ
                  </Text>
                </Col>
                <Col span={12}>
                  <Text strong>Tổng số buổi: </Text>
                  <Text>{editingInvoice.sessions.length} buổi</Text>
                </Col>
              </Row>

              <div>
                <Text strong style={{ display: "block", marginBottom: 4 }}>
                  Miễn giảm học phí:
                </Text>
                <InputNumber
                  style={{ width: "100%" }}
                  value={editDiscount}
                  onChange={(value) => setEditDiscount(value || 0)}
                  formatter={(value) =>
                    `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                  }
                  parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, ""))}
                  addonAfter="đ"
                  min={0}
                  max={totalBySubject.reduce((sum, item) => sum + (item.total || 0), 0)}
                  placeholder="Nhập số tiền miễn giảm"
                />
              </div>

              <div style={{ backgroundColor: "#f6ffed", padding: "12px 16px", borderRadius: 6, border: "1px solid #b7eb8f" }}>
                <Text strong style={{ fontSize: 16 }}>Phải thu: </Text>
                <Text strong style={{ color: "#52c41a", fontSize: 18 }}>
                  {Math.max(
                    0,
                    totalBySubject.reduce((sum, item) => sum + (item.total || 0), 0) - editDiscount
                  ).toLocaleString("vi-VN")}{" "}
                  đ
                </Text>
              </div>
            </Space>
          );
        })()}
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        open={previewOpen}
        title="Xem ảnh hóa đơn"
        footer={null}
        onCancel={() => setPreviewOpen(false)}
        width={800}
      >
        <Image alt="Invoice" style={{ width: "100%" }} src={previewImage} />
      </Modal>
    </WrapperContent>
  );
};

export default InvoicePage;
