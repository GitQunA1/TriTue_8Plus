import { Button, message, Space, Card, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { testCloudinaryConnection } from "../utils/cloudinaryStorage";
import { useState } from "react";

const { Text } = Typography;

/**
 * Component để test kết nối Cloudinary Storage
 * Chỉ dùng trong development
 */
const CloudinaryStorageTest = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    
    try {
      const testResult = await testCloudinaryConnection();
      setResult(testResult);
      
      if (testResult.success) {
        message.success("Kết nối Cloudinary thành công!");
      } else {
        message.error(testResult.message);
      }
    } catch (error: any) {
      const errorResult = {
        success: false,
        message: `Lỗi: ${error.message}`,
      };
      setResult(errorResult);
      message.error(errorResult.message);
    } finally {
      setTesting(false);
    }
  };

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <Card 
      size="small" 
      style={{ 
        marginBottom: 16, 
        background: "#f0f2f5",
        border: "1px dashed #d9d9d9"
      }}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Text strong>🔧 Cloudinary Storage Debug</Text>
        <Space>
          <Button 
            size="small" 
            onClick={handleTest} 
            loading={testing}
          >
            Test kết nối
          </Button>
          {result && (
            <Space>
              {result.success ? (
                <CheckCircleOutlined style={{ color: "#52c41a" }} />
              ) : (
                <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
              )}
              <Text 
                type={result.success ? "success" : "danger"}
                style={{ whiteSpace: "pre-line", fontSize: "12px" }}
              >
                {result.message}
              </Text>
            </Space>
          )}
        </Space>
      </Space>
    </Card>
  );
};

export default CloudinaryStorageTest;
