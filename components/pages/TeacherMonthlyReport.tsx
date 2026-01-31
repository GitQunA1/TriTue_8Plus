import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  DatePicker,
  Space,
  Tag,
  message,
  Popconfirm,
  Row,
  Col,
  Typography,
  Tooltip,
  Progress,
  Alert,
  Collapse,
  Statistic,
  Switch,
  Modal,
  Input,
} from "antd";
import {
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  BookOutlined,
  DownOutlined,
  WarningOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { ref, onValue, update, push } from "firebase/database";
import { database } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { Class, AttendanceSession, MonthlyComment, MonthlyReportStats, ClassStats } from "../../types";
import { generateStudentComment, StudentReportData } from "../../utils/geminiService";
import TeacherCommentEditModal from "../TeacherCommentEditModal";
import WrapperContent from "../WrapperContent";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;
const { Panel } = Collapse;

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh"?: string;
}

// Báo cáo theo học sinh - gộp nhiều lớp
interface StudentReportRow {
  key: string;
  studentId: string;
  studentName: string;
  studentCode?: string;
  // Tổng hợp tất cả lớp
  totalSessions: number;
  presentSessions: number;
  absentSessions: number;
  attendanceRate: number;
  averageScore: number;
  totalBonusPoints: number;
  // Chi tiết từng lớp
  classStats: ClassStats[];
  classIds: string[];
  classNames: string[];
  // Comment - giờ lưu theo từng lớp trong classStats
  aiComment: string;
  finalComment: string;
  status: 'draft' | 'submitted' | 'approved' | 'new';
  existingCommentId?: string;
}

