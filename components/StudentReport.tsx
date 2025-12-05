import { useRef, useState } from "react";
import {
  Modal,
  Button,
  Descriptions,
  Table,
  Tag,
  Divider,
  Card,
  Row,
  Col,
  Statistic,
  Alert,
  Spin,
  Input,
  Radio,
  Space,
  DatePicker,
} from "antd";
import {
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { useAttendanceStats } from "../hooks/useAttendanceStats";
import { AttendanceSession } from "../types";
import {
  generateStudentComment,
  StudentReportData,
} from "../utils/geminiService";
import dayjs from "dayjs";
import "dayjs/locale/vi";

dayjs.locale("vi");

interface StudentReportProps {
  open: boolean;
  onClose: () => void;
  student: {
    id: string;
    "Họ và tên": string;
    "Mã học sinh"?: string;
    "Ngày sinh"?: string;
    "Số điện thoại"?: string;
    Email?: string;
    "Địa chỉ"?: string;
    [key: string]: any;
  };
  sessions: AttendanceSession[];
}

const StudentReport = ({
  open,
  onClose,
  student,
  sessions,
}: StudentReportProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { getStudentStats } = useAttendanceStats();
  const [aiComment, setAiComment] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [commentError, setCommentError] = useState<string>("");
  const [viewMode, setViewMode] = useState<"session" | "monthly">("session");
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs | null>(dayjs());

  // Reset state when modal closes
  const handleClose = () => {
    setAiComment("");
    setCommentError("");
    setIsGenerating(false);
    onClose();
  };

  const stats = getStudentStats(student.id);

  // Filter sessions for this student
  const studentSessions = sessions
    .filter((session) =>
      session["Điểm danh"]?.some(
        (record) => record["Student ID"] === student.id
      )
    )
    .sort(
      (a, b) => new Date(b["Ngày"]).getTime() - new Date(a["Ngày"]).getTime()
    );

  // Calculate attendance rate
  const attendanceRate =
    stats.totalSessions > 0
      ? Math.round((stats.presentSessions / stats.totalSessions) * 100)
      : 0;

  // Get status tag
  const getStatusTag = (record: any) => {
    if (record["Có mặt"]) {
      if (record["Đi muộn"]) {
        return <Tag color="orange">Đi muộn</Tag>;
      }
      return <Tag color="green">Có mặt</Tag>;
    } else {
      if (record["Vắng có phép"]) {
        return <Tag color="blue">Vắng có phép</Tag>;
      }
      return <Tag color="red">Vắng không phép</Tag>;
    }
  };

  const columns = [
    {
      title: "Ngày",
      dataIndex: "Ngày",
      key: "date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
      width: 100,
    },
    {
      title: "Lớp học",
      dataIndex: "Tên lớp",
      key: "class",
      width: 150,
    },
    {
      title: "Giờ học",
      key: "time",
      render: (_: any, record: AttendanceSession) =>
        `${record["Giờ bắt đầu"]} - ${record["Giờ kết thúc"]}`,
      width: 100,
    },
    {
      title: "Trạng thái",
      key: "status",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord ? getStatusTag(studentRecord) : "-";
      },
      width: 120,
    },
    {
      title: "% BTVN",
      key: "homework_percentage",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        const percent = studentRecord?.["% Hoàn thành BTVN"];
        return percent !== null && percent !== undefined ? `${percent}%` : "-";
      },
      width: 80,
    },
    {
      title: "Điểm thưởng",
      key: "bonus_points",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Điểm thưởng"] ?? "-";
      },
      width: 90,
    },
    {
      title: "Bài kiểm tra",
      key: "test_name",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Bài kiểm tra"] || "-";
      },
      width: 150,
    },
    {
      title: "Điểm KT",
      key: "test_score",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Điểm kiểm tra"] ?? "-";
      },
      width: 80,
    },
    {
      title: "Điểm",
      key: "score",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Điểm"] ?? "-";
      },
      width: 80,
    },
    {
      title: "Bài tập",
      key: "homework",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        const completed = studentRecord?.["Bài tập hoàn thành"];
        const total = record["Bài tập"]?.["Tổng số bài"];
        if (completed !== undefined && total) {
          return `${completed}/${total}`;
        }
        return "-";
      },
      width: 100,
    },
    {
      title: "Ghi chú",
      key: "note",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Ghi chú"] || "-";
      },
    },
  ];

  const generateBasicComment = (averageScore: number) => {
    let comment = `Nhận xét về học sinh ${student["Họ và tên"]}:\n\n`;

    // Attendance evaluation
    if (attendanceRate >= 90) {
      comment += `✅ Chuyên cần: Xuất sắc với tỷ lệ tham gia ${attendanceRate}%. Em rất chăm chỉ và đều đặn đến lớp.\n\n`;
    } else if (attendanceRate >= 75) {
      comment += `✅ Chuyên cần: Tốt với tỷ lệ tham gia ${attendanceRate}%. Em cần duy trì sự đều đặn này.\n\n`;
    } else if (attendanceRate >= 50) {
      comment += `⚠️ Chuyên cần: Trung bình với tỷ lệ tham gia ${attendanceRate}%. Em cần cải thiện việc đi học đều đặn hơn.\n\n`;
    } else {
      comment += `❌ Chuyên cần: Cần cải thiện với tỷ lệ tham gia ${attendanceRate}%. Phụ huynh cần theo dõi sát sao hơn.\n\n`;
    }

    // Academic performance
    if (averageScore >= 8) {
      comment += `🌟 Kết quả học tập: Xuất sắc với điểm trung bình ${averageScore}/10. Em có năng lực học tập tốt.\n\n`;
    } else if (averageScore >= 6.5) {
      comment += `✅ Kết quả học tập: Khá với điểm trung bình ${averageScore}/10. Em đang tiến bộ tốt.\n\n`;
    } else if (averageScore >= 5) {
      comment += `⚠️ Kết quả học tập: Trung bình với điểm trung bình ${averageScore}/10. Em cần nỗ lực hơn nữa.\n\n`;
    } else if (averageScore > 0) {
      comment += `❌ Kết quả học tập: Yếu với điểm trung bình ${averageScore}/10. Em cần sự hỗ trợ thêm từ giáo viên và phụ huynh.\n\n`;
    }

    // General advice
    comment += `💡 Lời khuyên: `;
    if (attendanceRate < 75) {
      comment += `Hãy đảm bảo em đi học đều đặn để không bỏ lỡ kiến thức. `;
    }
    if (averageScore < 6.5 && averageScore > 0) {
      comment += `Dành thêm thời gian ôn tập và làm bài tập về nhà. `;
    }
    comment += `Tiếp tục cố gắng và giữ vững tinh thần học tập!\n\n`;

    // Encouragement
    comment += `🎯 Kỳ vọng: Với ${stats.totalHours} giờ học và ${stats.totalSessions} buổi học, em đã có nền tảng tốt. Hãy tiếp tục phát huy và hoàn thiện bản thân mỗi ngày!`;

    return comment;
  };

  const handleGenerateComment = async () => {
    setIsGenerating(true);
    setCommentError("");

    try {
      // Calculate average score
      const scores = studentSessions
        .map(
          (s) =>
            s["Điểm danh"]?.find((r) => r["Student ID"] === student.id)?.[
              "Điểm"
            ]
        )
        .filter((score) => score !== undefined && score !== null) as number[];
      const averageScore =
        scores.length > 0
          ? Number(
              (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
            )
          : 0;

      // Get status text
      const getStatusText = (record: any) => {
        if (record["Có mặt"]) {
          return record["Đi muộn"] ? "Đi muộn" : "Có mặt";
        } else {
          return record["Vắng có phép"] ? "Vắng có phép" : "Vắng không phép";
        }
      };

      // Prepare recent sessions (last 10)
      const recentSessions = studentSessions.slice(0, 10).map((session) => {
        const studentRecord = session["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        const completed = studentRecord?.["Bài tập hoàn thành"];
        const total = session["Bài tập"]?.["Tổng số bài"];

        return {
          date: dayjs(session["Ngày"]).format("DD/MM/YYYY"),
          className: session["Tên lớp"],
          status: studentRecord ? getStatusText(studentRecord) : "Không rõ",
          score: studentRecord?.["Điểm"],
          homework:
            completed !== undefined && total
              ? `${completed}/${total}`
              : undefined,
          note: studentRecord?.["Ghi chú"],
        };
      });

      const reportData: StudentReportData = {
        studentName: student["Họ và tên"],
        studentCode: student["Mã học sinh"],
        totalSessions: stats.totalSessions,
        presentSessions: stats.presentSessions,
        absentSessions: stats.absentSessions,
        attendanceRate,
        totalHours: stats.totalHours,
        averageScore,
        recentSessions,
      };

      try {
        console.log("🤖 Calling Gemini API...");
        const comment = await generateStudentComment(reportData);
        console.log("✅ AI Comment received:", comment);
        console.log("✅ Comment type:", typeof comment);
        console.log("✅ Comment length:", comment?.length);
        console.log(
          "✅ Comment is empty?",
          !comment || comment.trim().length === 0
        );

        if (!comment || comment.trim().length === 0) {
          console.warn("⚠️ Comment is empty, using fallback");
          const basicComment = generateBasicComment(averageScore);
          setAiComment(basicComment);
        } else {
          setAiComment(comment);
        }
      } catch (apiError: any) {
        console.log("❌ API Error:", apiError);
        // If API fails, use basic comment as fallback
        if (
          apiError?.message?.includes("quota") ||
          apiError?.message?.includes("giới hạn")
        ) {
          console.log("⚠️ Quota exceeded, using fallback...");
          setCommentError(apiError.message);
          // Generate basic comment as fallback
          const basicComment = generateBasicComment(averageScore);
          console.log("📝 Basic comment generated:", basicComment);
          setAiComment(basicComment);
        } else {
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error("Error generating comment:", error);
      setCommentError(
        error?.message || "Không thể tạo nhận xét. Vui lòng thử lại sau."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const generateMonthlyPrintContent = () => {
    // Filter sessions by selected month
    const filteredSessions = selectedMonth
      ? studentSessions.filter((session) => {
          const sessionDate = dayjs(session["Ngày"]);
          return (
            sessionDate.month() === selectedMonth.month() &&
            sessionDate.year() === selectedMonth.year()
          );
        })
      : studentSessions;

    // Get status text and color
    const getStatusText = (record: any) => {
      if (record["Có mặt"]) {
        return record["Đi muộn"] ? "Đi muộn" : "Có mặt";
      } else {
        return record["Vắng có phép"] ? "Vắng có phép" : "Vắng không phép";
      }
    };

    const getStatusColor = (record: any) => {
      if (record["Có mặt"]) {
        return record["Đi muộn"] ? "#fa8c16" : "#52c41a";
      } else {
        return record["Vắng có phép"] ? "#1890ff" : "#f5222d";
      }
    };

    // Calculate stats for selected month
    let presentCount = 0;
    let absentCount = 0;
    let totalScore = 0;
    let scoreCount = 0;

    filteredSessions.forEach((session) => {
      const record = session["Điểm danh"]?.find(
        (r) => r["Student ID"] === student.id
      );
      if (record) {
        if (record["Có mặt"]) {
          presentCount++;
        } else {
          absentCount++;
        }
        if (record["Điểm"] !== null && record["Điểm"] !== undefined) {
          totalScore += record["Điểm"];
          scoreCount++;
        }
      }
    });

    const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : "0";
    const attendanceRate =
      filteredSessions.length > 0
        ? ((presentCount / filteredSessions.length) * 100).toFixed(1)
        : "0";

    // Group sessions by subject for score table
    const sessionsBySubject: { [subject: string]: AttendanceSession[] } = {};
    filteredSessions.forEach((session) => {
      const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
      if (!sessionsBySubject[subject]) {
        sessionsBySubject[subject] = [];
      }
      sessionsBySubject[subject].push(session);
    });

    // Generate score tables by subject
    let scoreTablesHTML = "";
    Object.entries(sessionsBySubject).forEach(([subject, subjectSessions]) => {
      const sortedSessions = [...subjectSessions].sort(
        (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
      );

      // Calculate subject stats
      let subjectScores: number[] = [];
      sortedSessions.forEach((session) => {
        const record = session["Điểm danh"]?.find(r => r["Student ID"] === student.id);
        if (record?.["Điểm"] !== null && record?.["Điểm"] !== undefined) {
          subjectScores.push(record["Điểm"]);
        }
      });
      const subjectAvg = subjectScores.length > 0 
        ? (subjectScores.reduce((a, b) => a + b, 0) / subjectScores.length).toFixed(1)
        : "-";

      let tableRows = "";
      sortedSessions.forEach((session) => {
        const studentRecord = session["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        
        if (studentRecord) {
          const date = dayjs(session["Ngày"]).format("DD/MM");
          const attendance = studentRecord["Có mặt"] 
            ? (studentRecord["Đi muộn"] ? "Muộn" : "✓")
            : (studentRecord["Vắng có phép"] ? "P" : "✗");
          const attendanceColor = studentRecord["Có mặt"] 
            ? (studentRecord["Đi muộn"] ? "#fa8c16" : "#52c41a")
            : (studentRecord["Vắng có phép"] ? "#1890ff" : "#f5222d");
          const homeworkPercent = studentRecord["% Hoàn thành BTVN"] ?? "-";
          const testName = studentRecord["Bài kiểm tra"] || "-";
          const score = studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? "-";
          const bonusScore = studentRecord["Điểm thưởng"] ?? "-";
          const note = studentRecord["Ghi chú"] || "-";

          tableRows += `
            <tr>
              <td style="text-align: center;">${date}</td>
              <td style="text-align: center; color: ${attendanceColor}; font-weight: bold;">${attendance}</td>
              <td style="text-align: center;">${homeworkPercent}</td>
              <td style="text-align: left; font-size: 11px;">${testName}</td>
              <td style="text-align: center; font-weight: bold;">${score}</td>
              <td style="text-align: center;">${bonusScore}</td>
              <td style="text-align: left; font-size: 11px;">${note}</td>
            </tr>
          `;
        }
      });

      scoreTablesHTML += `
        <div class="subject-section">
          <div class="subject-header">
            <span class="subject-name">📚 ${subject}</span>
            <span class="subject-avg">TB: <strong>${subjectAvg}</strong></span>
          </div>
          <table class="score-table">
            <thead>
              <tr>
                <th style="width: 50px;">Ngày</th>
                <th style="width: 50px;">Chuyên cần</th>
                <th style="width: 55px;">% BTVN</th>
                <th style="width: 100px;">Tên bài KT</th>
                <th style="width: 45px;">Điểm</th>
                <th style="width: 50px;">Điểm thưởng</th>
                <th>Nhận xét</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;
    });

    return `
      <div class="report-header">
        <h1>BÁO CÁO THEO THÁNG ${selectedMonth?.format("MM/YYYY") || ""}</h1>
        <p>Ngày xuất: ${dayjs().format("DD/MM/YYYY HH:mm")}</p>
      </div>

      <div class="section">
        <div class="section-title">Thông tin học sinh</div>
        <table>
          <tr><th>Họ và tên</th><td>${student["Họ và tên"]}</td></tr>
          <tr><th>Mã học sinh</th><td>${student["Mã học sinh"] || "-"}</td></tr>
          <tr><th>Ngày sinh</th><td>${student["Ngày sinh"] ? dayjs(student["Ngày sinh"]).format("DD/MM/YYYY") : "-"}</td></tr>
          <tr><th>Số điện thoại</th><td>${student["Số điện thoại"] || "-"}</td></tr>
          <tr><th>Email</th><td>${student["Email"] || "-"}</td></tr>
          <tr><th>Địa chỉ</th><td>${student["Địa chỉ"] || "-"}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Thống kê tháng ${selectedMonth?.format("MM/YYYY") || ""}</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${filteredSessions.length}</div>
            <div class="stat-label">Tổng số buổi</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${presentCount}</div>
            <div class="stat-label">Số buổi có mặt</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${absentCount}</div>
            <div class="stat-label">Số buổi vắng</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${attendanceRate}%</div>
            <div class="stat-label">Tỷ lệ tham gia</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${avgScore} / 10</div>
            <div class="stat-label">Điểm trung bình</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Bảng điểm theo môn</div>
        ${scoreTablesHTML || '<p style="color: #999; text-align: center;">Không có dữ liệu điểm trong tháng này</p>'}
      </div>

      ${aiComment ? `
      <div class="section">
        <div class="section-title">📝 Nhận xét tổng quát tháng ${selectedMonth?.format("MM/YYYY") || ""}</div>
        <div class="comment-box">${aiComment.replace(/\n/g, "<br/>")}</div>
      </div>
      ` : ""}

      <div class="section">
        <div class="section-title">Lịch sử học tập chi tiết</div>
        <table>
          <thead>
            <tr>
              <th style="width: 80px;">Ngày</th>
              <th>Lớp học</th>
              <th style="width: 100px;">Giờ học</th>
              <th style="width: 100px;">Trạng thái</th>
              <th style="width: 60px;">Điểm</th>
              <th style="width: 80px;">Bài tập</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${filteredSessions
              .map((session) => {
                const studentRecord = session["Điểm danh"]?.find(
                  (r) => r["Student ID"] === student.id
                );
                const completed = studentRecord?.["Bài tập hoàn thành"];
                const total = session["Bài tập"]?.["Tổng số bài"];
                const homework =
                  completed !== undefined && total
                    ? `${completed}/${total}`
                    : "-";
                const statusText = studentRecord
                  ? getStatusText(studentRecord)
                  : "-";
                const statusColor = studentRecord
                  ? getStatusColor(studentRecord)
                  : "#999";

                return `
              <tr>
                <td style="text-align: center;">${dayjs(session["Ngày"]).format("DD/MM/YYYY")}</td>
                <td>${session["Tên lớp"]}</td>
                <td style="text-align: center;">${session["Giờ bắt đầu"]} - ${session["Giờ kết thúc"]}</td>
                <td style="text-align: center; color: ${statusColor}; font-weight: bold;">${statusText}</td>
                <td style="text-align: center; font-weight: bold;">${studentRecord?.["Điểm"] ?? "-"}</td>
                <td style="text-align: center;">${homework}</td>
                <td>${studentRecord?.["Ghi chú"] || "-"}</td>
              </tr>
            `;
              })
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>Báo cáo được tạo tự động từ hệ thống quản lý học sinh.</p>
        <p>Mọi thắc mắc xin liên hệ giáo viên phụ trách.</p>
      </div>
    `;
  };

  const generateSessionPrintContent = () => {
    // Get status text
    const getStatusText = (record: any) => {
      if (record["Có mặt"]) {
        return record["Đi muộn"] ? "Đi muộn" : "Có mặt";
      } else {
        return record["Vắng có phép"] ? "Vắng có phép" : "Vắng không phép";
      }
    };

    // Get status color
    const getStatusColor = (record: any) => {
      if (record["Có mặt"]) {
        return record["Đi muộn"] ? "#fa8c16" : "#52c41a";
      } else {
        return record["Vắng có phép"] ? "#1890ff" : "#f5222d";
      }
    };

    // Calculate average score
    const scores = studentSessions
      .map(
        (s) =>
          s["Điểm danh"]?.find((r) => r["Student ID"] === student.id)?.[
            "Điểm"
          ]
      )
      .filter((score) => score !== undefined && score !== null) as number[];
    const averageScore =
      scores.length > 0
        ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
        : "0";

    return `
      <div class="report-header">
        <h1>BÁO CÁO CHI TIẾT THEO BUỔI HỌC</h1>
        <p>Ngày xuất: ${dayjs().format("DD/MM/YYYY HH:mm")}</p>
      </div>

      <div class="section">
        <div class="section-title">Thông tin học sinh</div>
        <table>
          <tr><th>Họ và tên</th><td>${student["Họ và tên"]}</td></tr>
          <tr><th>Mã học sinh</th><td>${student["Mã học sinh"] || "-"}</td></tr>
          <tr><th>Ngày sinh</th><td>${student["Ngày sinh"] ? dayjs(student["Ngày sinh"]).format("DD/MM/YYYY") : "-"}</td></tr>
          <tr><th>Số điện thoại</th><td>${student["Số điện thoại"] || "-"}</td></tr>
          <tr><th>Email</th><td>${student["Email"] || "-"}</td></tr>
          <tr><th>Địa chỉ</th><td>${student["Địa chỉ"] || "-"}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Thống kê tổng quan</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.totalSessions}</div>
            <div class="stat-label">Tổng số buổi</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.presentSessions}</div>
            <div class="stat-label">Số buổi có mặt</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.absentSessions}</div>
            <div class="stat-label">Số buổi vắng</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${attendanceRate}%</div>
            <div class="stat-label">Tỷ lệ tham gia</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${averageScore} / 10</div>
            <div class="stat-label">Điểm trung bình</div>
          </div>
        </div>
      </div>

      ${aiComment ? `
      <div class="section">
        <div class="section-title">Nhận xét học sinh</div>
        <div class="comment-box">${aiComment.replace(/\n/g, "<br/>")}</div>
      </div>
      ` : ""}

      <div class="section">
        <div class="section-title">Lịch sử học tập chi tiết</div>
        <table>
          <thead>
            <tr>
              <th style="width: 80px;">Ngày</th>
              <th>Lớp học</th>
              <th style="width: 100px;">Giờ học</th>
              <th style="width: 100px;">Trạng thái</th>
              <th style="width: 60px;">Điểm</th>
              <th style="width: 80px;">Bài tập</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${studentSessions
              .map((session) => {
                const studentRecord = session["Điểm danh"]?.find(
                  (r) => r["Student ID"] === student.id
                );
                const completed = studentRecord?.["Bài tập hoàn thành"];
                const total = session["Bài tập"]?.["Tổng số bài"];
                const homework =
                  completed !== undefined && total
                    ? `${completed}/${total}`
                    : "-";
                const statusText = studentRecord
                  ? getStatusText(studentRecord)
                  : "-";
                const statusColor = studentRecord
                  ? getStatusColor(studentRecord)
                  : "#999";

                return `
              <tr>
                <td style="text-align: center;">${dayjs(session["Ngày"]).format("DD/MM/YYYY")}</td>
                <td>${session["Tên lớp"]}</td>
                <td style="text-align: center;">${session["Giờ bắt đầu"]} - ${session["Giờ kết thúc"]}</td>
                <td style="text-align: center; color: ${statusColor}; font-weight: bold;">${statusText}</td>
                <td style="text-align: center; font-weight: bold;">${studentRecord?.["Điểm"] ?? "-"}</td>
                <td style="text-align: center;">${homework}</td>
                <td>${studentRecord?.["Ghi chú"] || "-"}</td>
              </tr>
            `;
              })
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>Báo cáo được tạo tự động từ hệ thống quản lý học sinh.</p>
        <p>Mọi thắc mắc xin liên hệ giáo viên phụ trách.</p>
      </div>
    `;
  };

  const handleExportScoreTable = () => {
    // Group sessions by subject
    const sessionsBySubject: { [subject: string]: AttendanceSession[] } = {};
    const sessionsToExport = viewMode === "monthly" && selectedMonth
      ? studentSessions.filter((session) => {
          const sessionDate = dayjs(session["Ngày"]);
          return (
            sessionDate.month() === selectedMonth.month() &&
            sessionDate.year() === selectedMonth.year()
          );
        })
      : studentSessions;

    sessionsToExport.forEach((session) => {
      const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
      if (!sessionsBySubject[subject]) {
        sessionsBySubject[subject] = [];
      }
      sessionsBySubject[subject].push(session);
    });

    // Generate HTML table with styling (Excel can open HTML files)
    let tablesHTML = "";
    Object.entries(sessionsBySubject).forEach(([subject, subjectSessions]) => {
      const sortedSessions = [...subjectSessions].sort(
        (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
      );

      let tableRows = "";
      sortedSessions.forEach((session) => {
        const studentRecord = session["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        
        if (studentRecord) {
          const date = dayjs(session["Ngày"]).format("DD/MM/YYYY");
          const studentName = student["Họ và tên"];
          const attendance = studentRecord["Có mặt"] 
            ? (studentRecord["Đi muộn"] ? "Đi muộn" : "Có mặt")
            : (studentRecord["Vắng có phép"] ? "Vắng có phép" : "Vắng");
          const homeworkPercent = studentRecord["% Hoàn thành BTVN"] ?? "";
          const testName = studentRecord["Bài kiểm tra"] || "";
          const score = studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? "";
          const bonusScore = studentRecord["Điểm thưởng"] ?? "";
          const note = studentRecord["Ghi chú"] || "";

          tableRows += `
            <tr>
              <td>${date}</td>
              <td>${studentName}</td>
              <td>${attendance}</td>
              <td>${homeworkPercent}</td>
              <td>${testName}</td>
              <td style="font-weight: bold;">${score}</td>
              <td>${bonusScore}</td>
              <td style="text-align: left;">${note}</td>
            </tr>
          `;
        }
      });

      tablesHTML += `
        <tr>
          <td colspan="8" style="background: #e6f7ff; font-weight: bold; font-size: 14px; padding: 10px; border-left: 4px solid #1890ff;">
            Môn ${subject}
          </td>
        </tr>
        <tr style="background: #f0f0f0; font-weight: bold;">
          <td>Ngày</td>
          <td>Tên HS</td>
          <td>Chuyên cần</td>
          <td>% BTVN</td>
          <td>Tên bài kiểm tra</td>
          <td>Điểm</td>
          <td>Điểm thưởng</td>
          <td>Nhận xét</td>
        </tr>
        ${tableRows}
        <tr><td colspan="8" style="height: 20px;"></td></tr>
      `;
    });

    const htmlContent = `
      <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px;
              text-align: center;
              font-size: 11px;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
            }
            .header h1 {
              color: #1890ff;
              font-size: 24px;
              margin: 10px 0;
            }
            .info {
              margin-bottom: 20px;
            }
            .info td {
              text-align: left;
              padding: 5px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>BẢNG ĐIỂM CHI TIẾT</h1>
            <p><strong>Trung tâm Trí Tuệ 8+</strong></p>
          </div>
          
          <table class="info">
            <tr>
              <td style="width: 150px; font-weight: bold;">Học sinh:</td>
              <td>${student["Họ và tên"]}</td>
              <td style="width: 150px; font-weight: bold;">Mã học sinh:</td>
              <td>${student["Mã học sinh"] || "-"}</td>
            </tr>
            <tr>
              <td style="font-weight: bold;">Ngày sinh:</td>
              <td>${student["Ngày sinh"] ? dayjs(student["Ngày sinh"]).format("DD/MM/YYYY") : "-"}</td>
              <td style="font-weight: bold;">Số điện thoại:</td>
              <td>${student["Số điện thoại"] || "-"}</td>
            </tr>
            <tr>
              <td style="font-weight: bold;">Ngày xuất:</td>
              <td colspan="3">${dayjs().format("DD/MM/YYYY HH:mm")}</td>
            </tr>
          </table>
          
          <br/>
          
          <table>
            ${tablesHTML}
          </table>
        </body>
      </html>
    `;

    // Download as .xls file (HTML format that Excel can open)
    const blob = new Blob([htmlContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `bang_diem_${student["Họ và tên"]}_${dayjs().format("YYYYMMDD")}.xls`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintScoreTable = () => {
    // Group sessions by subject
    const sessionsBySubject: { [subject: string]: AttendanceSession[] } = {};
    const sessionsToExport = viewMode === "monthly" && selectedMonth
      ? studentSessions.filter((session) => {
          const sessionDate = dayjs(session["Ngày"]);
          return (
            sessionDate.month() === selectedMonth.month() &&
            sessionDate.year() === selectedMonth.year()
          );
        })
      : studentSessions;

    sessionsToExport.forEach((session) => {
      const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
      if (!sessionsBySubject[subject]) {
        sessionsBySubject[subject] = [];
      }
      sessionsBySubject[subject].push(session);
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let tablesHTML = "";
    Object.entries(sessionsBySubject).forEach(([subject, subjectSessions]) => {
      const sortedSessions = [...subjectSessions].sort(
        (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
      );

      let tableRows = "";
      sortedSessions.forEach((session) => {
        const studentRecord = session["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        
        if (studentRecord) {
          const date = dayjs(session["Ngày"]).format("DD/MM/YYYY");
          const studentName = student["Họ và tên"];
          const attendance = studentRecord["Có mặt"] 
            ? (studentRecord["Đi muộn"] ? "Đi muộn" : "Có mặt")
            : (studentRecord["Vắng có phép"] ? "Vắng có phép" : "Vắng");
          const homeworkPercent = studentRecord["% Hoàn thành BTVN"] ?? "";
          const testName = studentRecord["Bài kiểm tra"] || "";
          const score = studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? "";
          const bonusScore = studentRecord["Điểm thưởng"] ?? "";
          const note = studentRecord["Ghi chú"] || "";

          tableRows += `
            <tr>
              <td>${date}</td>
              <td>${studentName}</td>
              <td>${attendance}</td>
              <td>${homeworkPercent}</td>
              <td>${testName}</td>
              <td><strong>${score}</strong></td>
              <td>${bonusScore}</td>
              <td style="text-align: left;">${note}</td>
            </tr>
          `;
        }
      });

      tablesHTML += `
        <div class="subject-header">Môn ${subject}</div>
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
      <!DOCTYPE html>
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
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            h1 {
              text-align: center;
              color: #1890ff;
              margin-bottom: 10px;
            }
            h2 {
              text-align: center;
              color: #333;
              margin-bottom: 20px;
            }
            .info {
              text-align: center;
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
            <p>Ngày xuất: ${dayjs().format("DD/MM/YYYY HH:mm")}</p>
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

  const handlePrint = () => {
    const printWindow = window.open("", "", "width=1000,height=800");
    if (!printWindow) return;

    // Generate content based on view mode
    let content = "";
    
    if (viewMode === "monthly") {
      content = generateMonthlyPrintContent();
    } else {
      content = generateSessionPrintContent();
    }

    // Common CSS styles
    const styles = `
      <style>
        @page {
          size: A4;
          margin: 20mm;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #333;
          line-height: 1.6;
          background: #fff;
        }
        h1, h2, h3 {
          margin: 0;
          color: #004aad;
        }
        .report-header {
          text-align: center;
          border-bottom: 3px solid #004aad;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        .report-header h1 {
          font-size: 24px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .report-header p {
          font-size: 13px;
          color: #666;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-weight: bold;
          color: #004aad;
          border-left: 4px solid #004aad;
          padding-left: 10px;
          margin-bottom: 10px;
          font-size: 16px;
          text-transform: uppercase;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 13px;
        }
        th, td {
          border: 1px solid #ccc;
          padding: 6px 8px;
          text-align: left;
          vertical-align: middle;
        }
        th {
          background-color: #004aad;
          color: #fff;
          text-align: center;
        }
        tr:nth-child(even) {
          background-color: #f8f9fa;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        .stat-card {
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 6px 8px;
          background: #fafafa;
          text-align: center;
        }
        .stat-value {
          font-size: 16px;
          font-weight: 600;
          color: #004aad;
        }
        .stat-label {
          color: #666;
        }
        .comment-box {
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 12px;
          background: #fefefe;
          white-space: pre-wrap;
          font-size: 14px;
          line-height: 1.7;
        }
        .subject-section {
          margin-bottom: 20px;
        }
        .subject-header {
          background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
          padding: 10px 15px;
          border-left: 4px solid #1890ff;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .subject-name {
          font-weight: bold;
          font-size: 14px;
          color: #004aad;
        }
        .subject-avg {
          font-size: 13px;
          color: #666;
        }
        .score-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 0;
        }
        .score-table th, .score-table td {
          border: 1px solid #d9d9d9;
          padding: 6px 8px;
          font-size: 12px;
        }
        .score-table th {
          background-color: #fafafa;
          color: #333;
          font-weight: 600;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #888;
          border-top: 1px solid #ccc;
          padding-top: 10px;
        }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Báo cáo học tập - ${student["Họ và tên"]}</title>
          ${styles}
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  return (
    <Modal
      title="Báo cáo học tập"
      open={open}
      onCancel={handleClose}
      width={1000}
      footer={[
        <Button key="close" onClick={handleClose}>
          Đóng
        </Button>,
        <Button
          key="ai-comment"
          icon={<RobotOutlined />}
          onClick={handleGenerateComment}
          loading={isGenerating}
          style={{
            backgroundColor: "#52c41a",
            borderColor: "#52c41a",
            color: "white",
          }}
        >
          Tạo nhận xét AI
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
        >
          In báo cáo
        </Button>,
      ]}
    >
      <div ref={printRef}>
        {/* Header */}
        <div
          className="header"
          style={{
            textAlign: "center",
            marginBottom: 24,
            borderBottom: "2px solid #1890ff",
            paddingBottom: 16,
          }}
        >
          <h1 style={{ color: "#1890ff", margin: 0 }}>BÁO CÁO HỌC TẬP</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666" }}>
            Ngày xuất: {dayjs().format("DD/MM/YYYY HH:mm")}
          </p>
        </div>

        {/* Student Info */}
        <Card
          title="Thông tin học sinh"
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Họ và tên">
              <strong>{student["Họ và tên"]}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Mã học sinh">
              {student["Mã học sinh"] || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">
              {student["Ngày sinh"]
                ? dayjs(student["Ngày sinh"]).format("DD/MM/YYYY")
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Số điện thoại">
              {student["Số điện thoại"] || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Email" span={2}>
              {student["Email"] || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>
              {student["Địa chỉ"] || "-"}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* View Mode Selection */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Chế độ xem:</div>
            <Radio.Group
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="session">
                📋 Báo cáo theo buổi (Chi tiết)
              </Radio.Button>
              <Radio.Button value="monthly">
                📊 Báo cáo theo tháng (Tổng hợp)
              </Radio.Button>
            </Radio.Group>
          </Space>
        </Card>

        {/* Statistics */}
        <Card
          title="Thống kê chuyên cần"
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="Tổng số buổi"
                value={stats.totalSessions}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Số buổi có mặt"
                value={stats.presentSessions}
                valueStyle={{ color: "#3f8600" }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Số buổi vắng"
                value={stats.absentSessions}
                valueStyle={{ color: "#cf1322" }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Tỷ lệ tham gia"
                value={attendanceRate}
                suffix="%"
                valueStyle={{
                  color: attendanceRate >= 80 ? "#3f8600" : "#cf1322",
                }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Điểm trung bình"
                value={(() => {
                  const scores = studentSessions
                    .map(
                      (s) =>
                        s["Điểm danh"]?.find(
                          (r) => r["Student ID"] === student.id
                        )?.["Điểm"]
                    )
                    .filter(
                      (score) => score !== undefined && score !== null
                    ) as number[];
                  if (scores.length === 0) return 0;
                  return (
                    scores.reduce((a, b) => a + b, 0) / scores.length
                  ).toFixed(1);
                })()}
                suffix="/ 10"
              />
            </Col>
          </Row>
        </Card>

        {/* AI Comment Section - Editable Textarea */}
        <Card
          title={
            <span>
              <RobotOutlined style={{ marginRight: 8, color: "#52c41a" }} />
              Nhận xét học sinh
            </span>
          }
          size="small"
          style={{ marginBottom: 16 }}
        >
          {isGenerating && (
            <div
              style={{
                textAlign: "center",
                padding: "20px 0",
                marginBottom: 16,
              }}
            >
              <Spin />
              <p style={{ marginTop: 16, color: "#666" }}>
                Đang phân tích dữ liệu và tạo nhận xét...
              </p>
            </div>
          )}

          {/* Show error message */}
          {commentError && (
            <Alert
              message="Lỗi tạo nhận xét AI"
              description={commentError}
              type="warning"
              showIcon
              closable
              onClose={() => setCommentError("")}
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Editable Textarea */}
          <Input.TextArea
            value={aiComment}
            onChange={(e) => setAiComment(e.target.value)}
            placeholder="Nhập nhận xét về học sinh hoặc nhấn nút 'Tạo nhận xét AI' để tự động tạo..."
            rows={8}
            style={{
              fontSize: "14px",
              lineHeight: "1.8",
            }}
            showCount
            maxLength={2000}
          />
        </Card>

        {/* Score Table by Subject */}
        <Card 
          title={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Bảng điểm chi tiết</span>
              <Space>
                <Button icon={<PrinterOutlined />} onClick={handlePrintScoreTable}>
                  In bảng điểm
                </Button>
                <Button icon={<DownloadOutlined />} onClick={handleExportScoreTable}>
                  Xuất Excel
                </Button>
              </Space>
            </div>
          }
          size="small" 
          style={{ marginBottom: 16 }}
        >
          {(() => {
            // Group sessions by subject
            const sessionsBySubject: { [subject: string]: AttendanceSession[] } = {};
            const sessionsToShow = viewMode === "monthly" && selectedMonth
              ? studentSessions.filter((session) => {
                  const sessionDate = dayjs(session["Ngày"]);
                  return (
                    sessionDate.month() === selectedMonth.month() &&
                    sessionDate.year() === selectedMonth.year()
                  );
                })
              : studentSessions;

            sessionsToShow.forEach((session) => {
              const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
              if (!sessionsBySubject[subject]) {
                sessionsBySubject[subject] = [];
              }
              sessionsBySubject[subject].push(session);
            });

            if (Object.keys(sessionsBySubject).length === 0) {
              return <div style={{ textAlign: "center", padding: "20px", color: "#999" }}>Chưa có dữ liệu</div>;
            }

            return (
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                {Object.entries(sessionsBySubject).map(([subject, subjectSessions]) => {
                  const sortedSessions = [...subjectSessions].sort(
                    (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
                  );

                  return (
                    <div key={subject} style={{ marginBottom: 24 }}>
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
                            {sortedSessions.map((session) => {
                              const studentRecord = session["Điểm danh"]?.find(
                                (r) => r["Student ID"] === student.id
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
                                    {dayjs(session["Ngày"]).format("DD/MM/YYYY")}
                                  </td>
                                  <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                                    {student["Họ và tên"]}
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
                  );
                })}
              </div>
            );
          })()}
        </Card>

        {/* Session History or Monthly Summary */}
        {viewMode === "session" ? (
          <Card title="Lịch sử học tập (Chi tiết theo buổi)" size="small">
            <Table
              columns={columns}
              dataSource={studentSessions}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
              scroll={{ x: 1200 }}
            />
          </Card>
        ) : (
          <Card 
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Báo cáo theo tháng - {selectedMonth?.format("MM/YYYY")}</span>
                <DatePicker
                  picker="month"
                  format="MM/YYYY"
                  placeholder="Chọn tháng"
                  value={selectedMonth}
                  onChange={(date) => setSelectedMonth(date)}
                  style={{ width: 150 }}
                />
              </div>
            }
            size="small"
          >
            <Table
              columns={columns}
              dataSource={(() => {
                // Filter sessions by selected month
                if (!selectedMonth) return studentSessions;
                
                return studentSessions.filter((session) => {
                  const sessionDate = dayjs(session["Ngày"]);
                  return (
                    sessionDate.month() === selectedMonth.month() &&
                    sessionDate.year() === selectedMonth.year()
                  );
                });
              })()}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
            />
          </Card>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            textAlign: "center",
            fontSize: 12,
            color: "#999",
          }}
        >
          <Divider />
          <p>Báo cáo này được tạo tự động từ hệ thống quản lý học sinh</p>
          <p>Mọi thắc mắc xin liên hệ với giáo viên hoặc ban quản lý</p>
        </div>
      </div>
    </Modal>
  );
};

export default StudentReport;
