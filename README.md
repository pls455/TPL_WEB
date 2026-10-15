# TPL Web Admin

Arabic-first administration panel for **Tawjihi Palestine Library**.

## Current features
- Firebase Email/Password sign-in with role validation.
- Live Firestore management for branches and subjects: add, edit, sort, activate/deactivate, and assign subjects to multiple branches.
- External resource management: add/edit links, assign each resource to a subject, submit for review, publish, and archive.
- Published resources are visible to the Android app; draft and pending resources remain hidden from students.
- Overview counters and responsive RTL layout using TPL forest, ivory, and muted-gold colors.

## Firestore collections used
- `branches`: `name`, `active`, `order`, `createdBy`, `createdAt`, `updatedAt`
- `subjects`: `name`, `branchIds` (branch document IDs), `active`, `order`, timestamps
- `resources`: `title`, `description`, `type`, `branchIds`, `subjectId`, `subjectName`, `externalUrl` / `sourceUrl`, `status`, version and review metadata

## Deployment and security
1. Configure Firebase Authentication authorized domains to include the deployed GitHub Pages domain.
2. Review and publish `firestore.rules` in Firebase Console. A rules file in GitHub is not automatically deployed to Firebase.
3. Verify the super-admin UID and bootstrap the existing account in Firebase Authentication.
4. Test each role with Firebase Emulator Suite before production.
5. Never commit Dbrij keys, Firebase service-account JSON, or private storage credentials.

## Known limits
- Resource entries currently use external links. Uploading files to Dbrij and secure signed download delivery are not implemented.
- Tests and questions are not yet managed by this panel.
- Rules in this repository are a starting point and should be emulator-tested before production.

## Role identifiers
`super_admin`, `content_manager`, `academic_reviewer`, `sponsored_ads_manager`, `content_contributor`, `technical_support`.

Footer signature: **MADE BY Karam_Dev**