const TeacherMonthlyReport = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs>(dayjs().subtract(1, 'month')); // Mặc định tháng trước
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [existingComments, setExistingComments] = useState<MonthlyComment[]>([]);
  const [reportData, setReportData] = useState<StudentReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [teacherData, setTeacherData] = useState<any>(null);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentReportRow | null>(null);

  // Edit scores modal state
  const [editScoresModalOpen, setEditScoresModalOpen] = useState(false);
  const [editingScoresStudent, setEditingScoresStudent] = useState<StudentReportRow | null>(null);
  const [editingScores, setEditingScores] = useState<{ [columnKey: string]: number | null }>({});
  const [customScoresData, setCustomScoresData] = useState<{ [classId: string]: any }>({});

  // Luôn cho phép tạo báo cáo - nếu sai admin sẽ hủy duyệt
  const isMonthEnded = true;

  // Load teacher data
  useEffect(() => {
    if (!userProfile?.email) return;

    const teachersRef = ref(database, "datasheet/Giáo_viên");
    const unsubscribe = onValue(teachersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const teacherEntry = Object.entries(data).find(
          ([_, teacher]: [string, any]) =>
            teacher.Email === userProfile.email ||
            teacher["Email công ty"] === userProfile.email
        );
        if (teacherEntry) {
          const teacherValue = teacherEntry[1] as Record<string, any>;
          setTeacherData({ id: teacherEntry[0], ...teacherValue });
        }
      }
    });
    return () => unsubscribe();
  }, [userProfile?.email]);

  const actualTeacherId = userProfile?.teacherId || teacherData?.id || "";
  const teacherName = teacherData?.["Họ và tên"] || userProfile?.displayName || "";

  // Load classes for this teacher
  useEffect(() => {
    if (!actualTeacherId) return;

    const classesRef = ref(database, "datasheet/Lớp_học");
    const unsubscribe = onValue(classesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const classList = Object.entries(data)
          .map(([id, value]) => ({
            id,
            ...(value as Omit<Class, "id">),
          }))
          .filter((c) => c["Teacher ID"] === actualTeacherId && c["Trạng thái"] === "active");
        
        setClasses(classList);
      }
    });
    return () => unsubscribe();
  }, [actualTeacherId]);

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
        const sessionList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<AttendanceSession, "id">),
        }));
        setSessions(sessionList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load existing monthly comments
  useEffect(() => {
    const commentsRef = ref(database, "datasheet/Nhận_xét_tháng");
    const unsubscribe = onValue(commentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const commentList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<MonthlyComment, "id">),
        }));
        setExistingComments(commentList);
      } else {
        setExistingComments([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load custom scores (Điểm tự nhập) for all teacher's classes
  useEffect(() => {
    if (classes.length === 0) return;

    const customScoresRef = ref(database, "datasheet/Điểm_tự_nhập");
    const unsubscribe = onValue(customScoresRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Filter only classes that belong to this teacher
        const teacherClassIds = classes.map(c => c.id);
        const filteredData: { [classId: string]: any } = {};
        
        Object.entries(data).forEach(([classId, classScores]) => {
          if (teacherClassIds.includes(classId)) {
            filteredData[classId] = classScores;
          }
        });
        
        setCustomScoresData(filteredData);
      } else {
        setCustomScoresData({});
      }
    });
    return () => unsubscribe();
  }, [classes]);

  // Lấy danh sách học sinh unique từ tất cả các lớp của teacher TRONG THÁNG ĐÃ CHỌN
  // Kết hợp cả 2 nguồn: Student IDs trong lớp + học sinh đã điểm danh trong sessions
  const uniqueStudentIds = useMemo(() => {
    const studentIdSet = new Set<string>();
    const classIds = classes.map(c => c.id);
    const monthStr = selectedMonth?.format("YYYY-MM") || "";
    
    // Nguồn 1: Từ Student IDs của từng lớp
    classes.forEach((c) => {
      c["Student IDs"]?.forEach((id) => studentIdSet.add(id));
    });
    
    // Nguồn 2: Từ điểm danh sessions (học sinh đã được điểm danh thực tế) TRONG THÁNG ĐÃ CHỌN
    // Điều này bao gồm cả học sinh mới thêm vào lớp và đã được điểm danh
    sessions.forEach((session) => {
      if (classIds.includes(session["Class ID"])) {
        // Chỉ xét sessions trong tháng đã chọn
        const sessionMonth = dayjs(session["Ngày"]).format("YYYY-MM");
        if (sessionMonth === monthStr) {
          session["Điểm danh"]?.forEach((record) => {
            if (record["Student ID"]) {
              studentIdSet.add(record["Student ID"]);
            }
          });
        }
      }
    });
    
    return Array.from(studentIdSet);
  }, [classes, sessions, selectedMonth]);

  // Helper: Get custom scores for a student in a class for a specific month
  const getCustomScoresForClass = (studentId: string, classId: string, monthStr: string): number[] => {
    const classScores = customScoresData[classId];
    if (!classScores?.scores || !classScores?.columns) return [];

    const studentScore = classScores.scores.find((s: any) => s.studentId === studentId);
    if (!studentScore) return [];

    const scores: number[] = [];
    classScores.columns.forEach((columnName: string) => {
      // Check if column belongs to this month
      const dateMatch = columnName.match(/\((\d{2}-\d{2}-\d{4})\)$/);
      if (dateMatch) {
        const [day, month, year] = dateMatch[1].split("-");
        const columnMonth = `${year}-${month}`;
        if (columnMonth === monthStr) {
          const scoreValue = studentScore[columnName];
          if (scoreValue !== null && scoreValue !== undefined && scoreValue !== "" && !isNaN(Number(scoreValue))) {
            scores.push(Number(scoreValue));
          }
        }
      }
    });
    return scores;
  };

  // Calculate report data - THEO HỌC SINH (gộp nhiều lớp)
  useEffect(() => {
    if (!selectedMonth || classes.length === 0) {
      setReportData([]);
      return;
    }

    const monthStr = selectedMonth.format("YYYY-MM");

    // Build report data for each unique student
    const data: StudentReportRow[] = uniqueStudentIds.map((studentId) => {
      const student = students.find((s) => s.id === studentId);
      const studentName = student?.["Họ và tên"] || "Không tên";
      const studentCode = student?.["Mã học sinh"];

      // Tìm tất cả các lớp mà học sinh này đang học với teacher này
      // Kết hợp cả 2 nguồn: Student IDs + đã được điểm danh
      const studentClasses = classes.filter((c) => {
        // Nguồn 1: Có trong Student IDs của lớp
        if (c["Student IDs"]?.includes(studentId)) return true;
        
        // Nguồn 2: Đã được điểm danh trong sessions của lớp này
        const hasAttendance = sessions.some(
          (s) => s["Class ID"] === c.id && 
                 s["Điểm danh"]?.some((r) => r["Student ID"] === studentId)
        );
        return hasAttendance;
      });

      // Tính thống kê từng lớp
      const classStats: ClassStats[] = [];
      let totalSessions = 0;
      let totalPresent = 0;
      let totalAbsent = 0;
      let allScores: number[] = [];
      let totalBonusPoints = 0;
      const classIds: string[] = [];
      const classNames: string[] = [];

      studentClasses.forEach((cls) => {
        // Filter sessions cho lớp này trong tháng
        const classSessions = sessions.filter((s) => {
          const sessionMonth = dayjs(s["Ngày"]).format("YYYY-MM");
          return s["Class ID"] === cls.id && sessionMonth === monthStr;
        });

        let clsTotal = 0;
        let clsPresent = 0;
        let clsBonusPoints = 0;

        classSessions.forEach((session) => {
          const record = session["Điểm danh"]?.find((r) => r["Student ID"] === studentId);
          if (record) {
            clsTotal++;
            if (record["Có mặt"]) {
              clsPresent++;
            }
            if (record["Điểm thưởng"]) {
              clsBonusPoints += record["Điểm thưởng"];
              totalBonusPoints += record["Điểm thưởng"];
            }
          }
        });

        // Lấy điểm từ attendance sessions ("Điểm kiểm tra" hoặc "Điểm")
        const attendanceScores: number[] = [];
        classSessions.forEach((session) => {
          const record = session["Điểm danh"]?.find((r) => r["Student ID"] === studentId);
          if (record) {
            const scoreValue = record["Điểm kiểm tra"] ?? record["Điểm"];
            if (scoreValue !== undefined && scoreValue !== null && !isNaN(Number(scoreValue))) {
              attendanceScores.push(Number(scoreValue));
            }
          }
        });

        // Lấy điểm từ Điểm_tự_nhập (điểm giáo viên tự nhập)
        const customScores = getCustomScoresForClass(studentId, cls.id, monthStr);
        
        // Kết hợp cả hai nguồn điểm (ưu tiên hiển thị tất cả)
        const clsScores = [...attendanceScores, ...customScores];
        allScores = allScores.concat(clsScores);

        const clsAbsent = clsTotal - clsPresent;
        const clsAttendanceRate = clsTotal > 0 ? Math.round((clsPresent / clsTotal) * 100) : 0;
        const clsAvgScore = clsScores.length > 0
          ? clsScores.reduce((a, b) => a + b, 0) / clsScores.length
          : 0;

        if (clsTotal > 0 || clsScores.length > 0) {
          classStats.push({
            classId: cls.id,
            className: cls["Tên lớp"],
            subject: cls["Môn học"] || "",
            totalSessions: clsTotal,
            presentSessions: clsPresent,
            absentSessions: clsAbsent,
            attendanceRate: clsAttendanceRate,
            averageScore: clsAvgScore,
            totalBonusPoints: clsBonusPoints,
          });
          classIds.push(cls.id);
          classNames.push(cls["Tên lớp"]);
        }

        totalSessions += clsTotal;
        totalPresent += clsPresent;
        totalAbsent += clsAbsent;
      });

      const attendanceRate = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0;
      const averageScore = allScores.length > 0
        ? allScores.reduce((a, b) => a + b, 0) / allScores.length
        : 0;

      // Find existing comment for this student & month & THIS TEACHER
      // Mỗi giáo viên có báo cáo riêng cho học sinh
      const existingComment = existingComments.find(
        (c) => c.studentId === studentId && c.month === monthStr && c.teacherId === actualTeacherId
      );

      // Xác định status đúng type
      let status: 'draft' | 'submitted' | 'approved' | 'new' = 'new';
      if (existingComment?.status === 'draft' || existingComment?.status === 'submitted' || existingComment?.status === 'approved') {
        status = existingComment.status;
      }

      return {
        key: studentId,
        studentId,
        studentName,
        studentCode,
        totalSessions,
        presentSessions: totalPresent,
        absentSessions: totalAbsent,
        attendanceRate,
        averageScore,
        totalBonusPoints,
        classStats,
        classIds,
        classNames,
        aiComment: existingComment?.aiComment || "",
        finalComment: existingComment?.finalComment || "",
        status,
        existingCommentId: existingComment?.id,
      } as StudentReportRow;
    }).filter((row): row is StudentReportRow => row.totalSessions > 0 || row.classStats.some(cs => cs.averageScore > 0));

    setReportData(data);
  }, [classes, selectedMonth, sessions, students, existingComments, uniqueStudentIds, customScoresData]);

  // Check if report can be edited
  const canEdit = (status: string) => {
    return status === 'new' || status === 'draft';
  };

  // Generate AI comments
  const handleGenerateAIComments = async () => {
    if (!isMonthEnded) {
      message.warning("Chỉ có thể tạo báo cáo cho tháng đã kết thúc!");
      return;
    }

    setGeneratingAI(true);
    setGeneratingProgress(0);

    const monthStr = selectedMonth.format("YYYY-MM");
    const total = reportData.length;
    let completed = 0;

    try {
      for (const row of reportData) {
        if (row.aiComment || !canEdit(row.status)) {
          completed++;
          setGeneratingProgress(Math.round((completed / total) * 100));
          continue;
        }

        const recentSessions: any[] = [];
        row.classIds.forEach((classId, idx) => {
          const classSessions = sessions
            .filter((s) => {
              const sessionMonth = dayjs(s["Ngày"]).format("YYYY-MM");
              return s["Class ID"] === classId && sessionMonth === monthStr;
            })
            .sort((a, b) => new Date(b["Ngày"]).getTime() - new Date(a["Ngày"]).getTime())
            .slice(0, 3);

          classSessions.forEach((session) => {
            const record = session["Điểm danh"]?.find((r) => r["Student ID"] === row.studentId);
            if (record) {
              recentSessions.push({
                date: dayjs(session["Ngày"]).format("DD/MM"),
                className: row.classNames[idx],
                status: record["Có mặt"]
                  ? record["Đi muộn"] ? "Đi muộn" : "Có mặt"
                  : record["Vắng có phép"] ? "Vắng có phép" : "Vắng không phép",
                score: record["Điểm kiểm tra"] ?? record["Điểm"] ?? undefined,
              });
            }
          });
        });

        const classesInfo = row.classStats
          .map((cs) => `${cs.className} (${cs.subject}): ${cs.presentSessions}/${cs.totalSessions} buổi, TB: ${cs.averageScore.toFixed(1)}`)
          .join("; ");

        const reportDataForAI: StudentReportData = {
          studentName: row.studentName,
          totalSessions: row.totalSessions,
          presentSessions: row.presentSessions,
          absentSessions: row.absentSessions,
          attendanceRate: row.attendanceRate,
          totalHours: row.totalSessions * 2,
          averageScore: row.averageScore,
          recentSessions,
          additionalInfo: `Học sinh đang học ${row.classIds.length} lớp: ${classesInfo}. Tổng điểm thưởng: ${row.totalBonusPoints}.`,
        };

        try {
          const comment = await generateStudentComment(reportDataForAI);

          setReportData((prev) =>
            prev.map((r) =>
              r.studentId === row.studentId ? { ...r, aiComment: comment } : r
            )
          );

          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error generating AI comment for ${row.studentName}:`, error);
        }

        completed++;
        setGeneratingProgress(Math.round((completed / total) * 100));
      }

      message.success("Đã tạo xong nhận xét AI!");
    } catch (error) {
      console.error("Error generating AI comments:", error);
      message.error("Có lỗi khi tạo nhận xét AI");
    } finally {
      setGeneratingAI(false);
      setGeneratingProgress(0);
    }
  };

  // Get status tag
  const getStatusTag = (status: string) => {
    switch (status) {
      case "approved":
        return <Tag color="green" icon={<CheckCircleOutlined />}>Đã duyệt</Tag>;
      case "submitted":
        return <Tag color="blue" icon={<ClockCircleOutlined />}>Chờ duyệt</Tag>;
      case "draft":
        return <Tag color="orange">Nháp</Tag>;
      default:
        return <Tag>Chưa tạo</Tag>;
    }
  };

  // Open edit modal
  const handleOpenEditModal = (record: StudentReportRow) => {
    if (!isMonthEnded) {
      message.warning("Chỉ có thể tạo báo cáo cho tháng đã kết thúc!");
      return;
    }
    setSelectedStudent(record);
    setEditModalOpen(true);
  };

  // Modal save - nhận array các comment theo từng lớp
  const handleModalSave = async (classComments: { classId: string; comment: string }[]) => {
    if (!selectedStudent) return;

    // Update classStats với comment mới
    const updatedClassStats = selectedStudent.classStats.map(cs => {
      const commentObj = classComments.find(c => c.classId === cs.classId);
      return {
        ...cs,
        comment: commentObj?.comment || cs.comment || ""
      };
    });

    // Combine all comments for backward compatibility
    const combinedComment = classComments
      .filter(c => c.comment.trim())
      .map(c => {
        const classInfo = selectedStudent.classStats.find(cs => cs.classId === c.classId);
        return `[${classInfo?.className || c.classId}]\n${c.comment}`;
      })
      .join("\n\n---\n\n");

    setReportData((prev) =>
      prev.map((r) =>
        r.studentId === selectedStudent.studentId
          ? {
            ...r,
            classStats: updatedClassStats,
            finalComment: combinedComment
          }
          : r
      )
    );

    setEditModalOpen(false);
    setSelectedStudent(null);
  };

  // Generate single AI comment
  const handleGenerateSingleAI = async (studentId: string) => {
    if (!isMonthEnded) {
      message.warning("Chỉ có thể tạo báo cáo cho tháng đã kết thúc!");
      return;
    }

    const row = reportData.find((r) => r.studentId === studentId);
    if (!row || !canEdit(row.status)) return;

    const monthStr = selectedMonth.format("YYYY-MM");

    const recentSessions: any[] = [];
    row.classIds.forEach((classId, idx) => {
      const classSessions = sessions
        .filter((s) => {
          const sessionMonth = dayjs(s["Ngày"]).format("YYYY-MM");
          return s["Class ID"] === classId && sessionMonth === monthStr;
        })
        .sort((a, b) => new Date(b["Ngày"]).getTime() - new Date(a["Ngày"]).getTime())
        .slice(0, 3);

      classSessions.forEach((session) => {
        const record = session["Điểm danh"]?.find((r) => r["Student ID"] === row.studentId);
        if (record) {
          recentSessions.push({
            date: dayjs(session["Ngày"]).format("DD/MM"),
            className: row.classNames[idx],
            status: record["Có mặt"]
              ? record["Đi muộn"] ? "Đi muộn" : "Có mặt"
              : record["Vắng có phép"] ? "Vắng có phép" : "Vắng không phép",
            score: record["Điểm kiểm tra"] ?? record["Điểm"] ?? undefined,
          });
        }
      });
    });

    const classesInfo = row.classStats
      .map((cs) => `${cs.className} (${cs.subject}): ${cs.presentSessions}/${cs.totalSessions} buổi, TB: ${cs.averageScore.toFixed(1)}`)
      .join("; ");

    const reportDataForAI: StudentReportData = {
      studentName: row.studentName,
      totalSessions: row.totalSessions,
      presentSessions: row.presentSessions,
      absentSessions: row.absentSessions,
      attendanceRate: row.attendanceRate,
      totalHours: row.totalSessions * 2,
      averageScore: row.averageScore,
      recentSessions,
      additionalInfo: `Học sinh đang học ${row.classIds.length} lớp: ${classesInfo}. Tổng điểm thưởng: ${row.totalBonusPoints}.`,
    };

    try {
      const comment = await generateStudentComment(reportDataForAI);
      setReportData((prev) =>
        prev.map((r) =>
          r.studentId === studentId ? { ...r, aiComment: comment } : r
        )
      );

      if (selectedStudent?.studentId === studentId) {
        setSelectedStudent((prev) => prev ? { ...prev, aiComment: comment } : null);
      }

      message.success("Đã tạo nhận xét AI!");
    } catch (error) {
      console.error("Error generating AI comment:", error);
      message.error("Có lỗi khi tạo nhận xét AI");
    }
  };

  // Save all as draft
  const handleSaveDraft = async () => {
    if (!isMonthEnded) {
      message.warning("Chỉ có thể lưu báo cáo cho tháng đã kết thúc!");
      return;
    }

    setSaving(true);
    const monthStr = selectedMonth.format("YYYY-MM");

    try {
      for (const row of reportData) {
        // Kiểm tra có nhận xét cho ít nhất 1 lớp không (ưu tiên hơn finalComment/aiComment)
        const hasClassComment = row.classStats.some(cs => cs.comment && cs.comment.trim());
        if (!hasClassComment && !row.finalComment && !row.aiComment) continue;
        if (!canEdit(row.status)) continue;

        const stats: MonthlyReportStats = {
          totalSessions: row.totalSessions,
          presentSessions: row.presentSessions,
          absentSessions: row.absentSessions,
          attendanceRate: row.attendanceRate,
          averageScore: row.averageScore,
          classStats: row.classStats,
        };

        const commentData: Omit<MonthlyComment, "id"> = {
          studentId: row.studentId,
          studentName: row.studentName,
          studentCode: row.studentCode,
          teacherId: actualTeacherId,
          teacherName,
          classIds: row.classIds,
          classNames: row.classNames,
          month: monthStr,
          aiComment: row.aiComment,
          finalComment: row.finalComment || row.aiComment,
          stats,
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (row.existingCommentId) {
          await update(ref(database, `datasheet/Nhận_xét_tháng/${row.existingCommentId}`), {
            ...commentData,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const newRef = push(ref(database, "datasheet/Nhận_xét_tháng"));
          await update(newRef, commentData);
        }
      }

      message.success("Đã lưu nháp!");
    } catch (error) {
      console.error("Error saving draft:", error);
      message.error("Có lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  };

  // Submit for approval
  const handleSubmit = async () => {
    if (!isMonthEnded) {
      message.warning("Chỉ có thể gửi báo cáo cho tháng đã kết thúc!");
      return;
    }

    setSaving(true);
    const monthStr = selectedMonth.format("YYYY-MM");

    try {
      let submittedCount = 0;

      for (const row of reportData) {
        if (!canEdit(row.status)) continue;
        // Kiểm tra xem có nhận xét cho ít nhất 1 lớp không
        const hasClassComment = row.classStats.some(cs => cs.comment && cs.comment.trim());
        if (!hasClassComment && !row.finalComment && !row.aiComment) {
          message.warning(`Học sinh ${row.studentName} chưa có nhận xét!`);
          continue;
        }

        const stats: MonthlyReportStats = {
          totalSessions: row.totalSessions,
          presentSessions: row.presentSessions,
          absentSessions: row.absentSessions,
          attendanceRate: row.attendanceRate,
          averageScore: row.averageScore,
          classStats: row.classStats,
        };

        const commentData: Omit<MonthlyComment, "id"> = {
          studentId: row.studentId,
          studentName: row.studentName,
          studentCode: row.studentCode,
          teacherId: actualTeacherId,
          teacherName,
          classIds: row.classIds,
          classNames: row.classNames,
          month: monthStr,
          aiComment: row.aiComment,
          finalComment: row.finalComment || row.aiComment,
          stats,
          status: "submitted",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
          submittedBy: userProfile?.email || "",
        };

        if (row.existingCommentId) {
          await update(ref(database, `datasheet/Nhận_xét_tháng/${row.existingCommentId}`), {
            ...commentData,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const newRef = push(ref(database, "datasheet/Nhận_xét_tháng"));
          await update(newRef, commentData);
        }

        submittedCount++;
      }

      message.success(`Đã gửi ${submittedCount} báo cáo cho Admin duyệt!`);
    } catch (error) {
      console.error("Error submitting:", error);
      message.error("Có lỗi khi gửi báo cáo");
    } finally {
      setSaving(false);
    }
  };

  // Open edit scores modal - Load ALL score columns for the selected month
  const handleOpenEditScores = (record: StudentReportRow) => {
    setEditingScoresStudent(record);

    const monthStr = selectedMonth.format("YYYY-MM");
    const scoresMap: { [columnKey: string]: number | null } = {};

    // Load scores from customScoresData (Điểm tự nhập) - PRIMARY SOURCE
    record.classIds.forEach((classId) => {
      const classScores = customScoresData[classId];
      if (!classScores?.columns || !classScores?.scores) return;

      const deletedColumns = classScores.deletedColumns || [];
      
      // Find student's scores
      const studentScore = classScores.scores.find(
        (s: any) => s.studentId === record.studentId
      );

      if (studentScore) {
        classScores.columns.forEach((columnName: string) => {
          // Skip deleted columns
          if (deletedColumns.includes(columnName)) return;
          
          // Check if column belongs to this month
          const dateMatch = columnName.match(/\((\d{2}-\d{2}-\d{4})\)$/);
          if (dateMatch) {
            const [day, month, year] = dateMatch[1].split("-");
            const columnMonth = `${year}-${month}`;
            if (columnMonth === monthStr) {
              const scoreValue = studentScore[columnName];
              const columnKey = `${classId}|${columnName}`;
              scoresMap[columnKey] = scoreValue !== null && scoreValue !== undefined && scoreValue !== "" 
                ? Number(scoreValue) 
                : null;
            }
          }
        });
      }
    });

    setEditingScores(scoresMap);
    setEditScoresModalOpen(true);
  };

  // Handle score change in modal
  const handleScoreChange = (columnKey: string, value: number | null) => {
    setEditingScores(prev => ({
      ...prev,
      [columnKey]: value
    }));
  };

  // Save edited scores to Firebase - Update in Điểm_tự_nhập
  const handleSaveScores = async () => {
    if (!editingScoresStudent) return;

    setSaving(true);
    try {
      const updates: { [key: string]: any } = {};

      // Group updates by classId
      const updatesByClass: { [classId: string]: { [columnName: string]: number | null } } = {};

      for (const [columnKey, newScore] of Object.entries(editingScores)) {
        const [classId, columnName] = columnKey.split("|");
        if (!updatesByClass[classId]) {
          updatesByClass[classId] = {};
        }
        updatesByClass[classId][columnName] = newScore;
      }

      // Update each class's custom scores
      for (const [classId, columnScores] of Object.entries(updatesByClass)) {
        const classScores = customScoresData[classId];
        if (!classScores?.scores) continue;

        // Find the student's score index
        const studentScoreIndex = classScores.scores.findIndex(
          (s: any) => s.studentId === editingScoresStudent.studentId
        );

        if (studentScoreIndex !== -1) {
          // Update each column score
          for (const [columnName, newScore] of Object.entries(columnScores)) {
            updates[`datasheet/Điểm_tự_nhập/${classId}/scores/${studentScoreIndex}/${columnName}`] = newScore;
          }
        }

        // Also update the session if it exists (for sync)
        const monthStr = selectedMonth.format("YYYY-MM");
        for (const [columnName, newScore] of Object.entries(columnScores)) {
          // Extract date from column name
          const dateMatch = columnName.match(/\((\d{2}-\d{2}-\d{4})\)$/);
          if (dateMatch) {
            const [day, month, year] = dateMatch[1].split("-");
            const sessionDate = `${year}-${month}-${day}`;
            
            // Find matching session
            const matchingSession = sessions.find(s => 
              s["Class ID"] === classId && 
              dayjs(s["Ngày"]).format("YYYY-MM-DD") === sessionDate
            );

            if (matchingSession) {
              const attendanceRecords = matchingSession["Điểm danh"] || [];
              const recordIndex = attendanceRecords.findIndex(
                (r: any) => r["Student ID"] === editingScoresStudent.studentId
              );
              if (recordIndex !== -1) {
                updates[`datasheet/Điểm_danh_sessions/${matchingSession.id}/Điểm danh/${recordIndex}/Điểm kiểm tra`] = newScore;
              }
            }
          }
        }
      }

      // Apply all updates
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        message.success("Đã cập nhật điểm thành công!");
        setEditScoresModalOpen(false);
        setEditingScoresStudent(null);
        setEditingScores({});
      } else {
        message.warning("Không có thay đổi nào để lưu");
      }
    } catch (error) {
      console.error("Error saving scores:", error);
      message.error("Có lỗi khi lưu điểm");
    } finally {
      setSaving(false);
    }
  };

  // Submit single student report
  const handleSubmitSingle = async (studentId: string) => {
    if (!isMonthEnded) {
      message.warning("Chỉ có thể gửi báo cáo cho tháng đã kết thúc!");
      return;
    }

    const row = reportData.find((r) => r.studentId === studentId);
    if (!row || !canEdit(row.status)) {
      message.warning("Không thể gửi báo cáo này!");
      return;
    }

    // Kiểm tra xem có nhận xét cho ít nhất 1 lớp không
    const hasClassComment = row.classStats.some(cs => cs.comment && cs.comment.trim());
    if (!hasClassComment && !row.finalComment && !row.aiComment) {
      message.warning(`Học sinh ${row.studentName} chưa có nhận xét! Vui lòng thêm nhận xét cho ít nhất 1 môn.`);
      return;
    }

    setSaving(true);
    const monthStr = selectedMonth.format("YYYY-MM");

    try {
      const stats: MonthlyReportStats = {
        totalSessions: row.totalSessions,
        presentSessions: row.presentSessions,
        absentSessions: row.absentSessions,
        attendanceRate: row.attendanceRate,
        averageScore: row.averageScore,
        classStats: row.classStats,
      };

      const commentData: Omit<MonthlyComment, "id"> = {
        studentId: row.studentId,
        studentName: row.studentName,
        studentCode: row.studentCode,
        teacherId: actualTeacherId,
        teacherName,
        classIds: row.classIds,
        classNames: row.classNames,
        month: monthStr,
        aiComment: row.aiComment,
        finalComment: row.finalComment || row.aiComment,
        stats,
        status: "submitted",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        submittedBy: userProfile?.email || "",
      };

      if (row.existingCommentId) {
        await update(ref(database, `datasheet/Nhận_xét_tháng/${row.existingCommentId}`), {
          ...commentData,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const newRef = push(ref(database, "datasheet/Nhận_xét_tháng"));
        await update(newRef, commentData);
      }

      message.success(`Đã gửi báo cáo của ${row.studentName} cho Admin duyệt!`);
    } catch (error) {
      console.error("Error submitting single:", error);
      message.error("Có lỗi khi gửi báo cáo");
    } finally {
      setSaving(false);
    }
  };

  // Has locked reports
  const hasLockedReports = useMemo(() => {
    return reportData.some((r) => r.status === "submitted" || r.status === "approved");
  }, [reportData]);

  // Editable rows count
  const editableCount = useMemo(() => {
    return reportData.filter((r) => canEdit(r.status)).length;
  }, [reportData]);

  // Columns - hiển thị dropdown các lớp ngay trong bảng
  const columns = [
    {
      title: "STT",
      dataIndex: "index",
      key: "index",
      width: 50,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Học sinh",
      key: "student",
      width: 280,
      render: (_: any, record: StudentReportRow) => (
        <div>
          {/* Tên học sinh với link xem chi tiết */}
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            {record.studentName}
            <Tooltip title="Xem chi tiết điểm tháng này">
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => navigate(`/workspace/student-report/${record.studentId}?month=${selectedMonth.format("YYYY-MM")}`)}
                style={{ marginLeft: 4, padding: 0 }}
              />
            </Tooltip>
          </div>
          {record.studentCode && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Mã HS: {record.studentCode}
            </Text>
          )}

          {/* Dropdown các lớp ngay dưới tên */}
          <Collapse
            ghost
            size="small"
            expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} style={{ fontSize: 10 }} />}
          >
            <Panel
              key="classes"
              header={
                <Space size={4}>
                  <BookOutlined style={{ color: '#1890ff' }} />
                  <Text style={{ fontSize: 12 }}>
                    {record.classStats.length} lớp học
                  </Text>
                </Space>
              }
              style={{ padding: 0 }}
            >
              {record.classStats.map((cs, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    background: idx % 2 === 0 ? '#fafafa' : '#fff',
                    borderRadius: 4,
                    marginBottom: 4
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    <Tag color="blue">{cs.className}</Tag>
                    {cs.subject && <Tag color="cyan">{cs.subject}</Tag>}
                  </div>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Buổi học:</Text>
                      <div style={{ fontWeight: 500 }}>{cs.presentSessions}/{cs.totalSessions}</div>
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Chuyên cần:</Text>
                      <div style={{ fontWeight: 500, color: cs.attendanceRate >= 80 ? '#52c41a' : '#ff4d4f' }}>
                        {cs.attendanceRate}%
                      </div>
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Điểm TB:</Text>
                      <div style={{ fontWeight: 500, color: '#722ed1' }}>
                        {cs.averageScore > 0 ? cs.averageScore.toFixed(1) : '-'}
                      </div>
                    </Col>
                  </Row>
                </div>
              ))}
            </Panel>
          </Collapse>
        </div>
      ),
    },
    {
      title: "Tổng hợp",
      key: "summary",
      width: 150,
      render: (_: any, record: StudentReportRow) => (
        <div style={{ textAlign: 'center' }}>
          <Row gutter={[8, 8]}>
            <Col span={12}>
              <Statistic
                title={<span style={{ fontSize: 10 }}>Buổi học</span>}
                value={record.presentSessions}
                suffix={`/${record.totalSessions}`}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={<span style={{ fontSize: 10 }}>Chuyên cần</span>}
                value={record.attendanceRate}
                suffix="%"
                valueStyle={{
                  fontSize: 14,
                  color: record.attendanceRate >= 80 ? '#52c41a' : '#ff4d4f'
                }}
              />
            </Col>
          </Row>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 10 }}>Điểm TB: </Text>
            <Text strong style={{ color: '#722ed1' }}>
              {record.averageScore > 0 ? record.averageScore.toFixed(1) : '-'}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 200,
      render: (_: any, record: StudentReportRow) => {
        const isLocked = !canEdit(record.status);
        const cannotEdit = !isMonthEnded;
        // Kiểm tra xem có nhận xét cho ít nhất 1 lớp không
        const hasClassComment = record.classStats.some(cs => cs.comment && cs.comment.trim());
        const hasAnyComment = hasClassComment || record.finalComment || record.aiComment;

        return (
          <Space direction="vertical" size={4}>
            <Tooltip title="Xem và sửa điểm các buổi học">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleOpenEditScores(record)}
                block
                style={{ borderColor: '#1890ff', color: '#1890ff' }}
              >
                Sửa điểm
              </Button>
            </Tooltip>
            <Tooltip title={
              cannotEdit ? "Chỉ có thể tạo báo cáo cho tháng đã kết thúc" :
                isLocked ? "Không thể sửa (đã gửi/duyệt)" :
                  "Xem & chỉnh sửa nhận xét theo môn"
            }>
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleOpenEditModal(record)}
                disabled={isLocked || cannotEdit}
                block
              >
                Nhận xét
              </Button>
            </Tooltip>
            {!isLocked && !record.aiComment && (
              <Tooltip title={cannotEdit ? "Chỉ có thể tạo cho tháng đã kết thúc" : "Tạo nhận xét AI"}>
                <Button
                  size="small"
                  icon={<RobotOutlined />}
                  onClick={() => handleGenerateSingleAI(record.studentId)}
                  disabled={cannotEdit}
                  block
                >
                  Tạo AI
                </Button>
              </Tooltip>
            )}
            {/* Nút Gửi riêng cho từng học sinh */}
            {!isLocked && hasAnyComment && (
              <Popconfirm
                title="Gửi báo cáo?"
                description={`Gửi báo cáo của ${record.studentName} cho Admin duyệt?`}
                onConfirm={() => handleSubmitSingle(record.studentId)}
                okText="Gửi"
                cancelText="Hủy"
              >
                <Tooltip title={cannotEdit ? "Chỉ có thể gửi cho tháng đã kết thúc" : "Gửi báo cáo cho Admin duyệt"}>
                  <Button
                    type="default"
                    size="small"
                    icon={<SendOutlined />}
                    disabled={cannotEdit}
                    loading={saving}
                    style={{
                      borderColor: '#52c41a',
                      color: '#52c41a'
                    }}
                    block
                  >
                    Gửi Admin
                  </Button>
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <WrapperContent title="Báo cáo học sinh theo tháng">
      <Card>
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={8}>
            <Text strong>Chọn tháng:</Text>
            <DatePicker
              picker="month"
              style={{ width: "100%", marginTop: 8 }}
              value={selectedMonth}
              onChange={(date) => date && setSelectedMonth(date)}
              format="MM/YYYY"
            />
          </Col>
          <Col xs={24} md={16} style={{ display: "flex", alignItems: "flex-end" }}>
            <Space wrap>
              <Tooltip title={editableCount === 0 ? "Không có báo cáo nào có thể tạo AI" : ""}>
                <Button
                  type="primary"
                  icon={<RobotOutlined />}
                  onClick={handleGenerateAIComments}
                  loading={generatingAI}
                  disabled={reportData.length === 0 || editableCount === 0}
                >
                  Tạo nhận xét AI ({editableCount} HS)
                </Button>
              </Tooltip>
            </Space>
          </Col>
        </Row>

        {/* Warning for locked reports */}
        {hasLockedReports && (
          <Alert
            type="info"
            showIcon
            message="Một số báo cáo đã được gửi hoặc duyệt"
            description="Những báo cáo có trạng thái 'Chờ duyệt' hoặc 'Đã duyệt' không thể chỉnh sửa."
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Progress bar when generating */}
        {generatingAI && (
          <Alert
            type="info"
            showIcon
            icon={<RobotOutlined spin />}
            message="Đang tạo nhận xét AI..."
            description={
              <Progress percent={generatingProgress} status="active" />
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Summary Info */}
        {reportData.length > 0 && (
          <Alert
            type="info"
            message={
              <Space split="|">
                <span>
                  Tháng: <strong>{selectedMonth.format("MM/YYYY")}</strong>
                </span>
                <span>
                  Tổng học sinh: <strong>{reportData.length}</strong>
                </span>
                <span>
                  Có thể sửa: <strong>{editableCount}</strong>
                </span>
                <span>
                  Tổng số lớp: <strong>{classes.length}</strong>
                </span>
              </Space>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Table */}
        <Table
          dataSource={reportData}
          columns={columns}
          pagination={false}
          loading={loading}
          scroll={{ x: 800 }}
          locale={{ emptyText: "Không có học sinh nào có buổi học trong tháng này" }}
        />

        {/* Action buttons */}
        {editableCount > 0 && isMonthEnded && (
          <Row justify="end" style={{ marginTop: 24 }} gutter={16}>
            <Col>
              <Button
                icon={<SaveOutlined />}
                onClick={handleSaveDraft}
                loading={saving}
              >
                Lưu nháp ({editableCount})
              </Button>
            </Col>
            <Col>
              <Popconfirm
                title="Gửi báo cáo cho Admin?"
                description={`${editableCount} báo cáo sẽ được gửi. Sau khi gửi, bạn không thể chỉnh sửa.`}
                onConfirm={handleSubmit}
                okText="Gửi"
                cancelText="Hủy"
              >
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={saving}
                >
                  Gửi báo cáo ({editableCount})
                </Button>
              </Popconfirm>
            </Col>
          </Row>
        )}
      </Card>

      {/* Edit Modal */}
      {selectedStudent && canEdit(selectedStudent.status) && (
        <TeacherCommentEditModal
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedStudent(null);
          }}
          onSave={handleModalSave}
          student={{
            id: selectedStudent.studentId,
            name: selectedStudent.studentName,
          }}
          month={selectedMonth.format("YYYY-MM")}
          classInfo={{
            id: selectedStudent.classIds.join(","),
            name: selectedStudent.classNames.join(", "),
          }}
          aiComment={selectedStudent.aiComment}
          initialComment={selectedStudent.finalComment}
          stats={{
            totalSessions: selectedStudent.totalSessions,
            presentSessions: selectedStudent.presentSessions,
            absentSessions: selectedStudent.absentSessions,
            attendanceRate: selectedStudent.attendanceRate,
            averageScore: selectedStudent.averageScore,
          }}
          onGenerateAI={() => handleGenerateSingleAI(selectedStudent.studentId)}
          classStats={selectedStudent.classStats}
        />
      )}

      {/* Edit Scores Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EditOutlined style={{ color: '#1890ff' }} />
            <span>Sửa điểm - {editingScoresStudent?.studentName} (Tháng {selectedMonth.format("MM/YYYY")})</span>
          </div>
        }
        open={editScoresModalOpen}
        onCancel={() => {
          setEditScoresModalOpen(false);
          setEditingScoresStudent(null);
          setEditingScores({});
        }}
        width={900}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setEditScoresModalOpen(false);
              setEditingScoresStudent(null);
              setEditingScores({});
            }}
          >
            Hủy
          </Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveScores}
            loading={saving}
          >
            Lưu thay đổi
          </Button>,
        ]}
      >
        {editingScoresStudent && (
          <div>
            <Alert
              message="Lưu ý"
              description="Thay đổi điểm ở đây sẽ tự động cập nhật vào phần Điểm danh. Điểm trung bình sẽ được tính lại tự động."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            {editingScoresStudent.classIds.map((classId, classIndex) => {
              const monthStr = selectedMonth.format("YYYY-MM");
              const classScores = customScoresData[classId];
              const deletedColumns = classScores?.deletedColumns || [];
              
              // Get all score columns for this class in this month
              const scoreColumns: { columnKey: string; columnName: string; date: string; testName: string }[] = [];
              
              if (classScores?.columns) {
                classScores.columns.forEach((columnName: string) => {
                  // Skip deleted columns
                  if (deletedColumns.includes(columnName)) return;
                  
                  // Check if column belongs to this month
                  const dateMatch = columnName.match(/\((\d{2}-\d{2}-\d{4})\)$/);
                  if (dateMatch) {
                    const [day, month, year] = dateMatch[1].split("-");
                    const columnMonth = `${year}-${month}`;
                    if (columnMonth === monthStr) {
                      const testName = columnName.replace(/\s*\(\d{2}-\d{2}-\d{4}\)$/, "").trim();
                      scoreColumns.push({
                        columnKey: `${classId}|${columnName}`,
                        columnName,
                        date: `${year}-${month}-${day}`,
                        testName: testName || "Điểm",
                      });
                    }
                  }
                });
              }
              
              // Sort by date
              scoreColumns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

              const className = editingScoresStudent.classNames[classIndex];
              const classStats = editingScoresStudent.classStats.find(cs => cs.classId === classId);

              // Find student's current scores
              const studentScore = classScores?.scores?.find(
                (s: any) => s.studentId === editingScoresStudent.studentId
              );

              return (
                <div key={classId} style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      background: '#f0f5ff',
                      padding: '12px 16px',
                      borderRadius: 8,
                      marginBottom: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <Tag color="blue" style={{ fontSize: 14 }}>{className}</Tag>
                      {classStats?.subject && <Tag color="cyan">{classStats.subject}</Tag>}
                    </div>
                    <Text type="secondary">
                      Điểm TB hiện tại: <Text strong style={{ color: '#722ed1' }}>
                        {classStats?.averageScore ? classStats.averageScore.toFixed(1) : '-'}
                      </Text>
                    </Text>
                  </div>

                  {scoreColumns.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                      Chưa có cột điểm nào trong tháng này
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          <th style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center', width: '100px' }}>Ngày</th>
                          <th style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'left' }}>Tên cột điểm</th>
                          <th style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center', width: '120px' }}>Điểm hiện tại</th>
                          <th style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center', width: '150px' }}>Điểm mới</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scoreColumns.map((col) => {
                          const currentScore = studentScore?.[col.columnName] ?? null;

                          return (
                            <tr key={col.columnKey}>
                              <td style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center' }}>
                                {dayjs(col.date).format("DD/MM/YYYY")}
                              </td>
                              <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}>
                                {col.testName}
                              </td>
                              <td style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center' }}>
                                <Text strong style={{ fontSize: 14 }}>
                                  {currentScore !== null && currentScore !== undefined ? currentScore : '-'}
                                </Text>
                              </td>
                              <td style={{ border: '1px solid #d9d9d9', padding: '8px', textAlign: 'center' }}>
                                <Input
                                  type="number"
                                  min={0}
                                  max={10}
                                  step={0.5}
                                  value={editingScores[col.columnKey] ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    handleScoreChange(
                                      col.columnKey,
                                      value === '' ? null : parseFloat(value)
                                    );
                                  }}
                                  placeholder="Nhập điểm"
                                  style={{ width: '100%' }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </WrapperContent>
  );
};

export default TeacherMonthlyReport;
