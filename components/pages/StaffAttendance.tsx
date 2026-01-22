import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Button,
  Table,
  DatePicker,
  Select,
  Space,
  Tag,
  Popconfirm,
  message,
  Row,
  Col,
  Statistic,
  Empty,
  Tabs,
} from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  UserOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../contexts/AuthContext";
import { ref, onValue, remove, push, set, update } from "firebase/database";
import { database } from "../../firebase";
import dayjs, { Dayjs } from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import WrapperContent from "@/components/WrapperContent";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

interface StaffMember {
  id: string;
  "Họ và tên": string;
  "Email"?: string;
  "Email công ty"?: string;
  "Số điện thoại"?: string;
  "Vị trí"?: string;
  "Trạng thái"?: string;
  [key: string]: any;
}

interface StaffAttendanceSession {
  id: string;
  "Ngày": string; // Date (YYYY-MM-DD)
  "Giờ vào"?: string; // Check-in time (HH:mm)
  "Giờ ra"?: string; // Check-out time (HH:mm)
  "Nhân viên": string; // Staff name
  "Staff ID": string; // Staff ID
  "Trạng thái": "present" | "absent" | "late" | "leave" | "checkin" | "checkout"; // Attendance status
  "Ghi chú"?: string; // Note
  "Người điểm danh"?: string; // Person who took attendance
  "Thời gian điểm danh"?: string; // Attendance taken time
  "Timestamp": string; // Created timestamp
}

