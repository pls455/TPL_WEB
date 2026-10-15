# TPL Web Admin

Arabic-first administration panel for **Tawjihi Palestine Library**.

## Current features
- Firebase Email/Password sign-in with role validation.
- Live Firestore management for branches and subjects: add, edit, sort, activate/deactivate, and assign subjects to multiple branches.
- External resource management: add/edit links, assign each resource to a subject, submit for review, publish, and archive. Reviewer controls are role-gated separately from branch/subject administration.
- Curriculum-unit management: create/edit units, assign them to active subjects, order them, and activate/deactivate without deleting records.
- Assessment administration: create/edit practice tests, timed tests, and past-paper entries; validate duration; publish/unpublish the test definition.
- Question bank: create/edit multiple-choice, true/false, and short-answer questions; validate options and correct answers; assign points and optional explanations; deactivate instead of deleting.
- Live Firestore listeners update manager lists when cloud records change.
- Overview counters and responsive RTL layout using TPL forest, ivory, and muted-gold colors.

## Firestore collections used
- `branches`: `name`, `active`, `order`, `createdBy`, `createdAt`, `updatedAt`
- `subjects`: `name`, `branchIds` (branch document IDs), `active`, `order`, timestamps
- `units`: `name`, `description`, `order`, `subjectId`, `subjectName`, `branchIds`, `active`, timestamps
- `resources`: `title`, `description`, `type`, `branchIds`, `subjectId`, `subjectName`, `externalUrl` / `sourceUrl`, `status`, version and review metadata
- `tests`: `title`, `description`, `type`, `durationMinutes`, `subjectId`, `subjectName`, `branchIds`, `published`, `active`, timestamps
- `questions`: `testId`, `testTitle`, `subjectId`, `questionText`, `type`, `options`, `correctAnswer`, `points`, `explanation`, `active`, timestamps

## Deployment and security
1. Configure Firebase Authentication authorized domains to include the deployed GitHub Pages domain.
2. Review and publish `firestore.rules` in Firebase Console. A rules file in GitHub is not automatically deployed to Firebase.
3. Verify the super-admin UID and bootstrap the existing account in Firebase Authentication.
4. Test each role with Firebase Emulator Suite before production.
5. Never commit Dbrij keys, Firebase service-account JSON, or private storage credentials.

## Known limits
- Resource entries currently use external links. Uploading files to Dbrij and secure signed download delivery are not implemented.
- Unit records are cloud-managed here, but the Android student view has not yet been connected to display units/chapters.
- Test definitions can be published, but question documents remain admin/reviewer-only to prevent exposing answer keys. Student exam delivery, secure attempts, and grading are not implemented yet.
- Resource uploads to Dbrij and secure signed download delivery are not implemented.
- Rules in this repository are a starting point and should be emulator-tested before production. Publishing a new GitHub commit does not publish Firestore rules.

## Role identifiers
`super_admin`, `content_manager`, `academic_reviewer`, `sponsored_ads_manager`, `content_contributor`, `technical_support`.

Footer signature: **MADE BY Karam_Dev**
