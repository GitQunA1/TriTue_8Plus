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
  Checkbox,
  Modal,
  Form,
  Input,
} from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  UserOutlined,
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
  EditOutlined,
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

  // Staff management state
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [addStaffForm] = Form.useForm();

  // Load staff members (from separate Nhân_viên table, not Giáo_viên)
  useEffect(() => {
    const staffRef = ref(database, "datasheet/Nhân_viên");
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

  // Calculate total hours and minutes - MOVED UP before monthlyHoursPerStaff
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

  // Calculate monthly hours per staff
  const monthlyHoursPerStaff = useMemo(() => {
    const staffHours: { [staffId: string]: { name: string; totalMinutes: number; sessionCount: number } } = {};
    
    monthAttendance.forEach((session) => {
      const staffId = session["Staff ID"];
      const staffName = session["Nhân viên"];
      
      if (!staffHours[staffId]) {
        staffHours[staffId] = { name: staffName, totalMinutes: 0, sessionCount: 0 };
      }
      
      if (session["Giờ vào"] && session["Giờ ra"]) {
        const time = calculateTotalTime(session["Giờ vào"], session["Giờ ra"]);
        staffHours[staffId].totalMinutes += time.hours * 60 + time.minutes;
        staffHours[staffId].sessionCount += 1;
      }
    });
    
    return Object.entries(staffHours)
      .map(([staffId, data]) => ({
        staffId,
        staffName: data.name,
        totalHours: Math.floor(data.totalMinutes / 60),
        totalMinutes: data.totalMinutes % 60,
        sessionCount: data.sessionCount,
      }))
      .sort((a, b) => (b.totalHours * 60 + b.totalMinutes) - (a.totalHours * 60 + a.totalMinutes));
  }, [monthAttendance]);

  // Weekly schedule state
  const [currentWeekStart, setCurrentWeekStart] = useState<Dayjs>(dayjs().startOf('week'));
  
  // Weekly duty schedule (lịch trực) - stored in Firebase
  const [weeklyDutySchedule, setWeeklyDutySchedule] = useState<{ [dateStaffKey: string]: boolean }>({});

  // Load weekly duty schedule from Firebase
  useEffect(() => {
    const dutyRef = ref(database, "datasheet/Lịch_trực_nhân_sự");
    const unsubscribe = onValue(dutyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setWeeklyDutySchedule(data);
      } else {
        setWeeklyDutySchedule({});
      }
    });
    return () => unsubscribe();
  }, []);

  // Toggle duty for a specific staff on a specific date
  const toggleDuty = async (date: Dayjs, staffId: string) => {
    const dateStr = date.format("YYYY-MM-DD");
    const key = `${dateStr}_${staffId}`;
    const currentValue = weeklyDutySchedule[key] || false;
    
    try {
      const dutyRef = ref(database, `datasheet/Lịch_trực_nhân_sự/${key}`);
      if (currentValue) {
        // Remove duty
        await remove(dutyRef);
      } else {
        // Add duty
        await set(dutyRef, true);
      }
    } catch (error) {
      console.error("Error toggling duty:", error);
      message.error("Lỗi khi cập nhật lịch trực");
    }
  };

  // Check if staff has duty on a specific date
  const hasDuty = (date: Dayjs, staffId: string): boolean => {
    const dateStr = date.format("YYYY-MM-DD");
    const key = `${dateStr}_${staffId}`;
    return weeklyDutySchedule[key] === true;
  };

  // Count total staff on duty for a specific date
  const countDutyForDate = (date: Dayjs): number => {
    const dateStr = date.format("YYYY-MM-DD");
    return Object.entries(weeklyDutySchedule)
      .filter(([key, value]) => key.startsWith(dateStr) && value === true)
      .length;
  };

  // Get days in current week
  const weekDays = useMemo(() => {
    const days: Dayjs[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(currentWeekStart.add(i, 'day'));
    }
    return days;
  }, [currentWeekStart]);

  // Get attendance for a specific day and staff
  const getAttendanceForDayAndStaff = (date: Dayjs, staffId: string) => {
    const dateStr = date.format("YYYY-MM-DD");
    return attendanceSessions.find(
      (s) => s["Ngày"] === dateStr && s["Staff ID"] === staffId
    );
  };

  // Navigate weeks
  const goToPrevWeek = () => setCurrentWeekStart(currentWeekStart.subtract(1, 'week'));
  const goToNextWeek = () => setCurrentWeekStart(currentWeekStart.add(1, 'week'));
  const goToCurrentWeek = () => setCurrentWeekStart(dayjs().startOf('week'));

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

  // Add new staff member (to Nhân_viên table, separate from Giáo_viên)
  const handleAddStaff = async (values: any) => {
    try {
      const staffRef = ref(database, "datasheet/Nhân_viên");
      const newStaffRef = push(staffRef);
      await set(newStaffRef, {
        "Họ và tên": values.name,
        "Email": values.email || "",
        "Số điện thoại": values.phone || "",
        "Vị trí": values.position || "",
        "Trạng thái": "Đang làm việc",
        "Ngày tạo": dayjs().format("YYYY-MM-DD HH:mm:ss"),
      });
      message.success(`Đã thêm nhân viên ${values.name}`);
      setIsAddStaffModalOpen(false);
      addStaffForm.resetFields();
    } catch (error) {
      console.error("Error adding staff:", error);
      message.error("Lỗi khi thêm nhân viên");
    }
  };

  // Delete staff member (from Nhân_viên table, separate from Giáo_viên)
  const handleDeleteStaff = async (staffId: string, staffName: string) => {
    try {
      const staffRef = ref(database, `datasheet/Nhân_viên/${staffId}`);
      await remove(staffRef);
      message.success(`Đã xóa nhân viên ${staffName}`);
    } catch (error) {
      console.error("Error deleting staff:", error);
      message.error("Lỗi khi xóa nhân viên");
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
              <Card size="small" title="📅 Lịch trực theo tuần (Tích để đánh dấu)">
                <div style={{ marginBottom: 12 }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Button icon={<LeftOutlined />} onClick={goToPrevWeek} />
                    <span style={{ fontWeight: 600 }}>
                      {currentWeekStart.format("DD/MM")} - {currentWeekStart.add(6, 'day').format("DD/MM/YYYY")}
                    </span>
                    <Button icon={<RightOutlined />} onClick={goToNextWeek} />
                  </Space>
                  <Button 
                    type="link" 
                    onClick={goToCurrentWeek} 
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    Tuần hiện tại
                  </Button>
                </div>
                
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {staffMembers.length > 0 ? (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "6px", borderBottom: "1px solid #ddd", textAlign: "left", minWidth: "80px" }}>Nhân viên</th>
                          {weekDays.map((day) => (
                            <th 
                              key={day.format("YYYY-MM-DD")} 
                              style={{ 
                                padding: "4px 2px", 
                                borderBottom: "1px solid #ddd", 
                                textAlign: "center",
                                backgroundColor: day.isSame(dayjs(), 'day') ? "#e6f7ff" : "transparent",
                                minWidth: "36px"
                              }}
                            >
                              <div>{day.format("dd")}</div>
                              <div style={{ fontSize: "10px", color: "#666" }}>{day.format("DD")}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {staffMembers.map((staff) => (
                          <tr key={staff.id}>
                            <td style={{ padding: "6px", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "80px" }}>
                              {staff["Họ và tên"]?.split(" ").slice(-2).join(" ")}
                            </td>
                            {weekDays.map((day) => {
                              return (
                                <td 
                                  key={day.format("YYYY-MM-DD")} 
                                  style={{ 
                                    padding: "4px 2px", 
                                    borderBottom: "1px solid #f0f0f0", 
                                    textAlign: "center",
                                    backgroundColor: day.isSame(dayjs(), 'day') ? "#e6f7ff" : "transparent"
                                  }}
                                >
                                  <Checkbox 
                                    checked={hasDuty(day, staff.id)} 
                                    onChange={() => toggleDuty(day, staff.id)}
                                    style={{ transform: "scale(1.2)" }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Summary row - count of staff on duty per day */}
                        <tr style={{ backgroundColor: "#fafafa", fontWeight: 600 }}>
                          <td style={{ padding: "6px", borderTop: "2px solid #ddd" }}>Tổng trực</td>
                          {weekDays.map((day) => (
                            <td 
                              key={day.format("YYYY-MM-DD")} 
                              style={{ 
                                padding: "4px 2px", 
                                borderTop: "2px solid #ddd",
                                textAlign: "center",
                                backgroundColor: day.isSame(dayjs(), 'day') ? "#bae7ff" : "#fafafa",
                                color: countDutyForDate(day) > 0 ? "#52c41a" : "#999"
                              }}
                            >
                              {countDutyForDate(day)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <Empty description="Chưa có dữ liệu" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </div>
                
                <div style={{ marginTop: 8, fontSize: "11px", color: "#666" }}>
                  <span>✅ Tích chọn để đánh dấu nhân viên trực trong ngày</span>
                </div>
              </Card>

              {/* Staff Management Card */}
              <Card 
                size="small" 
                title="👥 Quản lý Nhân viên"
                extra={
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    size="small"
                    onClick={() => setIsAddStaffModalOpen(true)}
                  >
                    Thêm
                  </Button>
                }
              >
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {staffMembers.length > 0 ? (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "8px", borderBottom: "1px solid #ddd", textAlign: "left" }}>Họ tên</th>
                          <th style={{ padding: "8px", borderBottom: "1px solid #ddd", textAlign: "left" }}>Vị trí</th>
                          <th style={{ padding: "8px", borderBottom: "1px solid #ddd", textAlign: "center", width: "60px" }}>Xóa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffMembers.map((staff) => (
                          <tr key={staff.id}>
                            <td style={{ padding: "8px", borderBottom: "1px solid #f0f0f0" }}>
                              <Space>
                                <UserOutlined />
                                <span>{staff["Họ và tên"]}</span>
                              </Space>
                            </td>
                            <td style={{ padding: "8px", borderBottom: "1px solid #f0f0f0", color: "#666" }}>
                              {staff["Vị trí"] || "-"}
                            </td>
                            <td style={{ padding: "8px", borderBottom: "1px solid #f0f0f0", textAlign: "center" }}>
                              <Popconfirm
                                title="Xóa nhân viên"
                                description={`Bạn có chắc muốn xóa ${staff["Họ và tên"]}?`}
                                onConfirm={() => handleDeleteStaff(staff.id, staff["Họ và tên"])}
                                okText="Xóa"
                                cancelText="Hủy"
                                okButtonProps={{ danger: true }}
                              >
                                <Button 
                                  size="small" 
                                  danger 
                                  icon={<DeleteOutlined />}
                                />
                              </Popconfirm>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Empty description="Chưa có nhân viên" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: "11px", color: "#666" }}>
                  Tổng: <strong>{staffMembers.length}</strong> nhân viên
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

            {/* Monthly Hours Summary per Staff */}
            <Card
              title={`Thống kê giờ làm tháng ${selectedMonth.format("MM/YYYY")}`}
              size="small"
              style={{ marginTop: 16 }}
            >
              {monthlyHoursPerStaff.length > 0 ? (
                <Table
                  dataSource={monthlyHoursPerStaff}
                  rowKey="staffId"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: "NHÂN VIÊN",
                      dataIndex: "staffName",
                      key: "staffName",
                      render: (name: string) => (
                        <Space>
                          <UserOutlined />
                          <strong>{name}</strong>
                        </Space>
                      ),
                    },
                    {
                      title: "SỐ CA",
                      dataIndex: "sessionCount",
                      key: "sessionCount",
                      width: 100,
                      align: "center" as const,
                      render: (count: number) => (
                        <Tag color="blue">{count} ca</Tag>
                      ),
                    },
                    {
                      title: "TỔNG GIỜ",
                      key: "totalTime",
                      width: 150,
                      align: "center" as const,
                      render: (_: any, record: { totalHours: number; totalMinutes: number }) => (
                        <Tag color="green" style={{ fontSize: "14px", padding: "4px 12px" }}>
                          {record.totalHours}h {record.totalMinutes}m
                        </Tag>
                      ),
                    },
                  ]}
                />
              ) : (
                <Empty description="Chưa có dữ liệu giờ làm" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
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

      {/* Add Staff Modal */}
      <Modal
        title="Thêm Nhân Viên Mới"
        open={isAddStaffModalOpen}
        onCancel={() => {
          setIsAddStaffModalOpen(false);
          addStaffForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={addStaffForm}
          layout="vertical"
          onFinish={handleAddStaff}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Họ và tên"
            rules={[{ required: true, message: "Vui lòng nhập họ tên" }]}
          >
            <Input placeholder="Nguyễn Văn A" prefix={<UserOutlined />} />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: "email", message: "Email không hợp lệ" }]}
          >
            <Input placeholder="email@example.com" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Số điện thoại"
          >
            <Input placeholder="0123456789" />
          </Form.Item>

          <Form.Item
            name="position"
            label="Vị trí"
          >
            <Input placeholder="Giáo viên / Trợ giảng / ..." />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => {
                setIsAddStaffModalOpen(false);
                addStaffForm.resetFields();
              }}>
                Hủy
              </Button>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                Thêm nhân viên
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </WrapperContent>
  );
};

export default StaffAttendance;
