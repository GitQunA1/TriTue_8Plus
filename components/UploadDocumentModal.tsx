import { useState } from "react";
import {
  Modal,
  Form,
  Input,
  Radio,
  Upload,
  message,
  Space,
  Card,
  Typography,
  Progress,
  Alert,
} from "antd";
import type { UploadFile } from "antd";
import {
  LinkOutlined,
  UploadOutlined,
  InboxOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FilePptOutlined,
  FileImageOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { uploadToCloudinary, generateFolderPath } from "../utils/cloudinaryStorage";

const { Text } = Typography;
const { Dragger } = Upload;

interface UploadDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (documentData: any) => void;
  classId: string;
  className: string;
  uploaderName: string;
}

const UploadDocumentModal = ({
  open,
  onClose,
  onSuccess,
  classId,
  className,
  uploaderName,
}: UploadDocumentModalProps) => {
  const [form] = Form.useForm();
  const [uploadType, setUploadType] = useState<"link" | "file">("file");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleClose = () => {
    form.resetFields();
    setFileList([]);
    setUploadType("file");
    setUploadProgress(0);
    onClose();
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "pdf":
        return <FilePdfOutlined style={{ fontSize: 48, color: "#ff4d4f" }} />;
      case "doc":
      case "docx":
        return <FileWordOutlined style={{ fontSize: 48, color: "#1890ff" }} />;
      case "xls":
      case "xlsx":
        return <FileExcelOutlined style={{ fontSize: 48, color: "#52c41a" }} />;
      case "ppt":
      case "pptx":
        return <FilePptOutlined style={{ fontSize: 48, color: "#fa8c16" }} />;
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
        return <FileImageOutlined style={{ fontSize: 48, color: "#722ed1" }} />;
      default:
        return <FileTextOutlined style={{ fontSize: 48, color: "#8c8c8c" }} />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const handleSubmit = async (values: any) => {
    try {
      setUploading(true);
      setUploadProgress(10);
      let documentUrl = values.url;

      // If uploading file
      if (uploadType === "file") {
        if (fileList.length === 0) {
          message.error("Vui lòng chọn file để tải lên");
          setUploading(false);
          return;
        }

        // Get file from fileList - it can be either originFileObj or the file itself
        const fileItem = fileList[0];
        const file = (fileItem.originFileObj || fileItem) as File;

        if (!file || !file.name) {
          message.error("Không thể đọc file. Vui lòng thử lại.");
          setUploading(false);
          return;
        }

        setUploadProgress(30);

        // Generate folder path for Cloudinary
        const folderPath = generateFolderPath(classId, file.name);

        // Upload to Cloudinary
        setUploadProgress(50);
        const uploadResult = await uploadToCloudinary(file, folderPath);

        if (!uploadResult.success) {
          message.error(uploadResult.error || "Lỗi khi tải file lên");
          setUploading(false);
          setUploadProgress(0);
          return;
        }

        documentUrl = uploadResult.url;
        setUploadProgress(90);
      } else if (uploadType === "link" && !documentUrl) {
        message.error("Vui lòng nhập link tài liệu");
        setUploading(false);
        return;
      }

      // Create document data
      const fileItem = fileList.length > 0 ? fileList[0] : null;
      const actualFile = fileItem ? (fileItem.originFileObj || fileItem) as File : null;
      
      const newDocument = {
        name: values.name,
        description: values.description || "",
        url: documentUrl,
        type: uploadType,
        fileName: uploadType === "file" && actualFile ? actualFile.name : undefined,
        fileSize: uploadType === "file" && actualFile ? actualFile.size : undefined,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uploaderName,
      };

      setUploadProgress(100);
      message.success("Đã thêm tài liệu thành công!");
      
      // Call success callback
      onSuccess(newDocument);
      
      // Close modal
      handleClose();
    } catch (error: any) {
      console.error("❌ Error adding document:", error);
      message.error("Lỗi khi thêm tài liệu: " + (error.message || error));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <CloudUploadOutlined style={{ color: "#1890ff" }} />
          <span>Thêm tài liệu học tập</span>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      onOk={() => form.submit()}
      okText={uploading ? "Đang tải lên..." : "Thêm tài liệu"}
      cancelText="Hủy"
      width={700}
      confirmLoading={uploading}
      maskClosable={!uploading}
    >
      <Alert
        message={`Lớp: ${className}`}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {uploading && uploadProgress > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: "#f0f5ff" }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text strong>Đang tải lên...</Text>
            <Progress percent={uploadProgress} status="active" />
          </Space>
        </Card>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={uploading}
      >
        <Form.Item
          label={<Text strong>Tên tài liệu</Text>}
          name="name"
          rules={[{ required: true, message: "Vui lòng nhập tên tài liệu" }]}
        >
          <Input
            size="large"
            placeholder="Ví dụ: Bài giảng tuần 1, Đề kiểm tra giữa kỳ"
            prefix={<FileTextOutlined />}
          />
        </Form.Item>

        <Form.Item label={<Text strong>Mô tả</Text>} name="description">
          <Input.TextArea
            rows={2}
            placeholder="Mô tả ngắn về tài liệu (không bắt buộc)"
          />
        </Form.Item>

        <Form.Item label={<Text strong>Phương thức tải lên</Text>}>
          <Radio.Group
            value={uploadType}
            onChange={(e) => {
              setUploadType(e.target.value);
              setFileList([]);
              form.setFieldsValue({ url: undefined });
            }}
            buttonStyle="solid"
            size="large"
            style={{ width: "100%", display: "flex" }}
          >
            <Radio.Button value="file" style={{ flex: 1, textAlign: "center" }}>
              <UploadOutlined /> Tải file lên
            </Radio.Button>
            <Radio.Button value="link" style={{ flex: 1, textAlign: "center" }}>
              <LinkOutlined /> Nhập link
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        {uploadType === "link" ? (
          <Form.Item
            label={<Text strong>Link tài liệu</Text>}
            name="url"
            rules={[
              { required: true, message: "Vui lòng nhập link tài liệu" },
              { type: "url", message: "Link không hợp lệ" },
            ]}
            extra="Có thể dùng Google Drive, Dropbox, OneDrive, v.v."
          >
            <Input
              size="large"
              placeholder="https://drive.google.com/file/d/..."
              prefix={<LinkOutlined />}
            />
          </Form.Item>
        ) : (
          <Form.Item
            label={<Text strong>Chọn file</Text>}
            required
            extra={
              <Space split="|">
                <Text type="secondary">PDF, Word, Excel, PowerPoint, Hình ảnh</Text>
                <Text type="secondary">Tối đa 50MB</Text>
                <Text type="success">Lưu trữ trên Bunny CDN</Text>
              </Space>
            }
          >
            {fileList.length > 0 ? (
              <Card>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Space>
                    {getFileIcon(fileList[0].name)}
                    <div>
                      <Text strong>{fileList[0].name}</Text>
                      <br />
                      <Text type="secondary">
                        {formatFileSize(fileList[0].size || 0)}
                      </Text>
                    </div>
                  </Space>
                  <Upload
                    fileList={fileList}
                    onRemove={() => setFileList([])}
                    showUploadList={{
                      showRemoveIcon: true,
                      showPreviewIcon: false,
                    }}
                  />
                </Space>
              </Card>
            ) : (
              <Dragger
                fileList={fileList}
                beforeUpload={(file) => {
                  // Check file size (50MB)
                  const isLt50M = file.size / 1024 / 1024 < 50;
                  if (!isLt50M) {
                    message.error("File phải nhỏ hơn 50MB!");
                    return false;
                  }
                  setFileList([file]);
                  return false; // Prevent auto upload
                }}
                onRemove={() => setFileList([])}
                maxCount={1}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif"
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: "#1890ff" }} />
                </p>
                <p className="ant-upload-text">
                  Nhấn hoặc kéo file vào đây để tải lên
                </p>
                <p className="ant-upload-hint">
                  File sẽ được lưu trữ an toàn trên Bunny CDN
                </p>
              </Dragger>
            )}
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};

export default UploadDocumentModal;
