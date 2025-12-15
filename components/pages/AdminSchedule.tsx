import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Space,
  Tag,
  Empty,
  Select,
  Checkbox,
  Calendar as AntCalendar,
  Modal,
  Form,
  TimePicker,
  DatePicker,
  Input,
  message,
  Popover,
} from "antd";
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  BookOutlined,
  EnvironmentOutlined,
  UserOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useClasses } from "../../hooks/useClasses";
import { Class, ClassSchedule } from "../../types";
import { useNavigate } from "react-router-dom";
import { ref, onValue, set, push, remove, update } from "firebase/database";
import { database } from "../../firebase";
import dayjs, { Dayjs } from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/vi";
import WrapperContent from "@/components/WrapperContent";
import { subjectMap } from "@/utils/selectOptions";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isoWeek);
dayjs.locale("vi");

interface ScheduleEvent {
  class: Class;
  schedule: ClassSchedule;
  date: string;
  scheduleId?: string; // ID from Thời_khoá_biểu if exists
  isCustomSchedule?: boolean; // True if from Thời_khoá_biểu
}

interface TimetableEntry {
  id: string;
  "Class ID": string;
  "Mã lớp": string;
  "Tên lớp": string;
  "Ngày": string;
  "Thứ": number;
  "Giờ bắt đầu": string;
  "Giờ kết thúc": string;
  "Phòng học"?: string;
  "Ghi chú"?: string;
  "Thay thế ngày"?: string; // Ngày gốc bị thay thế (dùng khi di chuyển lịch)
  "Thay thế thứ"?: number; // Thứ gốc bị thay thế
}

interface StaffSchedule {
  id: string;
  "Tên": string; // Fixed: "Nhân viên trực trung tâm"
  "Thứ": number; // Day of week (2-8, 2=Monday, 8=Sunday)
  "Giờ bắt đầu": string;
  "Giờ kết thúc": string;
  "Ghi chú"?: string;
  "Ngày"?: string; // Specific date for makeup schedule (YYYY-MM-DD)
  "Thay thế ngày"?: string; // Replaced original date
  "Thay thế thứ"?: number; // Replaced original day
}

type FilterMode = "class" | "subject" | "teacher" | "location";

// Generate hourly time slots from 6:00 to 22:00
const HOUR_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 6;
  return {
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    start: `${hour.toString().padStart(2, '0')}:00`,
    end: `${(hour + 1).toString().padStart(2, '0')}:00`,
  };
});

