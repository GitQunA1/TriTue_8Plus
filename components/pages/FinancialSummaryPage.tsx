import WrapperContent from "@/components/WrapperContent";
import { database, DATABASE_URL_BASE } from "@/firebase";
import { ref, onValue, update, push, remove } from "firebase/database";
import {
  Card,
  Row,
  Col,
  DatePicker,
  Typography,
  Table,
  Space,
  Statistic,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  AutoComplete,
  message,
  Tag,
  Popconfirm,
  Upload,
  Image,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  DownloadOutlined,
  BarChartOutlined,
  FileImageOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd";
import React, { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { subjectOptions } from "@/utils/selectOptions";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const { Text } = Typography;
const { Option } = Select;

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  month: number;
  year: number;
  createdAt: string;
  createdBy?: string;
  invoiceImage?: string; // Base64 image data
}

// Colors for charts
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FFC658", "#FF6B6B", "#4ECDC4"];

const FinancialSummaryPage = () => {
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month());
  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [studentInvoices, setStudentInvoices] = useState<
    Record<string, any>
  >({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpenseModalVisible, setIsExpenseModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [previewImage, setPreviewImage] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [selectedClassForAttendance, setSelectedClassForAttendance] = useState<{
    classId: string;
    className: string;
  } | null>(null);
  const [syncingInvoices, setSyncingInvoices] = useState(false);
  const [classDetailModalOpen, setClassDetailModalOpen] = useState(false);
  const [selectedClassDetail, setSelectedClassDetail] = useState<{
    teacherId: string;
    teacherName: string;
    classId: string;
    className: string;
    sessions: any[];
  } | null>(null);

  // Expense categories - base categories + custom categories from localStorage
  const baseExpenseCategories = [
    "Lương giáo viên",
    "Lương nhân viên",
    "Thưởng",
    "Tiền thuê mặt bằng",
    "Tiền điện",
    "Tiền nước",
    "Internet",
    "Văn phòng phẩm",
    "Thiết bị dạy học",
    "Marketing",
    "Bảo trì & Sửa chữa",
    "Khác",
  ];

  // Load custom categories from localStorage
  const [expenseCategories, setExpenseCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("expenseCategories");
      if (saved) {
        const customCategories = JSON.parse(saved);
        // Merge with base categories, remove duplicates
        const allCategories = [...baseExpenseCategories];
        customCategories.forEach((cat: string) => {
          if (!allCategories.includes(cat)) {
            allCategories.push(cat);
          }
        });
        return allCategories;
      }
    } catch (error) {
      console.error("Error loading expense categories:", error);
    }
    return baseExpenseCategories;
  });

  // Function to add new category
  const addExpenseCategory = (newCategory: string) => {
    if (!newCategory || newCategory.trim() === "") return;
    
    const trimmedCategory = newCategory.trim();
    if (expenseCategories.includes(trimmedCategory)) return;

    const updatedCategories = [...expenseCategories, trimmedCategory];
    setExpenseCategories(updatedCategories);
    
    // Save custom categories to localStorage (only new ones, not base ones)
    const customCategories = updatedCategories.filter(
      (cat) => !baseExpenseCategories.includes(cat)
    );
    localStorage.setItem("expenseCategories", JSON.stringify(customCategories));
  };

  // Load student invoices from Firebase
  useEffect(() => {
    const invoicesRef = ref(database, "datasheet/Phiếu_thu_học_phí");
    const unsubscribe = onValue(invoicesRef, (snapshot) => {
      const data = snapshot.val();
      console.log("🔥 Firebase student invoices loaded:", data);
      if (data) {
        setStudentInvoices(data);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load expenses from Firebase
  useEffect(() => {
    const expensesRef = ref(database, "datasheet/Chi_phí_vận_hành");
    const unsubscribe = onValue(expensesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const expensesList = Object.entries(data).map(([id, expense]: [string, any]) => ({
          id,
          ...expense,
        }));
        setExpenses(expensesList);
      } else {
        setExpenses([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load attendance sessions from Firebase
  useEffect(() => {
    const sessionsRef = ref(database, "datasheet/Điểm_danh_sessions");
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sessionsList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setAttendanceSessions(sessionsList);
      } else {
        setAttendanceSessions([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load teachers from Firebase
  useEffect(() => {
    const teachersRef = ref(database, "datasheet/Giáo_viên");
    const unsubscribe = onValue(teachersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const teachersList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setTeachers(teachersList);
      } else {
        setTeachers([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load classes from Firebase
  useEffect(() => {
    const classesRef = ref(database, "datasheet/Lớp_học");
    const unsubscribe = onValue(classesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const classesList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setClasses(classesList);
      } else {
        setClasses([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load students and courses for invoice sync
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    const studentsRef = ref(database, "datasheet/Danh_sách_học_sinh");
    const unsubscribeStudents = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const studentsList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setStudents(studentsList);
      } else {
        setStudents([]);
      }
    });

    const coursesRef = ref(database, "datasheet/Khóa_học");
    const unsubscribeCourses = onValue(coursesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const coursesList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        setCourses(coursesList);
      } else {
        setCourses([]);
      }
    });

    return () => {
      unsubscribeStudents();
      unsubscribeCourses();
    };
  }, []);

  // Helper to parse salary/tuition values
  const parseSalaryValue = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    const numeric = String(value).replace(/[^\d.-]/g, "");
    return numeric ? Number(numeric) : 0;
  };

  // Filter completed sessions for the selected period
  const filteredSessions = useMemo(() => {
    return attendanceSessions.filter((session) => {
      const status = session["Trạng thái"];
      const isCompleted = status === "completed" || status === "completed_session" || !status;
      
      if (!isCompleted || !session["Ngày"]) return false;
      
      const sessionDate = new Date(session["Ngày"]);
      const sessionMonth = sessionDate.getMonth();
      const sessionYear = sessionDate.getFullYear();
      
      if (viewMode === "year") {
        return sessionYear === selectedYear;
      } else {
        return sessionMonth === selectedMonth && sessionYear === selectedYear;
      }
    });
  }, [attendanceSessions, selectedMonth, selectedYear, viewMode]);

  // Calculate detailed teacher salaries (grouped by teacher only)
  // Chỉ hiển thị các lớp phụ trách, không tách theo từng buổi
  const teacherSalaryDetails = useMemo(() => {
    // Map theo teacherId để group theo giáo viên
    const salaryMap: Record<string, {
      teacherId: string;
      teacherName: string;
      classes: Array<{
        classId: string;
        className: string;
        totalSessions: number;
        totalSalary: number;
        tuitionPerSession: number;
      }>;
      totalSessions: number;
      totalSalary: number;
      sessions: any[]; // Lưu tất cả sessions để hiển thị chi tiết
    }> = {};

    filteredSessions.forEach((session) => {
      const classId = session["Class ID"];
      const classData = classes.find(c => c.id === classId);
      
      if (!classData) return;

      // Lấy giáo viên phụ trách từ lớp, không phải từ session
      const teacherId = classData["Teacher ID"];
      if (!teacherId) return;

      const teacher = teachers.find(t => t.id === teacherId);
      const teacherName = teacher?.["Họ và tên"] || teacher?.["Tên giáo viên"] || classData["Giáo viên chủ nhiệm"] || "Không xác định";

      // Lấy hệ số lương giáo viên từ bảng Lớp học
      const teacherSalaryPerSession = parseSalaryValue(classData["Lương GV"]);
      if (!teacherSalaryPerSession) return; // Bỏ qua nếu không có lương giáo viên

      if (!salaryMap[teacherId]) {
        salaryMap[teacherId] = {
          teacherId,
          teacherName,
          classes: [],
          totalSessions: 0,
          totalSalary: 0,
          sessions: [],
        };
      }

      // Thêm session vào danh sách
      salaryMap[teacherId].sessions.push(session);

      // Tìm hoặc tạo class entry
      let classEntry = salaryMap[teacherId].classes.find(c => c.classId === classId);
      if (!classEntry) {
        const className = classData["Tên lớp"] || classData["Mã lớp"] || "Không xác định";
        classEntry = {
          classId,
          className,
          totalSessions: 0,
          totalSalary: 0,
          tuitionPerSession: teacherSalaryPerSession,
        };
        salaryMap[teacherId].classes.push(classEntry);
      }

      // Cập nhật số buổi và lương cho lớp này
      // Lương = Số buổi điểm danh × Hệ số lương giáo viên
      classEntry.totalSessions += 1;
      classEntry.totalSalary += teacherSalaryPerSession * 1;

      // Cập nhật tổng
      salaryMap[teacherId].totalSessions += 1;
      salaryMap[teacherId].totalSalary += teacherSalaryPerSession * 1;
    });

    return Object.values(salaryMap).sort((a, b) => {
      return a.teacherName.localeCompare(b.teacherName);
    });
  }, [filteredSessions, teachers, classes]);

  // Calculate total teacher salaries from attendance sessions
  const totalTeacherSalaries = useMemo(() => {
    return teacherSalaryDetails.reduce((sum, detail) => sum + detail.totalSalary, 0);
  }, [teacherSalaryDetails]);

  // Calculate revenue from invoices (by class)
  const revenueByClass = useMemo(() => {
    const classRevenueMap: Record<string, {
      classId: string;
      className: string;
      totalSessions: number;
      totalStudents: Set<string>; // Tổng số học sinh (unique)
      totalRevenue: number;
      avgRevenuePerSession: number;
    }> = {};

    // Process all invoices
    Object.values(studentInvoices).forEach((invoice: any) => {
      if (!invoice || typeof invoice !== "object") return;
      
      const invoiceMonth = invoice.month ?? 0;
      const invoiceYear = invoice.year ?? 0;
      
      // Filter by selected period
      if (viewMode === "year") {
        if (invoiceYear !== selectedYear) return;
      } else {
        if (invoiceMonth !== selectedMonth || invoiceYear !== selectedYear) return;
      }

      // Get invoice totals (already calculated correctly)
      const invoiceTotalSessions = invoice.totalSessions || 0;
      const invoiceTotalAmount = invoice.totalAmount || 0;
      const studentId = invoice.studentId;
      
      if (invoiceTotalSessions === 0 || invoiceTotalAmount === 0) return;

      // Get classes from invoice sessions to distribute the amount
      const invoiceSessions = invoice.sessions || [];
      const classDistribution: Record<string, { sessions: number; amount: number }> = {};
      
      // Count sessions per class from invoice sessions
      invoiceSessions.forEach((session: any) => {
        const classId = session["Class ID"];
        if (!classId) return;
        
        if (!classDistribution[classId]) {
          classDistribution[classId] = { sessions: 0, amount: 0 };
        }
        classDistribution[classId].sessions += 1;
      });

      // Calculate average price per session for this invoice
      const avgPricePerSession = invoiceTotalAmount / invoiceTotalSessions;

      // Distribute invoice amount and sessions to classes
      Object.entries(classDistribution).forEach(([classId, dist]) => {
        const classData = classes.find(c => c.id === classId);
        if (!classData) return;

        const className = classData["Tên lớp"] || classData["Mã lớp"] || "Không xác định";
        
        // Get price per session from class for display
        const course = courses.find((c) => {
          if (c["Khối"] !== classData["Khối"]) return false;
          const classSubject = classData["Môn học"];
          const courseSubject = c["Môn học"];
          if (courseSubject === classSubject) return true;
          const subjectOption = subjectOptions.find(
            (opt) => opt.label === classSubject || opt.value === classSubject
          );
          if (subjectOption) {
            return courseSubject === subjectOption.label || courseSubject === subjectOption.value;
          }
          return false;
        });
        
        const pricePerSession = course?.Giá || parseSalaryValue(classData["Học phí mỗi buổi"]) || avgPricePerSession;

        if (!classRevenueMap[classId]) {
          classRevenueMap[classId] = {
            classId,
            className,
            totalSessions: 0,
            totalStudents: new Set<string>(),
            totalRevenue: 0,
            avgRevenuePerSession: pricePerSession,
          };
        }

        // Add sessions and revenue proportionally
        classRevenueMap[classId].totalSessions += dist.sessions;
        classRevenueMap[classId].totalStudents.add(studentId);
        // Distribute amount proportionally based on sessions
        const classAmount = (dist.sessions / invoiceTotalSessions) * invoiceTotalAmount;
        classRevenueMap[classId].totalRevenue += classAmount;
      });
    });

    // Convert Set to number for totalStudents
    const result = Object.values(classRevenueMap).map(item => ({
      ...item,
      totalStudents: item.totalStudents.size || 0,
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Debug: Log totals for verification
    const totalRevenueFromTable = result.reduce((sum, item) => sum + item.totalRevenue, 0);
    const totalSessionsFromTable = result.reduce((sum, item) => sum + item.totalSessions, 0);
    const totalStudentsFromTable = result.reduce((sum, item) => sum + item.totalStudents, 0);
    
    console.log("📊 Revenue by Class (from invoices):", {
      totalRevenue: totalRevenueFromTable,
      totalSessions: totalSessionsFromTable,
      totalStudents: totalStudentsFromTable,
      classes: result.length,
    });

    return result;
  }, [studentInvoices, classes, courses, selectedMonth, selectedYear, viewMode]);

  // Calculate total revenue from attendance sessions
  const totalRevenue = useMemo(() => {
    return revenueByClass.reduce((sum, classRev) => sum + classRev.totalRevenue, 0);
  }, [revenueByClass]);

  // Calculate total revenue from student invoices (for comparison)
  const totalRevenueFromInvoices = useMemo(() => {
    let total = 0;
    Object.values(studentInvoices).forEach((invoice: any) => {
      if (!invoice || typeof invoice !== "object") return;
      
      const invoiceMonth = invoice.month ?? 0;
      const invoiceYear = invoice.year ?? 0;
      
      // Filter by selected period
      if (viewMode === "year") {
        if (invoiceYear !== selectedYear) return;
      } else {
        if (invoiceMonth !== selectedMonth || invoiceYear !== selectedYear) return;
      }
      
      // Add totalAmount (before discount)
      total += invoice.totalAmount || 0;
    });
    
    return total;
  }, [studentInvoices, selectedMonth, selectedYear, viewMode]);

  // Calculate total discount from student invoices (auto expense)
  const totalDiscount = useMemo(() => {
    let discount = 0;
    Object.values(studentInvoices).forEach((invoice: any) => {
      if (!invoice || typeof invoice !== "object") return;
      
      const invoiceMonth = invoice.month ?? 0;
      const invoiceYear = invoice.year ?? 0;
      
      // Filter by selected period
      if (viewMode === "year") {
        if (invoiceYear !== selectedYear) return;
      } else {
        if (invoiceMonth !== selectedMonth || invoiceYear !== selectedYear) return;
      }
      
      // Add discount amount
      discount += invoice.discount || 0;
    });
    
    return discount;
  }, [studentInvoices, selectedMonth, selectedYear, viewMode]);

  // Calculate total expenses (manual expenses + teacher salaries + discount from invoices)
  const totalExpenses = useMemo(() => {
    let manualExpenses = 0;
    if (viewMode === "year") {
      manualExpenses = expenses
        .filter((expense) => expense.year === selectedYear)
        .reduce((sum, expense) => sum + expense.amount, 0);
    } else {
      manualExpenses = expenses
        .filter(
          (expense) =>
            expense.month === selectedMonth && expense.year === selectedYear
        )
        .reduce((sum, expense) => sum + expense.amount, 0);
    }
    
    // Add teacher salaries and discount from invoices to total expenses
    const total = manualExpenses + totalTeacherSalaries + totalDiscount;
    console.log("📊 Total expenses:", { manualExpenses, totalTeacherSalaries, totalDiscount, total });
    return total;
  }, [expenses, totalTeacherSalaries, totalDiscount, selectedMonth, selectedYear, viewMode]);

  // Net profit/loss
  const netProfit = totalRevenue - totalExpenses;

  // Find students who attended but don't have invoices
  const studentsWithoutInvoices = useMemo(() => {
    const attendedStudents = new Set<string>();
    const studentsWithInvoices = new Set<string>();

    // Collect all students who attended sessions
    filteredSessions.forEach((session) => {
      const attendanceRecords = session["Điểm danh"] || [];
      attendanceRecords.forEach((record: any) => {
        const studentId = record["Student ID"];
        const isPresent = record["Có mặt"] === true || record["Có mặt"] === "true";
        const isExcused = record["Vắng có phép"] === true || record["Vắng có phép"] === "true";
        
        if (studentId && (isPresent || isExcused)) {
          attendedStudents.add(studentId);
        }
      });
    });

    // Collect all students who have invoices
    Object.values(studentInvoices).forEach((invoice: any) => {
      if (!invoice || typeof invoice !== "object") return;
      
      const invoiceMonth = invoice.month ?? 0;
      const invoiceYear = invoice.year ?? 0;
      
      // Filter by selected period
      if (viewMode === "year") {
        if (invoiceYear !== selectedYear) return;
      } else {
        if (invoiceMonth !== selectedMonth || invoiceYear !== selectedYear) return;
      }
      
      if (invoice.studentId) {
        studentsWithInvoices.add(invoice.studentId);
      }
    });

    // Find students who attended but don't have invoices
    const missingStudents: Array<{
      studentId: string;
      studentName: string;
      studentCode: string;
      sessionsCount: number;
      classes: string[];
    }> = [];

    attendedStudents.forEach((studentId) => {
      if (!studentsWithInvoices.has(studentId)) {
        const student = students.find(s => s.id === studentId);
        
        // Count sessions for this student
        let sessionsCount = 0;
        const classSet = new Set<string>();
        
        filteredSessions.forEach((session) => {
          const attendanceRecords = session["Điểm danh"] || [];
          const hasAttended = attendanceRecords.some((record: any) => {
            const recordStudentId = record["Student ID"];
            const isPresent = record["Có mặt"] === true || record["Có mặt"] === "true";
            const isExcused = record["Vắng có phép"] === true || record["Vắng có phép"] === "true";
            return recordStudentId === studentId && (isPresent || isExcused);
          });
          
          if (hasAttended) {
            sessionsCount++;
            const classId = session["Class ID"];
            const classData = classes.find(c => c.id === classId);
            if (classData) {
              classSet.add(classData["Tên lớp"] || classData["Mã lớp"] || classId);
            }
          }
        });

        missingStudents.push({
          studentId,
          studentName: student?.["Họ và tên"] || "Không xác định",
          studentCode: student?.["Mã học sinh"] || "",
          sessionsCount,
          classes: Array.from(classSet),
        });
      }
    });

    return missingStudents.sort((a, b) => b.sessionsCount - a.sessionsCount);
  }, [filteredSessions, studentInvoices, students, classes, selectedMonth, selectedYear, viewMode]);

  // Filter expenses for selected month/year
  const filteredExpenses = useMemo(() => {
    if (viewMode === "year") {
      return expenses.filter((expense) => expense.year === selectedYear);
    }
    return expenses.filter(
      (expense) =>
        expense.month === selectedMonth && expense.year === selectedYear
    );
  }, [expenses, selectedMonth, selectedYear, viewMode]);

  // Group expenses by category (including teacher salaries and discount)
  const expensesByCategory = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredExpenses.forEach((expense) => {
      if (!grouped[expense.category]) {
        grouped[expense.category] = 0;
      }
      grouped[expense.category] += expense.amount;
    });
    
    // Add teacher salaries as a separate category
    if (totalTeacherSalaries > 0) {
      grouped["Lương giáo viên (Từ điểm danh)"] = totalTeacherSalaries;
    }
    
    // Add discount from invoices as a separate category (auto expense)
    if (totalDiscount > 0) {
      grouped["Tiền miễn giảm (Từ hóa đơn)"] = totalDiscount;
    }
    
    return Object.entries(grouped).map(([category, amount]) => ({
      category,
      amount,
    }));
  }, [filteredExpenses, totalTeacherSalaries, totalDiscount]);

  // Sync invoices from attendance sessions
  const syncInvoicesFromSessions = async () => {
    if (syncingInvoices) return;
    
    try {
      setSyncingInvoices(true);
      message.loading("Đang đồng bộ hóa đơn từ điểm danh...", 0);

      const invoicesToUpdate: Array<{
        key: string;
        invoice: any;
      }> = [];

      // Process each filtered session
      filteredSessions.forEach((session) => {
        const classId = session["Class ID"];
        const classData = classes.find(c => c.id === classId);
        
        if (!classData || !session["Ngày"]) return;

        // Get price per session
        const course = courses.find((c) => {
          if (c["Khối"] !== classData["Khối"]) return false;
          const classSubject = classData["Môn học"];
          const courseSubject = c["Môn học"];
          if (courseSubject === classSubject) return true;
          const subjectOption = subjectOptions.find(
            (opt) => opt.label === classSubject || opt.value === classSubject
          );
          if (subjectOption) {
            return courseSubject === subjectOption.label || courseSubject === subjectOption.value;
          }
          return false;
        });
        
        const pricePerSession = course?.Giá || parseSalaryValue(classData["Học phí mỗi buổi"]);
        if (!pricePerSession) return;

        // Get session date info
        const sessionDate = new Date(session["Ngày"]);
        const sessionMonth = sessionDate.getMonth();
        const sessionYear = sessionDate.getFullYear();

        // Filter by selected period
        if (viewMode === "year") {
          if (sessionYear !== selectedYear) return;
        } else {
          if (sessionMonth !== selectedMonth || sessionYear !== selectedYear) return;
        }

        // Process attendance records
        const attendanceRecords = session["Điểm danh"] || [];
        attendanceRecords.forEach((record: any) => {
          const studentId = record["Student ID"];
          const isPresent = record["Có mặt"] === true || record["Có mặt"] === "true";
          const isExcused = record["Vắng có phép"] === true || record["Vắng có phép"] === "true";

          // Only create invoice for students who are present or excused
          if (!studentId || (!isPresent && !isExcused)) return;

          const student = students.find(s => s.id === studentId);
          if (!student) return;

          const invoiceKey = `${studentId}-${sessionMonth}-${sessionYear}`;
          const existingInvoice = studentInvoices[invoiceKey];
          const existingStatus = typeof existingInvoice === "object" && existingInvoice !== null 
            ? existingInvoice.status 
            : existingInvoice;
          const isPaid = existingStatus === "paid";

          // Don't modify paid invoices
          if (isPaid) return;

          const sessionInfo = {
            Ngày: session["Ngày"],
            "Tên lớp": classData["Tên lớp"],
            "Mã lớp": classData["Mã lớp"],
            "Class ID": classId,
          };

          // Find or create invoice entry
          let invoiceEntry = invoicesToUpdate.find(i => i.key === invoiceKey);
          if (!invoiceEntry) {
            if (existingInvoice && typeof existingInvoice === "object") {
              invoiceEntry = {
                key: invoiceKey,
                invoice: {
                  ...existingInvoice,
                  sessions: Array.isArray(existingInvoice.sessions) ? existingInvoice.sessions : [],
                },
              };
            } else {
              invoiceEntry = {
                key: invoiceKey,
                invoice: {
                  id: invoiceKey,
                  studentId,
                  studentName: student["Họ và tên"] || "",
                  studentCode: student["Mã học sinh"] || "",
                  month: sessionMonth,
                  year: sessionYear,
                  totalSessions: 0,
                  totalAmount: 0,
                  discount: existingInvoice && typeof existingInvoice === "object" ? (existingInvoice.discount || 0) : 0,
                  finalAmount: 0,
                  status: existingStatus === "paid" ? "paid" : "unpaid",
                  sessions: [],
                },
              };
            }
            invoicesToUpdate.push(invoiceEntry);
          }

          // Check if session already exists
          const sessionExists = invoiceEntry.invoice.sessions.some(
            (s: any) => s["Ngày"] === session["Ngày"] && s["Class ID"] === classId
          );

          if (!sessionExists) {
            invoiceEntry.invoice.sessions.push(sessionInfo);
            invoiceEntry.invoice.totalSessions = (invoiceEntry.invoice.totalSessions || 0) + 1;
            invoiceEntry.invoice.totalAmount = (invoiceEntry.invoice.totalAmount || 0) + pricePerSession;
            invoiceEntry.invoice.finalAmount = Math.max(
              0,
              invoiceEntry.invoice.totalAmount - (invoiceEntry.invoice.discount || 0)
            );
          }
        });
      });

      // Update all invoices
      const updatePromises = invoicesToUpdate.map(({ key, invoice }) => {
        const invoiceRef = ref(database, `datasheet/Phiếu_thu_học_phí/${key}`);
        return update(invoiceRef, invoice);
      });

      await Promise.all(updatePromises);

      message.destroy();
      message.success(`Đã đồng bộ ${invoicesToUpdate.length} hóa đơn từ điểm danh`);
    } catch (error) {
      console.error("Error syncing invoices:", error);
      message.destroy();
      message.error("Lỗi khi đồng bộ hóa đơn");
    } finally {
      setSyncingInvoices(false);
    }
  };

  // Convert file to base64
  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle add/edit expense
  const handleExpenseSubmit = async (values: any) => {
    try {
      let invoiceImageData = editingExpense?.invoiceImage || "";
      
      // If there's a new image uploaded
      if (fileList.length > 0 && fileList[0].originFileObj) {
        invoiceImageData = await getBase64(fileList[0].originFileObj as File);
      }

      const expenseData = {
        category: values.category,
        description: values.description || "",
        amount: values.amount,
        month: selectedMonth,
        year: selectedYear,
        invoiceImage: invoiceImageData,
        createdAt: editingExpense?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingExpense) {
        // Update existing expense
        const expenseRef = ref(
          database,
          `datasheet/Chi_phí_vận_hành/${editingExpense.id}`
        );
        await update(expenseRef, expenseData);
        message.success("Đã cập nhật chi phí");
      } else {
        // Add new expense
        const expensesRef = ref(database, "datasheet/Chi_phí_vận_hành");
        await push(expensesRef, expenseData);
        message.success("Đã thêm chi phí");
      }

      setIsExpenseModalVisible(false);
      setEditingExpense(null);
      setFileList([]);
      form.resetFields();
    } catch (error) {
      console.error("Error saving expense:", error);
      message.error("Lỗi khi lưu chi phí");
    }
  };

  // Handle delete expense
  const handleDeleteExpense = async (expenseId: string) => {
    try {
      if (!expenseId) {
        message.error("Không tìm thấy ID chi phí để xóa");
        return;
      }

      // Try Firebase SDK first
      try {
        const expenseRef = ref(
          database,
          `datasheet/Chi_phí_vận_hành/${expenseId}`
        );
        await remove(expenseRef);
        message.success("Đã xóa chi phí thành công");
        return;
      } catch (sdkError: any) {
        console.warn("Firebase SDK delete failed, trying REST API:", sdkError);
        
        // Fallback: Use REST API
        const deleteUrl = `${DATABASE_URL_BASE}/datasheet/Chi_phí_vận_hành/${encodeURIComponent(expenseId)}.json`;
        const deleteResponse = await fetch(deleteUrl, {
          method: "DELETE",
        });

        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text();
          throw new Error(`HTTP ${deleteResponse.status}: ${errorText}`);
        }

        message.success("Đã xóa chi phí thành công");
      }
    } catch (error: any) {
      console.error("Error deleting expense:", error);
      const errorMessage = error?.message || error?.toString() || "Lỗi không xác định";
      
      // Check for permission errors
      if (errorMessage.includes("permission") || errorMessage.includes("Permission") || errorMessage.includes("403")) {
        message.error("Không có quyền xóa chi phí. Vui lòng kiểm tra quyền truy cập Firebase.");
      } else if (errorMessage.includes("network") || errorMessage.includes("Network") || errorMessage.includes("Failed to fetch")) {
        message.error("Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.");
      } else {
        message.error(`Lỗi khi xóa chi phí: ${errorMessage}`);
      }
    }
  };

  // Open modal for add/edit
  const openExpenseModal = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      form.setFieldsValue({
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
      });
      
      // Load existing image if available
      if (expense.invoiceImage) {
        setFileList([
          {
            uid: "-1",
            name: "invoice.png",
            status: "done",
            url: expense.invoiceImage,
          },
        ]);
      } else {
        setFileList([]);
      }
    } else {
      setEditingExpense(null);
      setFileList([]);
      form.resetFields();
    }
    setIsExpenseModalVisible(true);
  };

  // Handle image preview
  const handlePreview = async (file: UploadFile) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file.originFileObj as File);
    }
    setPreviewImage(file.url || (file.preview as string));
    setPreviewOpen(true);
  };

  // Expense table columns
  const expenseColumns = [
    {
      title: "Hạng mục",
      dataIndex: "category",
      key: "category",
      width: 200,
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      width: 300,
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      width: 150,
      align: "right" as const,
      render: (amount: number) => (
        <Text strong style={{ color: "#f5222d" }}>
          {amount.toLocaleString("vi-VN")} đ
        </Text>
      ),
    },
    {
      title: "Hóa đơn",
      dataIndex: "invoiceImage",
      key: "invoiceImage",
      width: 100,
      align: "center" as const,
      render: (image?: string) =>
        image ? (
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setPreviewImage(image);
              setPreviewOpen(true);
            }}
          >
            Xem
          </Button>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 150,
      render: (_: any, record: Expense) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openExpenseModal(record)}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xác nhận xóa?"
            description="Bạn có chắc chắn muốn xóa chi phí này?"
            onConfirm={() => handleDeleteExpense(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Category summary columns
  const categoryColumns = [
    {
      title: "Hạng mục",
      dataIndex: "category",
      key: "category",
      width: 250,
    },
    {
      title: "Tổng chi",
      dataIndex: "amount",
      key: "amount",
      width: 200,
      align: "right" as const,
      render: (amount: number) => (
        <Text strong style={{ color: "#f5222d" }}>
          {amount.toLocaleString("vi-VN")} đ
        </Text>
      ),
    },
  ];

  // Teacher salary detail columns
  const teacherSalaryColumns = [
    {
      title: "Giáo viên",
      dataIndex: "teacherName",
      key: "teacherName",
      width: 200,
    },
    {
      title: "Lớp học",
      dataIndex: "classes",
      key: "classes",
      width: 250,
      render: (classes: Array<{ className: string; classId: string }>, record: any) => (
        <div>
          {classes.map((cls, index) => (
            <Tag 
              key={index} 
              color="blue" 
              style={{ 
                marginBottom: "4px", 
                display: "inline-block",
                cursor: "pointer"
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Find sessions for this specific class
                const classSessions = record.sessions.filter((session: any) => 
                  session["Class ID"] === cls.classId
                );
                setSelectedClassDetail({
                  teacherId: record.teacherId,
                  teacherName: record.teacherName,
                  classId: cls.classId,
                  className: cls.className,
                  sessions: classSessions,
                });
                setClassDetailModalOpen(true);
              }}
            >
              {cls.className}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: "Số buổi dạy",
      dataIndex: "totalSessions",
      key: "totalSessions",
      width: 120,
      align: "center" as const,
    },
    {
      title: "Lương",
      key: "salaryPerSession",
      width: 150,
      align: "right" as const,
      render: (_: any, record: any) => {
        const avgSalaryPerSession = record.totalSessions > 0 
          ? record.totalSalary / record.totalSessions 
          : 0;
        return (
          <Text style={{ color: "#1890ff" }}>
            {avgSalaryPerSession.toLocaleString("vi-VN")} đ/buổi
          </Text>
        );
      },
    },
    {
      title: "Tổng lương",
      dataIndex: "totalSalary",
      key: "totalSalary",
      width: 180,
      align: "right" as const,
      render: (amount: number) => (
        <Text strong style={{ color: "#f5222d" }}>
          {amount.toLocaleString("vi-VN")} đ
        </Text>
      ),
    },
  ];

  // Revenue by class columns (thêm thông tin giáo viên phụ trách)
  const revenueByClassWithTeacher = useMemo(() => {
    return revenueByClass.map(classRev => {
      const classData = classes.find(c => c.id === classRev.classId);
      const teacherId = classData?.["Teacher ID"];
      const teacher = teachers.find(t => t.id === teacherId);
      const teacherName = teacher?.["Họ và tên"] || teacher?.["Tên giáo viên"] || classData?.["Giáo viên chủ nhiệm"] || "-";
      
      return {
        ...classRev,
        teacherId: teacherId || "",
        teacherName,
      };
    });
  }, [revenueByClass, classes, teachers]);

  const revenueByClassColumns = [
    {
      title: "Lớp học",
      dataIndex: "className",
      key: "className",
      width: 200,
      render: (text: string, record: any) => (
        <Text 
          style={{ 
            color: "#1890ff", 
            cursor: "pointer",
            textDecoration: "underline"
          }}
          onClick={() => {
            setSelectedClassForAttendance({
              classId: record.classId,
              className: record.className,
            });
            setAttendanceModalOpen(true);
          }}
        >
          {text}
        </Text>
      ),
    },
    {
      title: "Giáo viên phụ trách",
      dataIndex: "teacherName",
      key: "teacherName",
      width: 200,
    },
    {
      title: "Số buổi học",
      dataIndex: "totalSessions",
      key: "totalSessions",
      width: 120,
      align: "center" as const,
    },
    {
      title: "Số học sinh",
      dataIndex: "totalStudents",
      key: "totalStudents",
      width: 120,
      align: "center" as const,
      render: (count: number) => (
        <Text>{count}</Text>
      ),
    },
    {
      title: "Học phí/buổi",
      dataIndex: "avgRevenuePerSession",
      key: "avgRevenuePerSession",
      width: 180,
      align: "right" as const,
      render: (amount: number) => (
        <Text>{amount.toLocaleString("vi-VN")} đ</Text>
      ),
    },
    {
      title: "Tổng học phí",
      dataIndex: "totalRevenue",
      key: "totalRevenue",
      width: 180,
      align: "right" as const,
      render: (amount: number) => (
        <Text strong style={{ color: "#3f8600" }}>
          {amount.toLocaleString("vi-VN")} đ
        </Text>
      ),
    },
  ];

  // Export to Excel function
  const exportToExcel = () => {
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ["BÁO CÁO TÀI CHÍNH"],
        [viewMode === "month" ? `Tháng ${selectedMonth + 1}/${selectedYear}` : `Năm ${selectedYear}`],
        [],
        ["Chỉ số", "Giá trị (VNĐ)"],
        ["Tổng thu (Học phí từ điểm danh)", totalRevenue],
        ["Tổng chi (Vận hành)", totalExpenses],
        ["Lợi nhuận ròng", netProfit],
        ["Tỷ lệ lợi nhuận (%)", totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Tổng quan");

      // Revenue by class sheet
      const revenueData = [
        ["HỌC PHÍ THEO LỚP (TỪ ĐIỂM DANH)"],
        [viewMode === "month" ? `Tháng ${selectedMonth + 1}/${selectedYear}` : `Năm ${selectedYear}`],
        [],
        ["Lớp học", "Giáo viên phụ trách", "Số buổi học", "Số học sinh", "Học phí/buổi (VNĐ)", "Tổng học phí (VNĐ)"],
        ...revenueByClassWithTeacher.map((item) => [
          item.className,
          item.teacherName,
          item.totalSessions,
          item.totalStudents,
          item.avgRevenuePerSession,
          item.totalRevenue,
        ]),
        [],
        ["TỔNG CỘNG", "", revenueByClass.reduce((sum, item) => sum + item.totalSessions, 0), revenueByClass.reduce((sum, item) => sum + item.totalStudents, 0), "", totalRevenue],
      ];
      const revenueSheet = XLSX.utils.aoa_to_sheet(revenueData);
      XLSX.utils.book_append_sheet(wb, revenueSheet, "Học phí theo lớp");

      // Teacher salary details sheet
      const salaryData = [
        ["CHI TIẾT LƯƠNG GIÁO VIÊN"],
        [viewMode === "month" ? `Tháng ${selectedMonth + 1}/${selectedYear}` : `Năm ${selectedYear}`],
        [],
        ["Giáo viên", "Lớp học", "Số buổi dạy", "Lương/buổi (VNĐ)", "Tổng lương (VNĐ)"],
        ...teacherSalaryDetails.map((item) => {
          const avgSalaryPerSession = item.totalSessions > 0 
            ? item.totalSalary / item.totalSessions 
            : 0;
          return [
          item.teacherName,
          item.classes.map(c => c.className).join(", "),
          item.totalSessions,
            avgSalaryPerSession,
          item.totalSalary,
          ];
        }),
        [],
        ["TỔNG CỘNG", "", teacherSalaryDetails.reduce((sum, item) => sum + item.totalSessions, 0), "", "", totalTeacherSalaries],
      ];
      const salarySheet = XLSX.utils.aoa_to_sheet(salaryData);
      XLSX.utils.book_append_sheet(wb, salarySheet, "Lương giáo viên");

      // Expenses by category sheet
      const categoryData = [
        ["CHI PHÍ THEO HẠNG MỤC"],
        [viewMode === "month" ? `Tháng ${selectedMonth + 1}/${selectedYear}` : `Năm ${selectedYear}`],
        [],
        ["Hạng mục", "Số tiền (VNĐ)"],
        ...expensesByCategory.map((item) => [item.category, item.amount]),
        [],
        ["TỔNG CỘNG", totalExpenses],
      ];
      const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
      XLSX.utils.book_append_sheet(wb, categorySheet, "Chi phí theo hạng mục");

      // Detailed expenses sheet
      const detailData = [
        ["CHI TIẾT CHI PHÍ VẬN HÀNH"],
        [viewMode === "month" ? `Tháng ${selectedMonth + 1}/${selectedYear}` : `Năm ${selectedYear}`],
        [],
        ["Hạng mục", "Mô tả", "Số tiền (VNĐ)", "Ngày tạo"],
        ...filteredExpenses.map((expense) => [
          expense.category,
          expense.description || "",
          expense.amount,
          dayjs(expense.createdAt).format("DD/MM/YYYY HH:mm"),
        ]),
        [],
        ["TỔNG CỘNG", "", filteredExpenses.reduce((sum, e) => sum + e.amount, 0), ""],
      ];
      const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
      XLSX.utils.book_append_sheet(wb, detailSheet, "Chi tiết chi phí");

      // Save file
      const fileName = `Bao_cao_tai_chinh_${viewMode === "month" ? `Thang_${selectedMonth + 1}_${selectedYear}` : `Nam_${selectedYear}`}.xlsx`;
      XLSX.writeFile(wb, fileName);
      message.success("Đã xuất file Excel thành công!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      message.error("Lỗi khi xuất file Excel");
    }
  };

  // Prepare chart data for monthly trend (for year view)
  const monthlyTrendData = useMemo(() => {
    if (viewMode !== "year") return [];

    const monthlyData: Record<number, { revenue: number; expense: number }> = {};
    
    // Initialize all months
    for (let i = 0; i < 12; i++) {
      monthlyData[i] = { revenue: 0, expense: 0 };
    }

    // Calculate revenue by month
    Object.entries(studentInvoices).forEach(([, invoice]: [string, any]) => {
      if (!invoice || typeof invoice === "string") return;
      
      if (invoice.status === "paid" && invoice.year === selectedYear && invoice.month !== undefined) {
        monthlyData[invoice.month].revenue += invoice.finalAmount || 0;
      }
    });

    // Calculate expenses by month
    expenses.forEach((expense) => {
      if (expense.year === selectedYear) {
        monthlyData[expense.month].expense += expense.amount;
      }
    });

    return Object.entries(monthlyData).map(([month, data]) => ({
      month: `T${parseInt(month) + 1}`,
      "Doanh thu": data.revenue,
      "Chi phí": data.expense,
      "Lợi nhuận": data.revenue - data.expense,
    }));
  }, [studentInvoices, expenses, selectedYear, viewMode]);

  // Prepare pie chart data for expenses
  const expensePieData = useMemo(() => {
    return expensesByCategory.map((item) => ({
      name: item.category,
      value: item.amount,
    }));
  }, [expensesByCategory]);

  return (
    <WrapperContent title="Tổng hợp tài chính">
      <Space direction="vertical" style={{ width: "100%" }} size="large">
        {/* Date Filter */}
        <Card>
          <Row gutter={16} align="middle">
            <Col>
              <Space>
                <Text strong>Xem theo:</Text>
                <Select
                  value={viewMode}
                  onChange={(value) => setViewMode(value)}
                  style={{ width: 120 }}
                >
                  <Option value="month">Tháng</Option>
                  <Option value="year">Năm</Option>
                </Select>
              </Space>
            </Col>
            {viewMode === "month" && (
              <Col>
                <Space>
                  <Text strong>Chọn tháng:</Text>
                  <DatePicker
                    picker="month"
                    value={dayjs().month(selectedMonth).year(selectedYear)}
                    onChange={(date) => {
                      if (date) {
                        setSelectedMonth(date.month());
                        setSelectedYear(date.year());
                      }
                    }}
                    format="MM/YYYY"
                  />
                </Space>
              </Col>
            )}
            {viewMode === "year" && (
              <Col>
                <Space>
                  <Text strong>Chọn năm:</Text>
                  <DatePicker
                    picker="year"
                    value={dayjs().year(selectedYear)}
                    onChange={(date) => {
                      if (date) {
                        setSelectedYear(date.year());
                      }
                    }}
                    format="YYYY"
                  />
                </Space>
              </Col>
            )}
            <Col>
              <Button
                type="default"
                onClick={() => {
                  setSelectedMonth(dayjs().month());
                  setSelectedYear(dayjs().year());
                  setViewMode("month");
                }}
              >
                Tháng hiện tại
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Summary Cards */}
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Tổng thu (Từ điểm danh)"
                value={totalRevenue}
                precision={0}
                valueStyle={{ color: "#3f8600" }}
                prefix={<RiseOutlined />}
                suffix="đ"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Tổng thu (Từ hóa đơn)"
                value={totalRevenueFromInvoices}
                precision={0}
                valueStyle={{ color: "#3f8600" }}
                prefix={<RiseOutlined />}
                suffix="đ"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Tổng chi (Vận hành)"
                value={totalExpenses}
                precision={0}
                valueStyle={{ color: "#cf1322" }}
                prefix={<FallOutlined />}
                suffix="đ"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Lợi nhuận ròng"
                value={netProfit}
                precision={0}
                valueStyle={{ color: netProfit >= 0 ? "#3f8600" : "#cf1322" }}
                prefix={<DollarOutlined />}
                suffix="đ"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Tỷ lệ lợi nhuận"
                value={totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0}
                precision={1}
                valueStyle={{ color: netProfit >= 0 ? "#3f8600" : "#cf1322" }}
                suffix="%"
              />
            </Card>
          </Col>
        </Row>

        {/* Export Button and Sync Button */}
        <Card>
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={exportToExcel}
              size="large"
            >
              Xuất báo cáo Excel
            </Button>
            <Text type="secondary">
              Xuất báo cáo tài chính chi tiết sang file Excel
            </Text>
            {totalRevenue !== totalRevenueFromInvoices && (
              <Button
                type="default"
                icon={<RiseOutlined />}
                onClick={syncInvoicesFromSessions}
                size="large"
                loading={syncingInvoices}
              >
                Đồng bộ hóa đơn từ điểm danh
              </Button>
            )}
          </Space>
        </Card>

        {/* Charts Section */}
        {viewMode === "year" && monthlyTrendData.length > 0 && (
          <Card
            title={
              <Space>
                <BarChartOutlined />
                <Text strong>Biểu đồ xu hướng theo tháng - Năm {selectedYear}</Text>
              </Space>
            }
          >
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => `${value.toLocaleString("vi-VN")} đ`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Doanh thu"
                  stroke="#3f8600"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="Chi phí"
                  stroke="#cf1322"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="Lợi nhuận"
                  stroke="#1890ff"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Expense Distribution Charts */}
        {expensePieData.length > 0 && (
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <Text strong>Biểu đồ phân bổ chi phí (Tròn)</Text>
                    <Tag color="red">
                      {viewMode === "month"
                        ? `Tháng ${selectedMonth + 1}/${selectedYear}`
                        : `Năm ${selectedYear}`}
                    </Tag>
                  </Space>
                }
              >
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name}: ${(percent * 100).toFixed(1)}%`
                      }
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {expensePieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) =>
                        `${value.toLocaleString("vi-VN")} đ`
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <Text strong>Biểu đồ chi phí theo hạng mục (Cột)</Text>
                    <Tag color="red">
                      {viewMode === "month"
                        ? `Tháng ${selectedMonth + 1}/${selectedYear}`
                        : `Năm ${selectedYear}`}
                    </Tag>
                  </Space>
                }
              >
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={expensesByCategory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="category"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) =>
                        `${value.toLocaleString("vi-VN")} đ`
                      }
                    />
                    <Bar dataKey="amount" fill="#cf1322">
                      {expensesByCategory.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        )}

        {/* Revenue by Class */}
        <Card
          title={
            <Space>
              <Text strong>Học phí từ hóa đơn</Text>
              <Tag color="green">
                {viewMode === "month"
                  ? `Tháng ${selectedMonth + 1}/${selectedYear}`
                  : `Năm ${selectedYear}`}
              </Tag>
            </Space>
          }
        >
          <Table
            columns={revenueByClassColumns}
            dataSource={revenueByClassWithTeacher}
            pagination={false}
            rowKey="classId"
            size="small"
            loading={loading}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2} align="right">
                    <Text strong>Tổng cộng:</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="center">
                    <Text strong>
                      {revenueByClass.reduce((sum, item) => sum + item.totalSessions, 0)}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="center">
                    <Text strong>
                      {revenueByClass.reduce((sum, item) => sum + item.totalStudents, 0)}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text>-</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Text strong style={{ color: "#3f8600", fontSize: "16px" }}>
                      {totalRevenueFromInvoices.toLocaleString("vi-VN")} đ
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Card>

        {/* Students without invoices */}
        {studentsWithoutInvoices.length > 0 && (
          <Card
            title={
              <Space>
                <Text strong style={{ color: "#faad14" }}>
                  ⚠️ Học sinh đã điểm danh nhưng chưa có hóa đơn ({studentsWithoutInvoices.length} học sinh)
                </Text>
                <Tag color="orange">
                  {viewMode === "month"
                    ? `Tháng ${selectedMonth + 1}/${selectedYear}`
                    : `Năm ${selectedYear}`}
                </Tag>
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<RiseOutlined />}
                onClick={syncInvoicesFromSessions}
                loading={syncingInvoices}
              >
                Tạo hóa đơn cho tất cả
              </Button>
            }
          >
            <Table
              columns={[
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
                  title: "Số buổi đã điểm danh",
                  dataIndex: "sessionsCount",
                  key: "sessionsCount",
                  width: 150,
                  align: "center" as const,
                  render: (count: number) => (
                    <Tag color="blue">{count} buổi</Tag>
                  ),
                },
                {
                  title: "Lớp học",
                  dataIndex: "classes",
                  key: "classes",
                  width: 300,
                  render: (classes: string[]) => (
                    <Space wrap>
                      {classes.map((cls, index) => (
                        <Tag key={index} color="cyan">{cls}</Tag>
                      ))}
                    </Space>
                  ),
                },
              ]}
              dataSource={studentsWithoutInvoices}
              pagination={{ pageSize: 10 }}
              rowKey="studentId"
              size="small"
            />
          </Card>
        )}

        {/* Teacher Salary Details */}
        <Card
          title={
            <Space>
              <Text strong>Chi tiết lương giáo viên</Text>
              <Tag color="red">
                {viewMode === "month"
                  ? `Tháng ${selectedMonth + 1}/${selectedYear}`
                  : `Năm ${selectedYear}`}
              </Tag>
            </Space>
          }
        >
          <Table
            columns={teacherSalaryColumns}
            dataSource={teacherSalaryDetails}
            pagination={false}
            rowKey="teacherId"
            size="small"
            loading={loading}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2} align="right">
                    <Text strong>Tổng cộng:</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="center">
                    <Text strong>
                      {teacherSalaryDetails.reduce((sum, item) => sum + item.totalSessions, 0)}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text>-</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong style={{ color: "#f5222d", fontSize: "16px" }}>
                      {totalTeacherSalaries.toLocaleString("vi-VN")} đ
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Card>

        {/* Class Detail Modal */}
        <Modal
          title={
            <Space>
              <Text strong>Chi tiết lớp học</Text>
              {selectedClassDetail && (
                <Tag color="blue">{selectedClassDetail.className}</Tag>
              )}
            </Space>
          }
          open={classDetailModalOpen}
          onCancel={() => {
            setClassDetailModalOpen(false);
            setSelectedClassDetail(null);
          }}
          footer={null}
          width={800}
        >
          {selectedClassDetail && (
            <div>
              <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
                <Text><strong>Giáo viên:</strong> {selectedClassDetail.teacherName}</Text>
                <Text><strong>Lớp:</strong> {selectedClassDetail.className}</Text>
                <Text><strong>Số buổi:</strong> {selectedClassDetail.sessions.length} buổi</Text>
              </Space>
              
              <Table
                columns={[
                  {
                    title: "Ngày",
                    dataIndex: "Ngày",
                    key: "date",
                    width: 120,
                    render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
                  },
                  {
                    title: "Giờ học",
                    key: "time",
                    width: 150,
                    render: (_: any, session: any) => 
                      `${session["Giờ bắt đầu"] || "-"} - ${session["Giờ kết thúc"] || "-"}`,
                  },
                  {
                    title: "Học phí/buổi",
                    key: "tuition",
                    width: 150,
                    align: "right" as const,
                    render: (_: any, session: any) => {
                      const classId = session["Class ID"];
                      const classData = classes.find(c => c.id === classId);
                      const tuition = parseSalaryValue(classData?.["Học phí mỗi buổi"]);
                      return <Text>{tuition.toLocaleString("vi-VN")} đ</Text>;
                    },
                  },
                ]}
                dataSource={selectedClassDetail.sessions.sort((a, b) => {
                  const dateA = dayjs(a["Ngày"]);
                  const dateB = dayjs(b["Ngày"]);
                  return dateB.isBefore(dateA) ? -1 : dateB.isAfter(dateA) ? 1 : 0;
                })}
                rowKey={(session) => session.id || `${session["Ngày"]}_${session["Class ID"]}`}
                pagination={false}
                size="small"
              />
            </div>
          )}
        </Modal>

        {/* Expense by Category */}
        <Card
          title={
            <Space>
              <Text strong>Chi phí theo hạng mục</Text>
              <Tag color="red">
                {viewMode === "month"
                  ? `Tháng ${selectedMonth + 1}/${selectedYear}`
                  : `Năm ${selectedYear}`}
              </Tag>
            </Space>
          }
        >
          <Table
            columns={categoryColumns}
            dataSource={expensesByCategory}
            pagination={false}
            rowKey="category"
            size="small"
            loading={loading}
          />
        </Card>

        {/* Detailed Expenses */}
        <Card
          title={
            <Space>
              <Text strong>Chi tiết chi phí vận hành</Text>
              <Tag color="red">
                {viewMode === "month"
                  ? `Tháng ${selectedMonth + 1}/${selectedYear}`
                  : `Năm ${selectedYear}`}
              </Tag>
            </Space>
          }
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openExpenseModal()}
            >
              Thêm chi phí
            </Button>
          }
        >
          <Table
            columns={expenseColumns}
            dataSource={filteredExpenses}
            pagination={{ pageSize: 10 }}
            rowKey="id"
            loading={loading}
          />
        </Card>
      </Space>

      {/* Add/Edit Expense Modal */}
      <Modal
        title={editingExpense ? "Sửa chi phí" : "Thêm chi phí"}
        open={isExpenseModalVisible}
        onCancel={() => {
          setIsExpenseModalVisible(false);
          setEditingExpense(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleExpenseSubmit}
          initialValues={{
            category: expenseCategories[0],
          }}
        >
          <Form.Item
            label="Hạng mục"
            name="category"
            rules={[{ required: true, message: "Vui lòng chọn hạng mục" }]}
          >
            <AutoComplete
              placeholder="Chọn hoặc nhập hạng mục mới"
              options={expenseCategories.map((cat) => ({ value: cat, label: cat }))}
              filterOption={(inputValue, option) =>
                option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              onSelect={(value: string) => {
                // Value selected from dropdown
                form.setFieldsValue({ category: value });
              }}
              onBlur={(e) => {
                // When user clicks away, if they typed a new value, add it
                const inputValue = ((e.currentTarget as HTMLInputElement).value || "").trim();
                if (inputValue && !expenseCategories.includes(inputValue)) {
                  addExpenseCategory(inputValue);
                  form.setFieldsValue({ category: inputValue });
                  message.success(`Đã thêm hạng mục mới: ${inputValue}`);
                }
              }}
              onKeyDown={(e) => {
                // When user presses Enter on a new value
                if ((e as any).key === 'Enter') {
                  const inputValue = ((e.currentTarget as HTMLInputElement).value || "").trim();
                  if (inputValue && !expenseCategories.includes(inputValue)) {
                    e.preventDefault();
                    addExpenseCategory(inputValue);
                    form.setFieldsValue({ category: inputValue });
                    message.success(`Đã thêm hạng mục mới: ${inputValue}`);
                  }
                }
              }}
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item label="Mô tả" name="description">
            <Input.TextArea
              rows={3}
              placeholder="Nhập mô tả chi tiết (không bắt buộc)"
            />
          </Form.Item>

          <Form.Item
            label="Số tiền"
            name="amount"
            rules={[
              { required: true, message: "Vui lòng nhập số tiền" },
              { type: "number", min: 0, message: "Số tiền phải lớn hơn 0" },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              formatter={(value) =>
                `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
              }
              parser={(value) => value!.replace(/\$\s?|(,*)/g, "")}
              placeholder="Nhập số tiền"
              addonAfter="đ"
            />
          </Form.Item>

          <Form.Item label="Ảnh hóa đơn">
            <Upload
              listType="picture-card"
              fileList={fileList}
              onPreview={handlePreview}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              beforeUpload={() => false}
              maxCount={1}
              accept="image/*"
            >
              {fileList.length === 0 && (
                <div>
                  <FileImageOutlined />
                  <div style={{ marginTop: 8 }}>Tải ảnh lên</div>
                </div>
              )}
            </Upload>
            <Text type="secondary" style={{ fontSize: "12px" }}>
              Tải lên ảnh hóa đơn/chứng từ (không bắt buộc)
            </Text>
          </Form.Item>

          <Form.Item>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button
                onClick={() => {
                  setIsExpenseModalVisible(false);
                  setEditingExpense(null);
                  setFileList([]);
                  form.resetFields();
                }}
              >
                Hủy
              </Button>
              <Button type="primary" htmlType="submit">
                {editingExpense ? "Cập nhật" : "Thêm"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        open={previewOpen}
        title="Xem ảnh hóa đơn"
        footer={null}
        onCancel={() => setPreviewOpen(false)}
        width={800}
      >
        <Image
          alt="Invoice"
          style={{ width: "100%" }}
          src={previewImage}
        />
      </Modal>

      {/* Attendance List Modal */}
      <Modal
        open={attendanceModalOpen}
        title={`Danh sách điểm danh - ${selectedClassForAttendance?.className || ""}`}
        footer={null}
        onCancel={() => {
          setAttendanceModalOpen(false);
          setSelectedClassForAttendance(null);
        }}
        width={1000}
      >
        {selectedClassForAttendance && (() => {
          // Lấy tất cả sessions của lớp này trong tháng/năm đã chọn
          const classSessions = filteredSessions.filter(
            (session) => session["Class ID"] === selectedClassForAttendance.classId
          );

          // Tạo danh sách điểm danh từ tất cả sessions
          const attendanceList: any[] = [];
          classSessions.forEach((session) => {
            const attendanceRecords = session["Điểm danh"] || [];
            attendanceRecords.forEach((record: any) => {
              const attendance = record["Có mặt"] === true || record["Có mặt"] === "true"
                ? record["Đi muộn"] === true || record["Đi muộn"] === "true"
                  ? "Đi muộn"
                  : "Có mặt"
                : record["Vắng có phép"] === true || record["Vắng có phép"] === "true"
                ? "Vắng có phép"
                : "Vắng";

              attendanceList.push({
                key: `${session.id}_${record["Student ID"]}`,
                date: session["Ngày"],
                time: `${session["Giờ bắt đầu"] || "-"} - ${session["Giờ kết thúc"] || "-"}`,
                studentName: record["Tên học sinh"] || record["Student Name"] || "-",
                studentCode: record["Mã học sinh"] || record["Student Code"] || "-",
                attendance,
                homework: record["% Hoàn thành BTVN"] ?? "-",
                test: record["Bài kiểm tra"] || record["Điểm kiểm tra"] || "-",
                bonus: record["Điểm thưởng"] ?? "-",
                note: record["Ghi chú"] || "-",
              });
            });
          });

          // Sắp xếp theo ngày (mới nhất trước)
          attendanceList.sort((a, b) => {
            const dateA = dayjs(a.date);
            const dateB = dayjs(b.date);
            return dateB.isBefore(dateA) ? -1 : dateB.isAfter(dateA) ? 1 : 0;
          });

          const attendanceColumns = [
            {
              title: "Ngày",
              dataIndex: "date",
              key: "date",
              width: 120,
              render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
            },
            {
              title: "Giờ học",
              dataIndex: "time",
              key: "time",
              width: 150,
            },
            {
              title: "Mã HS",
              dataIndex: "studentCode",
              key: "studentCode",
              width: 100,
            },
            {
              title: "Họ và tên",
              dataIndex: "studentName",
              key: "studentName",
              width: 200,
            },
            {
              title: "Điểm danh",
              dataIndex: "attendance",
              key: "attendance",
              width: 120,
              align: "center" as const,
              render: (attendance: string) => {
                const color = 
                  attendance === "Có mặt" ? "green" :
                  attendance === "Đi muộn" ? "orange" :
                  attendance === "Vắng có phép" ? "blue" : "red";
                return <Tag color={color}>{attendance}</Tag>;
              },
            },
            {
              title: "% BTVN",
              dataIndex: "homework",
              key: "homework",
              width: 100,
              align: "center" as const,
            },
            {
              title: "Bài kiểm tra",
              dataIndex: "test",
              key: "test",
              width: 120,
              align: "center" as const,
            },
            {
              title: "Điểm thưởng",
              dataIndex: "bonus",
              key: "bonus",
              width: 100,
              align: "center" as const,
            },
            {
              title: "Ghi chú",
              dataIndex: "note",
              key: "note",
              width: 200,
            },
          ];

          return (
            <Table
              columns={attendanceColumns}
              dataSource={attendanceList}
              rowKey="key"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Tổng ${total} bản ghi điểm danh`,
              }}
              scroll={{ x: 1000, y: 500 }}
              size="small"
            />
          );
        })()}
      </Modal>
    </WrapperContent>
  );
};

export default FinancialSummaryPage;
