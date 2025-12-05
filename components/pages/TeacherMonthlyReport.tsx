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
  BugOutlined,
} from "@ant-design/icons";
import { ref, onValue, update, push } from "firebase/database";
import { database } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { Class, AttendanceSession, MonthlyComment, MonthlyReportStats, ClassStats } from "../../types";
import { generateStudentComment, StudentReportData } from "../../utils/geminiService";
import TeacherCommentEditModal from "../TeacherCommentEditModal";
import WrapperContent from "../WrapperContent";
import dayjs from "dayjs";

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
  const [testMode, setTestMode] = useState(false); // Chế độ test - bỏ qua giới hạn tháng

  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentReportRow | null>(null);

  // Kiểm tra xem tháng đã kết thúc chưa (bỏ qua nếu đang ở chế độ test)
  const isMonthEnded = useMemo(() => {
    if (testMode) return true; // Chế độ test - luôn cho phép
    const endOfSelectedMonth = selectedMonth.endOf('month');
    const today = dayjs();
    return endOfSelectedMonth.isBefore(today, 'day');
  }, [selectedMonth, testMode]);

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

  // Lấy danh sách học sinh unique từ tất cả các lớp của teacher
  const uniqueStudentIds = useMemo(() => {
    const studentIdSet = new Set<string>();
    classes.forEach((c) => {
      c["Student IDs"]?.forEach((id) => studentIdSet.add(id));
    });
    return Array.from(studentIdSet);
  }, [classes]);

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
      const studentClasses = classes.filter((c) =>
        c["Student IDs"]?.includes(studentId)
      );

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
        let clsScores: number[] = [];
        let clsBonusPoints = 0;

        classSessions.forEach((session) => {
          const record = session["Điểm danh"]?.find((r) => r["Student ID"] === studentId);
          if (record) {
            clsTotal++;
            if (record["Có mặt"]) {
              clsPresent++;
            }
            if (record["Điểm"] != null) {
              clsScores.push(record["Điểm"]);
              allScores.push(record["Điểm"]);
            }
            if (record["Điểm thưởng"]) {
              clsBonusPoints += record["Điểm thưởng"];
              totalBonusPoints += record["Điểm thưởng"];
            }
          }
        });

        const clsAbsent = clsTotal - clsPresent;
        const clsAttendanceRate = clsTotal > 0 ? Math.round((clsPresent / clsTotal) * 100) : 0;
        const clsAvgScore = clsScores.length > 0
          ? clsScores.reduce((a, b) => a + b, 0) / clsScores.length
          : 0;

        if (clsTotal > 0) {
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

      // Find existing comment for this student & month
      const existingComment = existingComments.find(
        (c) => c.studentId === studentId && c.month === monthStr
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
    }).filter((row): row is StudentReportRow => row.totalSessions > 0);

    setReportData(data);
  }, [classes, selectedMonth, sessions, students, existingComments, uniqueStudentIds]);

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
                score: record["Điểm"] ?? undefined,
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
            score: record["Điểm"] ?? undefined,
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
        if (!row.finalComment && !row.aiComment) continue;
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
          {/* Tên học sinh */}
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            {record.studentName}
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
        {/* Test Mode Toggle - chỉ hiển thị trong dev */}
        {import.meta.env.DEV && (
          <Alert
            type="info"
            showIcon
            icon={<BugOutlined />}
            message={
              <Space>
                <span>Chế độ Test (DEV):</span>
                <Switch 
                  checked={testMode} 
                  onChange={setTestMode}
                  checkedChildren="BẬT" 
                  unCheckedChildren="TẮT"
                />
                {testMode && <Tag color="orange">Đang bỏ qua giới hạn tháng!</Tag>}
              </Space>
            }
            style={{ marginBottom: 16 }}
          />
        )}

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
              disabledDate={testMode ? undefined : (current) => current && current.isAfter(dayjs().subtract(1, 'month').endOf('month'))}
            />
          </Col>
          <Col xs={24} md={16} style={{ display: "flex", alignItems: "flex-end" }}>
            <Space wrap>
              <Tooltip title={!isMonthEnded ? "Chỉ có thể tạo báo cáo cho tháng đã kết thúc" : editableCount === 0 ? "Không có báo cáo nào có thể tạo AI" : ""}>
                <Button
                  type="primary"
                  icon={<RobotOutlined />}
                  onClick={handleGenerateAIComments}
                  loading={generatingAI}
                  disabled={reportData.length === 0 || editableCount === 0 || !isMonthEnded}
                >
                  Tạo nhận xét AI ({editableCount} HS)
                </Button>
              </Tooltip>
            </Space>
          </Col>
        </Row>

        {/* Warning nếu tháng chưa kết thúc */}
        {!isMonthEnded && !testMode && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="Tháng chưa kết thúc"
            description={`Bạn chỉ có thể tạo báo cáo cho tháng đã kết thúc. Tháng ${selectedMonth.format("MM/YYYY")} sẽ kết thúc vào ngày ${selectedMonth.endOf('month').format("DD/MM/YYYY")}.`}
            style={{ marginBottom: 16 }}
          />
        )}

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
    </WrapperContent>
  );
};

export default TeacherMonthlyReport;
