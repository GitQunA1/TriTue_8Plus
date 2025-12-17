import WrapperContent from "@/components/WrapperContent";
import { database } from "@/firebase";
import { ref, onValue, update, push } from "firebase/database";
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

  // Expense categories
  const expenseCategories = [
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

  // Helper to parse salary/tuition values
  const parseSalaryValue = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    const numeric = String(value).replace(/[^\d.-]/g, "");
    return numeric ? Number(numeric) : 0;
  };

  // Calculate total teacher salaries from attendance sessions
  const totalTeacherSalaries = useMemo(() => {
    console.log("💰 Calculating teacher salaries for:", { selectedMonth, selectedYear, viewMode });
    
    // Filter completed sessions for the selected period
    const filteredSessions = attendanceSessions.filter((session) => {
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
    
    console.log("📊 Filtered sessions:", filteredSessions.length);
    
    // Calculate salary for each session
    let totalSalary = 0;
    filteredSessions.forEach((session) => {
      const classId = session["Class ID"];
      const classData = classes.find(c => c.id === classId);
      const teacherId = session["Teacher ID"];
      const teacher = teachers.find(t => t.id === teacherId);
      
      // Priority: Học phí mỗi buổi > Lương GV > Lương theo buổi
      const sessionSalary = parseSalaryValue(
        classData?.["Học phí mỗi buổi"] ??
        classData?.["Lương GV"] ??
        session["Lương GV"] ??
        teacher?.["Lương theo buổi"]
      );
      
      totalSalary += sessionSalary;
    });
    
    console.log("✅ Total teacher salaries:", totalSalary, "from", filteredSessions.length, "sessions");
    return totalSalary;
  }, [attendanceSessions, teachers, classes, selectedMonth, selectedYear, viewMode]);

  // Calculate total revenue (paid invoices only)
  const totalRevenue = useMemo(() => {
    console.log("🔍 Calculating revenue for:", { selectedMonth, selectedYear, viewMode });
    console.log("📊 Student invoices data:", studentInvoices);
    
    let total = 0;
    let paidCount = 0;
    
    Object.entries(studentInvoices).forEach(([key, invoice]: [string, any]) => {
      if (!invoice) return;
      
      // Normalize status - handle both string and object formats
      let status: "paid" | "unpaid" = "unpaid";
      let month: number | undefined;
      let year: number | undefined;
      let finalAmount = 0;
      
      if (typeof invoice === "string") {
        status = invoice as "paid" | "unpaid";
      } else if (typeof invoice === "object") {
        status = invoice.status || "unpaid";
        month = invoice.month;
        year = invoice.year;
        finalAmount = invoice.finalAmount || 0;
      }
      
      console.log("Invoice:", {
        key,
        status,
        month,
        year,
        finalAmount,
        matchesMonth: status === "paid" && month === selectedMonth && year === selectedYear,
        matchesYear: status === "paid" && year === selectedYear
      });
      
      // For year view, sum all months in the year
      if (viewMode === "year") {
        if (status === "paid" && year === selectedYear) {
          total += finalAmount;
          paidCount++;
        }
      } else {
        // For month view, only sum the selected month
        if (
          status === "paid" &&
          month === selectedMonth &&
          year === selectedYear
        ) {
          total += finalAmount;
          paidCount++;
        }
      }
    });
    
    console.log("✅ Total revenue:", total, "from", paidCount, "paid invoices");
    return total;
  }, [studentInvoices, selectedMonth, selectedYear, viewMode]);

  // Calculate total expenses (manual expenses + teacher salaries)
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
    
    // Add teacher salaries to total expenses
    const total = manualExpenses + totalTeacherSalaries;
    console.log("📊 Total expenses:", { manualExpenses, totalTeacherSalaries, total });
    return total;
  }, [expenses, totalTeacherSalaries, selectedMonth, selectedYear, viewMode]);

  // Net profit/loss
  const netProfit = totalRevenue - totalExpenses;

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

  // Group expenses by category (including teacher salaries)
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
    
    return Object.entries(grouped).map(([category, amount]) => ({
      category,
      amount,
    }));
  }, [filteredExpenses, totalTeacherSalaries]);

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
      const expenseRef = ref(
        database,
        `datasheet/Chi_phí_vận_hành/${expenseId}`
      );
      await update(expenseRef, null as any);
      message.success("Đã xóa chi phí");
    } catch (error) {
      console.error("Error deleting expense:", error);
      message.error("Lỗi khi xóa chi phí");
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
        ["Tổng thu (Học phí)", totalRevenue],
        ["Tổng chi (Vận hành)", totalExpenses],
        ["Lợi nhuận ròng", netProfit],
        ["Tỷ lệ lợi nhuận (%)", totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Tổng quan");

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
        ["TỔNG CỘNG", "", totalExpenses, ""],
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
                title="Tổng thu (Học phí)"
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

        {/* Export Button */}
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
            <Select placeholder="Chọn hạng mục">
              {expenseCategories.map((cat) => (
                <Option key={cat} value={cat}>
                  {cat}
                </Option>
              ))}
            </Select>
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
    </WrapperContent>
  );
};

export default FinancialSummaryPage;
