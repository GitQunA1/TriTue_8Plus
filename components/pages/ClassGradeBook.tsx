import { useState, useEffect, useMemo } from "react";
import {
  Button,
  Table,
  Modal,
  Tabs,
  Tag,
  Space,
  Input,
  InputNumber,
  Popconfirm,
  message,
  Card,
  Row,
  Col,
  Popover,
  Descriptions,
  DatePicker,
  Radio,
  Empty,
} from "antd";
import type { Dayjs } from "dayjs";
import {
  PlusOutlined,
  DeleteOutlined,
  DownloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useParams, useNavigate } from "react-router-dom";
import { ref, onValue, set } from "firebase/database";
import { database } from "../../firebase";
import WrapperContent from "@/components/WrapperContent";
import { subjectMap } from "@/utils/selectOptions";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh": string;
}

const ClassGradeBook = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [classData, setClassData] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<any[]>([]);
  const [customScores, setCustomScores] = useState<any[]>([]);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingCell, setEditingCell] = useState<{
    studentId: string;
    column: string;
  } | null>(null);
  const [tempValue, setTempValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRangeFilter, setDateRangeFilter] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [monthFilter, setMonthFilter] = useState<Dayjs | null>(null);
  const [filterType, setFilterType] = useState<"all" | "dateRange" | "month">("all");
  const [isStudentDetailModalOpen, setIsStudentDetailModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const hasInvalidManualChars = (label: string) => /[.#$\[\]]/.test(label);
  const normalizeColumnLabel = (label: string) => (label ? label.replace(/\//g, "-") : label);
  const normalizeScoreKeys = (entry: any) => {
    if (!entry) return entry;
    const normalized: Record<string, any> = { studentId: entry.studentId };
    Object.keys(entry).forEach((key) => {
      if (key === "studentId") return;
      const normalizedKey = normalizeColumnLabel(key);
      normalized[normalizedKey] = entry[key];
    });
    return normalized;
  };

  // Load class data
  useEffect(() => {
    if (!classId) return;
    const classRef = ref(database, `datasheet/Lớp_học/${classId}`);
    const unsubscribe = onValue(classRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setClassData({ id: classId, ...data });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [classId]);

  // Load students
  useEffect(() => {
    const studentsRef = ref(database, "datasheet/Danh_sách_học_sinh");
    const unsubscribe = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const studentList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Student, "id">),
        }));
        setStudents(studentList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load attendance sessions
  useEffect(() => {
    const sessionsRef = ref(database, "datasheet/Điểm_danh_sessions");
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sessionsList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as any),
        }));
        setAttendanceSessions(sessionsList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Track which columns are from session history (read-only)
  const [autoColumns, setAutoColumns] = useState<string[]>([]);

  // Load custom scores and auto-populate from session history
  useEffect(() => {
    if (!classId || !classData || attendanceSessions.length === 0) return;
    
    // Get all test scores from session history for this class
    // Map: columnKey -> studentId -> score
    const testScoresMap = new Map<string, Map<string, number>>();
    const testColumns = new Set<string>();
    
    attendanceSessions.forEach((session) => {
      // Only process sessions for this class
      if (session["Class ID"] !== classId) return;
      
      const sessionDate = session["Ngày"];
      
      session["Điểm danh"]?.forEach((record: any) => {
        const studentId = record["Student ID"];
        if (!studentId || !sessionDate) return;
        
        // Get score - prioritize "Điểm kiểm tra", then "Điểm", then calculate from "Chi tiết điểm"
        let score: number | null = null;
        
        if (record["Điểm kiểm tra"] != null && record["Điểm kiểm tra"] !== "") {
          score = Number(record["Điểm kiểm tra"]);
        } else if (record["Điểm"] != null && record["Điểm"] !== "") {
          score = Number(record["Điểm"]);
        } else if (record["Chi tiết điểm"] && Array.isArray(record["Chi tiết điểm"]) && record["Chi tiết điểm"].length > 0) {
          const scores = record["Chi tiết điểm"]
            .map((s: any) => Number(s["Điểm"]))
            .filter((s: number) => !isNaN(s));
          if (scores.length > 0) {
            score = scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
          }
        }
        
        if (score != null && !isNaN(score)) {
          // Create column key with date and optional test name
          const formattedDate = dayjs(sessionDate).format("DD-MM-YYYY");
          const testName = record["Bài kiểm tra"] || "";
          const columnKey = testName 
            ? `${testName} (${formattedDate})`
            : `Điểm (${formattedDate})`;
          const normalizedColumnKey = normalizeColumnLabel(columnKey);
          
          testColumns.add(normalizedColumnKey);
          
          if (!testScoresMap.has(normalizedColumnKey)) {
            testScoresMap.set(normalizedColumnKey, new Map());
          }
          testScoresMap.get(normalizedColumnKey)!.set(studentId, score);
        }
      });
    });
    
    // Build scores array
    const studentIds = classData["Student IDs"] || [];
    const scoresArray = studentIds.map((studentId: string) => {
      const scoreObj: any = { studentId };
      
      testColumns.forEach((columnKey) => {
        const score = testScoresMap.get(columnKey)?.get(studentId);
        scoreObj[columnKey] = score ?? null;
      });
      
      return scoreObj;
    });
    
    const autoColumnsArray = Array.from(testColumns);
    setAutoColumns(autoColumnsArray); // Track auto columns
    const columnsArray = [...autoColumnsArray];
    
    // Load manual scores from Firebase and merge
    const scoresRef = ref(database, `datasheet/Điểm_tự_nhập/${classId}`);
    const unsubscribe = onValue(scoresRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data && data.scores && data.columns) {
        // Merge manual scores with auto-populated scores
        const manualScores = data.scores.map((score: any) => normalizeScoreKeys(score));
        const manualColumns = data.columns.map((col: string) => normalizeColumnLabel(col));
        
        // Add manual columns that don't exist in test names
        manualColumns.forEach((col: string) => {
          if (!columnsArray.includes(col)) {
            columnsArray.push(col);
          }
        });
        
        // Merge scores
        const mergedScores = scoresArray.map((autoScore: any) => {
          const manualScore = manualScores.find((s: any) => s.studentId === autoScore.studentId);
          return { ...autoScore, ...manualScore };
        });
        
        setCustomScores(mergedScores);
        setCustomColumns(columnsArray);
        setHasUnsavedChanges(false);
      } else {
        // No manual scores, use auto-populated only
        setCustomScores(scoresArray);
        setCustomColumns(columnsArray);
        setHasUnsavedChanges(false);
      }
    });
    
    return () => unsubscribe();
  }, [classId, classData, attendanceSessions]);

  // Save custom scores to Firebase
  const saveCustomScores = async (scores: any[], columns: string[]) => {
    if (!classId) return;
    try {
      const scoresRef = ref(database, `datasheet/Điểm_tự_nhập/${classId}`);
      // Sử dụng set() thay vì update() để ghi đè toàn bộ dữ liệu
      const normalizedScores = scores.map((score) => normalizeScoreKeys(score));
      const normalizedColumns = columns.map((col) => normalizeColumnLabel(col));
      await set(scoresRef, {
        scores: normalizedScores,
        columns: normalizedColumns,
        lastUpdated: new Date().toISOString(),
      });
      setHasUnsavedChanges(false);
      message.success("Đã lưu điểm thành công");
    } catch (error) {
      console.error("Error saving custom scores:", error);
      message.error("Lỗi khi lưu điểm");
    }
  };

  // Add new column
  const handleAddColumn = () => {
    const trimmedName = newColumnName.trim();
    if (!trimmedName) {
      message.warning("Vui lòng nhập tên cột");
      return;
    }
    if (hasInvalidManualChars(trimmedName)) {
      message.error("Tên cột không được chứa các ký tự . # $ [ ]");
      return;
    }

    const normalizedName = normalizeColumnLabel(trimmedName);

    if (customColumns.includes(normalizedName)) {
      message.warning("Tên cột đã tồn tại");
      return;
    }
    
    const newColumns = [...customColumns, normalizedName];
    
    // Đảm bảo tất cả học sinh đều có entry trong customScores
    const studentIds = classData?.["Student IDs"] || [];
    const updatedScores = studentIds.map((studentId: string) => {
      const existingScore = customScores.find((s: any) => s.studentId === studentId);
      return existingScore || { studentId };
    });
    
    setCustomColumns(newColumns);
    setCustomScores(updatedScores);
    saveCustomScores(updatedScores, newColumns);
    setNewColumnName("");
    setIsAddColumnModalOpen(false);
  };

  // Delete column
  const handleDeleteColumn = (columnName: string) => {
    const newColumns = customColumns.filter((c) => c !== columnName);
    const newScores = customScores.map((score) => {
      const { [columnName]: _, ...rest } = score;
      return rest;
    });
    setCustomColumns(newColumns);
    setCustomScores(newScores);
    saveCustomScores(newScores, newColumns);
  };

  // Update score
  const handleUpdateScore = (
    studentId: string,
    column: string,
    value: number | null
  ) => {
    const newScores = [...customScores];
    const existingIndex = newScores.findIndex((s) => s.studentId === studentId);

    if (existingIndex >= 0) {
      newScores[existingIndex] = {
        ...newScores[existingIndex],
        [column]: value,
      };
    } else {
      newScores.push({
        studentId,
        [column]: value,
      });
    }

    setCustomScores(newScores);
    setHasUnsavedChanges(true);
    setEditingCell(null);
    setTempValue(null);
  };

  // Get custom score
  const getCustomScore = (studentId: string, column: string) => {
    const score = customScores.find((s) => s.studentId === studentId);
    return score?.[column] ?? null;
  };

  // Handle save all scores
  const handleSaveAllScores = async () => {
    await saveCustomScores(customScores, customColumns);
  };

  // Get grade data
  const gradeData = useMemo(() => {
    if (!classData) return [];

    const studentIds = classData["Student IDs"] || [];

    const result = studentIds
      .map((studentId: string) => {
        const student = students.find((s) => String(s.id) === String(studentId));
        if (!student) {
          console.warn(`Student not found for ID: ${studentId}`);
          return null;
        }

        const studentName = student["Họ và tên"] || student["Tên học sinh"] || student["Tên"] || "-";
        const studentCode = student["Mã học sinh"] || student["Mã HS"] || "-";

        return {
          studentId,
          studentName,
          studentCode,
        };
      })
      .filter(Boolean);

    console.log("📊 Grade Data:", result);
    console.log("📊 Students list:", students.length);
    console.log("📊 Class Student IDs:", studentIds);
    return result;
  }, [classData, students]);

  // Get filtered columns based on date/month filter
  const filteredColumns = useMemo(() => {
    if (filterType === "all") {
      return customColumns;
    }
    
    return customColumns.filter((column) => {
            // Extract date from column name: "Tên bài (DD-MM-YYYY)" or "Điểm (DD/MM/YYYY)"
            const match = column.match(/\((\d{2}[\/-]\d{2}[\/-]\d{4})\)$/);
      if (!match) return true; // Keep columns without date format
      
            const normalizedDate = match[1].replace(/\//g, "-");
            const [day, month, year] = normalizedDate.split('-');
      const columnDate = dayjs(`${year}-${month}-${day}`);
      
      if (filterType === "dateRange" && dateRangeFilter[0] && dateRangeFilter[1]) {
        const startDate = dateRangeFilter[0].startOf("day");
        const endDate = dateRangeFilter[1].endOf("day");
        return (columnDate.isAfter(startDate) || columnDate.isSame(startDate, "day")) && 
               (columnDate.isBefore(endDate) || columnDate.isSame(endDate, "day"));
      }
      
      if (filterType === "month" && monthFilter) {
        return columnDate.year() === monthFilter.year() && columnDate.month() === monthFilter.month();
      }
      
      return true;
    });
  }, [customColumns, filterType, dateRangeFilter, monthFilter]);

  // Get score by date
  const getScoreByDate = (studentId: string, sessionId: string) => {
    const session = attendanceSessions.find((s) => s.id === sessionId);
    if (!session) return null;

    // FIX: Chuyển đổi an toàn sang mảng và so sánh ID dạng chuỗi
    const attendanceRecords = Array.isArray(session["Điểm danh"]) 
      ? session["Điểm danh"] 
      : Object.values(session["Điểm danh"] || {});

    const record = attendanceRecords.find(
      (r: any) => String(r["Student ID"]) === String(studentId)
    );

    if (!record) return null;

    // Ưu tiên lấy "Điểm kiểm tra" (từ điểm danh)
    if (record["Điểm kiểm tra"] !== null && record["Điểm kiểm tra"] !== undefined && record["Điểm kiểm tra"] !== "") {
      return Number(record["Điểm kiểm tra"]);
    }

    // Nếu không có, lấy trường "Điểm" trực tiếp
    if (record["Điểm"] !== null && record["Điểm"] !== undefined && record["Điểm"] !== "") {
      return Number(record["Điểm"]);
    }

    // Nếu không có, kiểm tra "Chi tiết điểm"
    if (record["Chi tiết điểm"] && Array.isArray(record["Chi tiết điểm"]) && record["Chi tiết điểm"].length > 0) {
      const scores = record["Chi tiết điểm"]
        .map((s: any) => Number(s["Điểm"]))
        .filter((s: number) => !isNaN(s));
      
      if (scores.length === 0) return null;
      return scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
    }

    return null;
  };

  // Get score details (for tooltip/popover)
  const getScoreDetails = (studentId: string, sessionId: string) => {
    const session = attendanceSessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const attendanceRecords = Array.isArray(session["Điểm danh"]) 
      ? session["Điểm danh"] 
      : Object.values(session["Điểm danh"] || {});

    const record = attendanceRecords.find(
      (r: any) => String(r["Student ID"]) === String(studentId)
    );

    if (!record) return null;

    // Return score details
    return {
      "Điểm kiểm tra": record["Điểm kiểm tra"],
      "Điểm": record["Điểm"],
      "Chi tiết điểm": record["Chi tiết điểm"],
      "Bài kiểm tra": record["Bài kiểm tra"],
    };
  };

  // Get score details from column name (for custom scores from session history)
  const getScoreDetailsFromColumn = (studentId: string, columnName: string) => {
    // Column format: "Tên bài kiểm tra (DD-MM-YYYY)"
    // Extract test name and date
    const match = columnName.match(/^(.+?)\s*\((\d{2}[\/-]\d{2}[\/-]\d{4})\)$/);
    if (!match) return null;

    const testName = match[1].trim();
    const normalizedDate = match[2].replace(/\//g, "-");
    // Convert DD-MM-YYYY to YYYY-MM-DD
    const [day, month, year] = normalizedDate.split('-');
    const sessionDate = `${year}-${month}-${day}`;

    // Find session with matching date and test name
    const session = attendanceSessions.find((s) => {
      if (s["Class ID"] !== classData?.id) return false;
      if (s["Ngày"] !== sessionDate) return false;
      
      // Check if any record has this test name
      const records = Array.isArray(s["Điểm danh"]) 
        ? s["Điểm danh"] 
        : Object.values(s["Điểm danh"] || {});
      
      return records.some((r: any) => 
        String(r["Student ID"]) === String(studentId) &&
        r["Bài kiểm tra"] === testName
      );
    });

    if (!session) return null;

    const attendanceRecords = Array.isArray(session["Điểm danh"]) 
      ? session["Điểm danh"] 
      : Object.values(session["Điểm danh"] || {});

    const record = attendanceRecords.find(
      (r: any) => String(r["Student ID"]) === String(studentId) && r["Bài kiểm tra"] === testName
    );

    if (!record) return null;

    return {
      "Điểm kiểm tra": record["Điểm kiểm tra"],
      "Điểm": record["Điểm"],
      "Chi tiết điểm": record["Chi tiết điểm"],
      "Bài kiểm tra": record["Bài kiểm tra"],
      "Ngày": session["Ngày"],
    };
  };

  // Calculate regular average
  const getRegularAverage = (studentId: string) => {
    const classSessions = attendanceSessions.filter(
      (session) => session["Class ID"] === classData?.id
    );

    let totalScore = 0;
    let count = 0;

    classSessions.forEach((session) => {
      // FIX: Chuyển đổi an toàn sang mảng và so sánh ID dạng chuỗi
      const attendanceRecords = Array.isArray(session["Điểm danh"]) 
        ? session["Điểm danh"] 
        : Object.values(session["Điểm danh"] || {});

      const studentRecord = attendanceRecords.find(
        (r: any) => String(r["Student ID"]) === String(studentId)
      );
      
      if (!studentRecord) return;

      // Logic tính điểm: ưu tiên "Điểm kiểm tra", sau đó "Điểm", cuối cùng "Chi tiết điểm"
      if (studentRecord["Điểm kiểm tra"] !== null && studentRecord["Điểm kiểm tra"] !== undefined && studentRecord["Điểm kiểm tra"] !== "") {
        totalScore += Number(studentRecord["Điểm kiểm tra"]);
        count++;
      }
      else if (studentRecord["Điểm"] !== null && studentRecord["Điểm"] !== undefined && studentRecord["Điểm"] !== "") {
        totalScore += Number(studentRecord["Điểm"]);
        count++;
      }
      else if (studentRecord["Chi tiết điểm"] && Array.isArray(studentRecord["Chi tiết điểm"]) && studentRecord["Chi tiết điểm"].length > 0) {
        const scores = studentRecord["Chi tiết điểm"]
          .map((s: any) => Number(s["Điểm"]))
          .filter((s: number) => !isNaN(s));
        
        if (scores.length > 0) {
          totalScore += scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
          count++;
        }
      }
    });

    return count > 0 ? totalScore / count : null;
  };

  // Calculate custom average
  const getCustomAverage = (studentId: string) => {
    const score = customScores.find((s) => s.studentId === studentId);
    if (!score) return null;

    const values = filteredColumns
      .map((col) => score[col])
      .filter((v) => v !== null && v !== undefined && !isNaN(v));

    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!classData) return;

    try {
      const wb = XLSX.utils.book_new();

      // Export custom scores (all scores)
      const titleRow = ["BẢNG THEO DÕI HỌC TẬP"];
      const mainHeader = ["", "", "ĐIỂM"];
      const subHeader = [
        "STT",
        "Mã HS",
        "HỌ VÀ TÊN",
        ...filteredColumns,
        "",
        "",
        "Điểm TB",
        "Ghi chú",
      ];

      const data = gradeData.map((student: any, index: number) => {
        const scores = filteredColumns.map((col) => {
          const score = getCustomScore(student.studentId, col);
          return score !== null ? Number(score) : "x";
        });
        const avg = getCustomAverage(student.studentId);
        return [
          index + 1,
          student.studentCode,
          student.studentName,
          ...scores,
          "",
          "",
          avg !== null ? Number(avg.toFixed(2)) : "",
          "",
        ];
      });

      const sheetData = [titleRow, mainHeader, subHeader, ...data];
      const sheet = XLSX.utils.aoa_to_sheet(sheetData);

      const colWidths = [
        { wch: 5 },
        { wch: 10 },
        { wch: 20 },
        ...filteredColumns.map(() => ({ wch: 10 })),
        { wch: 5 },
        { wch: 5 },
        { wch: 10 },
        { wch: 15 },
      ];
      sheet['!cols'] = colWidths;

      const merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: filteredColumns.length + 5 } },
        { s: { r: 1, c: 3 }, e: { r: 1, c: filteredColumns.length + 2 } },
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
        { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } },
        { s: { r: 1, c: filteredColumns.length + 3 }, e: { r: 2, c: filteredColumns.length + 3 } },
        { s: { r: 1, c: filteredColumns.length + 4 }, e: { r: 2, c: filteredColumns.length + 4 } },
      ];
      sheet['!merges'] = merges;

      XLSX.utils.book_append_sheet(wb, sheet, "Điểm kiểm tra");

      const fileName = `Bang_diem_${classData["Mã lớp"]}_${dayjs().format("YYYYMMDD")}.xlsx`;
      XLSX.writeFile(wb, fileName);
      message.success("Đã xuất file Excel thành công!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      message.error("Lỗi khi xuất file Excel");
    }
  };


  // Custom scores columns
  const customScoresColumns = [
    {
      title: "STT",
      key: "index",
      width: 60,
      align: "center" as const,
      render: (_: any, __: any, index: number) => index + 1,
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
      width: 180,
      render: (text: string, record: any) => {
        const displayName = text || record.studentName || "-";
        return (
          <strong
            style={{ cursor: "pointer", color: "#1890ff" }}
            onClick={() => {
              setSelectedStudent(record);
              setIsStudentDetailModalOpen(true);
            }}
          >
            {displayName}
          </strong>
        );
      },
    },
    ...filteredColumns.map((column) => {
      const isAutoColumn = autoColumns.includes(column);
      
      return {
        title: (
          <Space>
            <span>{column}</span>
            {!isAutoColumn && (
              <Popconfirm
                title="Xóa cột điểm"
                description={`Bạn có chắc chắn muốn xóa cột "${column}"?`}
                onConfirm={() => handleDeleteColumn(column)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  style={{ marginLeft: 4 }}
                />
              </Popconfirm>
            )}
          </Space>
        ),
        key: column,
        width: 100,
        align: "center" as const,
        render: (_: any, record: any) => {
          const score = getCustomScore(record.studentId, column);
          
          // Auto columns are read-only
          if (isAutoColumn) {
            const scoreDetails = getScoreDetailsFromColumn(record.studentId, column);
            
            const scoreTag = score !== null ? (
              <Tag
                color={
                  score >= 8
                    ? "green"
                    : score >= 6.5
                      ? "blue"
                      : score >= 5
                        ? "orange"
                        : "red"
                }
                style={{ cursor: scoreDetails?.["Chi tiết điểm"] ? "pointer" : "default" }}
              >
                {score}
              </Tag>
            ) : (
              <span style={{ color: "#ccc" }}>-</span>
            );

            // Show popover with score details if available
            if (scoreDetails && scoreDetails["Chi tiết điểm"] && Array.isArray(scoreDetails["Chi tiết điểm"]) && scoreDetails["Chi tiết điểm"].length > 0) {
              return (
                <Popover
                  title="Điểm thành phần"
                  content={
                    <div>
                      <Descriptions size="small" column={1}>
                        {scoreDetails["Chi tiết điểm"].map((detail: any, idx: number) => (
                          <Descriptions.Item key={idx} label={detail["Tên điểm"] || `Điểm ${idx + 1}`}>
                            {detail["Điểm"]} {detail["Ghi chú"] ? `(${detail["Ghi chú"]})` : ""}
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                      {scoreDetails["Bài kiểm tra"] && (
                        <div style={{ marginTop: 8, fontSize: "12px", color: "#666" }}>
                          <strong>Bài kiểm tra:</strong> {scoreDetails["Bài kiểm tra"]}
                        </div>
                      )}
                      {scoreDetails["Ngày"] && (
                        <div style={{ marginTop: 4, fontSize: "12px", color: "#666" }}>
                          <strong>Ngày:</strong> {dayjs(scoreDetails["Ngày"]).format("DD/MM/YYYY")}
                        </div>
                      )}
                    </div>
                  }
                >
                  {scoreTag}
                </Popover>
              );
            }

            return scoreTag;
          }
          
          // Manual columns are always editable
          const isEditing =
            editingCell?.studentId === record.studentId &&
            editingCell?.column === column;

          if (isEditing) {
            return (
              <InputNumber
                min={0}
                max={10}
                step={0.5}
                value={tempValue}
                onChange={(value) => setTempValue(value as number | null)}
                onPressEnter={() =>
                  handleUpdateScore(record.studentId, column, tempValue)
                }
                onBlur={() =>
                  handleUpdateScore(record.studentId, column, tempValue)
                }
                autoFocus
                style={{ width: 80 }}
              />
            );
          }

          return (
            <div
              onClick={() => {
                setEditingCell({ studentId: record.studentId, column });
                setTempValue(score);
              }}
              style={{ cursor: "pointer", minHeight: 22 }}
            >
              {score !== null ? (
                <Tag
                  color={
                    score >= 8
                      ? "green"
                      : score >= 6.5
                        ? "blue"
                        : score >= 5
                          ? "orange"
                          : "red"
                  }
                >
                  {score}
                </Tag>
              ) : (
                <span style={{ color: "#ccc" }}>Nhấn để nhập</span>
              )}
            </div>
          );
        },
      };
    }),
    {
      title: "Điểm TB",
      key: "average",
      width: 120,
      align: "center" as const,
      render: (_: any, record: any) => {
        const avg = getCustomAverage(record.studentId);
        if (avg === null) return <span style={{ color: "#ccc" }}>-</span>;
        return (
          <Tag
            color={
              avg >= 8 ? "green" : avg >= 6.5 ? "blue" : avg >= 5 ? "orange" : "red"
            }
          >
            <strong>{avg.toFixed(1)}</strong>
          </Tag>
        );
      },
    },
    {
      title: "Ghi chú",
      key: "note",
      width: 200,
    },
  ];

  if (!classData) {
    return <WrapperContent title="Bảng điểm" isLoading={loading}><div /></WrapperContent>;
  }

  return (
    <WrapperContent
      title={`Bảng điểm - ${classData["Tên lớp"]}`}
      toolbar={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={exportToExcel}>
            Xuất Excel
          </Button>
          <Button onClick={() => navigate(-1)}>Quay lại</Button>
        </Space>
      }
    >
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <strong>Mã lớp:</strong> {classData["Mã lớp"]}
          </Col>
          <Col span={6}>
            <strong>Môn học:</strong>{" "}
            {subjectMap[classData["Môn học"]] || classData["Môn học"]}
          </Col>
          <Col span={6}>
            <strong>Khối:</strong> {classData["Khối"]}
          </Col>
          <Col span={6}>
            <strong>Số học sinh:</strong> {gradeData.length}
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <strong>Bộ lọc:</strong>
          </div>
          <Radio.Group
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              if (e.target.value === "all") {
                setDateRangeFilter([null, null]);
                setMonthFilter(null);
              }
            }}
          >
            <Radio value="all">Tất cả</Radio>
            <Radio value="dateRange">Theo khoảng ngày</Radio>
            <Radio value="month">Theo tháng</Radio>
          </Radio.Group>
          {filterType === "dateRange" && (
            <DatePicker.RangePicker
              value={dateRangeFilter}
              onChange={(dates) => setDateRangeFilter(dates as [Dayjs | null, Dayjs | null])}
              format="DD/MM/YYYY"
            />
          )}
          {filterType === "month" && (
            <DatePicker
              picker="month"
              value={monthFilter}
              onChange={(date) => setMonthFilter(date)}
              format="MM/YYYY"
            />
          )}
        </Space>
      </Card>

      <Card>
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ color: "#666", marginBottom: 4 }}>
              Bảng điểm tự động lấy từ lịch sử lớp học (cột có tag "Từ lịch sử") và điểm tự nhập.
            </div>
            <div style={{ color: "#999", fontSize: 12 }}>
              💡 Cột từ lịch sử: chỉ xem | Cột thủ công: nhấn vào ô để nhập điểm. Kéo ngang bảng để xem thêm cột.
            </div>
          </div>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsAddColumnModalOpen(true)}
            >
              Thêm cột điểm
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveAllScores}
              disabled={!hasUnsavedChanges}
            >
              Lưu điểm
            </Button>
          </Space>
        </div>
        <Table
          columns={customScoresColumns}
          dataSource={gradeData}
          rowKey="studentId"
          pagination={false}
          scroll={{ x: "max-content", y: 500 }}
          size="small"
          bordered
          locale={{
            emptyText: <Empty description="Không có dữ liệu" />,
          }}
        />
      </Card>

      {/* Add Column Modal */}
      <Modal
        title="Thêm cột điểm"
        open={isAddColumnModalOpen}
        onCancel={() => {
          setIsAddColumnModalOpen(false);
          setNewColumnName("");
        }}
        onOk={handleAddColumn}
        okText="Thêm"
        cancelText="Hủy"
      >
        <div style={{ marginBottom: 8 }}>
          <label>Tên cột điểm:</label>
        </div>
        <Input
          placeholder="Ví dụ: Kiểm tra 15 phút, Giữa kỳ, Cuối kỳ..."
          value={newColumnName}
          onChange={(e) => setNewColumnName(e.target.value)}
          onPressEnter={handleAddColumn}
          autoFocus
        />
        <div style={{ marginTop: 8, color: "#999", fontSize: 12 }}>
          Không dùng các ký tự / . # $ [ ] để tránh lỗi lưu Firebase.
        </div>
      </Modal>

      {/* Student Detail Modal */}
      <Modal
        title={`Chi tiết điểm - ${selectedStudent?.studentName || ""}`}
        open={isStudentDetailModalOpen}
        onCancel={() => {
          setIsStudentDetailModalOpen(false);
          setSelectedStudent(null);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setIsStudentDetailModalOpen(false);
            setSelectedStudent(null);
          }}>
            Đóng
          </Button>,
        ]}
        width={1000}
      >
        {selectedStudent && (() => {
          // Get all sessions for this student
          const studentSessions = attendanceSessions
            .filter((session) => {
              if (session["Class ID"] !== classData?.id) return false;
              
              const records = Array.isArray(session["Điểm danh"]) 
                ? session["Điểm danh"] 
                : Object.values(session["Điểm danh"] || {});
              
              return records.some((r: any) => String(r["Student ID"]) === String(selectedStudent.studentId));
            })
            .sort((a, b) => {
              const dateA = dayjs(a["Ngày"]);
              const dateB = dayjs(b["Ngày"]);
              return dateB.isBefore(dateA) ? -1 : dateB.isAfter(dateA) ? 1 : 0;
            });

          // Get student records from sessions
          const studentRecords = studentSessions.map((session) => {
            const records = Array.isArray(session["Điểm danh"]) 
              ? session["Điểm danh"] 
              : Object.values(session["Điểm danh"] || {});
            
            const record = records.find((r: any) => String(r["Student ID"]) === String(selectedStudent.studentId));
            
            if (!record) return null;

            // Get score
            let score: number | null = null;
            if (record["Điểm kiểm tra"] != null && record["Điểm kiểm tra"] !== "") {
              score = Number(record["Điểm kiểm tra"]);
            } else if (record["Điểm"] != null && record["Điểm"] !== "") {
              score = Number(record["Điểm"]);
            } else if (record["Chi tiết điểm"] && Array.isArray(record["Chi tiết điểm"]) && record["Chi tiết điểm"].length > 0) {
              const scores = record["Chi tiết điểm"]
                .map((s: any) => Number(s["Điểm"]))
                .filter((s: number) => !isNaN(s));
              if (scores.length > 0) {
                score = scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
              }
            }

            return {
              sessionId: session.id,
              date: session["Ngày"],
              testName: record["Bài kiểm tra"] || "",
              score,
              scoreDetails: record["Chi tiết điểm"],
              homework: record["% Hoàn thành BTVN"],
              bonus: record["Điểm thưởng"],
              attendance: record["Có mặt"] ? (record["Đi muộn"] ? "Đi muộn" : "Có mặt") : (record["Vắng có phép"] ? "Vắng có phép" : "Vắng"),
              note: record["Ghi chú"],
            };
          }).filter(Boolean);

          return (
            <Table
              columns={[
                {
                  title: "Ngày",
                  dataIndex: "date",
                  key: "date",
                  width: 120,
                  render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
                },
                {
                  title: "Bài kiểm tra",
                  dataIndex: "testName",
                  key: "testName",
                  width: 200,
                  render: (name: string) => name || "-",
                },
                {
                  title: "Điểm",
                  dataIndex: "score",
                  key: "score",
                  width: 100,
                  align: "center" as const,
                  render: (score: number | null, record: any) => {
                    if (score === null) return <span style={{ color: "#ccc" }}>-</span>;
                    return (
                      <Popover
                        title="Điểm thành phần"
                        content={
                          record.scoreDetails && Array.isArray(record.scoreDetails) && record.scoreDetails.length > 0 ? (
                            <div>
                              <Descriptions size="small" column={1}>
                                {record.scoreDetails.map((detail: any, idx: number) => (
                                  <Descriptions.Item key={idx} label={detail["Tên điểm"] || `Điểm ${idx + 1}`}>
                                    {detail["Điểm"]} {detail["Ghi chú"] ? `(${detail["Ghi chú"]})` : ""}
                                  </Descriptions.Item>
                                ))}
                              </Descriptions>
                            </div>
                          ) : (
                            <div>Không có điểm thành phần</div>
                          )
                        }
                      >
                        <Tag
                          color={
                            score >= 8
                              ? "green"
                              : score >= 6.5
                                ? "blue"
                                : score >= 5
                                  ? "orange"
                                  : "red"
                          }
                          style={{ cursor: record.scoreDetails ? "pointer" : "default" }}
                        >
                          {score.toFixed(1)}
                        </Tag>
                      </Popover>
                    );
                  },
                },
                {
                  title: "% BTVN",
                  dataIndex: "homework",
                  key: "homework",
                  width: 100,
                  align: "center" as const,
                  render: (val: number) => val != null ? `${val}%` : "-",
                },
                {
                  title: "Điểm thưởng",
                  dataIndex: "bonus",
                  key: "bonus",
                  width: 100,
                  align: "center" as const,
                  render: (val: number) => val != null ? val : "-",
                },
                {
                  title: "Điểm danh",
                  dataIndex: "attendance",
                  key: "attendance",
                  width: 120,
                  align: "center" as const,
                  render: (attendance: string) => {
                    const color = attendance === "Có mặt" ? "green" : attendance === "Đi muộn" ? "orange" : "red";
                    return <Tag color={color}>{attendance}</Tag>;
                  },
                },
                {
                  title: "Ghi chú",
                  dataIndex: "note",
                  key: "note",
                  render: (note: string) => note || "-",
                },
              ]}
              dataSource={studentRecords}
              rowKey="sessionId"
              pagination={{
                pageSize: 10,
                showTotal: (total) => `Tổng ${total} buổi học`,
              }}
              locale={{
                emptyText: <Empty description="Chưa có điểm" />,
              }}
            />
          );
        })()}
      </Modal>
    </WrapperContent>
  );
};

export default ClassGradeBook;