const AdminSchedule = () => {
  const { classes, loading } = useClasses();
  const navigate = useNavigate();
  const [currentWeekStart, setCurrentWeekStart] = useState<Dayjs>(
    dayjs().startOf("isoWeek")
  );
  const [filterMode, setFilterMode] = useState<FilterMode>("teacher");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Map<string, any>>(new Map());
  const [attendanceSessions, setAttendanceSessions] = useState<any[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<Map<string, TimetableEntry>>(new Map());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [editForm] = Form.useForm();
  const [draggingEvent, setDraggingEvent] = useState<ScheduleEvent | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null); // "dayIndex_slotIndex"
  
  // Staff schedule states
  const [staffSchedules, setStaffSchedules] = useState<Map<string, StaffSchedule>>(new Map());
  const [isStaffScheduleModalOpen, setIsStaffScheduleModalOpen] = useState(false);
  const [editingStaffSchedule, setEditingStaffSchedule] = useState<StaffSchedule | null>(null);
  const [staffScheduleForm] = Form.useForm();
  const [draggingStaffSchedule, setDraggingStaffSchedule] = useState<StaffSchedule | null>(null);
  
  // State cho modal xác nhận loại sửa đổi
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalType, setConfirmModalType] = useState<'edit' | 'drag'>('edit');
  const [pendingAction, setPendingAction] = useState<{
    event: ScheduleEvent;
    targetDate?: Dayjs; // Chỉ dùng cho drag
    newValues?: any; // Chỉ dùng cho edit
  } | null>(null);

  // Màu sắc cho từng giáo viên (Bug 2)
  const TEACHER_COLOR_PALETTE = [
    { bg: "#e6f7ff", border: "#1890ff", text: "#1890ff" }, // blue
    { bg: "#fff7e6", border: "#fa8c16", text: "#fa8c16" }, // orange
    { bg: "#f6ffed", border: "#52c41a", text: "#52c41a" }, // green
    { bg: "#fff0f6", border: "#eb2f96", text: "#eb2f96" }, // pink
    { bg: "#f9f0ff", border: "#722ed1", text: "#722ed1" }, // purple
    { bg: "#e6fffb", border: "#13c2c2", text: "#13c2c2" }, // cyan
    { bg: "#fffbe6", border: "#faad14", text: "#faad14" }, // yellow
    { bg: "#f0f5ff", border: "#2f54eb", text: "#2f54eb" }, // geekblue
    { bg: "#fcffe6", border: "#a0d911", text: "#a0d911" }, // lime
    { bg: "#fff1f0", border: "#ff4d4f", text: "#ff4d4f" }, // red
  ];

  // Map lưu màu đã assign cho giáo viên
  const teacherColorMap = new Map<string, { bg: string; border: string; text: string }>();
  let colorAssignIndex = 0;

  const getTeacherColor = (teacherId: string, teacherName: string) => {
    const key = teacherId || teacherName || 'unknown';
    if (!teacherColorMap.has(key)) {
      teacherColorMap.set(key, TEACHER_COLOR_PALETTE[colorAssignIndex % TEACHER_COLOR_PALETTE.length]);
      colorAssignIndex++;
    }
    return teacherColorMap.get(key)!;
  };

  // Load rooms
  useEffect(() => {
    const roomsRef = ref(database, "datasheet/Phòng_học");
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomsMap = new Map();
        Object.entries(data).forEach(([id, room]: [string, any]) => {
          roomsMap.set(id, room);
        });
        setRooms(roomsMap);
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
        const sessionsArray = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as any),
        }));
        setAttendanceSessions(sessionsArray);
      } else {
        setAttendanceSessions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load staff schedules from Lịch_trực_trung_tâm
  useEffect(() => {
    const staffScheduleRef = ref(database, "datasheet/Lịch_trực_trung_tâm");
    const unsubscribe = onValue(staffScheduleRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const schedulesMap = new Map<string, StaffSchedule>();
        Object.entries(data).forEach(([id, value]: [string, any]) => {
          schedulesMap.set(id, { id, ...value });
        });
        setStaffSchedules(schedulesMap);
      } else {
        setStaffSchedules(new Map());
      }
    });
    return () => unsubscribe();
  }, []);

  // Load timetable entries from Thời_khoá_biểu
  useEffect(() => {
    const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
    const unsubscribe = onValue(timetableRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const entriesMap = new Map<string, TimetableEntry>();
        Object.entries(data).forEach(([id, value]: [string, any]) => {
          // Create a unique key: Class ID + Date + Thứ
          const key = `${value["Class ID"]}_${value["Ngày"]}_${value["Thứ"]}`;
          entriesMap.set(key, { id, ...value });
        });
        setTimetableEntries(entriesMap);
      } else {
        setTimetableEntries(new Map());
      }
    });
    return () => unsubscribe();
  }, []);

  // Helper: Check if a date is replaced by a custom schedule (moved to another day)
  const isDateReplacedByCustomSchedule = (classId: string, dateStr: string, dayOfWeek: number): boolean => {
    // Check if any timetable entry has replaced this date
    for (const [, entry] of timetableEntries) {
      if (
        entry["Class ID"] === classId &&
        entry["Thay thế ngày"] === dateStr &&
        entry["Thay thế thứ"] === dayOfWeek
      ) {
        return true; // This date has been moved to another day
      }
    }
    return false;
  };

  // Helper to get room name from ID
  const getRoomName = (roomId: string): string => {
    if (!roomId) return "";
    const room = rooms.get(roomId);
    if (room) {
      return `${room["Tên phòng"]} - ${room["Địa điểm"]}`;
    }
    return roomId; // Fallback to ID if room not found
  };

  // Helper to get attendance count for a class on a specific date
  const getAttendanceCount = (classId: string, date: string): { present: number; total: number } => {
    const session = attendanceSessions.find(
      (s) => s["Class ID"] === classId && s["Ngày"] === date
    );

    if (!session || !session["Điểm danh"]) {
      // If no session, return total students from class
      const classData = activeClasses.find((c) => c.id === classId);
      const total = classData?.["Student IDs"]?.length || 0;
      return { present: 0, total };
    }

    const attendanceRecords = Array.isArray(session["Điểm danh"])
      ? session["Điểm danh"]
      : Object.values(session["Điểm danh"] || {});

    const present = attendanceRecords.filter((r: any) => r["Có mặt"] === true).length;
    const total = attendanceRecords.length;

    return { present, total };
  };

  const weekDays = Array.from({ length: 7 }, (_, i) =>
    currentWeekStart.add(i, "day")
  );

  const activeClasses = classes.filter((c) => c["Trạng thái"] === "active");

  // Get filter options based on mode
  const getFilterItems = () => {
    switch (filterMode) {
      case "class":
        return Array.from(
          new Set(activeClasses.map((c) => c["Khối"]))
        ).sort().map((grade) => ({
          id: grade,
          label: `Khối ${grade}`,
        }));
      case "subject":
        // Get unique subjects and filter out empty/invalid values
        const subjects = Array.from(
          new Set(
            activeClasses
              .map((c) => c["Môn học"])
              .filter((s) => s && s.trim() !== "")
          )
        ).sort();
        
        return subjects.map((subject) => ({
          id: subject,
          label: subjectMap[subject] || subject,
        }));
      case "teacher":
        return Array.from(
          new Set(
            activeClasses.map((c) =>
              JSON.stringify({
                id: c["Teacher ID"],
                name: c["Giáo viên chủ nhiệm"],
              })
            )
          )
        ).map((t) => JSON.parse(t)).map((t) => ({
          id: t.id,
          label: t.name,
        }));
      case "location":
        // Get unique rooms from "Phòng học"
        const roomIds = new Set<string>();
        activeClasses.forEach((c) => {
          if (c["Phòng học"] && c["Phòng học"].trim() !== "") {
            roomIds.add(c["Phòng học"]);
          }
        });
        return Array.from(roomIds).sort().map((roomId) => {
          const room = rooms.get(roomId);
          const label = room 
            ? `${room["Tên phòng"]} - ${room["Địa điểm"]}`
            : roomId;
          return {
            id: roomId,
            label: label,
          };
        });
      default:
        return [];
    }
  };

  const filterItems = getFilterItems();

  // Filter classes based on selected items
  const filteredClasses = activeClasses.filter((c) => {
    if (selectedItems.size === 0) return true;

    switch (filterMode) {
      case "class":
        return selectedItems.has(c["Khối"]);
      case "subject":
        return selectedItems.has(c["Môn học"]);
      case "teacher":
        return selectedItems.has(c["Teacher ID"]);
      case "location":
        // Check if class has matching room in "Phòng học"
        return c["Phòng học"] && selectedItems.has(c["Phòng học"]);
      default:
        return true;
    }
  });

  // Get all events for a specific date
  const getEventsForDate = (date: Dayjs): ScheduleEvent[] => {
    const events: ScheduleEvent[] = [];
    const dayOfWeek = date.day() === 0 ? 8 : date.day() + 1;
    const dateStr = date.format("YYYY-MM-DD");

    filteredClasses.forEach((classData) => {
      // First, check if there's a custom schedule in Thời_khoá_biểu
      const timetableKey = `${classData.id}_${dateStr}_${dayOfWeek}`;
      const customSchedule = timetableEntries.get(timetableKey);

      if (customSchedule) {
        events.push({
          class: classData,
          schedule: {
            "Thứ": customSchedule["Thứ"],
            "Giờ bắt đầu": customSchedule["Giờ bắt đầu"],
            "Giờ kết thúc": customSchedule["Giờ kết thúc"],
          },
          date: dateStr,
          scheduleId: customSchedule.id,
          isCustomSchedule: true,
        });
      } else {
        // Check if this date has been replaced by a custom schedule (moved to another day)
        if (isDateReplacedByCustomSchedule(classData.id, dateStr, dayOfWeek)) {
          return;
        }

        // Fallback to class schedule
        if (!classData["Lịch học"] || classData["Lịch học"].length === 0) {
          return;
        }

        classData["Lịch học"].filter((s) => s && s["Thứ"] === dayOfWeek).forEach((schedule) => {
          events.push({ class: classData, schedule, date: dateStr, isCustomSchedule: false });
        });
      }
    });

    return events;
  };

  // Get staff schedules for a specific date
  const getStaffSchedulesForDate = (date: Dayjs): StaffSchedule[] => {
    const dayOfWeek = date.day() === 0 ? 8 : date.day() + 1;
    const dateStr = date.format("YYYY-MM-DD");
    const staffSchedulesList: StaffSchedule[] = [];
    
    // Collect all makeup/date-specific schedules for this date
    const makeupSchedulesForDate: StaffSchedule[] = [];
    const replacedBaseSchedules = new Set<string>(); // Track base schedules that should be hidden
    
    staffSchedules.forEach((schedule) => {
      // Case 1: Makeup schedule for this exact date (moved TO this date)
      if (schedule["Ngày"] === dateStr) {
        makeupSchedulesForDate.push(schedule);
        
        // Hide base schedule at the NEW location (to avoid duplicate)
        const baseKey = `${schedule["Thứ"]}_${schedule["Giờ bắt đầu"]}_${schedule["Giờ kết thúc"]}`;
        replacedBaseSchedules.add(baseKey);
      }
      
      // Case 2: Makeup schedule that replaced THIS date (moved FROM this date)
      if (schedule["Thay thế ngày"] === dateStr && schedule["Thay thế thứ"] === dayOfWeek) {
        // Hide base schedule at the OLD location (schedule was moved away)
        const baseKey = `${dayOfWeek}_${schedule["Giờ bắt đầu"]}_${schedule["Giờ kết thúc"]}`;
        replacedBaseSchedules.add(baseKey);
      }
    });
    
    // Add all makeup schedules for this date
    staffSchedulesList.push(...makeupSchedulesForDate);
    
    // Add base schedules (recurring by day of week) only if not replaced
    staffSchedules.forEach((schedule) => {
      if (!schedule["Ngày"] && schedule["Thứ"] === dayOfWeek) {
        // This is a base recurring schedule
        const baseKey = `${dayOfWeek}_${schedule["Giờ bắt đầu"]}_${schedule["Giờ kết thúc"]}`;
        
        // Only add if not replaced by any makeup schedule
        if (!replacedBaseSchedules.has(baseKey)) {
          staffSchedulesList.push(schedule);
        }
      }
    });
    
    return staffSchedulesList;
  };

  // Helper to calculate staff schedule position
  const getStaffScheduleStyle = (schedule: StaffSchedule) => {
    const startTime = schedule["Giờ bắt đầu"];
    const endTime = schedule["Giờ kết thúc"];
    
    if (!startTime || !endTime) return { top: 0, height: 60 };
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startOffset = (startHour - 6) * 60 + startMin;
    const endOffset = (endHour - 6) * 60 + endMin;
    const duration = endOffset - startOffset;
    
    const top = startOffset;
    const height = Math.max(duration, 30);
    
    return { top, height };
  };

  // Helper to calculate event position and height based on time
  const getEventStyle = (event: ScheduleEvent) => {
    const startTime = event.schedule["Giờ bắt đầu"];
    const endTime = event.schedule["Giờ kết thúc"];
    
    if (!startTime || !endTime) return { top: 0, height: 60 };
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    // Calculate position from 6:00 (first hour slot)
    const startOffset = (startHour - 6) * 60 + startMin;
    const endOffset = (endHour - 6) * 60 + endMin;
    const duration = endOffset - startOffset;
    
    // Each hour = 60px
    const top = startOffset;
    const height = Math.max(duration, 30); // minimum 30px height
    
    return { top, height };
  };

  // Group overlapping events for positioning
  const groupOverlappingEvents = (events: ScheduleEvent[]) => {
    if (events.length === 0) return [];
    
    // Sort by start time
    const sorted = [...events].sort((a, b) => {
      return a.schedule["Giờ bắt đầu"].localeCompare(b.schedule["Giờ bắt đầu"]);
    });
    
    // Find overlapping groups and assign columns
    const positioned: { event: ScheduleEvent; column: number; totalColumns: number }[] = [];
    
    sorted.forEach((event) => {
      const eventStart = event.schedule["Giờ bắt đầu"];
      const eventEnd = event.schedule["Giờ kết thúc"];
      
      // Find overlapping events already positioned
      const overlapping = positioned.filter((p) => {
        const pStart = p.event.schedule["Giờ bắt đầu"];
        const pEnd = p.event.schedule["Giờ kết thúc"];
        return eventStart < pEnd && eventEnd > pStart;
      });
      
      // Find first available column
      const usedColumns = new Set(overlapping.map(p => p.column));
      let column = 0;
      while (usedColumns.has(column)) column++;
      
      positioned.push({ event, column, totalColumns: 1 });
      
      // Update totalColumns for overlapping events
      const maxColumn = Math.max(column + 1, ...overlapping.map(p => p.totalColumns));
      overlapping.forEach(p => p.totalColumns = maxColumn);
      positioned[positioned.length - 1].totalColumns = maxColumn;
    });
    
    // Final pass to ensure all overlapping events have same totalColumns
    positioned.forEach((p, i) => {
      const pStart = p.event.schedule["Giờ bắt đầu"];
      const pEnd = p.event.schedule["Giờ kết thúc"];
      
      positioned.forEach((other, j) => {
        if (i === j) return;
        const oStart = other.event.schedule["Giờ bắt đầu"];
        const oEnd = other.event.schedule["Giờ kết thúc"];
        
        if (pStart < oEnd && pEnd > oStart) {
          const maxCols = Math.max(p.totalColumns, other.totalColumns);
          p.totalColumns = maxCols;
          other.totalColumns = maxCols;
        }
      });
    });
    
    return positioned;
  };

  const getEventsForDateAndSlot = (
    date: Dayjs,
    slotStart: string,
    slotEnd: string
  ): ScheduleEvent[] => {
    const events: ScheduleEvent[] = [];
    const dayOfWeek = date.day() === 0 ? 8 : date.day() + 1;
    const dateStr = date.format("YYYY-MM-DD");

    filteredClasses.forEach((classData) => {
      // Lịch học hiển thị tất cả các tuần (không giới hạn ngày bắt đầu/kết thúc)

      // First, check if there's a custom schedule in Thời_khoá_biểu
      const timetableKey = `${classData.id}_${dateStr}_${dayOfWeek}`;
      const customSchedule = timetableEntries.get(timetableKey);

      if (customSchedule) {
        // Use custom schedule from Thời_khoá_biểu
        const scheduleStart = customSchedule["Giờ bắt đầu"];
        if (scheduleStart && scheduleStart >= slotStart && scheduleStart < slotEnd) {
          events.push({
            class: classData,
            schedule: {
              "Thứ": customSchedule["Thứ"],
              "Giờ bắt đầu": customSchedule["Giờ bắt đầu"],
              "Giờ kết thúc": customSchedule["Giờ kết thúc"],
            },
            date: dateStr,
            scheduleId: customSchedule.id,
            isCustomSchedule: true,
          });
        }
      } else {
        // Check if this date has been replaced by a custom schedule (moved to another day)
        if (isDateReplacedByCustomSchedule(classData.id, dateStr, dayOfWeek)) {
          return; // Skip - this date's schedule has been moved
        }

        // Fallback to class schedule
        if (!classData["Lịch học"] || classData["Lịch học"].length === 0) {
          return;
        }

        const schedules =
          classData["Lịch học"].filter((s) => {
            if (!s || s["Thứ"] !== dayOfWeek) return false;
            const scheduleStart = s["Giờ bắt đầu"];
            if (!scheduleStart) return false;
            return scheduleStart >= slotStart && scheduleStart < slotEnd;
          });

        schedules.forEach((schedule) => {
          events.push({ class: classData, schedule, date: dateStr, isCustomSchedule: false });
        });
      }
    });

    return events.sort((a, b) =>
      a.schedule["Giờ bắt đầu"].localeCompare(b.schedule["Giờ bắt đầu"])
    );
  };

  const goToPreviousWeek = () =>
    setCurrentWeekStart((prev) => prev.subtract(1, "week"));
  const goToNextWeek = () => setCurrentWeekStart((prev) => prev.add(1, "week"));
  const goToToday = () => setCurrentWeekStart(dayjs().startOf("isoWeek"));

  const isToday = (date: Dayjs) => date.isSame(dayjs(), "day");

  const handleItemToggle = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filterItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filterItems.map((item) => item.id)));
    }
  };

  const handleEditSchedule = (event: ScheduleEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEvent(event);
    editForm.setFieldsValue({
      "Giờ bắt đầu": event.schedule["Giờ bắt đầu"] ? dayjs(event.schedule["Giờ bắt đầu"], "HH:mm") : null,
      "Giờ kết thúc": event.schedule["Giờ kết thúc"] ? dayjs(event.schedule["Giờ kết thúc"], "HH:mm") : null,
      "Phòng học": event.class["Phòng học"] || "",
      "Ghi chú": "",
    });
    setIsEditModalOpen(true);
  };

  // Hiển thị modal xác nhận khi người dùng nhấn Lưu
  const handleSaveScheduleClick = async () => {
    if (!editingEvent) return;
    
    try {
      const values = await editForm.validateFields();
      
      // Nếu đây là lịch bù (có scheduleId), update trực tiếp không cần hỏi
      if (editingEvent.isCustomSchedule && editingEvent.scheduleId) {
        await saveScheduleThisDateOnly(editingEvent, values);
        return;
      }
      
      // Nếu là lịch mặc định, hỏi người dùng muốn sửa tất cả hay chỉ ngày này
      setPendingAction({ event: editingEvent, newValues: values });
      setConfirmModalType('edit');
      setConfirmModalVisible(true);
    } catch (error) {
      console.error("Validation error:", error);
    }
  };

  // Lưu lịch cho tất cả các tuần (cập nhật lịch gốc của lớp)
  const saveScheduleAllWeeks = async (event: ScheduleEvent, values: any) => {
    try {
      const classRef = ref(database, `datasheet/Lớp_học/${event.class.id}`);
      const currentSchedules = event.class["Lịch học"] || [];
      const dayOfWeek = event.schedule["Thứ"];
      
      // Cập nhật lịch học trong mảng Lịch học của lớp
      const updatedSchedules = currentSchedules.map((s: any) => {
        if (s["Thứ"] === dayOfWeek && 
            s["Giờ bắt đầu"] === event.schedule["Giờ bắt đầu"] &&
            s["Giờ kết thúc"] === event.schedule["Giờ kết thúc"]) {
          return {
            "Thứ": dayOfWeek,
            "Giờ bắt đầu": values["Giờ bắt đầu"].format("HH:mm"),
            "Giờ kết thúc": values["Giờ kết thúc"].format("HH:mm"),
          };
        }
        return s;
      });
      
      // Cập nhật phòng học nếu có thay đổi
      const updateData: any = { "Lịch học": updatedSchedules };
      if (values["Phòng học"]) {
        updateData["Phòng học"] = values["Phòng học"];
      }
      
      await update(classRef, updateData);
      
      // Xóa tất cả các lịch bù cùng thứ của lớp này (vì đã cập nhật lịch gốc)
      const entriesToDelete: string[] = [];
      timetableEntries.forEach((entry, key) => {
        if (entry["Class ID"] === event.class.id && entry["Thứ"] === dayOfWeek) {
          entriesToDelete.push(entry.id);
        }
      });
      
      for (const entryId of entriesToDelete) {
        const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${entryId}`);
        await remove(entryRef);
      }
      
      message.success("Đã cập nhật lịch cho tất cả các tuần");
      setIsEditModalOpen(false);
      setEditingEvent(null);
      editForm.resetFields();
    } catch (error) {
      console.error("Error saving schedule for all weeks:", error);
      message.error("Có lỗi xảy ra khi lưu lịch học");
    }
  };

  // Lưu lịch chỉ cho ngày này (tạo/cập nhật lịch bù)
  const saveScheduleThisDateOnly = async (event: ScheduleEvent, values: any) => {
    try {
      const dateStr = event.date;
      const dayOfWeek = dayjs(dateStr).day() === 0 ? 8 : dayjs(dateStr).day() + 1;

      const timetableData: Omit<TimetableEntry, "id"> = {
        "Class ID": event.class.id,
        "Mã lớp": event.class["Mã lớp"] || "",
        "Tên lớp": event.class["Tên lớp"] || "",
        "Ngày": dateStr,
        "Thứ": dayOfWeek,
        "Giờ bắt đầu": values["Giờ bắt đầu"].format("HH:mm"),
        "Giờ kết thúc": values["Giờ kết thúc"].format("HH:mm"),
        "Phòng học": values["Phòng học"] || "",
        "Ghi chú": values["Ghi chú"] || "",
      };

      if (event.scheduleId) {
        // Cập nhật lịch bù hiện có
        const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${event.scheduleId}`);
        await set(entryRef, timetableData);
        message.success("Đã cập nhật lịch học bù");
      } else {
        // Tạo lịch bù mới
        const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
        const newEntryRef = push(timetableRef);
        await set(newEntryRef, timetableData);
        message.success("Đã tạo lịch học bù cho ngày này");
      }

      setIsEditModalOpen(false);
      setEditingEvent(null);
      editForm.resetFields();
    } catch (error) {
      console.error("Error saving schedule:", error);
      message.error("Có lỗi xảy ra khi lưu lịch học");
    }
  };

  // Xử lý khi người dùng xác nhận loại sửa đổi
  const handleConfirmAction = async (updateAll: boolean) => {
    setConfirmModalVisible(false);
    
    if (!pendingAction) return;
    
    if (confirmModalType === 'edit') {
      if (updateAll) {
        await saveScheduleAllWeeks(pendingAction.event, pendingAction.newValues);
      } else {
        await saveScheduleThisDateOnly(pendingAction.event, pendingAction.newValues);
      }
    } else if (confirmModalType === 'drag' && pendingAction.targetDate) {
      if (updateAll) {
        await moveScheduleAllWeeks(pendingAction.event, pendingAction.targetDate);
      } else {
        await moveScheduleThisDateOnly(pendingAction.event, pendingAction.targetDate);
      }
    }
    
    setPendingAction(null);
  };

  // Di chuyển lịch cho tất cả các tuần (cập nhật thứ trong lịch gốc)
  const moveScheduleAllWeeks = async (event: ScheduleEvent, targetDate: Dayjs) => {
    try {
      const newDayOfWeek = targetDate.day() === 0 ? 8 : targetDate.day() + 1;
      const oldDayOfWeek = event.schedule["Thứ"];
      
      const classRef = ref(database, `datasheet/Lớp_học/${event.class.id}`);
      const currentSchedules = event.class["Lịch học"] || [];
      
      // Cập nhật thứ trong lịch học của lớp
      const updatedSchedules = currentSchedules.map((s: any) => {
        if (s["Thứ"] === oldDayOfWeek && 
            s["Giờ bắt đầu"] === event.schedule["Giờ bắt đầu"] &&
            s["Giờ kết thúc"] === event.schedule["Giờ kết thúc"]) {
          return {
            ...s,
            "Thứ": newDayOfWeek,
          };
        }
        return s;
      });
      
      await update(classRef, { "Lịch học": updatedSchedules });
      
      // Xóa tất cả các lịch bù liên quan đến thứ cũ của lớp này
      const entriesToDelete: string[] = [];
      timetableEntries.forEach((entry) => {
        if (entry["Class ID"] === event.class.id && 
            (entry["Thứ"] === oldDayOfWeek || entry["Thay thế thứ"] === oldDayOfWeek)) {
          entriesToDelete.push(entry.id);
        }
      });
      
      for (const entryId of entriesToDelete) {
        const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${entryId}`);
        await remove(entryRef);
      }
      
      const oldDayName = ["", "", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][oldDayOfWeek];
      const newDayName = ["", "", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][newDayOfWeek];
      message.success(`Đã đổi lịch từ ${oldDayName} sang ${newDayName} cho tất cả các tuần`);
    } catch (error) {
      console.error("Error moving schedule for all weeks:", error);
      message.error("Có lỗi xảy ra khi di chuyển lịch");
    }
  };

  // Di chuyển lịch chỉ cho ngày này (tạo lịch bù)
  const moveScheduleThisDateOnly = async (event: ScheduleEvent, targetDate: Dayjs) => {
    const newDateStr = targetDate.format("YYYY-MM-DD");
    const oldDateStr = event.date;
    const newDayOfWeek = targetDate.day() === 0 ? 8 : targetDate.day() + 1;
    const oldDayOfWeek = event.schedule["Thứ"];

    try {
      const timetableData: Omit<TimetableEntry, "id"> = {
        "Class ID": event.class.id,
        "Mã lớp": event.class["Mã lớp"] || "",
        "Tên lớp": event.class["Tên lớp"] || "",
        "Ngày": newDateStr,
        "Thứ": newDayOfWeek,
        "Giờ bắt đầu": event.schedule["Giờ bắt đầu"],
        "Giờ kết thúc": event.schedule["Giờ kết thúc"],
        "Phòng học": event.class["Phòng học"] || "",
      };

      // Thêm thông tin ngày gốc bị thay thế
      if (!event.isCustomSchedule) {
        (timetableData as any)["Thay thế ngày"] = oldDateStr;
        (timetableData as any)["Thay thế thứ"] = oldDayOfWeek;
      }

      if (event.scheduleId) {
        // Lấy thông tin thay thế cũ nếu có
        const existingEntry = Array.from(timetableEntries.values()).find(
          entry => entry.id === event.scheduleId
        );
        if (existingEntry && existingEntry["Thay thế ngày"]) {
          (timetableData as any)["Thay thế ngày"] = existingEntry["Thay thế ngày"];
          (timetableData as any)["Thay thế thứ"] = existingEntry["Thay thế thứ"];
        }

        // Xóa entry cũ và tạo mới
        const oldEntryRef = ref(database, `datasheet/Thời_khoá_biểu/${event.scheduleId}`);
        await remove(oldEntryRef);
      }

      const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
      const newEntryRef = push(timetableRef);
      await set(newEntryRef, timetableData);

      message.success(`Đã di chuyển lịch từ ${oldDateStr} sang ${newDateStr}`);
    } catch (error) {
      console.error("Error moving schedule:", error);
      message.error("Có lỗi xảy ra khi di chuyển lịch học");
    }
  };

  const handleSaveSchedule = async () => {
    // Giữ lại hàm cũ cho backward compatibility, nhưng gọi hàm mới
    handleSaveScheduleClick();
  };

  const handleDeleteSchedule = async () => {
    if (!editingEvent || !editingEvent.scheduleId) return;

    try {
      const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${editingEvent.scheduleId}`);
      await remove(entryRef);
      message.success("Đã xóa lịch học khỏi thời khóa biểu");
      setIsEditModalOpen(false);
      setEditingEvent(null);
      editForm.resetFields();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      message.error("Có lỗi xảy ra khi xóa lịch học");
    }
  };

  // ===== DRAG & DROP HANDLERS =====
  const handleDragStart = (e: React.DragEvent, event: ScheduleEvent) => {
    setDraggingEvent(event);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({
      classId: event.class.id,
      date: event.date,
      scheduleId: event.scheduleId,
      isCustomSchedule: event.isCustomSchedule,
      schedule: event.schedule,
    }));
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingEvent(null);
    setDragOverCell(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleDragOver = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCell(cellKey);
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Dayjs) => {
    e.preventDefault();
    setDragOverCell(null);

    // Handle staff schedule drop
    if (draggingStaffSchedule) {
      // Capture dragged schedule into local variable to avoid closure issues
      const draggedSchedule = draggingStaffSchedule;
      const newDayOfWeek = targetDate.day() === 0 ? 8 : targetDate.day() + 1;
      const oldDayOfWeek = draggedSchedule["Thứ"];

      // Nếu drop vào cùng thứ thì không làm gì
      if (newDayOfWeek === oldDayOfWeek) {
        setDraggingStaffSchedule(null);
        return;
      }

      const oldDayName = ["", "", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][oldDayOfWeek];
      const newDayName = ["", "", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][newDayOfWeek];
      const timeRange = `${draggedSchedule["Giờ bắt đầu"]}-${draggedSchedule["Giờ kết thúc"]}`;

      // Clear dragging state immediately
      setDraggingStaffSchedule(null);

      // Hỏi người dùng muốn di chuyển lịch này hay tất cả giờ ấy
      Modal.confirm({
        title: "Chuyển lịch trực",
        content: (
          <div>
            <p>Chọn cách di chuyển:</p>
            <ul style={{ marginLeft: "20px" }}>
              <li><strong>Lịch này:</strong> Chỉ di chuyển lịch vừa kéo từ {oldDayName} sang {newDayName}</li>
              <li><strong>Tất cả lịch ({timeRange}):</strong> Di chuyển tất cả lịch trực cùng khung giờ {timeRange} từ {oldDayName} sang {newDayName}</li>
            </ul>
          </div>
        ),
        okText: "Lịch này",
        cancelText: "Hủy",
        width: 600,
        okButtonProps: { type: "primary" },
        footer: (_, { OkBtn, CancelBtn }) => (
          <>
            <CancelBtn />
            <Button
              onClick={async () => {
                try {
                  // Move all staff schedules with same day and time
                  const schedulesToUpdate: string[] = [];
                  staffSchedules.forEach((schedule) => {
                    if (
                      schedule["Thứ"] === oldDayOfWeek &&
                      schedule["Giờ bắt đầu"] === draggedSchedule["Giờ bắt đầu"] &&
                      schedule["Giờ kết thúc"] === draggedSchedule["Giờ kết thúc"]
                    ) {
                      schedulesToUpdate.push(schedule.id);
                    }
                  });

                  for (const scheduleId of schedulesToUpdate) {
                    const scheduleRef = ref(database, `datasheet/Lịch_trực_trung_tâm/${scheduleId}`);
                    await update(scheduleRef, { "Thứ": newDayOfWeek });
                  }

                  message.success(`Đã chuyển ${schedulesToUpdate.length} lịch trực từ ${oldDayName} sang ${newDayName}`);
                  Modal.destroyAll();
                } catch (error) {
                  console.error("Error moving all staff schedules:", error);
                  message.error("Lỗi khi chuyển lịch trực");
                }
              }}
            >
              Tất cả lịch
            </Button>
            <OkBtn />
          </>
        ),
        onOk: async () => {
          try {
            const targetDateStr = targetDate.format("YYYY-MM-DD");

            // Check if this is a base schedule (no "Ngày") or date-specific schedule
            if (!draggedSchedule["Ngày"]) {
              // Compute the original date (in the currently displayed week) for the base schedule
              // Map Thứ (2..8) to week index 0..6 relative to currentWeekStart
              const oldDateStr = currentWeekStart.add(oldDayOfWeek - 2, 'day').format("YYYY-MM-DD");

              // Moving a base schedule to specific date - create makeup schedule
              const makeupScheduleData: Partial<StaffSchedule> = {
                "Tên": "Nhân viên trực trung tâm",
                "Thứ": newDayOfWeek,
                "Giờ bắt đầu": draggedSchedule["Giờ bắt đầu"],
                "Giờ kết thúc": draggedSchedule["Giờ kết thúc"],
                "Ghi chú": draggedSchedule["Ghi chú"] || "",
                "Ngày": targetDateStr, // Mark as date-specific
                "Thay thế ngày": oldDateStr, // Track original date being replaced (important)
                "Thay thế thứ": oldDayOfWeek, // Track original day
              };

              const schedulesRef = ref(database, "datasheet/Lịch_trực_trung_tâm");
              await push(schedulesRef, makeupScheduleData);
              message.success(`Đã chuyển lịch trực từ ${oldDayName} sang ${newDayName} cho ngày này`);
            } else {
              // Moving an existing date-specific schedule
              const scheduleRef = ref(database, `datasheet/Lịch_trực_trung_tâm/${draggedSchedule.id}`);
              await update(scheduleRef, { 
                "Thứ": newDayOfWeek,
                "Ngày": targetDateStr,
              });
              message.success(`Đã chuyển lịch trực từ ${oldDayName} sang ${newDayName}`);
            }
          } catch (error) {
            console.error("Error moving staff schedule:", error);
            message.error("Lỗi khi chuyển lịch trực");
          }
        },
      });

      return;
    }

    // Handle class schedule drop
    if (!draggingEvent) return;

    const newDateStr = targetDate.format("YYYY-MM-DD");
    const oldDateStr = draggingEvent.date;

    // Nếu drop vào cùng ngày thì không làm gì
    if (newDateStr === oldDateStr) {
      setDraggingEvent(null);
      return;
    }

    // Luôn hỏi người dùng muốn di chuyển tất cả hay chỉ ngày này
    setPendingAction({ event: draggingEvent, targetDate });
    setConfirmModalType('drag');
    setConfirmModalVisible(true);
    setDraggingEvent(null);
  };

  if (activeClasses.length === 0 && !loading)
    return (
      <div style={{ padding: "24px" }}>
        <Empty description="Chưa có lớp học nào" />
      </div>
    );

  return (
    <WrapperContent title="Lịch dạy tổng hợp" isLoading={loading}>
      <div style={{ display: "flex", gap: "16px", height: "calc(100vh - 200px)" }}>
        {/* Sidebar */}
        <div
          style={{
            width: "280px",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            maxHeight: "100%",
            overflowY: "auto",
          }}
        >
          {/* Mini Calendar */}
          <Card size="small" style={{ padding: "8px" }}>
            <AntCalendar
              fullscreen={false}
              value={currentWeekStart}
              onChange={(date) => setCurrentWeekStart(date.startOf("isoWeek"))}
            />
          </Card>

          {/* Filter Mode Dropdown */}
          <Card size="small" title="Bộ lọc lịch" key={`filter-card-${filterMode}`}>
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "6px" }}>
                Chế độ lọc:
              </div>
              <Select
                style={{ width: "100%" }}
                value={filterMode}
                onChange={(value) => {
                  setFilterMode(value);
                  setSelectedItems(new Set());
                }}
                options={[
                  { value: "teacher", label: "🧑‍🏫 Theo Giáo viên" },
                  { value: "class", label: "📚 Theo Khối" },
                  { value: "subject", label: "📖 Theo Môn học" },
                  { value: "location", label: "📍 Theo phòng học" },
                ]}
              />
            </div>

            {filterItems.length > 0 && (
              <>
                {/* Select All Checkbox */}
                <div style={{ marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid #f0f0f0" }}>
                  <Checkbox
                    checked={selectedItems.size === filterItems.length}
                    indeterminate={selectedItems.size > 0 && selectedItems.size < filterItems.length}
                    onChange={handleSelectAll}
                  >
                    <strong>
                      {selectedItems.size === 0
                        ? "Chọn tất cả"
                        : `Đã chọn ${selectedItems.size}/${filterItems.length}`}
                    </strong>
                  </Checkbox>
                </div>

                {/* Filter Items */}
                <div 
                  key={filterMode} 
                  style={{ maxHeight: "300px", overflowY: "auto", overflowX: "hidden" }}
                >
                  <Space direction="vertical" style={{ width: "100%" }} size="small">
                    {filterItems.map((item) => (
                      <Checkbox
                        key={`${filterMode}-${item.id}`}
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleItemToggle(item.id)}
                        style={{ width: "100%", margin: 0 }}
                      >
                        <span 
                          style={{ 
                            fontSize: "13px",
                            wordBreak: "break-word",
                            whiteSpace: "normal",
                            lineHeight: "1.4"
                          }}
                        >
                          {item.label}
                        </span>
                      </Checkbox>
                    ))}
                  </Space>
                </div>
              </>
            )}

            {filterItems.length === 0 && (
              <Empty
                description="Không có dữ liệu"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ margin: "20px 0" }}
              />
            )}
          </Card>
        </div>

        {/* Main Calendar View */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Week Navigation */}
          <Card style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button icon={<LeftOutlined />} onClick={goToPreviousWeek}>
                Tuần trước
              </Button>
              <Space>
                <CalendarOutlined />
                <span style={{ fontSize: 16, fontWeight: "bold" }}>
                  Tuần {currentWeekStart.isoWeek()} -{" "}
                  {currentWeekStart.format("MMMM YYYY")}
                </span>
                <span style={{ color: "#999" }}>
                  ({currentWeekStart.format("DD/MM")} -{" "}
                  {currentWeekStart.add(6, "day").format("DD/MM")})
                </span>
              </Space>
              <Space>
                <Button 
                  type="primary"
                  style={{ backgroundColor: "#ff9800", borderColor: "#ff9800" }}
                  onClick={() => {
                    setEditingStaffSchedule(null);
                    staffScheduleForm.resetFields();
                    setIsStaffScheduleModalOpen(true);
                  }}
                >
                  + Thêm lịch trực
                </Button>
                <Button onClick={goToToday}>Hôm nay</Button>
                <Button icon={<RightOutlined />} onClick={goToNextWeek}>
                  Tuần sau
                </Button>
              </Space>
            </div>
          </Card>

          {/* Schedule Grid - Hourly View */}
          <div style={{ flex: 1, overflow: "auto", backgroundColor: "white", border: "1px solid #f0f0f0", borderRadius: "8px" }}>
            <div style={{ display: "flex", minWidth: "fit-content" }}>
              {/* Time Column */}
              <div style={{ width: "60px", flexShrink: 0, borderRight: "1px solid #f0f0f0", backgroundColor: "#fafafa" }}>
                {/* Empty header cell */}
                <div style={{ 
                  height: "60px", 
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  color: "#999"
                }}>
                  GMT+07
                </div>
                {/* Hour labels */}
                {HOUR_SLOTS.map((slot) => (
                  <div
                    key={slot.hour}
                    style={{
                      height: "60px",
                      borderBottom: "1px solid #f0f0f0",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "flex-end",
                      paddingRight: "8px",
                      paddingTop: "4px",
                      fontSize: "11px",
                      color: "#666",
                    }}
                  >
                    {slot.label}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {weekDays.map((day, dayIndex) => {
                const dayEvents = getEventsForDate(day);
                const positionedEvents = groupOverlappingEvents(dayEvents);
                const cellKey = `day_${dayIndex}`;
                const isDragOver = dragOverCell === cellKey;

                return (
                  <div
                    key={dayIndex}
                    style={{
                      flex: 1,
                      minWidth: "140px",
                      borderRight: dayIndex < 6 ? "1px solid #f0f0f0" : "none",
                      position: "relative",
                    }}
                  >
                    {/* Day Header */}
                    <div
                      style={{
                        height: "60px",
                        borderBottom: "1px solid #f0f0f0",
                        backgroundColor: isToday(day) ? "#e6f7ff" : "#fafafa",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#666", textTransform: "capitalize" }}>
                        {day.format("dddd")}
                      </div>
                      <div style={{ 
                        fontSize: "20px", 
                        fontWeight: "bold",
                        color: isToday(day) ? "#1890ff" : "#333",
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isToday(day) ? "#1890ff" : "transparent",
                        ...(isToday(day) && { color: "white" })
                      }}>
                        {day.format("D")}
                      </div>
                    </div>

                    {/* Hour Grid with Events */}
                    <div
                      style={{
                        position: "relative",
                        height: `${HOUR_SLOTS.length * 60}px`,
                        backgroundColor: isDragOver ? "#e6f7ff" : isToday(day) ? "#fafffe" : "white",
                      }}
                      onDragOver={(e) => handleDragOver(e, cellKey)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, day)}
                    >
                      {/* Hour lines */}
                      {HOUR_SLOTS.map((slot, idx) => (
                        <div
                          key={slot.hour}
                          style={{
                            position: "absolute",
                            top: idx * 60,
                            left: 0,
                            right: 0,
                            height: "60px",
                            borderBottom: "1px solid #f5f5f5",
                          }}
                        />
                      ))}

                      {/* Current time indicator */}
                      {isToday(day) && (() => {
                        const now = dayjs();
                        const currentHour = now.hour();
                        const currentMin = now.minute();
                        if (currentHour >= 6 && currentHour < 23) {
                          const topPosition = (currentHour - 6) * 60 + currentMin;
                          return (
                            <div
                              style={{
                                position: "absolute",
                                top: topPosition,
                                left: 0,
                                right: 0,
                                height: "2px",
                                backgroundColor: "#ff4d4f",
                                zIndex: 5,
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  left: -4,
                                  top: -4,
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "50%",
                                  backgroundColor: "#ff4d4f",
                                }}
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Events */}
                      {positionedEvents.map(({ event, column, totalColumns }, idx) => {
                        const { top, height } = getEventStyle(event);
                        const eventKey = `${event.class.id}_${event.date}_${event.schedule["Thứ"]}`;
                        const isDragging = draggingEvent?.class.id === event.class.id && draggingEvent?.date === event.date;
                        
                        // Calculate width and left position for overlapping events
                        const width = `calc((100% - 4px) / ${totalColumns})`;
                        const left = `calc(${column} * (100% - 4px) / ${totalColumns} + 2px)`;

                        // Màu sắc theo GIÁO VIÊN (Bug 2 - mỗi giáo viên 1 màu)
                        const colorScheme = getTeacherColor(
                          event.class["Teacher ID"] || "",
                          event.class["Giáo viên chủ nhiệm"] || ""
                        );

                        return (
                          <div
                            key={`${eventKey}_${idx}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, event)}
                            onDragEnd={handleDragEnd}
                            style={{
                              position: "absolute",
                              top: top,
                              left: left,
                              width: width,
                              height: Math.max(height, 50),
                              backgroundColor: colorScheme.bg,
                              borderLeft: `3px solid ${colorScheme.border}`,
                              borderRadius: "4px",
                              padding: "4px 6px",
                              fontSize: "11px",
                              overflow: "hidden",
                              cursor: "pointer",
                              opacity: isDragging ? 0.5 : 1,
                              zIndex: 2,
                              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
                              e.currentTarget.style.zIndex = "15";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
                              e.currentTarget.style.zIndex = "2";
                            }}
                            onClick={() => navigate(`/workspace/classes/${event.class.id}/history`)}
                          >
                              <Popover
                                content={
                                  <div style={{ maxWidth: "250px" }}>
                                    <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                                      {event.class["Tên lớp"]}
                                    </div>
                                    <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                                      🕐 {event.schedule["Giờ bắt đầu"]} - {event.schedule["Giờ kết thúc"]}
                                    </div>
                                    <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                                      👨‍🏫 {event.class["Giáo viên chủ nhiệm"]}
                                    </div>
                                    {event.class["Phòng học"] && (
                                      <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                                        📍 {getRoomName(event.class["Phòng học"])}
                                      </div>
                                    )}
                                    <div style={{ marginTop: "8px" }}>
                                      <Space size={4}>
                                        <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); handleEditSchedule(event, e); }}>
                                          <EditOutlined /> Sửa lịch
                                        </Button>
                                      </Space>
                                    </div>
                                  </div>
                                }
                                trigger="hover"
                                placement="right"
                              >
                                <div style={{ height: "100%" }}>
                                  <div style={{ fontWeight: "bold", color: colorScheme.border, marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {event.class["Tên lớp"]}
                                  </div>
                                  <div style={{ color: "#666", fontSize: "10px" }}>
                                    {event.schedule["Giờ bắt đầu"]} - {event.schedule["Giờ kết thúc"]}
                                  </div>
                                  {height > 60 && (
                                    <div style={{ color: "#999", fontSize: "10px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {getRoomName(event.class["Phòng học"]) || event.class["Giáo viên chủ nhiệm"]}
                                    </div>
                                  )}
                                  {event.isCustomSchedule && (
                                    <Tag color="blue" style={{ fontSize: "9px", marginTop: "2px", padding: "0 4px" }}>
                                      Đã sửa
                                    </Tag>
                                  )}
                                </div>
                              </Popover>
                          </div>
                        );
                      })}

                      {/* Staff Schedules - Only for Admin */}
                      {getStaffSchedulesForDate(day).map((staffSchedule, idx) => {
                        const { top, height } = getStaffScheduleStyle(staffSchedule);
                        const isDragging = draggingStaffSchedule?.id === staffSchedule.id;

                        return (
                          <div
                            key={`staff_${staffSchedule.id}_${idx}`}
                            draggable
                            onDragStart={(e) => {
                              setDraggingStaffSchedule(staffSchedule);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDraggingStaffSchedule(null)}
                            style={{
                              position: "absolute",
                              top: top,
                              left: "2px",
                              right: "2px",
                              height: Math.max(height, 50),
                              backgroundColor: "#fff4e6",
                              borderLeft: "3px solid #ff9800",
                              borderRadius: "4px",
                              padding: "4px 6px",
                              fontSize: "11px",
                              overflow: "hidden",
                              cursor: "pointer",
                              opacity: isDragging ? 0.5 : 1,
                              zIndex: 3,
                              boxShadow: "0 1px 2px rgba(255,152,0,0.2)",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = "0 2px 8px rgba(255,152,0,0.3)";
                              e.currentTarget.style.zIndex = "16";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = "0 1px 2px rgba(255,152,0,0.2)";
                              e.currentTarget.style.zIndex = "3";
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingStaffSchedule(staffSchedule);
                              staffScheduleForm.setFieldsValue({
                                schedules: [
                                  {
                                    day: staffSchedule["Thứ"],
                                    startTime: dayjs(staffSchedule["Giờ bắt đầu"], "HH:mm"),
                                    endTime: dayjs(staffSchedule["Giờ kết thúc"], "HH:mm"),
                                    note: staffSchedule["Ghi chú"] || "",
                                  }
                                ],
                              });
                              setIsStaffScheduleModalOpen(true);
                            }}
                          >
                            <Popover
                              content={
                                <div style={{ maxWidth: "250px" }}>
                                  <div style={{ fontWeight: "bold", marginBottom: "8px", color: "#ff9800" }}>
                                    🏢 {staffSchedule["Tên"]}
                                  </div>
                                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                                    🕐 {staffSchedule["Giờ bắt đầu"]} - {staffSchedule["Giờ kết thúc"]}
                                  </div>
                                  {staffSchedule["Ghi chú"] && (
                                    <div style={{ fontSize: "12px", color: "#666", marginTop: "4px", fontStyle: "italic" }}>
                                      📝 {staffSchedule["Ghi chú"]}
                                    </div>
                                  )}
                                  <div style={{ fontSize: "11px", color: "#999", marginTop: "8px", borderTop: "1px solid #f0f0f0", paddingTop: "8px" }}>
                                    Click để chỉnh sửa hoặc xóa
                                  </div>
                                </div>
                              }
                              trigger="hover"
                            >
                              <div style={{ fontWeight: "600", color: "#ff9800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                🏢 Trực trung tâm
                              </div>
                              <div style={{ fontSize: "10px", color: "#666", marginTop: "1px" }}>
                                {staffSchedule["Giờ bắt đầu"]} - {staffSchedule["Giờ kết thúc"]}
                              </div>
                              {height > 60 && staffSchedule["Ghi chú"] && (
                                <div style={{ color: "#999", fontSize: "10px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  📝 {staffSchedule["Ghi chú"]}
                                </div>
                              )}
                            </Popover>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal - Hỏi sửa tất cả hay chỉ ngày này */}
      <Modal
        title={confirmModalType === 'edit' ? "Chọn loại cập nhật" : "Chọn loại di chuyển"}
        open={confirmModalVisible}
        onCancel={() => {
          setConfirmModalVisible(false);
          setPendingAction(null);
        }}
        footer={null}
        width={500}
      >
        <div style={{ padding: "16px 0" }}>
          {pendingAction && (
            <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
              <div><strong>Lớp:</strong> {pendingAction.event.class["Tên lớp"]}</div>
              <div><strong>Thời gian:</strong> {pendingAction.event.schedule["Giờ bắt đầu"]} - {pendingAction.event.schedule["Giờ kết thúc"]}</div>
              {confirmModalType === 'drag' && pendingAction.targetDate && (
                <div style={{ marginTop: "8px", color: "#1890ff" }}>
                  <strong>Di chuyển từ:</strong> {dayjs(pendingAction.event.date).format("dddd, DD/MM/YYYY")}
                  <br />
                  <strong>Đến:</strong> {pendingAction.targetDate.format("dddd, DD/MM/YYYY")}
                </div>
              )}
            </div>
          )}
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Button 
              type="primary" 
              size="large" 
              block 
              onClick={() => handleConfirmAction(true)}
              style={{ height: "auto", padding: "16px", textAlign: "left" }}
            >
              <div>
                <div style={{ fontWeight: "bold", fontSize: "15px" }}>
                  {confirmModalType === 'edit' ? "📅 Sửa tất cả các tuần" : "📅 Di chuyển tất cả các tuần"}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "4px" }}>
                  {confirmModalType === 'edit' 
                    ? "Cập nhật lịch gốc của lớp. Thay đổi sẽ áp dụng cho tất cả các tuần."
                    : "Thay đổi thứ học cố định của lớp. Từ tuần này trở đi lớp sẽ học vào thứ mới."
                  }
                </div>
              </div>
            </Button>
            
            <Button 
              size="large" 
              block 
              onClick={() => handleConfirmAction(false)}
              style={{ height: "auto", padding: "16px", textAlign: "left" }}
            >
              <div>
                <div style={{ fontWeight: "bold", fontSize: "15px" }}>
                  {confirmModalType === 'edit' ? "📌 Chỉ sửa ngày này" : "📌 Chỉ di chuyển ngày này"}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>
                  {confirmModalType === 'edit' 
                    ? "Tạo lịch học bù riêng cho ngày này. Các tuần khác giữ nguyên."
                    : "Tạo lịch học bù cho ngày mới. Các tuần khác vẫn học theo lịch cũ."
                  }
                </div>
              </div>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <EditOutlined style={{ color: "#1890ff" }} />
            <span>Chỉnh sửa lịch học</span>
          </div>
        }
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingEvent(null);
          editForm.resetFields();
        }}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        width={500}
        footer={[
          editingEvent?.scheduleId && (
            <Button key="delete" danger onClick={handleDeleteSchedule}>
              Xóa lịch bù
            </Button>
          ),
          <Button key="cancel" onClick={() => {
            setIsEditModalOpen(false);
            setEditingEvent(null);
            editForm.resetFields();
          }}>
            Hủy
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveSchedule}>
            Lưu thay đổi
          </Button>,
        ].filter(Boolean)}
      >
        {editingEvent && (
          <div style={{ marginBottom: "20px", padding: "16px", backgroundColor: "#f0f9ff", borderRadius: "8px", border: "1px solid #91d5ff" }}>
            <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "8px", color: "#1890ff" }}>
              {editingEvent.class["Tên lớp"]}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
              <div>📅 <strong>Ngày:</strong> {dayjs(editingEvent.date).format("dddd, DD/MM/YYYY")}</div>
              <div>👨‍🏫 <strong>GV:</strong> {editingEvent.class["Giáo viên chủ nhiệm"]}</div>
              {editingEvent.class["Phòng học"] && (
                <div>📍 <strong>Phòng:</strong> {getRoomName(editingEvent.class["Phòng học"])}</div>
              )}
              {editingEvent.isCustomSchedule && (
                <div><Tag color="blue">Đã có lịch bù</Tag></div>
              )}
            </div>
          </div>
        )}
        <Form form={editForm} layout="vertical">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Form.Item
              label="Giờ bắt đầu"
              name="Giờ bắt đầu"
              rules={[{ required: true, message: "Chọn giờ bắt đầu" }]}
            >
              <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
            </Form.Item>
            <Form.Item
              label="Giờ kết thúc"
              name="Giờ kết thúc"
              rules={[{ required: true, message: "Chọn giờ kết thúc" }]}
            >
              <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
            </Form.Item>
          </div>
          <Form.Item label="Phòng học" name="Phòng học">
            <Select
              placeholder="Chọn phòng học"
              allowClear
              style={{ width: "100%" }}
              options={Array.from(rooms.values()).map((room: any) => ({
                value: room.id || room["Tên phòng"],
                label: `${room["Tên phòng"]} - ${room["Địa điểm"] || ""}`
              }))}
            />
          </Form.Item>
          <Form.Item label="Ghi chú" name="Ghi chú">
            <Input.TextArea rows={2} placeholder="Nhập ghi chú (tùy chọn)" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Staff Schedule Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🏢</span>
            <span>{editingStaffSchedule ? "Chỉnh sửa lịch trực" : "Thêm lịch trực trung tâm"}</span>
          </div>
        }
        open={isStaffScheduleModalOpen}
        onCancel={() => {
          setIsStaffScheduleModalOpen(false);
          setEditingStaffSchedule(null);
          staffScheduleForm.resetFields();
        }}
        onOk={() => staffScheduleForm.submit()}
        okText={editingStaffSchedule ? "Cập nhật" : "Thêm lịch"}
        cancelText="Hủy"
        width={500}
        footer={
          <Space>
            {editingStaffSchedule && (
              <Button
                danger
                onClick={async () => {
                  Modal.confirm({
                    title: "Xác nhận xóa",
                    content: "Bạn có chắc muốn xóa lịch trực này?",
                    okText: "Xóa",
                    cancelText: "Hủy",
                    okButtonProps: { danger: true },
                    onOk: async () => {
                      try {
                        const scheduleRef = ref(database, `datasheet/Lịch_trực_trung_tâm/${editingStaffSchedule.id}`);
                        await remove(scheduleRef);
                        message.success("Đã xóa lịch trực");
                        setIsStaffScheduleModalOpen(false);
                        setEditingStaffSchedule(null);
                        staffScheduleForm.resetFields();
                      } catch (error) {
                        console.error("Error deleting staff schedule:", error);
                        message.error("Lỗi khi xóa lịch trực");
                      }
                    },
                  });
                }}
              >
                Xóa lịch
              </Button>
            )}
            <Button onClick={() => {
              setIsStaffScheduleModalOpen(false);
              setEditingStaffSchedule(null);
              staffScheduleForm.resetFields();
            }}>
              Hủy
            </Button>
            <Button type="primary" onClick={() => staffScheduleForm.submit()}>
              {editingStaffSchedule ? "Cập nhật" : "Thêm lịch"}
            </Button>
          </Space>
        }
      >
        <Form
          form={staffScheduleForm}
          layout="vertical"
          onFinish={async (values) => {
            try {
              if (editingStaffSchedule) {
                // Update existing - only one schedule
                const scheduleData: Partial<StaffSchedule> = {
                  "Tên": "Nhân viên trực trung tâm",
                  "Thứ": values.schedules[0].day,
                  "Giờ bắt đầu": values.schedules[0].startTime.format("HH:mm"),
                  "Giờ kết thúc": values.schedules[0].endTime.format("HH:mm"),
                  "Ghi chú": values.schedules[0].note || "",
                };
                const scheduleRef = ref(database, `datasheet/Lịch_trực_trung_tâm/${editingStaffSchedule.id}`);
                await update(scheduleRef, scheduleData);
                message.success("Đã cập nhật lịch trực");
              } else {
                // Create new - can create multiple with different times
                const schedulesRef = ref(database, "datasheet/Lịch_trực_trung_tâm");
                
                // values.schedules is an array of {day, startTime, endTime, note}
                for (const schedule of values.schedules || []) {
                  const scheduleData: Partial<StaffSchedule> = {
                    "Tên": "Nhân viên trực trung tâm",
                    "Thứ": schedule.day,
                    "Giờ bắt đầu": schedule.startTime.format("HH:mm"),
                    "Giờ kết thúc": schedule.endTime.format("HH:mm"),
                    "Ghi chú": schedule.note || "",
                  };
                  await push(schedulesRef, scheduleData);
                }
                
                message.success(`Đã thêm ${values.schedules?.length || 0} lịch trực`);
              }

              setIsStaffScheduleModalOpen(false);
              setEditingStaffSchedule(null);
              staffScheduleForm.resetFields();
            } catch (error) {
              console.error("Error saving staff schedule:", error);
              message.error("Lỗi khi lưu lịch trực");
            }
          }}
        >
          {!editingStaffSchedule && (
            <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
              <div style={{ fontSize: "13px", color: "#666", marginBottom: "8px" }}>
                ✨ <strong>Tip:</strong> Thêm lịch trực cho nhiều thứ với giờ khác nhau. Mỗi thứ có thể có khung giờ riêng.
              </div>
            </div>
          )}

          <Form.List
            name="schedules"
            rules={[
              {
                validator: async (_, schedules) => {
                  if (!schedules || schedules.length < 1) {
                    return Promise.reject(new Error("Vui lòng thêm ít nhất một lịch trực"));
                  }
                },
              },
            ]}
          >
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <Card
                    key={field.key}
                    size="small"
                    style={{ marginBottom: "12px" }}
                    extra={
                      fields.length > 1 && (
                        <Button
                          type="text"
                          danger
                          onClick={() => remove(field.name)}
                          style={{ padding: "4px 8px", height: "auto" }}
                        >
                          Xóa
                        </Button>
                      )
                    }
                  >
                    <Form.Item
                      {...field}
                      label="Thứ"
                      name={[field.name, "day"]}
                      rules={[{ required: true, message: "Chọn thứ" }]}
                    >
                      <Select placeholder="Chọn thứ">
                        <Select.Option value={2}>Thứ 2</Select.Option>
                        <Select.Option value={3}>Thứ 3</Select.Option>
                        <Select.Option value={4}>Thứ 4</Select.Option>
                        <Select.Option value={5}>Thứ 5</Select.Option>
                        <Select.Option value={6}>Thứ 6</Select.Option>
                        <Select.Option value={7}>Thứ 7</Select.Option>
                        <Select.Option value={8}>Chủ nhật</Select.Option>
                      </Select>
                    </Form.Item>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <Form.Item
                        {...field}
                        label="Giờ bắt đầu"
                        name={[field.name, "startTime"]}
                        rules={[{ required: true, message: "Chọn giờ bắt đầu" }]}
                      >
                        <TimePicker format="HH:mm" style={{ width: "100%" }} />
                      </Form.Item>

                      <Form.Item
                        {...field}
                        label="Giờ kết thúc"
                        name={[field.name, "endTime"]}
                        rules={[{ required: true, message: "Chọn giờ kết thúc" }]}
                      >
                        <TimePicker format="HH:mm" style={{ width: "100%" }} />
                      </Form.Item>
                    </div>

                    <Form.Item
                      {...field}
                      label="Ghi chú"
                      name={[field.name, "note"]}
                    >
                      <Input.TextArea rows={2} placeholder="Ghi chú (tùy chọn)" />
                    </Form.Item>
                  </Card>
                ))}

                {!editingStaffSchedule && (
                  <Button
                    type="dashed"
                    block
                    onClick={() => {
                      add();
                    }}
                    style={{ marginBottom: "12px" }}
                  >
                    + Thêm lịch trực khác
                  </Button>
                )}
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </WrapperContent>
  );
};

export default AdminSchedule;
