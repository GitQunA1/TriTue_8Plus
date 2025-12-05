import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Space,
  Empty,
  Select,
  Checkbox,
  Calendar as AntCalendar,
  Modal,
  Form,
  TimePicker,
  DatePicker,
  message,
  Tag,
} from "antd";
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  BookOutlined,
  EnvironmentOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useClasses } from "../../hooks/useClasses";
import { useAuth } from "../../contexts/AuthContext";
import { Class, ClassSchedule } from "../../types";
import { ref, onValue, push, set, remove, update } from "firebase/database";
import { database } from "../../firebase";
import { useNavigate } from "react-router-dom";
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
  date: Dayjs;
  startMinutes: number;
  durationMinutes: number;
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
  "Thay thế ngày"?: string;
  "Thay thế thứ"?: number;
}

type ViewMode = "all" | "subject" | "location";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

const TeacherSchedule = () => {
  const { userProfile } = useAuth();
  const { classes, loading } = useClasses();
  const navigate = useNavigate();
  const [teacherData, setTeacherData] = useState<any>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Dayjs>(
    dayjs().startOf("isoWeek")
  );
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Map<string, any>>(new Map());
  
  // Drag & Drop và Edit states
  const [timetableEntries, setTimetableEntries] = useState<Map<string, TimetableEntry>>(new Map());
  const [draggingEvent, setDraggingEvent] = useState<ScheduleEvent | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [editForm] = Form.useForm();
  
  // State cho modal xác nhận loại sửa đổi
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalType, setConfirmModalType] = useState<'edit' | 'drag'>('edit');
  const [pendingAction, setPendingAction] = useState<{
    event: ScheduleEvent;
    targetDate?: Dayjs;
    newValues?: any;
  } | null>(null);

  const teacherId =
    teacherData?.id || userProfile?.teacherId || userProfile?.uid || "";

  const weekDays = Array.from({ length: 7 }, (_, i) =>
    currentWeekStart.add(i, "day")
  );

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

  // Load timetable entries (lịch học bù)
  useEffect(() => {
    const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
    const unsubscribe = onValue(timetableRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const entriesMap = new Map<string, TimetableEntry>();
        Object.entries(data).forEach(([id, value]: [string, any]) => {
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

  // Helper: Check if a date is replaced by a custom schedule
  const isDateReplacedByCustomSchedule = (classId: string, dateStr: string, dayOfWeek: number): boolean => {
    for (const [, entry] of timetableEntries) {
      if (
        entry["Class ID"] === classId &&
        entry["Thay thế ngày"] === dateStr &&
        entry["Thay thế thứ"] === dayOfWeek
      ) {
        return true;
      }
    }
    return false;
  };

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
          const [id, teacher] = teacherEntry;
          setTeacherData({ id, ...(teacher as any) });
        }
      }
    });
    return () => unsubscribe();
  }, [userProfile?.email]);

  // Helper to get room name from ID
  const getRoomName = (roomId: string): string => {
    if (!roomId) return "";
    const room = rooms.get(roomId);
    if (room) {
      return `${room["Tên phòng"]} - ${room["Địa điểm"]}`;
    }
    return roomId; // Fallback to ID if room not found
  };

  const myClasses = classes.filter((c) => {
    const match = c["Teacher ID"] === teacherId;
    return match && c["Trạng thái"] === "active";
  });

  const subjects = Array.from(new Set(myClasses.map((c) => c["Môn học"]))).sort();

  // Get unique rooms from "Phòng học"
  const locations = (() => {
    const roomSet = new Set<string>();
    myClasses.forEach((c) => {
      if (c["Phòng học"] && c["Phòng học"].trim() !== "") {
        roomSet.add(c["Phòng học"]);
      }
    });
    return Array.from(roomSet).sort();
  })();

  const filteredClasses = (() => {
    if (viewMode === "all") return myClasses;
    
    if (viewMode === "subject") {
      return selectedSubjects.size === 0
        ? myClasses
        : myClasses.filter((c) => selectedSubjects.has(c["Môn học"]));
    }
    
    if (viewMode === "location") {
      return selectedLocations.size === 0
        ? myClasses
        : myClasses.filter((c) => 
            c["Phòng học"] && selectedLocations.has(c["Phòng học"])
          );
    }
    
    return myClasses;
  })();

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const getWeekEvents = (): (ScheduleEvent & { column: number; totalColumns: number })[] => {
    const events: ScheduleEvent[] = [];

    weekDays.forEach((date) => {
      const dayOfWeek = date.day() === 0 ? 8 : date.day() + 1;
      const dateStr = date.format("YYYY-MM-DD");

      filteredClasses.forEach((classData) => {
        // Lịch học hiển thị tất cả các tuần (không giới hạn ngày bắt đầu/kết thúc)

        // Check if there's a custom schedule in Thời_khoá_biểu
        const timetableKey = `${classData.id}_${dateStr}_${dayOfWeek}`;
        const customSchedule = timetableEntries.get(timetableKey);

        if (customSchedule) {
          // Use custom schedule from Thời_khoá_biểu
          const startMinutes = timeToMinutes(customSchedule["Giờ bắt đầu"]);
          const endMinutes = timeToMinutes(customSchedule["Giờ kết thúc"]);
          events.push({
            class: classData,
            schedule: {
              "Thứ": customSchedule["Thứ"],
              "Giờ bắt đầu": customSchedule["Giờ bắt đầu"],
              "Giờ kết thúc": customSchedule["Giờ kết thúc"],
            },
            date,
            startMinutes,
            durationMinutes: endMinutes - startMinutes,
            scheduleId: customSchedule.id,
            isCustomSchedule: true,
          });
        } else {
          // Check if this date has been replaced by a custom schedule
          if (isDateReplacedByCustomSchedule(classData.id, dateStr, dayOfWeek)) {
            return; // Skip - this date's schedule has been moved
          }

          // Fallback to class schedule
          const schedules = classData["Lịch học"]?.filter(
            (s) => s["Thứ"] === dayOfWeek
          ) || [];

          schedules.forEach((schedule) => {
            const startMinutes = timeToMinutes(schedule["Giờ bắt đầu"]);
            const endMinutes = timeToMinutes(schedule["Giờ kết thúc"]);
            events.push({
              class: classData,
              schedule,
              date,
              startMinutes,
              durationMinutes: endMinutes - startMinutes,
              isCustomSchedule: false,
            });
          });
        }
      });
    });

    // Calculate columns for overlapping events
    const eventsWithColumns = events.map((event) => ({
      ...event,
      column: 0,
      totalColumns: 1,
    }));

    // Group by day and calculate overlaps
    weekDays.forEach((day) => {
      const dayEvents = eventsWithColumns.filter((e) => e.date.isSame(day, "day"));
      
      dayEvents.sort((a, b) => a.startMinutes - b.startMinutes);

      for (let i = 0; i < dayEvents.length; i++) {
        const currentEvent = dayEvents[i];
        const overlapping = [currentEvent];

        for (let j = 0; j < dayEvents.length; j++) {
          if (i === j) continue;
          const otherEvent = dayEvents[j];
          
          const currentEnd = currentEvent.startMinutes + currentEvent.durationMinutes;
          const otherEnd = otherEvent.startMinutes + otherEvent.durationMinutes;
          
          if (
            (otherEvent.startMinutes < currentEnd && otherEvent.startMinutes >= currentEvent.startMinutes) ||
            (currentEvent.startMinutes < otherEnd && currentEvent.startMinutes >= otherEvent.startMinutes)
          ) {
            if (!overlapping.includes(otherEvent)) {
              overlapping.push(otherEvent);
            }
          }
        }

        if (overlapping.length > 1) {
          overlapping.forEach((event, index) => {
            event.column = index;
            event.totalColumns = overlapping.length;
          });
        }
      }
    });

    return eventsWithColumns;
  };

  const weekEvents = getWeekEvents();

  const goToPreviousWeek = () =>
    setCurrentWeekStart((prev) => prev.subtract(1, "week"));
  const goToNextWeek = () => setCurrentWeekStart((prev) => prev.add(1, "week"));
  const goToToday = () => setCurrentWeekStart(dayjs().startOf("isoWeek"));

  const isToday = (date: Dayjs) => date.isSame(dayjs(), "day");

  const handleSubjectToggle = (subject: string) => {
    const newSelected = new Set(selectedSubjects);
    if (newSelected.has(subject)) {
      newSelected.delete(subject);
    } else {
      newSelected.add(subject);
    }
    setSelectedSubjects(newSelected);
  };

  const handleSelectAll = () => {
    if (viewMode === "subject") {
      if (selectedSubjects.size === subjects.length) {
        setSelectedSubjects(new Set());
      } else {
        setSelectedSubjects(new Set(subjects));
      }
    } else if (viewMode === "location") {
      if (selectedLocations.size === locations.length) {
        setSelectedLocations(new Set());
      } else {
        setSelectedLocations(new Set(locations));
      }
    }
  };

  const handleLocationToggle = (location: string) => {
    const newSelected = new Set(selectedLocations);
    if (newSelected.has(location)) {
      newSelected.delete(location);
    } else {
      newSelected.add(location);
    }
    setSelectedLocations(newSelected);
  };

  // ===== DRAG & DROP HANDLERS =====
  const handleDragStart = (e: React.DragEvent, event: ScheduleEvent) => {
    setDraggingEvent(event);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingEvent(null);
    setDragOverDay(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleDragOver = (e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(dayIndex);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDay: Dayjs) => {
    e.preventDefault();
    setDragOverDay(null);

    if (!draggingEvent) return;

    const newDateStr = targetDay.format("YYYY-MM-DD");
    const oldDateStr = draggingEvent.date.format("YYYY-MM-DD");

    if (newDateStr === oldDateStr) {
      setDraggingEvent(null);
      return;
    }

    // Nếu đây là lịch bù (có scheduleId), di chuyển trực tiếp không cần hỏi
    if (draggingEvent.isCustomSchedule && draggingEvent.scheduleId) {
      await moveScheduleThisDateOnly(draggingEvent, targetDay);
      setDraggingEvent(null);
      return;
    }

    // Nếu là lịch mặc định, hỏi người dùng muốn di chuyển tất cả hay chỉ ngày này
    setPendingAction({ event: draggingEvent, targetDate: targetDay });
    setConfirmModalType('drag');
    setConfirmModalVisible(true);
    setDraggingEvent(null);
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
    const oldDateStr = event.date.format("YYYY-MM-DD");
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
      
      await update(classRef, { "Lịch học": updatedSchedules });
      
      // Xóa tất cả các lịch bù cùng thứ của lớp này (vì đã cập nhật lịch gốc)
      const entriesToDelete: string[] = [];
      timetableEntries.forEach((entry) => {
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
      const dateStr = event.date.format("YYYY-MM-DD");
      const dayOfWeek = event.date.day() === 0 ? 8 : event.date.day() + 1;

      const timetableData: Omit<TimetableEntry, "id"> = {
        "Class ID": event.class.id,
        "Mã lớp": event.class["Mã lớp"] || "",
        "Tên lớp": event.class["Tên lớp"] || "",
        "Ngày": dateStr,
        "Thứ": dayOfWeek,
        "Giờ bắt đầu": values["Giờ bắt đầu"].format("HH:mm"),
        "Giờ kết thúc": values["Giờ kết thúc"].format("HH:mm"),
        "Phòng học": event.class["Phòng học"] || "",
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

  // ===== EDIT SCHEDULE HANDLERS =====
  const handleEditSchedule = (event: ScheduleEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEvent(event);
    editForm.setFieldsValue({
      "Ngày": event.date,
      "Giờ bắt đầu": dayjs(event.schedule["Giờ bắt đầu"], "HH:mm"),
      "Giờ kết thúc": dayjs(event.schedule["Giờ kết thúc"], "HH:mm"),
    });
    setIsEditModalOpen(true);
  };

  const handleSaveSchedule = async () => {
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

  const handleDeleteSchedule = async () => {
    if (!editingEvent || !editingEvent.scheduleId) {
      message.warning("Không thể xóa lịch mặc định");
      return;
    }

    try {
      const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${editingEvent.scheduleId}`);
      await remove(entryRef);
      message.success("Đã xóa lịch học bù");
      setIsEditModalOpen(false);
      setEditingEvent(null);
      editForm.resetFields();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      message.error("Có lỗi xảy ra khi xóa lịch học");
    }
  };

  if (myClasses.length === 0)
    return (
      <WrapperContent title="Lịch dạy của tôi" isLoading={loading}>
        <Empty description="Bạn chưa được phân công lớp học nào" />
      </WrapperContent>
    );

  return (
    <WrapperContent title="Lịch dạy của tôi" isLoading={loading}>
      <div style={{ display: "flex", gap: "16px", height: "calc(100vh - 200px)" }}>
        {/* Sidebar */}
        <div
          style={{
            width: "280px",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
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

          {/* View Mode Selection */}
          <Card size="small" title="Bộ lọc lịch">
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "6px" }}>
                Chế độ xem:
              </div>
              <Select
                style={{ width: "100%" }}
                value={viewMode}
                onChange={(value) => {
                  setViewMode(value);
                  setSelectedSubjects(new Set());
                  setSelectedLocations(new Set());
                }}
                options={[
                  { value: "all", label: "📅 Lịch tổng hợp" },
                  { value: "subject", label: "📚 Lịch phân môn" },
                  { value: "location", label: "📍 Lịch theo phòng học" },
                ]}
              />
            </div>

            {/* Subject Filter */}
            {viewMode === "subject" && subjects.length > 0 && (
              <>
                <div style={{ marginBottom: "8px", paddingBottom: "8px", borderTop: "1px solid #f0f0f0", paddingTop: "8px" }}>
                  <Checkbox
                    checked={selectedSubjects.size === subjects.length}
                    indeterminate={selectedSubjects.size > 0 && selectedSubjects.size < subjects.length}
                    onChange={handleSelectAll}
                  >
                    <strong>
                      {selectedSubjects.size === 0
                        ? "Chọn tất cả"
                        : `Đã chọn ${selectedSubjects.size}/${subjects.length}`}
                    </strong>
                  </Checkbox>
                </div>

                <div style={{ maxHeight: "350px", overflowY: "auto" }}>
                  <Space direction="vertical" style={{ width: "100%" }} size="small">
                    {subjects.map((subject) => (
                      <Checkbox
                        key={subject}
                        checked={selectedSubjects.has(subject)}
                        onChange={() => handleSubjectToggle(subject)}
                        style={{ width: "100%" }}
                      >
                        <span style={{ fontSize: "13px" }}>
                          {subjectMap[subject] || subject}
                        </span>
                      </Checkbox>
                    ))}
                  </Space>
                </div>
              </>
            )}

            {viewMode === "subject" && subjects.length === 0 && (
              <Empty
                description="Không có môn học"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ margin: "20px 0" }}
              />
            )}

            {/* Location Filter */}
            {viewMode === "location" && locations.length > 0 && (
              <>
                <div style={{ marginBottom: "8px", paddingBottom: "8px", borderTop: "1px solid #f0f0f0", paddingTop: "8px" }}>
                  <Checkbox
                    checked={selectedLocations.size === locations.length}
                    indeterminate={selectedLocations.size > 0 && selectedLocations.size < locations.length}
                    onChange={handleSelectAll}
                  >
                    <strong>
                      {selectedLocations.size === 0
                        ? "Chọn tất cả"
                        : `Đã chọn ${selectedLocations.size}/${locations.length}`}
                    </strong>
                  </Checkbox>
                </div>

                <div style={{ maxHeight: "350px", overflowY: "auto" }}>
                  <Space direction="vertical" style={{ width: "100%" }} size="small">
                    {locations.map((roomId) => (
                      <Checkbox
                        key={roomId}
                        checked={selectedLocations.has(roomId)}
                        onChange={() => handleLocationToggle(roomId)}
                        style={{ width: "100%" }}
                      >
                        <span style={{ fontSize: "13px" }}>
                          {getRoomName(roomId)}
                        </span>
                      </Checkbox>
                    ))}
                  </Space>
                </div>
              </>
            )}

            {viewMode === "location" && locations.length === 0 && (
              <Empty
                description="Không có phòng học"
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

          {/* Calendar Grid */}
          <div style={{ flex: 1, overflowY: "auto", backgroundColor: "white", borderRadius: "8px" }}>
            <div style={{ display: "flex", minHeight: "100%" }}>
              {/* Time Column */}
              <div
                style={{
                  width: "60px",
                  flexShrink: 0,
                  borderRight: "1px solid #f0f0f0",
                }}
              >
                <div style={{ height: "60px", borderBottom: "1px solid #f0f0f0" }} />
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{
                      height: "60px",
                      borderBottom: "1px solid #f0f0f0",
                      padding: "4px",
                      fontSize: "12px",
                      color: "#666",
                      textAlign: "right",
                    }}
                  >
                    {hour}:00
                  </div>
                ))}
              </div>

              {/* Days Columns */}
              {weekDays.map((day, dayIndex) => {
                const dayEvents = weekEvents.filter((e) =>
                  e.date.isSame(day, "day")
                );
                const isDragOver = dragOverDay === dayIndex;

                return (
                  <div
                    key={dayIndex}
                    style={{
                      flex: 1,
                      borderRight: dayIndex < 6 ? "1px solid #f0f0f0" : "none",
                      position: "relative",
                      backgroundColor: isDragOver 
                        ? "#bae7ff" 
                        : isToday(day) ? "#f6ffed" : "white",
                      transition: "background-color 0.2s",
                      outline: isDragOver ? "2px dashed #1890ff" : "none",
                    }}
                    onDragOver={(e) => handleDragOver(e, dayIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day)}
                  >
                    {/* Day Header */}
                    <div
                      style={{
                        height: "60px",
                        borderBottom: "1px solid #f0f0f0",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isToday(day) ? "#e6f7ff" : "#fafafa",
                      }}
                    >
                      <div
                        className="capitalize"
                        style={{
                          fontSize: "12px",
                          color: "#666",
                          fontWeight: 500,
                        }}
                      >
                        {day.format("ddd")}
                      </div>
                      <div
                        style={{
                          fontSize: "20px",
                          fontWeight: "bold",
                          color: isToday(day) ? "#1890ff" : "#000",
                        }}
                      >
                        {day.format("DD")}
                      </div>
                    </div>

                    {/* Hour Grid Lines */}
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        style={{
                          height: "60px",
                          borderBottom: "1px solid #f0f0f0",
                        }}
                      />
                    ))}

                    {/* Events */}
                    {dayEvents.map((event, idx) => {
                      const topOffset = ((event.startMinutes - 6 * 60) / 60) * 60;
                      const height = (event.durationMinutes / 60) * 60;
                      
                      const widthPercent = 100 / event.totalColumns;
                      const leftPercent = (event.column * widthPercent);
                      const isDragging = draggingEvent?.class.id === event.class.id && 
                                         draggingEvent?.date.isSame(event.date, "day");

                      return (
                        <div
                          key={idx}
                          draggable
                          onDragStart={(e) => handleDragStart(e, event)}
                          onDragEnd={handleDragEnd}
                          style={{
                            position: "absolute",
                            top: `${60 + topOffset}px`,
                            left: `${leftPercent}%`,
                            width: `${widthPercent - 1}%`,
                            height: `${height - 4}px`,
                            backgroundColor: event.isCustomSchedule ? "#fff7e6" : "#e6f7ff",
                            border: `1px solid ${event.isCustomSchedule ? "#ffa940" : "#69c0ff"}`,
                            borderLeft: `3px solid ${event.isCustomSchedule ? "#fa8c16" : "#1890ff"}`,
                            borderRadius: "4px",
                            padding: "4px 6px",
                            cursor: "grab",
                            overflow: "hidden",
                            transition: "all 0.2s",
                            zIndex: 1,
                            opacity: isDragging ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = event.isCustomSchedule ? "#ffd591" : "#bae7ff";
                            e.currentTarget.style.zIndex = "10";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = event.isCustomSchedule ? "#fff7e6" : "#e6f7ff";
                            e.currentTarget.style.zIndex = "1";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        >
                          {/* Edit Button */}
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={(e) => handleEditSchedule(event, e)}
                            style={{
                              position: "absolute",
                              top: "2px",
                              right: "2px",
                              padding: "0 4px",
                              height: "16px",
                              fontSize: "10px",
                              zIndex: 2,
                            }}
                            title="Sửa lịch"
                          />
                          
                          {/* Custom schedule indicator */}
                          {event.isCustomSchedule && (
                            <Tag 
                              color="orange" 
                              style={{ 
                                position: "absolute", 
                                bottom: "2px", 
                                right: "2px", 
                                fontSize: "8px",
                                padding: "0 4px",
                                margin: 0,
                              }}
                            >
                              Bù
                            </Tag>
                          )}
                          
                          <div
                            style={{
                              fontWeight: "bold",
                              fontSize: "11px",
                              marginBottom: "2px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              paddingRight: "20px",
                            }}
                            onClick={() =>
                              navigate(
                                `/workspace/attendance/session/${event.class.id}`,
                                {
                                  state: {
                                    classData: event.class,
                                    date: event.date.format("YYYY-MM-DD"),
                                  },
                                }
                              )
                            }
                          >
                            {event.class["Tên lớp"]}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              color: "#666",
                              marginBottom: "2px",
                            }}
                          >
                            {event.schedule["Giờ bắt đầu"]} - {event.schedule["Giờ kết thúc"]}
                          </div>
                          {(event.class["Phòng học"] || event.schedule["Địa điểm"]) && (
                            <div
                              style={{
                                fontSize: "9px",
                                color: "#999",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                marginBottom: "2px",
                              }}
                            >
                              <EnvironmentOutlined /> {getRoomName(event.class["Phòng học"]) || event.schedule["Địa điểm"]}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: "9px",
                              color: "#999",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            <BookOutlined /> {subjectMap[event.class["Môn học"]] || event.class["Môn học"]}
                          </div>
                        </div>
                      );
                    })}
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
                  <strong>Di chuyển từ:</strong> {pendingAction.event.date.format("dddd, DD/MM/YYYY")}
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
        title={`Chỉnh sửa lịch dạy - ${editingEvent?.class["Tên lớp"] || ""}`}
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingEvent(null);
          editForm.resetFields();
        }}
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
            Lưu
          </Button>,
        ]}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="Ngày"
            label="Ngày"
            rules={[{ required: true, message: "Vui lòng chọn ngày" }]}
          >
            <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>
          
          <Space style={{ width: "100%" }}>
            <Form.Item
              name="Giờ bắt đầu"
              label="Giờ bắt đầu"
              rules={[{ required: true, message: "Vui lòng chọn giờ bắt đầu" }]}
              style={{ flex: 1 }}
            >
              <TimePicker format="HH:mm" style={{ width: "100%" }} />
            </Form.Item>
            
            <Form.Item
              name="Giờ kết thúc"
              label="Giờ kết thúc"
              rules={[{ required: true, message: "Vui lòng chọn giờ kết thúc" }]}
              style={{ flex: 1 }}
            >
              <TimePicker format="HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </WrapperContent>
  );
};

export default TeacherSchedule;
