# Firebase Admin Scripts

This directory contains Node.js scripts for managing Firebase Realtime Database
and Authentication.

## Prerequisites

1. **Install Firebase Admin SDK**:

   ```bash
   npm install firebase-admin
   ```

2. **Download Service Account Key**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings (⚙️ icon) → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file as `serviceAccountKey.json` in this directory
   - **⚠️ IMPORTANT**: Add `serviceAccountKey.json` to `.gitignore` to prevent
     committing it

3. **Update Database URL**:
   - Open each script file
   - Replace `'https://your-project-id.firebaseio.com'` with your actual
     Firebase Realtime Database URL
   - You can find this URL in Firebase Console → Realtime Database

## Scripts

### 1. migrate-attendance.js

Migrates attendance data from the old flat structure to the new date-based
structure.

**Usage**:

```bash
node scripts/migrate-attendance.js
```

**What it does**:

- Reads old attendance records
- Groups them by date
- Creates new structure with `homework` and `students` nodes
- Creates a backup of old data before migration
- Displays migration summary

**Before running**:

- Backup your database manually (recommended)
- Update the `databaseURL` in the script

### 2. set-teacher-claims.js

Sets custom claims for Firebase Authentication users to grant teacher
permissions.

**Usage**:

Set teacher role for a single user:

```bash
node scripts/set-teacher-claims.js set teacher@example.com
```

Check if a user has teacher role:

```bash
node scripts/set-teacher-claims.js check teacher@example.com
```

List all users with their claims:

```bash
node scripts/set-teacher-claims.js list
```

Remove teacher role:

```bash
node scripts/set-teacher-claims.js remove teacher@example.com
```

Set teacher role for multiple users (edit script first):

```bash
node scripts/set-teacher-claims.js batch
```

## Important Notes

### Security

- **Never commit** `serviceAccountKey.json` to version control
- Add to `.gitignore`:
  ```
  scripts/serviceAccountKey.json
  ```

### Testing

- Test scripts in a development environment first
- Always backup your database before running migration scripts
- Verify the results after running scripts

### Custom Claims

- Custom claims take effect immediately for new ID tokens
- Existing tokens need to be refreshed (user needs to log out and log in again)
- Or force token refresh in your app:
  ```javascript
  const user = firebase.auth().currentUser;
  await user.getIdToken(true); // Force refresh
  ```

## Setup Checklist

- [ ] Install `firebase-admin` package
- [ ] Download service account key JSON file
- [ ] Save as `serviceAccountKey.json` in scripts directory
- [ ] Add `serviceAccountKey.json` to `.gitignore`
- [ ] Update `databaseURL` in each script
- [ ] Test in development environment first
- [ ] Backup database before running migration

## Troubleshooting

### Error: "Cannot find module 'firebase-admin'"

```bash
npm install firebase-admin
```

### Error: "Error: ENOENT: no such file or directory"

Make sure `serviceAccountKey.json` exists in the scripts directory.

### Error: "Permission denied"

Check that your service account has the necessary permissions in Firebase
Console.

### Custom claims not working

1. Verify the claim was set:
   `node scripts/set-teacher-claims.js check email@example.com`
2. Force token refresh in your app
3. Check Firebase Security Rules are correct

## Example Workflow

1. **Initial Setup**:

   ```bash
   # Install dependencies
   npm install firebase-admin

   # Download service account key to scripts/serviceAccountKey.json

   # Update database URL in scripts
   ```

2. **Set Teacher Roles**:

   ```bash
   # Set for single teacher
   node scripts/set-teacher-claims.js set nguyensihoang@gmail.com

   # Verify it worked
   node scripts/set-teacher-claims.js check nguyensihoang@gmail.com
   ```

3. **Migrate Data** (if needed):

   ```bash
   # Backup database first (in Firebase Console)

   # Run migration
   node scripts/migrate-attendance.js

   # Verify in Firebase Console
   ```

## Support

If you encounter issues:

1. Check Firebase Console for error messages
2. Verify service account permissions
3. Check Firebase Security Rules are up to date
4. Ensure database URL is correct
5. Check that users exist in Firebase Authentication

## Resources

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Custom Claims Documentation](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Realtime Database Security Rules](https://firebase.google.com/docs/database/security)