const StaffAttendance = () => {
  const { userProfile } = useAuth();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<StaffAttendanceSession[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("daily");

  const isAdmin = userProfile?.isAdmin === true || userProfile?.role === "admin";

  // Load staff members
  useEffect(() => {
    const staffRef = ref(database, "datasheet/Giáo_viên");
    const unsubscribe = onValue(staffRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const staffList = Object.entries(data)
          .map(([id, value]) => ({
            id,
            ...(value as Omit<StaffMember, "id">),
          }))
          .filter((staff): staff is StaffMember => 
            staff["Họ và tên"] != null && typeof staff["Họ và tên"] === "string"
          );
        setStaffMembers(staffList);
      } else {
        setStaffMembers([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load attendance sessions
  useEffect(() => {
    const sessionsRef = ref(database, "datasheet/Điểm_danh_nhân_sự");
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sessionsList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<StaffAttendanceSession, "id">),
        }));
        setAttendanceSessions(sessionsList);
      } else {
        setAttendanceSessions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Get attendance for selected month
  const monthAttendance = useMemo(() => {
    const yearMonth = selectedMonth.format("YYYY-MM");
    return attendanceSessions
      .filter((session) => session["Ngày"]?.startsWith(yearMonth))
      .sort((a, b) => {
        // Sort by date then check-in time
        const dateCompare = (a["Ngày"] || "").localeCompare(b["Ngày"] || "");
        if (dateCompare !== 0) return dateCompare;
        if (a["Giờ vào"] && b["Giờ vào"]) {
          return a["Giờ vào"].localeCompare(b["Giờ vào"]);
        }
        return 0;
      });
  }, [attendanceSessions, selectedMonth]);

  // Group attendance by date
  const attendanceByDate = useMemo(() => {
    const grouped: { [date: string]: StaffAttendanceSession[] } = {};
    monthAttendance.forEach((session) => {
      const date = session["Ngày"];
      if (date) {
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(session);
      }
    });
    return grouped;
  }, [monthAttendance]);

  // Calculate daily stats
  const dailyStats = useMemo(() => {
    return Object.entries(attendanceByDate).map(([date, sessions]) => {
      const uniqueStaff = new Set(sessions.map(s => s["Staff ID"])).size;
      return {
        date,
        staffCount: uniqueStaff,
        sessionCount: sessions.length,
        displayDate: dayjs(date).format("DD/MM/YYYY"),
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceByDate]);

  // Monthly statistics
  const monthlyStats = useMemo(() => {
    const totalSessions = monthAttendance.length;
    const uniqueStaff = new Set(monthAttendance.map(s => s["Staff ID"])).size;
    const totalDays = Object.keys(attendanceByDate).length;
    return {
      totalSessions,
      uniqueStaff,
      totalDays,
    };
  }, [monthAttendance, attendanceByDate]);

  // Handle check-in
  const handleCheckIn = async () => {
    if (!selectedStaffId) {
      message.warning("Vui lòng chọn nhân viên");
      return;
    }

    const selectedStaff = staffMembers.find((s) => s.id === selectedStaffId);
    if (!selectedStaff) {
      message.error("Không tìm thấy nhân viên");
      return;
    }

    const dateStr = dayjs().format("YYYY-MM-DD");
    const checkInTime = dayjs().format("HH:mm");
    const todayAttendance = monthAttendance.filter(s => s["Ngày"] === dateStr);
    const existingSession = todayAttendance.find(
      (s) => s["Staff ID"] === selectedStaffId
    );

    try {
      if (existingSession) {
        // Update existing session with check-in
        if (existingSession["Giờ vào"]) {
          message.warning("Nhân viên đã check-in rồi");
          return;
        }
        const sessionRef = ref(
          database,
          `datasheet/Điểm_danh_nhân_sự/${existingSession.id}`
        );
        await update(sessionRef, {
          "Giờ vào": checkInTime,
          "Trạng thái": "checkin",
          "Thời gian điểm danh": dayjs().format("YYYY-MM-DD HH:mm:ss"),
          "Người điểm danh": userProfile?.email || userProfile?.displayName || "System",
        });
        message.success(`Đã check-in cho ${selectedStaff["Họ và tên"]} lúc ${checkInTime}`);
      } else {
        // Create new session
        const sessionsRef = ref(database, "datasheet/Điểm_danh_nhân_sự");
        const newSessionRef = push(sessionsRef);
        await set(newSessionRef, {
          "Ngày": dateStr,
          "Nhân viên": selectedStaff["Họ và tên"],
          "Staff ID": selectedStaffId,
          "Giờ vào": checkInTime,
          "Trạng thái": "checkin",
          "Thời gian điểm danh": dayjs().format("YYYY-MM-DD HH:mm:ss"),
          "Người điểm danh": userProfile?.email || userProfile?.displayName || "System",
          "Timestamp": dayjs().toISOString(),
        });
        message.success(`Đã check-in cho ${selectedStaff["Họ và tên"]} lúc ${checkInTime}`);
      }
      setSelectedStaffId("");
    } catch (error) {
      console.error("Error checking in:", error);
      message.error("Lỗi khi check-in");
    }
  };

  // Handle check-out
  const handleCheckOut = async (sessionId: string, staffName: string) => {
    const checkOutTime = dayjs().format("HH:mm");
    try {
      const sessionRef = ref(database, `datasheet/Điểm_danh_nhân_sự/${sessionId}`);
      await update(sessionRef, {
        "Giờ ra": checkOutTime,
        "Trạng thái": "checkout",
        "Thời gian điểm danh": dayjs().format("YYYY-MM-DD HH:mm:ss"),
      });
      message.success(`Đã check-out cho ${staffName} lúc ${checkOutTime}`);
    } catch (error) {
      console.error("Error checking out:", error);
      message.error("Lỗi khi check-out");
    }
  };

  // Calculate total hours and minutes
  const calculateTotalTime = (checkIn: string, checkOut: string): { hours: number; minutes: number; total: number } => {
    if (!checkIn || !checkOut) return { hours: 0, minutes: 0, total: 0 };
    try {
      const inTime = dayjs(checkIn, "HH:mm");
      const outTime = dayjs(checkOut, "HH:mm");
      if (inTime.isValid() && outTime.isValid()) {
        const totalMinutes = outTime.diff(inTime, "minute");
        if (totalMinutes > 0) {
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          return { hours, minutes, total: totalMinutes / 60 };
        }
      }
    } catch (error) {
      console.error("Error calculating time:", error);
    }
    return { hours: 0, minutes: 0, total: 0 };
  };

  // Get status label and color
  const getStatusInfo = (session: StaffAttendanceSession) => {
    if (session["Giờ vào"] && session["Giờ ra"]) {
      return { label: "Đã hoàn thành", color: "green" };
    }
    if (session["Giờ vào"] && !session["Giờ ra"]) {
      return { label: "Đang làm việc", color: "blue" };
    }
    if (session["Trạng thái"] === "absent") {
      return { label: "Vắng", color: "red" };
    }
    if (session["Trạng thái"] === "leave") {
      return { label: "Nghỉ phép", color: "orange" };
    }
    return { label: "Chưa check-in", color: "default" };
  };

  // Delete attendance record
  const handleDelete = async (sessionId: string) => {
    try {
      const sessionRef = ref(database, `datasheet/Điểm_danh_nhân_sự/${sessionId}`);
      await remove(sessionRef);
      message.success("Đã xóa bản ghi chấm công");
    } catch (error) {
      console.error("Error deleting attendance:", error);
      message.error("Lỗi khi xóa bản ghi");
    }
  };

  // Columns for daily attendance log
  const dailyColumns = [
    {
      title: "NGÀY",
      dataIndex: "Ngày",
      key: "date",
      width: 120,
      align: "center" as const,
      render: (date: string) => (
        <span style={{ fontWeight: 600, fontSize: "14px" }}>
          {dayjs(date).format("DD/MM/YYYY")}
        </span>
      ),
    },
    {
      title: "NHÂN VIÊN",
      dataIndex: "Nhân viên",
      key: "staff",
      width: 250,
      render: (name: string) => (
        <Space>
          <UserOutlined style={{ fontSize: "18px" }} />
          <strong style={{ fontSize: "16px" }}>{name}</strong>
        </Space>
      ),
    },
    {
      title: "GIỜ VÀO",
      dataIndex: "Giờ vào",
      key: "checkIn",
      width: 150,
      align: "center" as const,
      render: (time: string) =>
        time ? (
          <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: "15px", padding: "6px 12px" }}>
            {time}
          </Tag>
        ) : (
          <span style={{ color: "#999", fontSize: "15px" }}>-</span>
        ),
    },
    {
      title: "GIỜ RA",
      dataIndex: "Giờ ra",
      key: "checkOut",
      width: 180,
      align: "center" as const,
      render: (time: string, record: StaffAttendanceSession) =>
        time ? (
          <Tag color="blue" icon={<ClockCircleOutlined />} style={{ fontSize: "15px", padding: "6px 12px" }}>
            {time}
          </Tag>
        ) : record["Giờ vào"] ? (
          <Button
            size="large"
            type="primary"
            onClick={() => handleCheckOut(record.id, record["Nhân viên"])}
            style={{ fontSize: "15px", height: "40px", padding: "0 20px" }}
          >
            Check-out
          </Button>
        ) : (
          <span style={{ color: "#999", fontSize: "15px" }}>-</span>
        ),
    },
    {
      title: "TỔNG GIỜ",
      key: "totalHours",
      width: 150,
      align: "center" as const,
      render: (_: any, record: StaffAttendanceSession) => {
        const time = calculateTotalTime(record["Giờ vào"] || "", record["Giờ ra"] || "");
        return time.total > 0 ? (
          <Tag color="blue" style={{ fontSize: "15px", padding: "6px 12px" }}>
            {time.hours}h {time.minutes}m
          </Tag>
        ) : (
          <span style={{ color: "#999", fontSize: "15px" }}>-</span>
        );
      },
    },
    {
      title: "TRẠNG THÁI",
      key: "status",
      width: 180,
      align: "center" as const,
      render: (_: any, record: StaffAttendanceSession) => {
        const statusInfo = getStatusInfo(record);
        return <Tag color={statusInfo.color} style={{ fontSize: "15px", padding: "6px 12px" }}>{statusInfo.label}</Tag>;
      },
    },
    {
      title: "TÁC VỤ",
      key: "action",
      width: 120,
      align: "center" as const,
      render: (_: any, record: StaffAttendanceSession) => (
        <Popconfirm
          title="Xóa bản ghi chấm công"
          description="Bạn có chắc chắn muốn xóa bản ghi này?"
          onConfirm={() => handleDelete(record.id)}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button size="large" danger icon={<DeleteOutlined />} style={{ fontSize: "16px", height: "40px", width: "40px" }} />
        </Popconfirm>
      ),
    },
  ];

  const tabItems = [
    {
      key: "daily",
      label: "Chấm công ngày",
      children: (
        <Row gutter={16}>
          {/* Left Panel */}
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: "100%" }} size="large">
              {/* Check-In/Out Section */}
              <Card title="Check-In / Out" size="small">
                <Space direction="vertical" style={{ width: "100%" }} size="middle">
                  <div>
                    <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                      CHỌN THÁNG
                    </label>
                    <DatePicker
                      value={selectedMonth}
                      onChange={(date) => setSelectedMonth(date || dayjs())}
                      picker="month"
                      format="MM/YYYY"
                      style={{ width: "100%" }}
                      allowClear={false}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                      CHỌN NHÂN VIÊN
                    </label>
                    <Select
                      value={selectedStaffId}
                      onChange={setSelectedStaffId}
                      placeholder="-- Chọn nhân sự --"
                      style={{ width: "100%" }}
                      showSearch
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        (option?.children as unknown as string)
                          ?.toLowerCase()
                          .includes(input.toLowerCase())
                      }
                    >
                      {staffMembers.map((staff) => (
                        <Select.Option key={staff.id} value={staff.id}>
                          {staff["Họ và tên"]}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    type="primary"
                    block
                    size="large"
                    onClick={handleCheckIn}
                    disabled={!selectedStaffId}
                  >
                    Xác nhận Check-in
                  </Button>
                </Space>
              </Card>

              {/* Monthly Stats */}
              <Card size="small" title={`Thống kê tháng ${selectedMonth.format("MM/YYYY")}`}>
                <Space direction="vertical" style={{ width: "100%" }} size="small">
                  <Statistic
                    title="Tổng số nhân viên"
                    value={monthlyStats.uniqueStaff}
                    prefix={<UserOutlined />}
                    valueStyle={{ fontSize: "24px", fontWeight: "bold" }}
                  />
                  <Statistic
                    title="Tổng số ca"
                    value={monthlyStats.totalSessions}
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ fontSize: "24px", fontWeight: "bold" }}
                  />
                  <Statistic
                    title="Số ngày có dữ liệu"
                    value={monthlyStats.totalDays}
                    prefix={<CalendarOutlined />}
                    valueStyle={{ fontSize: "24px", fontWeight: "bold" }}
                  />
                </Space>
              </Card>

              {/* Daily Breakdown */}
              <Card size="small" title="Chi tiết theo ngày">
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {dailyStats.length > 0 ? (
                    <Space direction="vertical" style={{ width: "100%" }} size="small">
                      {dailyStats.map((stat) => (
                        <Card
                          key={stat.date}
                          size="small"
                          style={{ backgroundColor: "#f5f5f5" }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            📅 {stat.displayDate}
                          </div>
                          <div style={{ fontSize: "13px", color: "#666" }}>
                            👥 {stat.staffCount} nhân viên • 🔄 {stat.sessionCount} ca
                          </div>
                        </Card>
                      ))}
                    </Space>
                  ) : (
                    <Empty description="Chưa có dữ liệu" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </div>
              </Card>
            </Space>
          </Col>

          {/* Right Panel - Attendance Log */}
          <Col xs={24} md={16}>
            <Card
              title={`Nhật ký chấm công - Tháng ${selectedMonth.format("MM/YYYY")}`}
              size="small"
            >
              <Table
                columns={dailyColumns}
                dataSource={monthAttendance}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
                locale={{
                  emptyText: (
                    <Empty description="Chưa có dữ liệu chấm công tháng này." />
                  ),
                }}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <WrapperContent title="Quản Lý Chấm Công">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
      />
    </WrapperContent>
  );
};

export default StaffAttendance;
