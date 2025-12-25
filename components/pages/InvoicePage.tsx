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
  "Nội dung buổi học"?: string;
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
  >("all");
  const [studentClassFilter, setStudentClassFilter] = useState<string[]>([]); // Nhiều lớp
  const [studentTeacherFilter, setStudentTeacherFilter] = useState<string>("all"); // Lọc theo giáo viên

  // Trigger to force recalculation after discount update
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Row selection state for bulk delete (unpaid tab)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  
  // Row selection state for bulk delete (paid tab)
  const [selectedPaidRowKeys, setSelectedPaidRowKeys] = useState<React.Key[]>([]);

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

        // Get salary per session from teacher info
        const salaryPerSession = Number(teacher["Lương theo buổi"]) || 0;

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

  // Filter student invoices with all filters
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
          studentStatusFilter === "all" ||
          (studentStatusFilter === "paid" && invoice.status === "paid") ||
          (studentStatusFilter === "unpaid" && invoice.status !== "paid");

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
    const content = generateStudentInvoiceHTML(invoice);
    const isPaid = invoice.status === "paid";
    const modal = Modal.info({
      title: `Phiếu thu học phí - ${invoice.studentName}`,
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
        <Space>
          <Button onClick={() => modal.destroy()}>Đóng</Button>
          {!isPaid && (
            <Button
              icon={<PrinterOutlined />}
              onClick={() => printInvoice(content)}
            >
              In phiếu
            </Button>
          )}
        </Space>
      ),
    });
  };

  const viewTeacherSalary = (salary: TeacherSalary) => {
    const content = generateTeacherSalaryHTML(salary);
    const modal = Modal.info({
      title: `Phiếu lương giáo viên - ${salary.teacherName}`,
      width: 800,
      maskClosable: true,
      closable: true,
      content: (
        <div
          id={`teacher-salary-${salary.id}`}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ),
      footer: (
        <Space>
          <Button onClick={() => modal.destroy()}>Đóng</Button>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => printInvoice(content)}
          >
            In phiếu
          </Button>
        </Space>
      ),
    });
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

  const generateStudentInvoiceHTML = (invoice: StudentInvoice) => {
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
              <td style="padding:12px; border:1px solid #e8e8e8; color:#c40000;">Tổng nợ</td>
              <td style="padding:12px; text-align:right; border:1px solid #e8e8e8; color:#c40000; font-size:16px;">${totalDebt.toLocaleString("vi-VN")} đ</td>
            </tr>
          </tbody>
        </table>
      </div>`
        : `<p style="margin:14px 0;"><strong style="color:#1a3353; font-size:15px;">Chi tiết nợ:</strong> <span style="color:#666;">Không có nợ</span></p>`;
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
        ${
          discountAmount > 0
            ? `
        <div style="margin-top:8px; padding:10px 12px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#003a8c; font-size:14px; font-weight:600;">Miễn giảm học phí</span>
            <span style="color:#003a8c; font-size:15px; font-weight:700;">- ${discountAmount.toLocaleString("vi-VN")} đ</span>
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

    // Format debt details for display (first 2 lines)
    const debtDetail1 = debtDetails.length > 0 
      ? `Tháng ${debtDetails[0].month + 1}/${debtDetails[0].year}: ${debtDetails[0].amount.toLocaleString("vi-VN")} đ`
      : "";
    const debtDetail2 = debtDetails.length > 1
      ? `Tháng ${debtDetails[1].month + 1}/${debtDetails[1].year}: ${debtDetails[1].amount.toLocaleString("vi-VN")} đ`
      : "";

    return `
      <div style="font-family: 'Roboto', sans-serif; width: 100%; max-width: 800px; background: #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.1); overflow: hidden; position: relative; border-radius: 8px; margin: 0 auto;">
        <!-- Watermark -->
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 40px; font-weight: bold; color: rgba(0,0,0,0.03); z-index: 0; pointer-events: none; white-space: nowrap;">TRUNG TÂM HỌC TẬP</div>

        <!-- Background Logo, full sheet with 10% opacity on top layer -->
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; align-items: center; justify-content: center; pointer-events: none;">
          <img
            src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F5efd9944.%E1%BA%A2nh.120320.png"
            alt="Background Logo"
            style="width: 90%; height: 90%; max-width: 90%; max-height: 90%; object-fit: contain; opacity: 0.1; filter: grayscale(15%) brightness(1.05);"
          />
        </div>

        <div style="position: relative; z-index: 1;">
          <!-- Header -->
          <div style="background-color: #103458; color: #fccf6e; text-align: center; padding: 25px 10px;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 15px;">
              <img src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png" alt="Logo Trí Tuệ 8+" style="height: 50px; width: auto; object-fit: contain;" />
              <div style="font-size: 20px; font-weight: 500; color: #fccf6e;">Trung tâm trí tuệ 8+</div>
            </div>
            <h1 style="text-transform: uppercase; font-size: 28px; font-weight: 700; letter-spacing: 1px; margin: 0;">PHIẾU THU HỌC PHÍ THÁNG ${invoice.month + 1}</h1>
          </div>

          <!-- Info Section -->
          <div style="display: flex; justify-content: space-between; padding: 30px 40px; color: #103458; font-weight: 700;">
            <div style="width: 48%;">
              <h3 style="text-transform: uppercase; font-size: 18px; margin-bottom: 15px; font-weight: 700;">THÔNG TIN HỌC SINH</h3>
              <div style="margin-bottom: 8px; font-size: 15px; color: #333;"><span style="font-weight: 800;">Họ và tên:</span> ${invoice.studentName}</div>
              <div style="margin-bottom: 8px; font-size: 15px; color: #333;"><span style="font-weight: 800;">Khối lớp:</span> ${grade || "Chưa xác định"}</div>
            </div>
            <div style="width: 48%;">
              <h3 style="text-transform: uppercase; font-size: 18px; margin-bottom: 15px; font-weight: 700;">THÔNG TIN THANH TOÁN</h3>
              <div style="margin-bottom: 8px; font-size: 15px; color: #333;"><span style="font-weight: 800;">Tên người nhận:</span> ${accountName}</div>
              <div style="margin-bottom: 8px; font-size: 15px; color: #333;"><span style="font-weight: 800;">Số tài khoản:</span> ${accountNo}</div>
            </div>
              </div>
              
          <!-- Table -->
          <div style="padding: 0 40px;">
            <table style="width: 100%; border-collapse: collapse; border-radius: 10px 10px 0 0; overflow: hidden; border: 2px solid #999;">
              <thead style="background-color: #103458; color: white;">
                <tr>
                  <th style="padding: 15px; text-align: center; font-weight: 600; border-right: 2px solid rgba(255,255,255,0.3);">Môn học</th>
                  <th style="padding: 15px; text-align: center; font-weight: 600; border-right: 2px solid rgba(255,255,255,0.3);">Lớp</th>
                  <th style="padding: 15px; text-align: center; font-weight: 600; border-right: 2px solid rgba(255,255,255,0.3);">Số buổi</th>
                  <th style="padding: 15px; text-align: center; font-weight: 600; border-right: 2px solid rgba(255,255,255,0.3);">Giá/buổi</th>
                  <th style="padding: 15px; text-align: center; font-weight: 600;">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${subjectsForTable.map((item, index) => {
                  return `
                    <tr style="background-color: ${index % 2 === 0 ? '#fff' : '#eef6fb'};">
                      <td style="padding: 12px 15px 12px 20px; text-align: left; color: #333; border-bottom: 2px solid #999; border-right: 2px solid #999;">
                        <div style="display: flex; align-items: center; gap: 10px; font-weight: 600;">
                          <i class="fa-solid ${getSubjectIcon(item.subject)}" style="color: #103458; width: 20px;"></i>
                          ${subjectMap[item.subject] || item.subject}
              </div>
                      </td>
                      <td style="padding: 12px 15px; text-align: center; color: #333; border-bottom: 2px solid #999; border-right: 2px solid #999; font-weight: 600;">${item.className}</td>
                      <td style="padding: 12px 15px; text-align: center; color: #333; border-bottom: 2px solid #999; border-right: 2px solid #999; font-weight: 600;">${item.sessions}</td>
                      <td style="padding: 12px 15px; text-align: center; color: #333; border-bottom: 2px solid #999; border-right: 2px solid #999; font-weight: 600;">${item.pricePerSession.toLocaleString("vi-VN")}</td>
                      <td style="padding: 12px 15px; text-align: center; color: #333; border-bottom: 2px solid #999; font-weight: 600;">${item.total.toLocaleString("vi-VN")}</td>
                    </tr>
                  `;
                }).join("")}
                ${discountAmount > 0 ? `
                <tr style="background-color: #fff0f6;">
                  <td colspan="4" style="padding: 12px 15px 12px 20px; text-align: left; color: #333; border-bottom: 2px solid #999; border-right: 2px solid #999; font-weight: 600;">Miễn giảm</td>
                  <td style="padding: 12px 15px; text-align: center; color: #c40000; border-bottom: 2px solid #999; font-weight: 700;">- ${discountAmount.toLocaleString("vi-VN")} đ</td>
                </tr>
                ` : ""}
                <tr style="background-color: #fff1f0; border-top: 2px solid #c40000;">
                  <td colspan="4" style="padding: 12px 15px 12px 20px; text-align: left; color: #c40000; border-bottom: 2px solid #999; border-right: 2px solid #999; font-weight: 700; font-size: 16px;">Tổng học phí tháng ${invoice.month + 1}</td>
                  <td style="padding: 12px 15px; text-align: center; color: #c40000; border-bottom: 2px solid #999; font-weight: 700; font-size: 16px;">${currentMonthTotal.toLocaleString("vi-VN")} đ</td>
                </tr>
              </tbody>
            </table>
            </div>
            
          <!-- Footer -->
          <div style="padding: 20px 40px 40px 40px;">
            ${totalDebt > 0 ? `
            <div style="display: flex; gap: 30px; margin-bottom: 30px;">
              <div style="flex: 1.2; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="background-color: #f25c78; color: white; display: inline-block; padding: 8px 15px; border-radius: 6px; font-weight: bold; margin-bottom: 10px; width: fit-content;">Chi tiết nợ</div>
                  <div style="width: 100%; background-color: #eef6fb; border: none; height: 40px; border-radius: 8px; margin-bottom: 10px; padding: 8px 12px; font-size: 14px; color: #333; display: flex; align-items: center;">${debtDetail1 || ""}</div>
                  <div style="width: 100%; background-color: #eef6fb; border: none; height: 40px; border-radius: 8px; margin-bottom: 10px; padding: 8px 12px; font-size: 14px; color: #333; display: flex; align-items: center;">${debtDetail2 || ""}</div>
              </div>
              </div>
            </div>
            ` : ""}

            <!-- QR Code + Tổng tiền cùng hàng, căn dưới -->
            <div style="display: flex; gap: 20px; align-items: flex-end; margin-bottom: 20px;">
              <div style="flex: 1; background-color: white; border: 2px solid #1890ff; padding: 15px; border-radius: 8px; display: flex; align-items: center; justify-content: center; min-height: 70px;">
                <span style="font-size: 18px; font-weight: bold; color: #333; margin-right: 5px;">
                  TỔNG TIỀN:
                </span>
                <span style="color: #c40000; font-weight: bold; font-size: 20px;">${combinedTotalDue.toLocaleString("vi-VN")} đ</span>
              </div>

              <div style="flex: 0 0 200px; border: 1px solid #ddd; border-radius: 15px; padding: 10px; text-align: center; background: white;">
                <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 5px; color: red; font-weight: bold; font-size: 12px;">
                  <span>VIETQR</span> <span>VIETQR</span>
                </div>
                <img src="${generateVietQR(combinedTotalDue.toString(), invoice.studentName, (invoice.month + 1).toString())}" alt="QR Code" style="width: 100%; height: auto; display: block;" crossOrigin="anonymous" />
                <div style="font-size: 12px; margin-top: 5px; font-weight: bold;">Quét mã để thanh toán</div>
              </div>
            </div>

            <!-- Ghi chú -->
            <div style="font-size: 11px; color: #666; text-align: center; line-height: 1.4; max-width: 100%;">
              Ghi chú: Vui lòng ghi rõ nội dung chuyển khoản: ${invoice.studentName} - T${invoice.month + 1}
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const generateTeacherSalaryHTML = (salary: TeacherSalary) => {
    const teacher = teachers.find((t) => t.id === salary.teacherId);
    const travelAllowancePerSession = Number(teacher?.["Trợ cấp đi lại"]) || 0;

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
      
      // Get salary per session from class (Lương GV) or calculate from session
      const classSalaryPerSession = classInfo?.["Lương GV"] || 0;
      
      // Use class-specific salary if available, otherwise use teacher's default
      const salaryPerSession = classSalaryPerSession > 0 
        ? classSalaryPerSession 
        : (Number(teacher?.["Lương theo buổi"]) || 0);

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

      classSummary[classId].sessionCount++;
      classSummary[classId].totalSalary += salaryPerSession;
      classSummary[classId].totalAllowance += travelAllowancePerSession;
    });

    const classData = Object.values(classSummary).sort((a, b) => 
      a.className.localeCompare(b.className)
    );
    
    // Use the pre-calculated values from salary object for accuracy
    const grandTotal = salary.totalSalary + salary.totalAllowance;

    // Build a compact table similar to the provided image
    const subjects = Array.from(
      new Set(
        salary.sessions
          .map((s) => classes.find((c) => c.id === s["Class ID"])?.["Môn học"])
          .filter(Boolean)
      )
    ).join(", ");

    // Layout: left details + right QR/bank block (if available)
    const hasBank = Boolean(teacher?.["Ngân hàng"] && teacher?.STK);

    const totalSessions = salary.totalSessions || salary.sessions?.length || 0;

    return `
      <div style="font-family: 'Times New Roman', serif; padding: 40px 20px 20px 20px; position: relative;">
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;">
          <img
            src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png"
            alt="Background Logo"
            style="width: auto; height: 520px; max-width: 520px; object-fit: contain; opacity: 0.08; filter: grayscale(50%); user-select: none; pointer-events: none;"
          />
        </div>
        <div style="position: relative; z-index: 1;">
          <h1 style="color: #c40000; text-align: center; margin: 6px 0 18px; font-size: 26px;">PHIẾU LƯƠNG THÁNG ${salary.month + 1}</h1>

          <div style="display:flex; gap:24px; align-items:flex-start;">
            <div style="flex:1; max-width: 720px;">
              <p style="color: #c40000; font-weight: 700; font-size: 16px; margin: 10px 0;">Họ và tên: ${salary.teacherName}</p>
              <p style="margin: 6px 0; font-size: 15px;"><strong>Môn Phụ Trách:</strong> ${
                subjectMap[subjects] ||
                subjects
                  .split(",")
                  .map((item) => subjectMap[item.trim()] || item.trim())
                  .join(", ") ||
                teacher?.["Môn phụ trách"] ||
                ""
              }</p>

              <div style="margin-bottom:12px;">
                <p style="margin:4px 0;"><strong>Tổng số buổi dạy:</strong> ${totalSessions} buổi</p>
                <p style="margin:4px 0;"><strong>Trợ cấp đi lại:</strong> ${travelAllowancePerSession.toLocaleString("vi-VN")} VNĐ/buổi</p>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin: 18px 0;">
                <thead>
                  <tr style="background: #fff;">
                    <th style="border: 1px solid #000; padding: 10px; text-align: left;">Lớp học</th>
                    <th style="border: 1px solid #000; padding: 10px; text-align: center;">Số buổi</th>
                    <th style="border: 1px solid #000; padding: 10px; text-align: right;">Tổng lương</th>
                  </tr>
                </thead>
                <tbody>
                  ${classData
                    .map(
                      (classItem) => `
                    <tr>
                      <td style="border: 1px solid #000; padding: 10px;">
                        <strong>${classItem.className}</strong>
                        ${classItem.classCode ? ` (${classItem.classCode})` : ''}
                        ${classItem.subject ? `<br/><span style="font-size: 12px; color: #666;">${subjectMap[classItem.subject] || classItem.subject}</span>` : ''}
                      </td>
                      <td style="border: 1px solid #000; padding: 10px; text-align: center;">${classItem.sessionCount}</td>
                      <td style="border: 1px solid #000; padding: 10px; text-align: right;">${(classItem.totalSalary + classItem.totalAllowance).toLocaleString("vi-VN")}</td>
                    </tr>
                  `
                    )
                    .join("")}
                  <tr style="background: #e8f5e9; font-weight: bold;">
                    <td style="border: 1px solid #000; padding: 12px; text-align: left; font-size: 16px;">TỔNG LƯƠNG</td>
                    <td style="border: 1px solid #000; padding: 12px; text-align: center; font-size: 16px;">${salary.totalSessions || salary.sessions?.length || 0}</td>
                    <td style="border: 1px solid #000; padding: 12px; text-align: right; font-size: 16px;">${grandTotal.toLocaleString("vi-VN")}</td>
                  </tr>
                </tbody>
              </table>

              <div style="margin-top: 12px; font-size: 14px;">
                <p style="margin: 6px 0;"><strong>Ghi chú:</strong> ${teacher?.["Ghi chú"] || "Thầy Cô kiểm tra kỹ thông tin và tiền lương. Nếu có sai sót báo lại với Trung Tâm"}</p>
                <p style="margin: 12px 0 0 0;">Thầy Cô ký xác nhận:</p>
              </div>
            </div>

            <div style="width: 260px; text-align: center; border-left: 1px solid #f0f0f0; padding-left: 20px;">
              ${
                hasBank
                  ? `
                <div style="margin-top: 10px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                  <p style="margin-bottom: 12px; font-size: 13px; color: #666;">Quét mã để nhận lương</p>
                  <p style="margin:0 0 12px 0; font-weight:700;">${teacher["Họ và tên"] || salary.teacherName}<br/>${teacher?.STK}</p>
                  <div style="display:flex; align-items:center; justify-content:center;">
                    <img src="${generateTeacherVietQR(
                      grandTotal,
                      salary.teacherName,
                      salary.month,
                      teacher["Ngân hàng"],
                      teacher.STK,
                      teacher["Họ và tên"] || salary.teacherName
                    )}" alt="VietQR" style="width:180px; height:180px; border:1px solid #eee; padding:8px; border-radius:6px; background:#fff;" />
                  </div>
                  <p style="margin-top:10px; font-size:13px; color:#666;">Ngân hàng: ${teacher["Ngân hàng"] || "N/A"} - STK: ${teacher?.STK || "N/A"}<br/>Người nhận: ${teacher["Họ và tên"] || salary.teacherName}</p>
                </div>
              `
                  : `
                <div style="margin-bottom: 20px; text-align: left;">
                  <p style="margin: 6px 0;"><strong>Thông tin ngân hàng:</strong></p>
                  <p style="margin: 4px 0;">Ngân hàng: ${teacher?.["Ngân hàng"] || "N/A"}</p>
                  <p style="margin: 4px 0;">Số tài khoản: ${teacher?.STK || "N/A"}</p>
                </div>
              `
              }
            </div>
          </div>

          <p style="text-align: center; color: #999; font-size: 12px; margin-top: 26px;">Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}</p>
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

  const printInvoice = (content: string) => {
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
        ${content}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
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
        width: 130,
        render: (amount: number) => (
          <Text style={{ color: "#36797f" }}>
            {amount.toLocaleString("vi-VN")} đ
          </Text>
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
          // Nợ = Thành tiền (chưa thanh toán)
          const debt = record.status === "unpaid" ? record.finalAmount : 0;
          return (
            <Text strong style={{ color: debt > 0 ? "#ff4d4f" : "#52c41a", fontSize: "14px" }}>
              {debt.toLocaleString("vi-VN")} đ
            </Text>
          );
        },
      },
      {
        title: "Thao tác",
        key: "actions",
        width: 250,
        render: (_: any, record: GroupedStudentInvoice) => {
          const firstInvoice = record.invoices[0];
          return (
            <Space>
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => viewStudentInvoice(firstInvoice)}
              >
                Xem
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingInvoice(firstInvoice);
                  // Initialize edit session prices from current data - grouped by subject
                  const prices: Record<string, number> = {};
                  firstInvoice.sessions?.forEach((session: AttendanceSession) => {
                    const classId = session["Class ID"];
                    const classData = classes.find(c => c.id === classId);
                    const subject = classData?.["Môn học"] || session["Môn học"] || "Chưa xác định";
                    
                    // Only set once per subject (take first session price)
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
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  // Mark all invoices for this student as paid
                  record.invoices.forEach((invoice) => {
                    updateStudentInvoiceStatus(invoice.id, "paid");
                  });
                }}
              >
                Xác nhận TT
              </Button>
              <Popconfirm
                title="Xác nhận xóa"
                description="Bạn có chắc chắn muốn xóa tất cả phiếu thu của học sinh này? Dữ liệu sẽ bị xóa vĩnh viễn."
                onConfirm={() => {
                  // Delete all invoices for this student
                  record.invoices.forEach((invoice) => {
                    handleDeleteInvoice(invoice.id);
                  });
                }}
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
          // Nợ = 0 nếu đã thanh toán, = finalAmount nếu chưa thanh toán
          const debt = record.status === "unpaid" ? record.finalAmount : 0;
          return (
            <Text strong style={{ color: debt > 0 ? "#ff4d4f" : "#52c41a", fontSize: "14px" }}>
              {debt.toLocaleString("vi-VN")} đ
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
              onChange={(e) => setStudentSearchTerm(e.target.value.trim())}
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
          <Button
            type="primary"
            danger
            icon={<DeleteOutlined />}
            onClick={handleDeleteMultipleInvoices}
          >
            Xóa {selectedRowKeys.length} phiếu đã chọn
          </Button>
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
        defaultActiveKey="students"
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
