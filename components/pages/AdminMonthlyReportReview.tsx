import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Select,
  DatePicker,
  Space,
  Tag,
  message,
  Modal,
  Row,
  Col,
  Typography,
  Statistic,
  Popconfirm,
  Input,
  Divider,
  Descriptions,
  Collapse,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  CheckOutlined,
  SearchOutlined,
  CloseOutlined,
  BookOutlined,
  UserOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { ref, onValue, update } from "firebase/database";
import { database } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { Class, MonthlyComment, AttendanceSession, ClassStats } from "../../types";
import WrapperContent from "../WrapperContent";
import dayjs from "dayjs";

const { Text } = Typography;
const { Panel } = Collapse;

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh"?: string;
  "Ngày sinh"?: string;
  "Số điện thoại"?: string;
  "Email"?: string;
  "Địa chỉ"?: string;
}

const AdminMonthlyReportReview = () => {
  const { userProfile } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [allComments, setAllComments] = useState<MonthlyComment[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs>(dayjs());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Print modal
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [selectedComment, setSelectedComment] = useState<MonthlyComment | null>(null);

  // Load classes
  useEffect(() => {
    const classesRef = ref(database, "datasheet/Lớp_học");
    const unsubscribe = onValue(classesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const classList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Class, "id">),
        }));
        setClasses(classList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load all monthly comments
  useEffect(() => {
    const commentsRef = ref(database, "datasheet/Nhận_xét_tháng");
    const unsubscribe = onValue(commentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const commentList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<MonthlyComment, "id">),
        }));
        setAllComments(commentList);
      } else {
        setAllComments([]);
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

  // Filter và MERGE comments theo học sinh - gộp nhiều báo cáo của cùng 1 học sinh thành 1
  const filteredComments = useMemo(() => {
    const monthStr = selectedMonth.format("YYYY-MM");

    // Lọc các comments trong tháng đã submitted hoặc approved
    let filtered = allComments.filter((c) => c.month === monthStr);
    filtered = filtered.filter((c) => c.status === "submitted" || c.status === "approved");

    // MERGE: Gộp các báo cáo của cùng 1 học sinh trong cùng 1 tháng
    const studentReportMap = new Map<string, MonthlyComment>();
    
    filtered.forEach((comment) => {
      const key = `${comment.studentId}_${comment.month}`;
      const existing = studentReportMap.get(key);
      
      if (!existing) {
        // Clone comment để không modify original
        studentReportMap.set(key, {
          ...comment,
          classIds: [...(comment.classIds || [])],
          classNames: [...(comment.classNames || [])],
          stats: {
            ...comment.stats,
            classStats: [...(comment.stats?.classStats || [])],
          },
        });
      } else {
        // Merge: thêm các lớp mới vào báo cáo hiện có
        const newClassIds = (comment.classIds || []).filter(
          (id) => !(existing.classIds || []).includes(id)
        );
        const newClassNames = (comment.classNames || []).filter(
          (name, idx) => {
            const classId = (comment.classIds || [])[idx];
            return !(existing.classIds || []).includes(classId);
          }
        );
        const newClassStats = (comment.stats?.classStats || []).filter(
          (cs) => !(existing.stats?.classStats || []).some((ecs) => ecs.classId === cs.classId)
        );

        // Merge vào existing
        existing.classIds = [...(existing.classIds || []), ...newClassIds];
        existing.classNames = [...(existing.classNames || []), ...newClassNames];
        existing.stats = {
          ...existing.stats,
          classStats: [...(existing.stats?.classStats || []), ...newClassStats],
          // Recalculate totals
          totalSessions: (existing.stats?.totalSessions || 0) + (comment.stats?.totalSessions || 0),
          presentSessions: (existing.stats?.presentSessions || 0) + (comment.stats?.presentSessions || 0),
          absentSessions: (existing.stats?.absentSessions || 0) + (comment.stats?.absentSessions || 0),
          attendanceRate: 0, // Will recalculate
          averageScore: 0, // Will recalculate
        };
        
        // Recalculate averages
        const totalSessions = existing.stats.totalSessions || 0;
        const presentSessions = existing.stats.presentSessions || 0;
        existing.stats.attendanceRate = totalSessions > 0 
          ? Math.round((presentSessions / totalSessions) * 100) 
          : 0;
        
        // Average score from all class stats
        const allClassStats = existing.stats.classStats || [];
        if (allClassStats.length > 0) {
          const totalScore = allClassStats.reduce((sum, cs) => sum + (cs.averageScore || 0), 0);
          existing.stats.averageScore = totalScore / allClassStats.length;
        }

        // Merge comments
        if (comment.finalComment && !existing.finalComment.includes(comment.finalComment)) {
          existing.finalComment = existing.finalComment 
            ? `${existing.finalComment}\n\n---\n\n${comment.finalComment}`
            : comment.finalComment;
        }
        
        // Keep most recent status - if any is 'submitted', keep submitted
        if (comment.status === 'submitted' || existing.status === 'submitted') {
          existing.status = 'submitted';
        }
      }
    });

    let merged = Array.from(studentReportMap.values());

    // Apply status filter
    if (statusFilter !== "all") {
      merged = merged.filter((c) => c.status === statusFilter);
    }

    // Apply search filter
    if (searchText) {
      merged = merged.filter(
        (c) =>
          c.studentName.toLowerCase().includes(searchText.toLowerCase()) ||
          c.teacherName.toLowerCase().includes(searchText.toLowerCase()) ||
          (c.classNames || []).join(", ").toLowerCase().includes(searchText.toLowerCase())
      );
    }

    return merged.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
  }, [allComments, selectedMonth, statusFilter, searchText]);

  // Stats - đếm theo số HỌC SINH (sau khi merge), không phải số records
  const stats = useMemo(() => {
    const monthStr = selectedMonth.format("YYYY-MM");
    const monthComments = allComments.filter((c) => c.month === monthStr);
    
    // Merge theo student để đếm đúng
    const studentMap = new Map<string, { status: string }>();
    monthComments.forEach((c) => {
      if (c.status === "submitted" || c.status === "approved") {
        const existing = studentMap.get(c.studentId);
        if (!existing) {
          studentMap.set(c.studentId, { status: c.status });
        } else {
          // Nếu có bất kỳ submitted nào thì coi như submitted
          if (c.status === 'submitted') {
            existing.status = 'submitted';
          }
        }
      }
    });
    
    const merged = Array.from(studentMap.values());
    return {
      total: merged.length,
      submitted: merged.filter((c) => c.status === "submitted").length,
      approved: merged.filter((c) => c.status === "approved").length,
    };
  }, [allComments, selectedMonth]);

  // Approve single comment
  const handleApproveSingle = async (comment: MonthlyComment) => {
    try {
      await update(ref(database, `datasheet/Nhận_xét_tháng/${comment.id}`), {
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: userProfile?.email || "",
      });
      message.success("Đã duyệt!");
    } catch (error) {
      console.error("Error approving:", error);
      message.error("Có lỗi khi duyệt");
    }
  };

  // Reject single comment
  const handleRejectSingle = async (comment: MonthlyComment) => {
    try {
      await update(ref(database, `datasheet/Nhận_xét_tháng/${comment.id}`), {
        status: "draft",
        rejectedAt: new Date().toISOString(),
        rejectedBy: userProfile?.email || "",
        submittedAt: null,
        submittedBy: null,
      });
      message.success("Đã từ chối! Giáo viên có thể chỉnh sửa lại.");
    } catch (error) {
      console.error("Error rejecting:", error);
      message.error("Có lỗi khi từ chối");
    }
  };

  // Approve all
  const handleApproveAll = async () => {
    const toApprove = filteredComments.filter((c) => c.status === "submitted");
    if (toApprove.length === 0) {
      message.info("Không có báo cáo nào cần duyệt");
      return;
    }

    try {
      const updates: { [key: string]: any } = {};
      toApprove.forEach((comment) => {
        updates[`datasheet/Nhận_xét_tháng/${comment.id}/status`] = "approved";
        updates[`datasheet/Nhận_xét_tháng/${comment.id}/approvedAt`] = new Date().toISOString();
        updates[`datasheet/Nhận_xét_tháng/${comment.id}/approvedBy`] = userProfile?.email || "";
      });

      await update(ref(database), updates);
      message.success(`Đã duyệt ${toApprove.length} báo cáo!`);
    } catch (error) {
      console.error("Error approving all:", error);
      message.error("Có lỗi khi duyệt");
    }
  };

  // Print
  const handlePrint = (comment: MonthlyComment) => {
    setSelectedComment(comment);
    setPrintModalOpen(true);
  };

  // Generate print content - với LỊCH SỬ HỌC TẬP CHI TIẾT giống ảnh mẫu
  const generatePrintContent = (comment: MonthlyComment) => {
    const monthDisplay = dayjs(comment.month).format("MM/YYYY");
    const monthStr = comment.month;
    
    const studentInfo = students.find((s) => s.id === comment.studentId);
    const classIds = comment.classIds || [];
    const classStats = comment.stats?.classStats || [];

    // Get sessions for all classes
    const allStudentSessions = sessions
      .filter((s) => {
        const sessionMonth = dayjs(s["Ngày"]).format("YYYY-MM");
        return (
          classIds.includes(s["Class ID"]) &&
          sessionMonth === monthStr &&
          s["Điểm danh"]?.some((r) => r["Student ID"] === comment.studentId)
        );
      })
      .sort((a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime());

    // Generate BẢNG ĐIỂM THEO MÔN - giống ảnh mẫu
    let scoreTablesHTML = "";
    classStats.forEach((cs: ClassStats) => {
      const classSessions = allStudentSessions.filter((s) => s["Class ID"] === cs.classId);
      
      let tableRows = "";
      classSessions.forEach((session) => {
        const record = session["Điểm danh"]?.find((r) => r["Student ID"] === comment.studentId);
        if (record) {
          const date = dayjs(session["Ngày"]).format("DD/MM");
          const attendance = record["Có mặt"]
            ? record["Đi muộn"] ? "Muộn" : "✓"
            : record["Vắng có phép"] ? "P" : "✗";
          const attendanceColor = record["Có mặt"]
            ? record["Đi muộn"] ? "#fa8c16" : "#52c41a"
            : record["Vắng có phép"] ? "#1890ff" : "#f5222d";
          const homeworkPercent = record["% Hoàn thành BTVN"] ?? "-";
          const testName = record["Bài kiểm tra"] || "-";
          const score = record["Điểm kiểm tra"] ?? record["Điểm"] ?? "-";
          const bonusScore = record["Điểm thưởng"] ?? "-";
          const note = record["Ghi chú"] || "-";

          tableRows += `
            <tr>
              <td style="text-align: center;">${date}</td>
              <td style="text-align: center; color: ${attendanceColor}; font-weight: bold;">${attendance}</td>
              <td style="text-align: center;">${homeworkPercent}${homeworkPercent !== '-' ? '%' : ''}</td>
              <td style="text-align: left; font-size: 11px;">${testName}</td>
              <td style="text-align: center; font-weight: bold;">${score}</td>
              <td style="text-align: center;">${bonusScore}</td>
              <td style="text-align: left; font-size: 10px;">${note}</td>
            </tr>
          `;
        }
      });

      scoreTablesHTML += `
        <div class="subject-section">
          <div class="subject-header">
            <span class="subject-name">📚 ${cs.className} ${cs.subject ? `(${cs.subject})` : ""}</span>
            <span class="subject-avg">TB: <strong>${cs.averageScore > 0 ? cs.averageScore.toFixed(1) : "-"}</strong></span>
          </div>
          <table class="score-table">
            <thead>
              <tr>
                <th style="width: 55px;">Ngày</th>
                <th style="width: 65px;">Chuyên cần</th>
                <th style="width: 55px;">% BTVN</th>
                <th style="width: 100px;">Tên bài KT</th>
                <th style="width: 50px;">Điểm</th>
                <th style="width: 65px;">Điểm thưởng</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="7" style="text-align: center; color: #999;">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>
          ${cs.comment ? `
          <div class="subject-comment">
            <div class="comment-label">📝 Nhận xét môn học:</div>
            <div class="comment-content">${cs.comment.replace(/\n/g, "<br/>")}</div>
          </div>
          ` : ""}
        </div>
      `;
    });

    // Generate LỊCH SỬ HỌC TẬP CHI TIẾT - giống ảnh mẫu
    let historyTableRows = "";
    allStudentSessions.forEach((session) => {
      const record = session["Điểm danh"]?.find((r) => r["Student ID"] === comment.studentId);
      if (record) {
        const date = dayjs(session["Ngày"]).format("DD/MM/YYYY");
        const classInfo = classes.find((c) => c.id === session["Class ID"]);
        const className = classInfo?.["Tên lớp"] || session["Tên lớp"] || "-";
        const timeRange = `${session["Giờ bắt đầu"]} - ${session["Giờ kết thúc"]}`;
        const attendance = record["Có mặt"]
          ? record["Đi muộn"] ? "Đi muộn" : "Có mặt"
          : record["Vắng có phép"] ? "Vắng có phép" : "Vắng";
        const attendanceColor = record["Có mặt"]
          ? record["Đi muộn"] ? "#fa8c16" : "#52c41a"
          : record["Vắng có phép"] ? "#1890ff" : "#f5222d";
        const score = record["Điểm kiểm tra"] ?? record["Điểm"] ?? "-";
        const testName = record["Bài kiểm tra"] || "-";
        const note = record["Ghi chú"] || "-";

        historyTableRows += `
          <tr>
            <td style="text-align: center;">${date}</td>
            <td style="text-align: left;">${className}</td>
            <td style="text-align: center;">${timeRange}</td>
            <td style="text-align: center; color: ${attendanceColor}; font-weight: 500;">${attendance}</td>
            <td style="text-align: center; font-weight: bold;">${score}</td>
            <td style="text-align: left; font-size: 11px;">${testName}</td>
            <td style="text-align: left; font-size: 10px;">${note}</td>
          </tr>
        `;
      }
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Báo cáo học tập - ${comment.studentName}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #333;
              line-height: 1.5;
              background: #fff;
              font-size: 12px;
            }
            .watermark-container { position: relative; }
            .watermark-logo {
              position: absolute; 
              top: 50%; 
              left: 50%;
              transform: translate(-50%, -50%);
              z-index: 0; 
              pointer-events: none;
            }
            .watermark-logo img {
              width: 600px; height: 600px;
              max-width: 80vw;
              object-fit: contain; opacity: 0.22; filter: grayscale(25%);
            }
            .report-content { position: relative; z-index: 1; }
            .header {
              text-align: center;
              border-bottom: 3px solid #004aad;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .header h1 {
              color: #004aad;
              font-size: 22px;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .header p { color: #666; margin: 5px 0 0; font-size: 12px; }
            .section { margin-bottom: 18px; }
            .section-title {
              font-weight: bold;
              color: #004aad;
              border-left: 4px solid #004aad;
              padding-left: 10px;
              margin-bottom: 10px;
              font-size: 14px;
              text-transform: uppercase;
            }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; }
            th { background-color: #004aad; color: #fff; text-align: center; font-weight: 600; }
            tr:nth-child(even) { background-color: #f8f9fa; }
            .info-table th { background: #f0f0f0; color: #333; text-align: left; width: 130px; }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 10px;
              margin-top: 10px;
            }
            .stat-card {
              border: 1px solid #ddd;
              border-radius: 6px;
              padding: 10px;
              text-align: center;
              background: #fafafa;
            }
            .stat-value { font-size: 20px; font-weight: bold; color: #004aad; }
            .stat-label { color: #666; font-size: 11px; margin-top: 3px; }
            .subject-section { margin-bottom: 15px; }
            .subject-header {
              background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
              padding: 8px 12px;
              border-left: 4px solid #1890ff;
              border-radius: 4px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 6px;
            }
            .subject-name { font-weight: bold; font-size: 13px; color: #004aad; }
            .subject-avg { font-size: 12px; color: #666; }
            .score-table th { background-color: #f5f5f5; color: #333; font-size: 11px; }
            .score-table td { font-size: 11px; }
            .history-table { margin-top: 10px; }
            .history-table th { background-color: #004aad; color: #fff; font-size: 11px; }
            .history-table td { font-size: 11px; }
            .comment-section {
              margin-top: 25px;
              page-break-inside: avoid;
            }
            .comment-box {
              border: 2px solid #004aad;
              border-radius: 8px;
              padding: 15px;
              background: linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 100%);
              min-height: 100px;
              white-space: pre-wrap;
              line-height: 1.7;
              font-size: 13px;
            }
            .subject-comment {
              margin-top: 8px;
              padding: 10px 12px;
              background: rgba(240, 250, 235, 0.4);
              border-left: 3px solid rgba(82, 196, 26, 0.7);
              border-radius: 4px;
            }
            .subject-comment .comment-label {
              font-weight: bold;
              color: #389e0d;
              margin-bottom: 5px;
              font-size: 12px;
            }
            .subject-comment .comment-content {
              color: #333;
              font-size: 12px;
              line-height: 1.6;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              color: #888;
              font-size: 11px;
              border-top: 1px solid #ccc;
              padding-top: 10px;
            }
            .classes-list {
              display: flex;
              flex-wrap: wrap;
              gap: 5px;
              margin-top: 5px;
            }
            .class-tag {
              background: #e6f7ff;
              color: #1890ff;
              padding: 2px 8px;
              border-radius: 4px;
              font-size: 11px;
            }
            @media print { 
              body { margin: 0; } 
              .no-print { display: none; }
              .watermark-logo {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 0;
                pointer-events: none;
              }
              .watermark-logo img {
                width: 650px;
                height: 650px;
                opacity: 0.25;
                filter: grayscale(25%);
              }
            }
          </style>
        </head>
        <body>
          <div class="watermark-container">
            <div class="watermark-logo">
              <img src="/img/logo.png" alt="Background Logo" />
            </div>
            <div class="report-content">
              <div class="header">
                <h1>BÁO CÁO HỌC TẬP THÁNG ${monthDisplay}</h1>
                <p>Ngày xuất: ${dayjs().format("DD/MM/YYYY HH:mm")}</p>
              </div>

              <div class="section">
                <div class="section-title">Thông tin học sinh</div>
                <table class="info-table">
                  <tr><th>Họ và tên</th><td><strong>${comment.studentName}</strong></td></tr>
                  <tr><th>Mã học sinh</th><td>${comment.studentCode || studentInfo?.["Mã học sinh"] || "-"}</td></tr>
                  <tr><th>Ngày sinh</th><td>${studentInfo?.["Ngày sinh"] ? dayjs(studentInfo["Ngày sinh"]).format("DD/MM/YYYY") : "-"}</td></tr>
                  <tr>
                    <th>Các lớp đang học</th>
                    <td>
                      <div class="classes-list">
                        ${(comment.classNames || []).map((name: string) => `<span class="class-tag">${name}</span>`).join("")}
                      </div>
                    </td>
                  </tr>
                  <tr><th>Giáo viên</th><td>${comment.teacherName}</td></tr>
                </table>
              </div>

              <div class="section">
                <div class="section-title">Thống kê tổng hợp tháng ${monthDisplay}</div>
                <div class="stats-grid">
                  <div class="stat-card">
                    <div class="stat-value">${comment.stats?.totalSessions || 0}</div>
                    <div class="stat-label">Tổng số buổi</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value" style="color: #52c41a;">${comment.stats?.presentSessions || 0}</div>
                    <div class="stat-label">Số buổi có mặt</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value" style="color: #ff4d4f;">${comment.stats?.absentSessions || 0}</div>
                    <div class="stat-label">Số buổi vắng</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value" style="color: #1890ff;">${comment.stats?.attendanceRate || 0}%</div>
                    <div class="stat-label">Tỷ lệ tham gia</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value" style="color: #722ed1;">${comment.stats?.averageScore > 0 ? comment.stats.averageScore.toFixed(1) : "0"}</div>
                    <div class="stat-label">Điểm trung bình</div>
                  </div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">Bảng điểm theo môn</div>
                ${scoreTablesHTML || '<p style="color: #999; text-align: center;">Không có dữ liệu</p>'}
              </div>

              <div class="section" style="page-break-before: auto;">
                <div class="section-title">Lịch sử học tập chi tiết</div>
                <table class="history-table">
                  <thead>
                    <tr>
                      <th style="width: 80px;">Ngày</th>
                      <th style="width: 120px;">Lớp học</th>
                      <th style="width: 90px;">Giờ học</th>
                      <th style="width: 90px;">Trạng thái</th>
                      <th style="width: 50px;">Điểm</th>
                      <th style="width: 100px;">Bài tập</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${historyTableRows || '<tr><td colspan="7" style="text-align: center; color: #999;">Không có dữ liệu</td></tr>'}
                  </tbody>
                </table>
              </div>

              <div class="footer">
                <p>Báo cáo được tạo tự động từ hệ thống quản lý học sinh.</p>
                <p style="margin-top: 5px;">Mọi thắc mắc xin liên hệ giáo viên phụ trách.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Execute print
  const executePrint = () => {
    if (!selectedComment) return;

    const printWindow = window.open("", "", "width=1000,height=800");
    if (!printWindow) return;

    printWindow.document.write(generatePrintContent(selectedComment));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);

    setPrintModalOpen(false);
  };

  // Get status tag
  const getStatusTag = (status: string) => {
    switch (status) {
      case "approved":
        return <Tag color="green" icon={<CheckCircleOutlined />}>Đã duyệt</Tag>;
      case "submitted":
        return <Tag color="blue" icon={<ClockCircleOutlined />}>Chờ duyệt</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns = [
    {
      title: "STT",
      key: "index",
      width: 50,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Học sinh",
      key: "student",
      width: 300,
      render: (_: any, record: MonthlyComment) => {
        const classStats = record.stats?.classStats || [];
        return (
          <div>
            {/* Tên học sinh */}
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              <UserOutlined style={{ marginRight: 4 }} />
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
                      {classStats.length || (record.classNames || []).length} lớp học
                    </Text>
                  </Space>
                }
                style={{ padding: 0 }}
              >
                {classStats.length > 0 ? (
                  classStats.map((cs: ClassStats, idx: number) => (
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
                  ))
                ) : (
                  (record.classNames || []).map((name: string, idx: number) => (
                    <Tag key={idx} color="blue" style={{ margin: "2px 0" }}>
                      {name}
                    </Tag>
                  ))
                )}
              </Panel>
            </Collapse>
          </div>
        );
      },
    },
    {
      title: "Tổng hợp",
      key: "summary",
      width: 160,
      render: (_: any, record: MonthlyComment) => (
        <div style={{ textAlign: 'center' }}>
          <Row gutter={[8, 8]}>
            <Col span={12}>
              <Statistic 
                title={<span style={{ fontSize: 10 }}>Buổi học</span>}
                value={record.stats?.presentSessions || 0}
                suffix={`/${record.stats?.totalSessions || 0}`}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic 
                title={<span style={{ fontSize: 10 }}>Chuyên cần</span>}
                value={record.stats?.attendanceRate || 0}
                suffix="%"
                valueStyle={{ 
                  fontSize: 14, 
                  color: (record.stats?.attendanceRate || 0) >= 80 ? '#52c41a' : '#ff4d4f' 
                }}
              />
            </Col>
          </Row>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 10 }}>Điểm TB: </Text>
            <Text strong style={{ color: '#722ed1' }}>
              {record.stats?.averageScore > 0 ? record.stats.averageScore.toFixed(1) : '-'}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: "Giáo viên",
      dataIndex: "teacherName",
      key: "teacherName",
      width: 130,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: "Ngày gửi",
      dataIndex: "submittedAt",
      key: "submittedAt",
      width: 110,
      render: (date: string) => date ? dayjs(date).format("DD/MM HH:mm") : "-",
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 200,
      render: (_: any, record: MonthlyComment) => (
        <Space wrap>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => handlePrint(record)}
          >
            In
          </Button>
          {record.status === "submitted" && (
            <>
              <Popconfirm
                title="Duyệt báo cáo này?"
                onConfirm={() => handleApproveSingle(record)}
                okText="Duyệt"
                cancelText="Hủy"
              >
                <Button size="small" type="primary" icon={<CheckOutlined />}>
                  Duyệt
                </Button>
              </Popconfirm>
              <Popconfirm
                title="Từ chối báo cáo này?"
                description="Giáo viên sẽ có thể chỉnh sửa lại."
                onConfirm={() => handleRejectSingle(record)}
                okText="Từ chối"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<CloseOutlined />}>
                  Từ chối
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  // Expanded row để xem chi tiết
  const expandedRowRender = (record: MonthlyComment) => {
    const classStats = record.stats?.classStats || [];
    return (
      <Card size="small" style={{ margin: 0 }}>
        {classStats.length > 0 && (
          <>
            <Text strong>Chi tiết từng lớp:</Text>
            <Descriptions size="small" column={4} bordered style={{ marginTop: 8 }}>
              {classStats.map((cs: ClassStats, idx: number) => (
                <Descriptions.Item
                  key={idx}
                  label={<Tag color="blue">{cs.className}</Tag>}
                  span={4}
                >
                  <div>
                    <Space size="large">
                      <span>
                        <Text type="secondary">Buổi học:</Text>{" "}
                        <Text strong style={{ color: "#52c41a" }}>{cs.presentSessions}</Text>/{cs.totalSessions}
                      </span>
                      <span>
                        <Text type="secondary">Chuyên cần:</Text>{" "}
                        <Text strong style={{ color: cs.attendanceRate >= 80 ? "#52c41a" : "#ff4d4f" }}>
                          {cs.attendanceRate}%
                        </Text>
                      </span>
                      <span>
                        <Text type="secondary">Điểm TB:</Text>{" "}
                        <Text strong style={{ color: "#722ed1" }}>
                          {cs.averageScore > 0 ? cs.averageScore.toFixed(1) : "-"}
                        </Text>
                      </span>
                      <span>
                        <Text type="secondary">Điểm thưởng:</Text>{" "}
                        <Text strong style={{ color: "#fa8c16" }}>{cs.totalBonusPoints}</Text>
                      </span>
                    </Space>
                    {cs.comment && (
                      <div style={{
                        marginTop: 8,
                        padding: "8px 12px",
                        background: "rgba(240, 250, 235, 0.4)",
                        borderLeft: "3px solid rgba(82, 196, 26, 0.7)",
                        borderRadius: 4,
                      }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>📝 Nhận xét:</Text>
                        <div style={{ marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                          {cs.comment}
                        </div>
                      </div>
                    )}
                  </div>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </>
        )}
      </Card>
    );
  };

  return (
    <WrapperContent title="Duyệt báo cáo học sinh theo tháng">
      <Card>
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8} md={6}>
            <Text strong>Tháng:</Text>
            <DatePicker
              picker="month"
              style={{ width: "100%", marginTop: 8 }}
              value={selectedMonth}
              onChange={(date) => date && setSelectedMonth(date)}
              format="MM/YYYY"
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Text strong>Trạng thái:</Text>
            <Select
              style={{ width: "100%", marginTop: 8 }}
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <Select.Option value="all">Tất cả</Select.Option>
              <Select.Option value="submitted">Chờ duyệt</Select.Option>
              <Select.Option value="approved">Đã duyệt</Select.Option>
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Text strong>Tìm kiếm:</Text>
            <Input
              style={{ marginTop: 8 }}
              placeholder="Tên học sinh, lớp, giáo viên..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={6} style={{ display: "flex", alignItems: "flex-end" }}>
            {stats.submitted > 0 && (
              <Popconfirm
                title={`Duyệt tất cả ${stats.submitted} báo cáo?`}
                onConfirm={handleApproveAll}
                okText="Duyệt"
                cancelText="Hủy"
              >
                <Button type="primary" icon={<CheckOutlined />}>
                  Duyệt tất cả ({stats.submitted})
                </Button>
              </Popconfirm>
            )}
          </Col>
        </Row>

        {/* Stats summary */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Tổng báo cáo"
                value={stats.total}
                valueStyle={{ color: "#1890ff" }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Chờ duyệt"
                value={stats.submitted}
                valueStyle={{ color: "#fa8c16" }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title="Đã duyệt"
                value={stats.approved}
                valueStyle={{ color: "#52c41a" }}
              />
            </Card>
          </Col>
        </Row>

        {/* Table */}
        <Table
          dataSource={filteredComments}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: "Không có báo cáo nào" }}
          expandable={{
            expandedRowRender,
            rowExpandable: () => true,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Print Preview Modal */}
      <Modal
        title={`Xem trước - ${selectedComment?.studentName}`}
        open={printModalOpen}
        onCancel={() => setPrintModalOpen(false)}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => setPrintModalOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={executePrint}
          >
            In báo cáo
          </Button>,
        ]}
      >
        {selectedComment && (
          <div
            style={{
              maxHeight: 500,
              overflow: "auto",
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              padding: 16,
            }}
            dangerouslySetInnerHTML={{
              __html: generatePrintContent(selectedComment),
            }}
          />
        )}
      </Modal>
    </WrapperContent>
  );
};

export default AdminMonthlyReportReview;
