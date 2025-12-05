import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Form,
  Space,
  message,
  Steps,
  Modal,
  Tag,
  Popconfirm,
  Empty,
} from "antd";
import { SaveOutlined, CheckOutlined, GiftOutlined, HistoryOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { ref, onValue, push, set, update, remove } from "firebase/database";
import { database } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { Class, AttendanceSession, AttendanceRecord } from "../../types";
import dayjs from "dayjs";
import WrapperContent from "@/components/WrapperContent";

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh": string;
}

interface TimetableEntry {
  id: string;
  "Class ID": string;
  "Ngày": string;
  "Thứ": number;
  "Giờ bắt đầu": string;
  "Giờ kết thúc": string;
  "Phòng học"?: string;
}

const AttendanceSessionPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const classData: Class = location.state?.classData;
  const sessionDate: string =
    location.state?.date || dayjs().format("YYYY-MM-DD");

  const [currentStep, setCurrentStep] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [homeworkDescription, setHomeworkDescription] = useState("");
  const [totalExercises, setTotalExercises] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [existingSession, setExistingSession] =
    useState<AttendanceSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [commonTestName, setCommonTestName] = useState<string>("");
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [selectedStudentForRedeem, setSelectedStudentForRedeem] = useState<Student | null>(null);
  const [redeemForm] = Form.useForm();
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);
  const [redeemHistory, setRedeemHistory] = useState<any[]>([]);
  const [isEditRedeemModalOpen, setIsEditRedeemModalOpen] = useState(false);
  const [editingRedeem, setEditingRedeem] = useState<any | null>(null);
  const [editRedeemForm] = Form.useForm();
  const [customSchedule, setCustomSchedule] = useState<TimetableEntry | null>(null);
  const [isEditingMode, setIsEditingMode] = useState(false); // Chế độ sửa điểm danh sau khi hoàn thành

  // Load custom schedule from Thời_khoá_biểu
  useEffect(() => {
    if (!classData?.id || !sessionDate) return;

    const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
    const unsubscribe = onValue(timetableRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const entry = Object.entries(data).find(([, value]: [string, any]) => 
          value["Class ID"] === classData.id && value["Ngày"] === sessionDate
        );
        if (entry) {
          setCustomSchedule({ id: entry[0], ...(entry[1] as Omit<TimetableEntry, "id">) });
        } else {
          setCustomSchedule(null);
        }
      }
    });
    return () => unsubscribe();
  }, [classData?.id, sessionDate]);

  useEffect(() => {
    if (!classData) {
      message.error("Không tìm thấy thông tin lớp học");
      navigate("/workspace/attendance");
      return;
    }

    // Check if session already exists for this class and date (only completed sessions)
    // Chỉ load một lần khi component mount, không dùng realtime listener
    const sessionsRef = ref(database, "datasheet/Điểm_danh_sessions");
    const unsubscribeSession = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sessions = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<AttendanceSession, "id">),
        }));

        // Only load completed sessions
        const existing = sessions.find(
          (s) =>
            s["Class ID"] === classData.id &&
            s["Ngày"] === sessionDate &&
            s["Trạng thái"] === "completed"
        );

        if (existing) {
          // Chỉ update nếu chưa có existingSession hoặc sessionId khác
          // Tránh ghi đè khi đang edit
          if (!existingSession || existingSession.id !== existing.id) {
            setExistingSession(existing);
            setSessionId(existing.id);
            setAttendanceRecords(existing["Điểm danh"] || []);
            setHomeworkDescription(existing["Bài tập"]?.["Mô tả"] || "");
            setTotalExercises(existing["Bài tập"]?.["Tổng số bài"] || 0);
            setCurrentStep(1); // Go to step 2 to view/edit
          }
        }
      }
      setLoadingSession(false);
    }, { onlyOnce: true }); // Chỉ load một lần

    // Load students - chỉ load một lần
    const studentsRef = ref(database, "datasheet/Danh_sách_học_sinh");
    const unsubscribeStudents = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const allStudents = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Student, "id">),
        }));

        const classStudents = allStudents.filter((s) =>
          classData["Student IDs"]?.includes(s.id)
        );

        setStudents(classStudents);
      }
    }, { onlyOnce: true }); // Chỉ load một lần

    return () => {
      unsubscribeSession();
      unsubscribeStudents();
    };
  }, [classData, navigate, sessionDate]); // Bỏ existingSession khỏi dependency

  // Initialize attendance records khi students được load và chưa có existing session
  useEffect(() => {
    if (students.length > 0 && !existingSession && attendanceRecords.length === 0) {
      setAttendanceRecords(
        students.map((s) => ({
          "Student ID": s.id,
          "Tên học sinh": s["Họ và tên"],
          "Có mặt": false,
          "Ghi chú": "",
        }))
      );
    }
  }, [students, existingSession, attendanceRecords.length]);

  // Chế độ chỉ đọc: session đã hoàn thành và chưa bật chế độ sửa
  const isReadOnly = !!(existingSession && existingSession["Trạng thái"] === "completed" && !isEditingMode);

  const handleAttendanceChange = (studentId: string, present: boolean) => {
    setAttendanceRecords((prev) =>
      prev.map((record) =>
        record["Student ID"] === studentId
          ? { ...record, "Có mặt": present }
          : record
      )
    );
  };

  const handleSelectAll = (present: boolean) => {
    setAttendanceRecords((prev) =>
      prev.map((record) => ({
        ...record,
        "Có mặt": present,
      }))
    );
  };

  const handleLateChange = (studentId: string, late: boolean) => {
    setAttendanceRecords((prev) =>
      prev.map((record) => {
        if (record["Student ID"] === studentId) {
          const updated = { ...record };
          if (late) {
            updated["Đi muộn"] = true;
          } else {
            delete updated["Đi muộn"];
          }
          return updated;
        }
        return record;
      })
    );
  };

  const handleAbsentWithPermissionChange = (
    studentId: string,
    withPermission: boolean
  ) => {
    setAttendanceRecords((prev) =>
      prev.map((record) => {
        if (record["Student ID"] === studentId) {
          const updated = { ...record };
          if (withPermission) {
            updated["Vắng có phép"] = true;
          } else {
            delete updated["Vắng có phép"];
          }
          return updated;
        }
        return record;
      })
    );
  };

  // Handle exercises completed change - auto-save to Firebase if session exists
  const handleExercisesCompletedChange = async (
    studentId: string,
    count: number | null
  ) => {
    // Update local state first
    const updatedRecords = attendanceRecords.map((record) => {
      if (record["Student ID"] === studentId) {
        const updated = { ...record };
        if (count !== null && count !== undefined) {
          updated["Bài tập hoàn thành"] = count;
          // Calculate percentage
          const total = totalExercises || 0;
          if (total > 0) {
            updated["% Hoàn thành BTVN"] = Math.round((count / total) * 100);
          }
        } else {
          delete updated["Bài tập hoàn thành"];
          delete updated["% Hoàn thành BTVN"];
        }
        return updated;
      }
      return record;
    });
    
    setAttendanceRecords(updatedRecords);
    
    // Auto-save to Firebase if session already exists
    if (sessionId && existingSession) {
      try {
        const sessionRef = ref(database, `datasheet/Điểm_danh_sessions/${sessionId}`);
        await update(sessionRef, {
          "Điểm danh": updatedRecords,
        });
        message.success("Đã cập nhật bài tập", 1);
      } catch (error) {
        console.error("Error updating exercises:", error);
        message.error("Lỗi khi cập nhật bài tập");
      }
    }
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setAttendanceRecords((prev) =>
      prev.map((record) =>
        record["Student ID"] === studentId
          ? { ...record, "Ghi chú": note }
          : record
      )
    );
  };

  const handleScoreChange = (studentId: string, score: number | null) => {
    setAttendanceRecords((prev) =>
      prev.map((record) => {
        if (record["Student ID"] === studentId) {
          const updated = { ...record };
          if (score !== null && score !== undefined) {
            updated["Điểm"] = score;
          } else {
            delete updated["Điểm"];
          }
          return updated;
        }
        return record;
      })
    );
  };

  // Apply common test name to all students
  const handleApplyCommonTestName = (testName: string) => {
    setCommonTestName(testName);
    setAttendanceRecords((prev) =>
      prev.map((record) => ({
        ...record,
        "Bài kiểm tra": testName,
      }))
    );
  };

  // Handle test score change - auto-save to Firebase if session exists
  const handleTestScoreChange = async (studentId: string, score: number | null) => {
    console.log("🔄 handleTestScoreChange called:", { studentId, score, sessionId, hasExistingSession: !!existingSession });
    
    // Update local state first
    const updatedRecords = attendanceRecords.map((record) => {
      if (record["Student ID"] === studentId) {
        const updated = { ...record };
        if (score !== null && score !== undefined) {
          updated["Điểm kiểm tra"] = score;
        } else {
          delete updated["Điểm kiểm tra"];
        }
        return updated;
      }
      return record;
    });
    
    setAttendanceRecords(updatedRecords);
    
    // Auto-save to Firebase if session already exists
    if (sessionId && existingSession) {
      try {
        console.log("💾 Saving to Firebase:", { sessionId, updatedRecords });
        const sessionRef = ref(database, `datasheet/Điểm_danh_sessions/${sessionId}`);
        await update(sessionRef, {
          "Điểm danh": updatedRecords,
        });
        console.log("✅ Successfully saved to Firebase");
        message.success("Đã cập nhật điểm", 1);
      } catch (error) {
        console.error("❌ Error updating score:", error);
        message.error("Lỗi khi cập nhật điểm");
      }
    } else {
      console.log("⚠️ Not saving - sessionId:", sessionId, "existingSession:", existingSession);
    }
  };

  // Handle bonus points change - auto-save to Firebase if session exists
  const handleBonusPointsChange = async (studentId: string, points: number | null) => {
    // Update local state first
    const updatedRecords = attendanceRecords.map((record) => {
      if (record["Student ID"] === studentId) {
        const updated = { ...record };
        if (points !== null && points !== undefined) {
          updated["Điểm thưởng"] = points;
        } else {
          delete updated["Điểm thưởng"];
        }
        return updated;
      }
      return record;
    });
    
    setAttendanceRecords(updatedRecords);
    
    // Auto-save to Firebase if session already exists
    if (sessionId && existingSession) {
      try {
        const sessionRef = ref(database, `datasheet/Điểm_danh_sessions/${sessionId}`);
        await update(sessionRef, {
          "Điểm danh": updatedRecords,
        });
        message.success("Đã cập nhật điểm thưởng", 1);
      } catch (error) {
        console.error("Error updating bonus points:", error);
        message.error("Lỗi khi cập nhật điểm thưởng");
      }
    }
  };

  // Helper function to remove undefined values
  const cleanData = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map((item) => cleanData(item));
    }
    if (obj !== null && typeof obj === "object") {
      return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = cleanData(value);
        }
        return acc;
      }, {} as any);
    }
    return obj;
  };

  // Load redeem history for a student
  useEffect(() => {
    if (!isHistoryModalOpen || !selectedStudentForHistory) {
      setRedeemHistory([]);
      return;
    }

    const historyRef = ref(database, "datasheet/Đổi_thưởng");
    const unsubscribe = onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const historyList = Object.entries(data)
          .map(([id, value]) => ({
            id,
            ...(value as any),
          }))
          .filter((item) => item["Student ID"] === selectedStudentForHistory.id)
          .sort((a, b) => {
            const dateA = dayjs(a["Ngày đổi"] || a["Timestamp"]);
            const dateB = dayjs(b["Ngày đổi"] || b["Timestamp"]);
            return dateB.isBefore(dateA) ? -1 : dateB.isAfter(dateA) ? 1 : 0;
          });
        setRedeemHistory(historyList);
      } else {
        setRedeemHistory([]);
      }
    });
    return () => unsubscribe();
  }, [isHistoryModalOpen, selectedStudentForHistory]);

  // Handle redeem points
  const handleRedeemPoints = async () => {
    if (!selectedStudentForRedeem) return;

    try {
      const values = await redeemForm.validateFields();
      const pointsToRedeem = Number(values.points) || 0;
      const note = values.note || "";

      if (pointsToRedeem <= 0) {
        message.error("Điểm đổi thưởng phải lớn hơn 0");
        return;
      }

      // Get current student data
      const studentRef = ref(database, `datasheet/Danh_sách_học_sinh/${selectedStudentForRedeem.id}`);
      const studentSnapshot = await new Promise<any>((resolve) => {
        onValue(studentRef, (snapshot) => {
          resolve(snapshot.val());
        }, { onlyOnce: true });
      });

      const currentTotalBonus = Number(studentSnapshot?.["Tổng điểm thưởng"] || 0);
      
      if (pointsToRedeem > currentTotalBonus) {
        message.error(`Không đủ điểm thưởng. Hiện có: ${currentTotalBonus} điểm`);
        return;
      }

      const newTotalBonus = currentTotalBonus - pointsToRedeem;
      const redeemTime = new Date().toISOString();
      const redeemer = userProfile?.displayName || userProfile?.email || "";

      // Save redeem history
      const redeemData = {
        "Student ID": selectedStudentForRedeem.id,
        "Tên học sinh": selectedStudentForRedeem["Họ và tên"],
        "Mã học sinh": selectedStudentForRedeem["Mã học sinh"] || "",
        "Điểm đổi": pointsToRedeem,
        "Ghi chú": note,
        "Ngày đổi": dayjs().format("YYYY-MM-DD"),
        "Thời gian đổi": redeemTime,
        "Người đổi": redeemer,
        "Tổng điểm trước khi đổi": currentTotalBonus,
        "Tổng điểm sau khi đổi": newTotalBonus,
        Timestamp: redeemTime,
      };

      const redeemHistoryRef = ref(database, "datasheet/Đổi_thưởng");
      const newRedeemRef = push(redeemHistoryRef);
      await set(newRedeemRef, redeemData);

      // Update student's total bonus points
      await update(studentRef, {
        "Tổng điểm thưởng": newTotalBonus,
      });

      message.success(`Đã đổi ${pointsToRedeem} điểm thưởng. Còn lại: ${newTotalBonus} điểm`);
      setIsRedeemModalOpen(false);
      setSelectedStudentForRedeem(null);
      redeemForm.resetFields();
    } catch (error) {
      console.error("Error redeeming points:", error);
      message.error("Có lỗi xảy ra khi đổi thưởng");
    }
  };

  // Handle edit redeem
  const handleEditRedeem = (redeemRecord: any) => {
    setEditingRedeem(redeemRecord);
    editRedeemForm.setFieldsValue({
      points: redeemRecord["Điểm đổi"],
      note: redeemRecord["Ghi chú"],
    });
    setIsEditRedeemModalOpen(true);
  };

  // Handle save edit redeem
  const handleSaveEditRedeem = async () => {
    if (!editingRedeem || !selectedStudentForHistory) return;

    try {
      const values = await editRedeemForm.validateFields();
      const newPoints = Number(values.points) || 0;
      const newNote = values.note || "";
      const oldPoints = Number(editingRedeem["Điểm đổi"] || 0);

      if (newPoints <= 0) {
        message.error("Điểm đổi thưởng phải lớn hơn 0");
        return;
      }

      // Get current student data
      const studentRef = ref(database, `datasheet/Danh_sách_học_sinh/${selectedStudentForHistory.id}`);
      const studentSnapshot = await new Promise<any>((resolve) => {
        onValue(studentRef, (snapshot) => {
          resolve(snapshot.val());
        }, { onlyOnce: true });
      });

      const currentTotalBonus = Number(studentSnapshot?.["Tổng điểm thưởng"] || 0);
      
      // Calculate the difference
      // Current total = old total after redeem
      // If we change from 10 to 15: need to subtract 5 more (current - 5)
      // If we change from 10 to 5: need to add 5 back (current + 5)
      const pointsDifference = newPoints - oldPoints;
      const newTotalBonus = currentTotalBonus - pointsDifference;

      if (newTotalBonus < 0) {
        message.error(`Không đủ điểm thưởng. Hiện có: ${currentTotalBonus} điểm, cần thêm: ${Math.abs(newTotalBonus)} điểm`);
        return;
      }

      // Calculate what the total was before the original redeem
      const oldTotalBeforeRedeem = Number(editingRedeem["Tổng điểm trước khi đổi"] || 0);

      // Update redeem record
      const redeemRef = ref(database, `datasheet/Đổi_thưởng/${editingRedeem.id}`);
      const updateTime = new Date().toISOString();
      await update(redeemRef, {
        "Điểm đổi": newPoints,
        "Ghi chú": newNote,
        "Tổng điểm trước khi đổi": oldTotalBeforeRedeem,
        "Tổng điểm sau khi đổi": newTotalBonus,
        "Thời gian cập nhật": updateTime,
        "Người cập nhật": userProfile?.displayName || userProfile?.email || "",
      });

      // Update student's total bonus points
      await update(studentRef, {
        "Tổng điểm thưởng": newTotalBonus,
      });

      message.success("Đã cập nhật thông tin đổi thưởng");
      setIsEditRedeemModalOpen(false);
      setEditingRedeem(null);
      editRedeemForm.resetFields();
    } catch (error) {
      console.error("Error editing redeem:", error);
      message.error("Có lỗi xảy ra khi cập nhật");
    }
  };

  // Handle delete redeem
  const handleDeleteRedeem = async (redeemRecord: any) => {
    if (!selectedStudentForHistory) return;

    try {
      // Get current student data
      const studentRef = ref(database, `datasheet/Danh_sách_học_sinh/${selectedStudentForHistory.id}`);
      const studentSnapshot = await new Promise<any>((resolve) => {
        onValue(studentRef, (snapshot) => {
          resolve(snapshot.val());
        }, { onlyOnce: true });
      });

      const currentTotalBonus = Number(studentSnapshot?.["Tổng điểm thưởng"] || 0);
      const pointsToRestore = Number(redeemRecord["Điểm đổi"] || 0);
      const newTotalBonus = currentTotalBonus + pointsToRestore;

      // Delete redeem record
      const redeemRef = ref(database, `datasheet/Đổi_thưởng/${redeemRecord.id}`);
      await remove(redeemRef);

      // Restore student's total bonus points
      await update(studentRef, {
        "Tổng điểm thưởng": newTotalBonus,
      });

      message.success(`Đã xóa lần đổi thưởng. Đã hoàn lại ${pointsToRestore} điểm. Tổng điểm hiện tại: ${newTotalBonus}`);
    } catch (error) {
      console.error("Error deleting redeem:", error);
      message.error("Có lỗi xảy ra khi xóa");
    }
  };

  const handleSaveAttendance = () => {
    // Save attendance time info to state (will be saved to Firebase on complete)
    const attendanceTime = new Date().toISOString();
    const attendancePerson =
      userProfile?.displayName || userProfile?.email || "";

    // Store in a way that can be used later
    (window as any).__attendanceInfo = {
      time: attendanceTime,
      person: attendancePerson,
    };

    message.success("Đã lưu điểm danh tạm thời");
    setCurrentStep(1);
  };

  const handleCompleteSession = async () => {
    setSaving(true);
    try {
      // Get schedule info - prioritize custom schedule from Thời_khoá_biểu
      let scheduleStartTime = "";
      let scheduleEndTime = "";

      if (customSchedule) {
        // Use custom schedule from Thời_khoá_biểu
        scheduleStartTime = customSchedule["Giờ bắt đầu"] || "";
        scheduleEndTime = customSchedule["Giờ kết thúc"] || "";
      } else {
        // Fallback to default schedule from class
        const sessionDayjs = dayjs(sessionDate);
        const sessionDayOfWeek = sessionDayjs.day() === 0 ? 8 : sessionDayjs.day() + 1;
        const defaultSchedule = classData["Lịch học"]?.find((s) => s["Thứ"] === sessionDayOfWeek);
        scheduleStartTime = defaultSchedule?.["Giờ bắt đầu"] || "";
        scheduleEndTime = defaultSchedule?.["Giờ kết thúc"] || "";
      }

      const completionTime = new Date().toISOString();
      const completionPerson =
        userProfile?.displayName || userProfile?.email || "";

      // Get attendance info from step 1
      const attendanceInfo = (window as any).__attendanceInfo || {
        time: completionTime,
        person: completionPerson,
      };

      if (sessionId && existingSession) {
        // Update existing session
        const updateData = {
          "Trạng thái": "completed",
          "Điểm danh": attendanceRecords,
          "Thời gian hoàn thành": completionTime,
          "Người hoàn thành": completionPerson,
          "Bài tập":
            homeworkDescription || totalExercises
              ? {
                  "Mô tả": homeworkDescription,
                  "Tổng số bài": totalExercises,
                  "Người giao": completionPerson,
                  "Thời gian giao": completionTime,
                }
              : undefined,
        };

        const cleanedData = cleanData(updateData);
        const sessionRef = ref(
          database,
          `datasheet/Điểm_danh_sessions/${sessionId}`
        );
        await update(sessionRef, cleanedData);
      } else {
        // Create new session (only when completing)
        const sessionData: Omit<AttendanceSession, "id"> = {
          "Mã lớp": classData["Mã lớp"],
          "Tên lớp": classData["Tên lớp"],
          "Class ID": classData.id,
          Ngày: sessionDate,
          "Giờ bắt đầu": scheduleStartTime,
          "Giờ kết thúc": scheduleEndTime,
          "Giáo viên": userProfile?.displayName || userProfile?.email || "",
          "Teacher ID": userProfile?.teacherId || userProfile?.uid || "",
          "Trạng thái": "completed",
          "Điểm danh": attendanceRecords,
          "Thời gian điểm danh": attendanceInfo.time,
          "Người điểm danh": attendanceInfo.person,
          "Thời gian hoàn thành": completionTime,
          "Người hoàn thành": completionPerson,
          "Bài tập":
            homeworkDescription || totalExercises
              ? {
                  "Mô tả": homeworkDescription,
                  "Tổng số bài": totalExercises,
                  "Người giao": completionPerson,
                  "Thời gian giao": completionTime,
                }
              : undefined,
          Timestamp: completionTime,
        };

        const cleanedData = cleanData(sessionData);
        const sessionsRef = ref(database, "datasheet/Điểm_danh_sessions");
        const newSessionRef = push(sessionsRef);
        await set(newSessionRef, cleanedData);
      }

      // Clear attendance info
      delete (window as any).__attendanceInfo;

      message.success("Đã hoàn thành buổi học");

      Modal.success({
        title: "Hoàn thành điểm danh",
        content: "Buổi học đã được lưu thành công!",
        onOk: () => navigate("/workspace/attendance"),
      });
    } catch (error) {
      console.error("Error completing session:", error);
      message.error("Không thể hoàn thành buổi học");
    } finally {
      setSaving(false);
    }
  };

  const attendanceColumns = [
    {
      title: "STT",
      key: "index",
      width: 60,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Mã học sinh",
      dataIndex: "Mã học sinh",
      key: "code",
      width: 120,
      render: (_: any, record: Student) => record["Mã học sinh"],
    },
    {
      title: "Họ và tên",
      dataIndex: "Họ và tên",
      key: "name",
      render: (_: any, record: Student) => record["Họ và tên"],
    },
    {
      title: "Có mặt",
      key: "present",
      width: 100,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        return (
          <Checkbox
            checked={attendanceRecord?.["Có mặt"]}
            onChange={(e) =>
              handleAttendanceChange(record.id, e.target.checked)
            }
            disabled={currentStep !== 0}
          />
        );
      },
    },
    {
      title: "Ghi chú",
      key: "note",
      width: 200,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        return (
          <Input
            placeholder="Ghi chú"
            value={attendanceRecord?.["Ghi chú"]}
            onChange={(e) => handleNoteChange(record.id, e.target.value)}
            disabled={currentStep !== 0}
          />
        );
      },
    },
  ];

  const homeworkColumns = [
    ...attendanceColumns.slice(0, 3),
    {
      title: "Có mặt",
      key: "present",
      width: 80,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        return (
          <Checkbox
            checked={attendanceRecord?.["Có mặt"] || false}
            onChange={(e) => handleAttendanceChange(record.id, e.target.checked)}
            disabled={isReadOnly}
          />
        );
      },
    },
    {
      title: "Đi muộn",
      key: "late",
      width: 90,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        if (!attendanceRecord?.["Có mặt"]) return "-";
        return (
          <Checkbox
            checked={attendanceRecord?.["Đi muộn"] || false}
            onChange={(e) => handleLateChange(record.id, e.target.checked)}
            disabled={isReadOnly}
          />
        );
      },
    },
    {
      title: "Vắng có phép",
      key: "permission",
      width: 110,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        if (attendanceRecord?.["Có mặt"]) return "-";
        return (
          <Checkbox
            checked={attendanceRecord?.["Vắng có phép"] || false}
            onChange={(e) =>
              handleAbsentWithPermissionChange(record.id, e.target.checked)
            }
            disabled={isReadOnly}
          />
        );
      },
    },
    {
      title: "Bài tập hoàn thành",
      key: "exercises",
      width: 140,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        if (!attendanceRecord?.["Có mặt"]) return "-";

        const completed = attendanceRecord?.["Bài tập hoàn thành"] ?? 0;
        const total = totalExercises || 0;

        return (
          <Space.Compact style={{ width: "100%" }}>
            <InputNumber
              min={0}
              max={total || 100}
              placeholder="0"
              value={completed || null}
              onChange={(value) =>
                handleExercisesCompletedChange(record.id, value)
              }
              onBlur={() => {
                // Ensure save on blur
                const currentRecord = attendanceRecords.find(
                  (r) => r["Student ID"] === record.id
                );
                if (currentRecord && sessionId && existingSession) {
                  handleExercisesCompletedChange(record.id, currentRecord["Bài tập hoàn thành"] ?? null);
                }
              }}
              style={{ width: "50%" }}
              disabled={isReadOnly}
            />
            <Input
              value={`/ ${total}`}
              disabled
              style={{ 
                width: "50%", 
                textAlign: "center",
                backgroundColor: "#f5f5f5",
                color: "#000"
              }}
            />
          </Space.Compact>
        );
      },
    },
    {
      title: "Bài kiểm tra",
      key: "test_name",
      width: 150,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        return (
          <span style={{ color: attendanceRecord?.["Bài kiểm tra"] ? "#000" : "#ccc" }}>
            {attendanceRecord?.["Bài kiểm tra"] || "(Chưa có)"}
          </span>
        );
      },
    },
    {
      title: "Điểm kiểm tra",
      key: "test_score",
      width: 120,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        if (!attendanceRecord?.["Có mặt"]) return "-";

        return (
          <InputNumber
            min={0}
            max={10}
            step={0.5}
            placeholder="Điểm"
            value={attendanceRecord?.["Điểm kiểm tra"] ?? null}
            onChange={(value) => handleTestScoreChange(record.id, value)}
            onBlur={() => {
              // Ensure save on blur
              const currentRecord = attendanceRecords.find(
                (r) => r["Student ID"] === record.id
              );
              if (currentRecord && sessionId && existingSession) {
                handleTestScoreChange(record.id, currentRecord["Điểm kiểm tra"] ?? null);
              }
            }}
            style={{ width: "100%" }}
          />
        );
      },
    },
    {
      title: "Điểm thưởng",
      key: "bonus_points",
      width: 110,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        if (!attendanceRecord?.["Có mặt"]) return "-";

        return (
          <InputNumber
            min={0}
            step={1}
            placeholder="Điểm"
            value={attendanceRecord?.["Điểm thưởng"] ?? null}
            onChange={(value) => handleBonusPointsChange(record.id, value)}
            style={{ width: "100%" }}
            disabled={isReadOnly}
          />
        );
      },
    },
    {
      title: "Ghi chú",
      key: "note",
      width: 150,
      render: (_: any, record: Student) => {
        const attendanceRecord = attendanceRecords.find(
          (r) => r["Student ID"] === record.id
        );
        return (
          <Input
            placeholder="Ghi chú"
            value={attendanceRecord?.["Ghi chú"]}
            onChange={(e) => handleNoteChange(record.id, e.target.value)}
            disabled={isReadOnly}
          />
        );
      },
    },
    {
      title: "Đổi thưởng",
      key: "redeem",
      width: 150,
      render: (_: any, record: Student) => {
        return (
          <Space>
            <Button
              size="small"
              icon={<GiftOutlined />}
              onClick={() => {
                setSelectedStudentForRedeem(record);
                redeemForm.resetFields();
                setIsRedeemModalOpen(true);
              }}
            >
              Đổi thưởng
            </Button>
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => {
                setSelectedStudentForHistory(record);
                setIsHistoryModalOpen(true);
              }}
            >
              Lịch sử
            </Button>
          </Space>
        );
      },
    },
  ];

  if (!classData) {
    return null;
  }

  const presentCount = attendanceRecords.filter((r) => r["Có mặt"]).length;
  const absentCount = attendanceRecords.length - presentCount;

  return (
    <WrapperContent title="Điểm danh" isLoading={loadingSession}>
      {existingSession && !isEditingMode && (
        <Card
          style={{
            marginBottom: 16,
            backgroundColor: "#f6ffed",
            borderColor: "#b7eb8f",
          }}
          size="small"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ margin: 0 }}>
              ✅ Buổi học này đã hoàn thành điểm danh. Bạn có thể sửa điểm danh nếu cần.
            </p>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => setIsEditingMode(true)}
            >
              Sửa điểm danh
            </Button>
          </div>
        </Card>
      )}

      {existingSession && isEditingMode && (
        <Card
          style={{
            marginBottom: 16,
            backgroundColor: "#fff7e6",
            borderColor: "#ffd591",
          }}
          size="small"
        >
          <p style={{ margin: 0 }}>
            ✏️ Đang chỉnh sửa điểm danh. Nhấn "Cập nhật điểm danh" khi hoàn tất.
          </p>
        </Card>
      )}

      <Card
        title={
          <div>
            <h2 style={{ margin: 0 }}>{classData["Tên lớp"]}</h2>
            <p style={{ margin: "8px 0 0 0", color: "#666", fontSize: "14px" }}>
              {dayjs(sessionDate).format("dddd, DD/MM/YYYY")}
            </p>
          </div>
        }
      >
        <Steps
          current={currentStep}
          items={[
            {
              title: "Điểm danh",
              description: "Ghi nhận học sinh có mặt",
            },
            {
              title: "Giao bài tập",
              description: "Chấm điểm và giao bài tập",
            },
          ]}
          style={{ marginBottom: 32 }}
        />

        {currentStep === 0 && (
          <div>
            <div
              style={{
                marginBottom: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Space>
                <span>Tổng: {students.length}</span>
                <span style={{ color: "green" }}>Có mặt: {presentCount}</span>
                <span style={{ color: "red" }}>Vắng: {absentCount}</span>
              </Space>
              <Space>
                <Button
                  size="small"
                  onClick={() => handleSelectAll(true)}
                  icon={<CheckOutlined />}
                >
                  Chọn tất cả
                </Button>
                <Button size="small" onClick={() => handleSelectAll(false)}>
                  Bỏ chọn tất cả
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSaveAttendance}
                >
                  Tiếp tục
                </Button>
              </Space>
            </div>

            <Table
              columns={attendanceColumns}
              dataSource={students}
              rowKey="id"
              pagination={false}
            />
          </div>
        )}

        {currentStep === 1 && (
          <div>
            <Card title="Bài tập về nhà" style={{ marginBottom: 16 }}>
              <Form layout="vertical">
                <Form.Item label="Mô tả bài tập">
                  <Input.TextArea
                    rows={3}
                    placeholder="Nhập mô tả bài tập..."
                    value={homeworkDescription}
                    onChange={(e) => setHomeworkDescription(e.target.value)}
                    disabled={isReadOnly}
                  />
                </Form.Item>
                <Form.Item label="Tổng số bài tập">
                  <InputNumber
                    min={0}
                    placeholder="Số lượng bài tập"
                    value={totalExercises}
                    onChange={(value) => setTotalExercises(value || 0)}
                    style={{ width: 200 }}
                    disabled={isReadOnly}
                  />
                </Form.Item>
              </Form>
            </Card>

            <Card 
              title="Bài kiểm tra chung" 
              size="small" 
              style={{ marginBottom: 16, background: "#f0f5ff" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <div style={{ color: "#666", fontSize: 12, marginBottom: 8 }}>
                  💡 Nhập tên bài kiểm tra một lần, áp dụng cho tất cả học sinh
                </div>
                <Space>
                  <label style={{ fontWeight: 500 }}>Tên bài kiểm tra:</label>
                  <Input
                    placeholder="Ví dụ: Kiểm tra 15 phút, Giữa kỳ, Cuối kỳ..."
                    value={commonTestName}
                    onChange={(e) => handleApplyCommonTestName(e.target.value)}
                    style={{ width: 400 }}
                    disabled={isReadOnly}
                  />
                  {commonTestName && (
                    <Tag color="green">✓ Đã áp dụng cho {students.length} học sinh</Tag>
                  )}
                </Space>
              </Space>
            </Card>

            <Card title="Chấm điểm học sinh">
              <Table
                columns={homeworkColumns}
                dataSource={students}
                rowKey="id"
                pagination={false}
                scroll={{ x: 1500 }}
              />
            </Card>

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Space>
                <Button onClick={() => {
                  if (isEditingMode) {
                    setIsEditingMode(false);
                  }
                  setCurrentStep(0);
                }}>Quay lại</Button>
                {existingSession && isEditingMode ? (
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleCompleteSession}
                    loading={saving}
                  >
                    Cập nhật điểm danh
                  </Button>
                ) : !existingSession ? (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleCompleteSession}
                    loading={saving}
                  >
                    Hoàn thành buổi học
                  </Button>
                ) : null}
              </Space>
            </div>
          </div>
        )}
      </Card>

      {/* Redeem Points Modal */}
      <Modal
        title={`Đổi thưởng - ${selectedStudentForRedeem?.["Họ và tên"] || ""}`}
        open={isRedeemModalOpen}
        onOk={handleRedeemPoints}
        onCancel={() => {
          setIsRedeemModalOpen(false);
          setSelectedStudentForRedeem(null);
          redeemForm.resetFields();
        }}
        okText="Xác nhận đổi"
        cancelText="Hủy"
        width={600}
      >
        {selectedStudentForRedeem && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 4 }}>
            <div><strong>Học sinh:</strong> {selectedStudentForRedeem["Họ và tên"]}</div>
            <div><strong>Mã học sinh:</strong> {selectedStudentForRedeem["Mã học sinh"] || "-"}</div>
          </div>
        )}
        <Form form={redeemForm} layout="vertical">
          <Form.Item
            label="Điểm cần đổi"
            name="points"
            rules={[
              { required: true, message: "Nhập số điểm cần đổi" },
              { type: "number", min: 1, message: "Điểm phải lớn hơn 0" },
            ]}
          >
            <InputNumber
              min={1}
              step={1}
              placeholder="Nhập số điểm"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            label="Ghi chú"
            name="note"
            rules={[{ required: true, message: "Nhập ghi chú" }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="Nhập ghi chú về việc đổi thưởng"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Redeem History Modal */}
      <Modal
        title={`Lịch sử đổi thưởng - ${selectedStudentForHistory?.["Họ và tên"] || ""}`}
        open={isHistoryModalOpen}
        onCancel={() => {
          setIsHistoryModalOpen(false);
          setSelectedStudentForHistory(null);
          setRedeemHistory([]);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setIsHistoryModalOpen(false);
            setSelectedStudentForHistory(null);
            setRedeemHistory([]);
          }}>
            Đóng
          </Button>,
        ]}
        width={800}
      >
        <Table
          columns={[
            {
              title: "Ngày đổi",
              dataIndex: "Ngày đổi",
              key: "date",
              width: 120,
              render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
            },
            {
              title: "Thời gian",
              key: "time",
              width: 150,
              render: (_: any, record: any) => 
                dayjs(record["Thời gian đổi"] || record["Timestamp"]).format("HH:mm:ss"),
            },
            {
              title: "Điểm đổi",
              dataIndex: "Điểm đổi",
              key: "points",
              width: 100,
              align: "center" as const,
              render: (points: number) => (
                <Tag color="red" style={{ fontSize: "14px", fontWeight: "bold" }}>
                  -{points}
                </Tag>
              ),
            },
            {
              title: "Tổng điểm trước",
              dataIndex: "Tổng điểm trước khi đổi",
              key: "before",
              width: 120,
              align: "center" as const,
            },
            {
              title: "Tổng điểm sau",
              dataIndex: "Tổng điểm sau khi đổi",
              key: "after",
              width: 120,
              align: "center" as const,
            },
            {
              title: "Ghi chú",
              dataIndex: "Ghi chú",
              key: "note",
              render: (note: string) => note || "-",
            },
            {
              title: "Người đổi",
              dataIndex: "Người đổi",
              key: "redeemer",
              width: 150,
            },
            {
              title: "Thao tác",
              key: "actions",
              width: 120,
              fixed: "right" as const,
              render: (_: any, record: any) => (
                <Space size="small">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEditRedeem(record)}
                  >
                    Sửa
                  </Button>
                  <Popconfirm
                    title="Xóa lần đổi thưởng"
                    description="Bạn có chắc chắn muốn xóa? Điểm thưởng sẽ được hoàn lại cho học sinh."
                    onConfirm={() => handleDeleteRedeem(record)}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                    >
                      Xóa
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          dataSource={redeemHistory}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `Tổng ${total} lần đổi thưởng`,
          }}
          locale={{
            emptyText: <Empty description="Chưa có lịch sử đổi thưởng" />,
          }}
          scroll={{ x: 1000 }}
        />
      </Modal>

      {/* Edit Redeem Modal */}
      <Modal
        title={`Chỉnh sửa đổi thưởng - ${selectedStudentForHistory?.["Họ và tên"] || ""}`}
        open={isEditRedeemModalOpen}
        onOk={handleSaveEditRedeem}
        onCancel={() => {
          setIsEditRedeemModalOpen(false);
          setEditingRedeem(null);
          editRedeemForm.resetFields();
        }}
        okText="Lưu"
        cancelText="Hủy"
        width={600}
      >
        {editingRedeem && (
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 4 }}>
            <div><strong>Ngày đổi:</strong> {dayjs(editingRedeem["Ngày đổi"]).format("DD/MM/YYYY")}</div>
            <div><strong>Điểm đổi hiện tại:</strong> {editingRedeem["Điểm đổi"]}</div>
            <div><strong>Tổng điểm trước khi đổi:</strong> {editingRedeem["Tổng điểm trước khi đổi"]}</div>
            <div><strong>Tổng điểm sau khi đổi:</strong> {editingRedeem["Tổng điểm sau khi đổi"]}</div>
          </div>
        )}
        <Form form={editRedeemForm} layout="vertical">
          <Form.Item
            label="Điểm cần đổi"
            name="points"
            rules={[
              { required: true, message: "Nhập số điểm cần đổi" },
              { type: "number", min: 1, message: "Điểm phải lớn hơn 0" },
            ]}
          >
            <InputNumber
              min={1}
              step={1}
              placeholder="Nhập số điểm"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            label="Ghi chú"
            name="note"
            rules={[{ required: true, message: "Nhập ghi chú" }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="Nhập ghi chú về việc đổi thưởng"
            />
          </Form.Item>
        </Form>
      </Modal>
    </WrapperContent>
  );
};

export default AttendanceSessionPage;
