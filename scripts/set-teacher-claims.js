/**
 * Firebase Custom Claims Setup Script
 *
 * This script sets the 'role: teacher' custom claim for specified users.
 * Custom claims are used in Firebase Security Rules to control access.
 */

const admin = require("firebase-admin");

// Initialize Firebase Admin (you need to download serviceAccountKey.json from Firebase Console)
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://your-project-id.firebaseio.com", // Replace with your database URL
});

/**
 * Set teacher role for a user by email
 */
async function setTeacherRole(email) {
  try {
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);

    // Set custom claim
    await admin.auth().setCustomUserClaims(user.uid, {
      role: "teacher",
    });

    console.log(`✅ Set teacher role for: ${email} (UID: ${user.uid})`);

    // Verify the claim was set
    const updatedUser = await admin.auth().getUser(user.uid);
    console.log(`   Custom claims:`, updatedUser.customClaims);

    return true;
  } catch (error) {
    console.error(`❌ Error setting teacher role for ${email}:`, error.message);
    return false;
  }
}

/**
 * Set teacher role for multiple users
 */
async function setTeacherRoleForMultipleUsers(emails) {
  console.log(`🚀 Setting teacher role for ${emails.length} users...\n`);

  const results = [];

  for (const email of emails) {
    const success = await setTeacherRole(email);
    results.push({ email, success });
    console.log(""); // Empty line for readability
  }

  // Summary
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log("\n📊 Summary:");
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ❌ Failed: ${failCount}`);

  if (failCount > 0) {
    console.log("\n❌ Failed users:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.email}`);
      });
  }
}

/**
 * Remove teacher role from a user
 */
async function removeTeacherRole(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);

    // Remove the role claim by setting it to null
    await admin.auth().setCustomUserClaims(user.uid, {
      role: null,
    });

    console.log(`✅ Removed teacher role from: ${email} (UID: ${user.uid})`);
    return true;
  } catch (error) {
    console.error(
      `❌ Error removing teacher role from ${email}:`,
      error.message
    );
    return false;
  }
}

/**
 * List all users with their custom claims
 */
async function listAllUsersWithClaims() {
  console.log("📋 Listing all users with their custom claims...\n");

  try {
    const listUsersResult = await admin.auth().listUsers();

    console.log(`Found ${listUsersResult.users.length} users:\n`);

    listUsersResult.users.forEach((user) => {
      console.log(`Email: ${user.email || "N/A"}`);
      console.log(`UID: ${user.uid}`);
      console.log(`Custom Claims:`, user.customClaims || "None");
      console.log(
        `Created: ${new Date(user.metadata.creationTime).toLocaleString()}`
      );
      console.log("---");
    });
  } catch (error) {
    console.error("❌ Error listing users:", error);
  }
}

/**
 * Check if a user has teacher role
 */
async function checkUserRole(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    const claims = user.customClaims || {};

    console.log(`\n👤 User: ${email}`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Role: ${claims.role || "None"}`);
    console.log(`   Is Teacher: ${claims.role === "teacher" ? "✅" : "❌"}`);

    return claims.role === "teacher";
  } catch (error) {
    console.error(`❌ Error checking user role for ${email}:`, error.message);
    return false;
  }
}

// ==================== USAGE EXAMPLES ====================

// Example 1: Set teacher role for a single user
async function example1() {
  await setTeacherRole("nguyensihoang@gmail.com");
}

// Example 2: Set teacher role for multiple users
async function example2() {
  const teacherEmails = [
    "nguyensihoang@gmail.com",
    "teacher2@example.com",
    "teacher3@example.com",
  ];

  await setTeacherRoleForMultipleUsers(teacherEmails);
}

// Example 3: List all users
async function example3() {
  await listAllUsersWithClaims();
}

// Example 4: Check specific user
async function example4() {
  await checkUserRole("nguyensihoang@gmail.com");
}

// Example 5: Remove teacher role
async function example5() {
  await removeTeacherRole("teacher@example.com");
}

// ==================== MAIN EXECUTION ====================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
📚 Firebase Custom Claims Manager

Usage:
  node set-teacher-claims.js <command> [email]

Commands:
  set <email>           - Set teacher role for a user
  remove <email>        - Remove teacher role from a user
  check <email>         - Check if user has teacher role
  list                  - List all users with their claims
  batch                 - Set teacher role for multiple users (edit script first)

Examples:
  node set-teacher-claims.js set nguyensihoang@gmail.com
  node set-teacher-claims.js check nguyensihoang@gmail.com
  node set-teacher-claims.js list
    `);
    process.exit(0);
  }

  try {
    switch (command) {
      case "set":
        if (!args[1]) {
          console.error("❌ Please provide an email address");
          process.exit(1);
        }
        await setTeacherRole(args[1]);
        break;

      case "remove":
        if (!args[1]) {
          console.error("❌ Please provide an email address");
          process.exit(1);
        }
        await removeTeacherRole(args[1]);
        break;

      case "check":
        if (!args[1]) {
          console.error("❌ Please provide an email address");
          process.exit(1);
        }
        await checkUserRole(args[1]);
        break;

      case "list":
        await listAllUsersWithClaims();
        break;

      case "batch":
        // Edit the email list below
        const teacherEmails = [
          "nguyensihoang@gmail.com",
          // Add more teacher emails here
        ];
        await setTeacherRoleForMultipleUsers(teacherEmails);
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log("Run without arguments to see usage");
        process.exit(1);
    }

    console.log("\n✅ Script completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  }
}

// Run the script
main();

// Export functions for testing
module.exports = {
  setTeacherRole,
  removeTeacherRole,
  checkUserRole,
  listAllUsersWithClaims,
  setTeacherRoleForMultipleUsers,
};
