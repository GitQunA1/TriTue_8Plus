/**
 * Cloudinary Storage Utility
 * Upload files to Cloudinary (FREE tier - no credit card required)
 * 
 * Setup Instructions: See THIRD_PARTY_CONFIG_SETUP_GUIDE.md
 */

// Cloudinary Configuration from environment variables
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "";

interface UploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

/**
 * Upload file to Cloudinary
 * @param file - File to upload
 * @param folder - Optional folder path (e.g., "class-documents/classId")
 * @returns Promise with upload result
 */
export const uploadToCloudinary = async (
  file: File,
  folder?: string
): Promise<UploadResult> => {
  try {
    // Validate configuration
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      console.error("❌ Cloudinary not configured. Check .env.local");
      return {
        success: false,
        error: "Cloudinary chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
      };
    }

    // Create form data
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    
    // Add folder if specified
    if (folder) {
      formData.append("folder", folder);
    }

    // Upload to Cloudinary
    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
    
    console.log("📤 Uploading to Cloudinary:", {
      cloudName: CLOUDINARY_CLOUD_NAME,
      preset: CLOUDINARY_UPLOAD_PRESET,
      fileName: file.name,
      fileSize: `${(file.size / 1024).toFixed(2)} KB`,
    });

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ Cloudinary upload failed:", errorData);
      return {
        success: false,
        error: `Upload thất bại: ${errorData.error?.message || response.statusText}`,
      };
    }

    const data = await response.json();
    
    console.log("✅ Upload successful:", {
      url: data.secure_url,
      publicId: data.public_id,
    });

    return {
      success: true,
      url: data.secure_url, // HTTPS URL
      publicId: data.public_id, // For future deletion
    };
  } catch (error: any) {
    console.error("❌ Cloudinary upload error:", error);
    return {
      success: false,
      error: `Lỗi kết nối: ${error.message || "Unknown error"}`,
    };
  }
};

/**
 * Delete file from Cloudinary
 * Note: Requires signed request with API Secret (backend only)
 * For now, manual deletion via Cloudinary Dashboard
 * @param publicId - Public ID of the file to delete
 * @returns Promise with delete result
 */
export const deleteFromCloudinary = async (publicId: string): Promise<boolean> => {
  console.warn("⚠️ Delete from Cloudinary requires backend API with signature.");
  console.log("Please delete manually from Cloudinary Dashboard: https://console.cloudinary.com/");
  console.log("Public ID:", publicId);
  
  // For unsigned uploads, deletion requires server-side signature
  // This is a security feature to prevent unauthorized deletions
  return false;
};

/**
 * Generate folder path for storage
 * @param classId - Class ID
 * @param fileName - Original file name
 * @returns Folder path string
 */
export const generateFolderPath = (classId: string, fileName?: string): string => {
  return `class-documents/${classId}`;
};

/**
 * Test Cloudinary connection
 * @returns Promise with test result
 */
export const testCloudinaryConnection = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  try {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      return {
        success: false,
        message: "Thiếu cấu hình Cloudinary. Check file .env.local\n\n" +
                 "Required:\n" +
                 "- VITE_CLOUDINARY_CLOUD_NAME\n" +
                 "- VITE_CLOUDINARY_UPLOAD_PRESET\n\n" +
                 "Xem hướng dẫn: THIRD_PARTY_CONFIG_SETUP_GUIDE.md",
      };
    }

    // Test by fetching cloud info (public API)
    const testUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/sample.jpg`;
    
    const response = await fetch(testUrl, { method: "HEAD" });

    if (response.ok || response.status === 200) {
      return {
        success: true,
        message: `Kết nối Cloudinary thành công!\n\nCloud Name: ${CLOUDINARY_CLOUD_NAME}\nUpload Preset: ${CLOUDINARY_UPLOAD_PRESET}`,
      };
    } else {
      return {
        success: false,
        message: `Cloud Name có thể không đúng: ${CLOUDINARY_CLOUD_NAME}\nKiểm tra lại trong Dashboard.`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Lỗi: ${error.message}\n\nCheck lại cấu hình trong .env.local`,
    };
  }
};

/**
 * Get Cloudinary URL for a file
 * @param publicId - Public ID from upload result
 * @param options - Transformation options (optional)
 * @returns Cloudinary URL
 */
export const getCloudinaryUrl = (
  publicId: string,
  options?: {
    width?: number;
    height?: number;
    crop?: "fill" | "fit" | "scale" | "thumb";
    quality?: "auto" | number;
  }
): string => {
  let transformations = [];
  
  if (options?.width) transformations.push(`w_${options.width}`);
  if (options?.height) transformations.push(`h_${options.height}`);
  if (options?.crop) transformations.push(`c_${options.crop}`);
  if (options?.quality) transformations.push(`q_${options.quality}`);
  
  const transform = transformations.length > 0 ? `${transformations.join(",")}/` : "";
  
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transform}${publicId}`;
};

// Export configuration for debugging
export const getCloudinaryConfig = () => ({
  cloudName: CLOUDINARY_CLOUD_NAME,
  uploadPreset: CLOUDINARY_UPLOAD_PRESET,
  isConfigured: !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET),
});
