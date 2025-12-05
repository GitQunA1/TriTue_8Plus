import { useState, useEffect } from "react";
import {
  Modal,
  Tabs,
  Input,
  Button,
  Space,
  Card,
  Row,
  Col,
  Statistic,
  message,
  Typography,
  Tag,
  Divider,
  Descriptions,
} from "antd";
import {
  RobotOutlined,
  EditOutlined,
  CopyOutlined,
  SaveOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { MonthlyReportStats, ClassStats } from "../types";

const { TextArea } = Input;
const { Text } = Typography;

interface StudentInfo {
  id: string;
  name: string;
}

interface ClassInfo {
  id: string;
  name: string;
}

interface TeacherCommentEditModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (classComments: { classId: string; comment: string }[]) => void;
  student: StudentInfo;
  month: string; // YYYY-MM
  classInfo: ClassInfo;
  aiComment: string;
  initialComment: string;
  stats: Omit<MonthlyReportStats, 'classStats'>;
  isGeneratingAI?: boolean;
  onGenerateAI?: () => void;
  classStats?: ClassStats[]; // Chi tiết từng lớp (optional)
}

const TeacherCommentEditModal = ({
  open,
  onClose,
  onSave,
  student,
  month,
  classInfo,
  aiComment,
  initialComment,
  stats,
  isGeneratingAI,
  onGenerateAI,
  classStats,
}: TeacherCommentEditModalProps) => {
  // State để lưu comment cho từng lớp
  const [classComments, setClassComments] = useState<{ [classId: string]: string }>({});
  const [activeClassId, setActiveClassId] = useState<string>("");

  // Initialize comments from classStats when modal opens
  useEffect(() => {
    if (open && classStats && classStats.length > 0) {
      const initialComments: { [classId: string]: string } = {};
      classStats.forEach(cs => {
        initialComments[cs.classId] = cs.comment || "";
      });
      setClassComments(initialComments);
      setActiveClassId(classStats[0].classId);
    }
  }, [open, classStats]);

  const handleCommentChange = (classId: string, comment: string) => {
    setClassComments(prev => ({
      ...prev,
      [classId]: comment
    }));
  };

  const handleCopyAIComment = (classId: string) => {
    if (aiComment) {
      // Parse AI comment to get class-specific part if available
      const classInfo = classStats?.find(cs => cs.classId === classId);
      const className = classInfo?.className || "";
      
      // Try to find class-specific comment in AI response
      // For now, just use the full AI comment
      setClassComments(prev => ({
        ...prev,
        [classId]: aiComment
      }));
      message.success(`Đã sao chép nhận xét AI cho ${className}!`);
    }
  };

  const handleSave = () => {
    const hasAnyComment = Object.values(classComments).some(c => c.trim().length > 0);
    if (!hasAnyComment) {
      message.warning("Vui lòng nhập ít nhất 1 nhận xét cho môn học!");
      return;
    }
    
    const commentsArray = Object.entries(classComments).map(([classId, comment]) => ({
      classId,
      comment: comment.trim()
    }));
    
    onSave(commentsArray);
  };

  // Format month display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    return `Tháng ${month}/${year}`;
  };

  // Get current class stats
  const currentClassStats = classStats?.find(cs => cs.classId === activeClassId);

  return (
    <Modal
      title={
        <Space>
          <EditOutlined />
          <span>Nhận xét theo môn - {student.name}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
        >
          Lưu nhận xét
        </Button>,
      ]}
    >
      {/* Info Header */}
      <Card size="small" style={{ marginBottom: 16, background: "#f0f5ff" }}>
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary">Học sinh:</Text>{" "}
            <Text strong>{student.name}</Text>
          </Col>
          <Col span={12}>
            <Text type="secondary">Tháng:</Text>{" "}
            <Text strong>{formatMonth(month)}</Text>
          </Col>
        </Row>
      </Card>

      {/* Stats Grid - Tổng hợp */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Tổng buổi"
              value={stats.totalSessions}
              valueStyle={{ fontSize: 20, color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Có mặt"
              value={stats.presentSessions}
              valueStyle={{ fontSize: 20, color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Vắng"
              value={stats.absentSessions}
              valueStyle={{ fontSize: 20, color: "#ff4d4f" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Điểm TB"
              value={stats.averageScore.toFixed(1)}
              valueStyle={{ fontSize: 20, color: "#722ed1" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs for each class */}
      {classStats && classStats.length > 0 ? (
        <Tabs
          activeKey={activeClassId}
          onChange={setActiveClassId}
          type="card"
          items={classStats.map((cs) => ({
            key: cs.classId,
            label: (
              <Space size={4}>
                <BookOutlined />
                <span>{cs.className}</span>
                {cs.subject && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>{cs.subject}</Tag>}
                {classComments[cs.classId]?.trim() && (
                  <Tag color="green" style={{ fontSize: 10 }}>✓</Tag>
                )}
              </Space>
            ),
            children: (
              <div>
                {/* Class Stats */}
                <Card size="small" style={{ marginBottom: 12, background: "#fafafa" }}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Text type="secondary">Buổi học:</Text>{" "}
                      <Text strong style={{ color: "#52c41a" }}>{cs.presentSessions}</Text>
                      <Text type="secondary">/{cs.totalSessions}</Text>
                    </Col>
                    <Col span={6}>
                      <Text type="secondary">Chuyên cần:</Text>{" "}
                      <Text strong style={{ color: cs.attendanceRate >= 80 ? "#52c41a" : "#ff4d4f" }}>
                        {cs.attendanceRate}%
                      </Text>
                    </Col>
                    <Col span={6}>
                      <Text type="secondary">Điểm TB:</Text>{" "}
                      <Text strong style={{ color: "#722ed1" }}>
                        {cs.averageScore > 0 ? cs.averageScore.toFixed(1) : "-"}
                      </Text>
                    </Col>
                    <Col span={6}>
                      <Text type="secondary">Điểm thưởng:</Text>{" "}
                      <Text strong style={{ color: "#fa8c16" }}>{cs.totalBonusPoints}</Text>
                    </Col>
                  </Row>
                </Card>

                {/* Comment Textarea */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text strong>Nhận xét cho {cs.className}:</Text>
                    {aiComment && (
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopyAIComment(cs.classId)}
                      >
                        Dùng gợi ý AI
                      </Button>
                    )}
                  </div>
                  <TextArea
                    value={classComments[cs.classId] || ""}
                    onChange={(e) => handleCommentChange(cs.classId, e.target.value)}
                    placeholder={`Nhập nhận xét về học sinh ${student.name} trong môn ${cs.subject || cs.className}...`}
                    rows={6}
                    style={{ fontSize: 14 }}
                  />
                  <div style={{ marginTop: 4, color: "#888", fontSize: 12 }}>
                    Số ký tự: {(classComments[cs.classId] || "").length}
                  </div>
                </div>

                {/* AI Suggestion */}
                {aiComment && (
                  <Card 
                    size="small" 
                    title={
                      <Space>
                        <RobotOutlined style={{ color: "#52c41a" }} />
                        <span>Gợi ý từ AI</span>
                      </Space>
                    }
                    style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}
                  >
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, maxHeight: 150, overflowY: "auto" }}>
                      {aiComment}
                    </div>
                  </Card>
                )}

                {/* Generate AI button if no AI comment */}
                {!aiComment && onGenerateAI && (
                  <div style={{ textAlign: "center", padding: 20, background: "#fafafa", borderRadius: 8 }}>
                    <RobotOutlined style={{ fontSize: 32, color: "#ccc", marginBottom: 8 }} />
                    <div style={{ color: "#888", marginBottom: 12 }}>Chưa có gợi ý AI</div>
                    <Button
                      type="primary"
                      icon={<RobotOutlined />}
                      loading={isGeneratingAI}
                      onClick={onGenerateAI}
                    >
                      Tạo gợi ý AI
                    </Button>
                  </div>
                )}
              </div>
            ),
          }))}
        />
      ) : (
        <Card style={{ textAlign: "center", padding: 40 }}>
          <BookOutlined style={{ fontSize: 48, color: "#ccc" }} />
          <p style={{ color: "#888", marginTop: 16 }}>Không có thông tin lớp học</p>
        </Card>
      )}
    </Modal>
  );
};

export default TeacherCommentEditModal;
