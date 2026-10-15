# TPL Web Admin

Arabic-first administration panel for **Tawjihi Palestine Library**.

## Current features
- Firebase Email/Password sign-in with role validation.
- Live Firestore management for branches and subjects: add, edit, sort, activate/deactivate, and assign subjects to multiple branches.
- Resource management: upload PDF, images, Office documents, presentations, spreadsheets, audio, video, or compressed files up to 50 MB; external links are supported too. Uploaded files use Firebase Storage; resources remain pending review until published.
- Curriculum-unit management: create/edit units, assign them to active subjects, order them, and delete only when no resources refer to the unit.
- Assessment administration: create/edit practice tests, timed tests, and past-paper entries; validate duration; publish/unpublish and delete tests with their questions. Publishing creates a safe `studentQuestions` projection that omits answer keys and explanations.
- Question bank: create/edit multiple-choice, true/false, and short-answer questions; validate options and correct answers; assign points and optional explanations; delete questions when requested.
- Super-admin-only team management: assign the approved role set to existing Firebase Authentication UIDs and remove TPL permissions by deleting the team record (the Firebase Auth account itself is not deleted).
- Role-gated report moderation for support, content managers, reviewers, and the super admin; resolve or dismiss reports without deleting their records.
- Live Firestore listeners update manager lists when cloud records change.
- Section-based admin navigation separates overview, branches/subjects, resources, curriculum/tests, and team/reports instead of stacking every tool on one page.
- Creation forms stay collapsed until requested and reopen automatically when editing an existing record.
- Responsive RTL layout with subtle section transitions and reduced-motion support, using TPL forest, ivory, and muted-gold colors.

## Firestore collections used
- `branches`: `name`, `active`, `order`, `createdBy`, `createdAt`, `updatedAt`
- `subjects`: `name`, `branchIds` (branch document IDs), `active`, `order`, timestamps
- `units`: `name`, `description`, `order`, `subjectId`, `subjectName`, `branchIds`, `active`, timestamps
- `resources`: `title`, `description`, `type`, `branchIds`, `subjectId`, `subjectName`, `externalUrl` / `sourceUrl`, `status`, version and review metadata
- `tests`: `title`, `description`, `type`, `durationMinutes`, `subjectId`, `subjectName`, `branchIds`, `published`, `active`, timestamps
- `questions`: `testId`, `testTitle`, `subjectId`, `questionText`, `type`, `options`, `correctAnswer`, `points`, `explanation`, `active`, timestamps
- `adminUsers`: document ID is the existing Firebase Authentication UID; `role`, `active`, `displayName`, `email`, and audit timestamps
- `reports`: `reporterUid`, report message/details, `status`, and review metadata

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
- Rules in this repository are a starting point and should be emulator-tested before production. Publishing a new GitHub commit does not publish Firestore rules.

## Role identifiers
`super_admin`, `content_manager`, `academic_reviewer`, `sponsored_ads_manager`, `content_contributor`, `technical_support`.

Footer signature: **MADE BY Karam_Dev**


## Publish Firebase rules
The repository contains `firestore.rules` and `storage.rules`, but GitHub Pages does not deploy Firebase rules automatically. Publish both files through Firebase Console before testing the new features:
1. In Firebase Console, open **Firestore Database → Rules**, replace the rules with `firestore.rules`, and publish.
2. Open **Storage → Rules**, replace the rules with `storage.rules`, and publish.
3. The configured bucket name `tpl-38d2e.firebasestorage.app` requires the Firebase **Blaze** plan for Cloud Storage access. Spark projects receive 402/403 errors; no-cost usage may still apply on Blaze, but a billing account is required.
4. Verify uploads as a signed-in content manager, then approve a resource and confirm students can open the file only after publication. Set budget alerts before enabling billing.

Student-facing assessment questions are copied to `studentQuestions` without `correctAnswer` or `explanation`. The student app can display and collect choices locally, but trusted automatic grading and saving attempts are not implemented in this build.
