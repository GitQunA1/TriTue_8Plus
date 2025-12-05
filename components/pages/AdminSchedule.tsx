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
  
  // State cho modal xác nhận loại sửa đổi
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalType, setConfirmModalType] = useState<'edit' | 'drag'>('edit');
  const [pendingAction, setPendingAction] = useState<{
    event: ScheduleEvent;
    targetDate?: Dayjs; // Chỉ dùng cho drag
    newValues?: any; // Chỉ dùng cho edit
  } | null>(null);

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

    if (!draggingEvent) return;

    const newDateStr = targetDate.format("YYYY-MM-DD");
    const oldDateStr = draggingEvent.date;

    // Nếu drop vào cùng ngày thì không làm gì
    if (newDateStr === oldDateStr) {
      setDraggingEvent(null);
      return;
    }

    // Nếu đây là lịch bù (có scheduleId), di chuyển trực tiếp không cần hỏi
    if (draggingEvent.isCustomSchedule && draggingEvent.scheduleId) {
      await moveScheduleThisDateOnly(draggingEvent, targetDate);
      setDraggingEvent(null);
      return;
    }

    // Nếu là lịch mặc định, hỏi người dùng muốn di chuyển tất cả hay chỉ ngày này
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

                        // Generate color based on class name for variety
                        const colors = [
                          { bg: "#fff1f0", border: "#ff4d4f" }, // red
                          { bg: "#fff7e6", border: "#fa8c16" }, // orange  
                          { bg: "#fffbe6", border: "#fadb14" }, // yellow
                          { bg: "#f6ffed", border: "#52c41a" }, // green
                          { bg: "#e6fffb", border: "#13c2c2" }, // cyan
                          { bg: "#e6f7ff", border: "#1890ff" }, // blue
                          { bg: "#f9f0ff", border: "#722ed1" }, // purple
                          { bg: "#fff0f6", border: "#eb2f96" }, // pink
                        ];
                        const colorIndex = event.class["Tên lớp"]?.charCodeAt(0) % colors.length || 0;
                        const colorScheme = colors[colorIndex];

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
          <Form.Item label="Ghi chú" name="Ghi chú">
            <Input.TextArea rows={2} placeholder="Nhập ghi chú (tùy chọn)" />
          </Form.Item>
        </Form>
      </Modal>
    </WrapperContent>
  );
};

export default AdminSchedule;
