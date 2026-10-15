# TPL Web Admin

Arabic-first administration panel for **Tawjihi Palestine Library**.

## Current foundation
- Firebase Email/Password sign-in.
- Role lookup and a super-admin UID gate.
- Overview counters and a read-only list of published resources.
- Initial Firestore security rules in `firestore.rules`.
- Responsive RTL layout using TPL's forest, ivory, and muted-gold palette.

## Deployment
This is a static site and can be served by GitHub Pages. Firebase web configuration is included in `app.js`; it identifies the Firebase project and is not a service-account secret. Configure Firebase Authentication authorized domains to include the deployed Pages domain.

## Before production
1. Review and deploy `firestore.rules` in the Firebase Console.
2. Verify the super-admin UID is correct and bootstrap its account using the existing Firebase user.
3. Create the admin role record only through the authorized super-admin path.
4. Test each role with Firebase Emulator Suite before enabling write workflows.
5. Do not add Dbrij keys, Firebase service-account JSON, or private storage URLs to this repository.
6. Resource upload and signed file delivery are not implemented yet; do not treat this panel as a production content editor until those flows are completed and tested.

## Role identifiers
`super_admin`, `content_manager`, `academic_reviewer`, `sponsored_ads_manager`, `content_contributor`, `technical_support`.

Footer signature: **MADE BY Karam_Dev**
