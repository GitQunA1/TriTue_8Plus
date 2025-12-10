/**
 * Firebase Attendance Data Migration Script
 *
 * This script migrates attendance data from the old flat structure to the new date-based structure.
 *
 * OLD STRUCTURE:
 * {
 *   "Điểm_danh": {
 *     "-ABC123": {
 *       "studentId": "-XYZ789",
 *       "studentName": "Nguyễn Văn A",
 *       "date": "2025-11-10",
 *       "present": true,
 *       "submittedBy": "teacher@example.com",
 *       "timestamp": "2025-11-10T10:00:00.000Z"
 *     }
 *   }
 * }
 *
 * NEW STRUCTURE:
 * {
 *   "Điểm_danh": {
 *     "2025-11-10": {
 *       "homework": {
 *         "totalExercises": 0,
 *         "description": "",
 *         "assignedBy": "teacher@example.com"
 *       },
 *       "students": {
 *         "-XYZ789": {
 *           "studentName": "Nguyễn Văn A",
 *           "present": true,
 *           "score": 0,
 *           "submittedBy": "teacher@example.com",
 *           "timestamp": "2025-11-10T10:00:00.000Z"
 *         }
 *       }
 *     }
 *   }
 * }
 */

// This is for Node.js environment with Firebase Admin SDK
const admin = require("firebase-admin");

// Initialize Firebase Admin (you need to download serviceAccountKey.json from Firebase Console)
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://your-project-id.firebaseio.com", // Replace with your database URL
});

const db = admin.database();

async function migrateAttendanceData() {
  console.log("🚀 Starting attendance data migration...");

  try {
    // 1. Read old attendance data
    const oldAttendanceRef = db.ref("datasheet/Điểm_danh");
    const snapshot = await oldAttendanceRef.once("value");
    const oldData = snapshot.val();

    if (!oldData) {
      console.log("⚠️ No existing attendance data found");
      return;
    }

    console.log(
      `📊 Found ${Object.keys(oldData).length} old attendance records`
    );

    // 2. Group records by date
    const groupedByDate = {};
    let recordCount = 0;

    Object.entries(oldData).forEach(([recordId, record]) => {
      const date = record.date;

      if (!date) {
        console.warn(`⚠️ Skipping record ${recordId} - no date field`);
        return;
      }

      // Initialize date entry if it doesn't exist
      if (!groupedByDate[date]) {
        groupedByDate[date] = {
          homework: {
            totalExercises: 0,
            description: "",
            assignedBy: record.submittedBy || "Unknown",
          },
          students: {},
        };
      }

      // Add student record
      const studentId = record.studentId;
      if (studentId) {
        groupedByDate[date].students[studentId] = {
          studentName: record.studentName || "Unknown",
          present: record.present || false,
          score: record.score || 0,
          submittedBy: record.submittedBy || "Unknown",
          timestamp: record.timestamp || new Date().toISOString(),
        };
        recordCount++;
      } else {
        console.warn(`⚠️ Skipping record ${recordId} - no studentId`);
      }
    });

    console.log(`📅 Grouped into ${Object.keys(groupedByDate).length} dates`);
    console.log(`👥 Migrating ${recordCount} student records`);

    // 3. Backup old data (optional but recommended)
    const backupRef = db.ref(
      "datasheet/Điểm_danh_backup_" + new Date().getTime()
    );
    await backupRef.set(oldData);
    console.log("💾 Created backup of old data");

    // 4. Write new structure
    await oldAttendanceRef.set(groupedByDate);
    console.log("✅ Migration completed successfully!");

    // 5. Print summary
    console.log("\n📋 Migration Summary:");
    console.log(`  - Dates processed: ${Object.keys(groupedByDate).length}`);
    console.log(`  - Student records migrated: ${recordCount}`);
    console.log(
      `  - Backup location: datasheet/Điểm_danh_backup_${new Date().getTime()}`
    );

    // 6. Print sample of new structure
    const sampleDate = Object.keys(groupedByDate)[0];
    console.log("\n📝 Sample of new structure:");
    console.log(
      JSON.stringify(
        {
          [sampleDate]: groupedByDate[sampleDate],
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run migration
migrateAttendanceData()
  .then(() => {
    console.log("\n✅ Migration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration script failed:", error);
    process.exit(1);
  });

// Export for testing
module.exports = { migrateAttendanceData };
