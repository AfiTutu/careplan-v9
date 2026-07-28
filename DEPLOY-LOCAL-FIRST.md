# Deploy CarePlan v9.9 Local-First to Cloudflare Pages

## Cloudflare Pages settings

- Framework preset: None
- Build command: leave empty
- Build output directory: `public`
- Root directory: repository root

This release does not require D1, R2, KV, Cloudflare Access, workspace slugs, secrets, or Pages Functions. Existing backend files are retained only for the later multitenant phase and are not called by the frontend.

## Safe replacement procedure

1. Create a new Git branch or tag before replacing the current deployment.
2. Upload this package to the repository root.
3. Deploy the `public` directory.
4. Open the root URL, for example `https://careplan-v9.pages.dev/`.
5. Confirm the bottom navigation is the final responsive navigation and the main Today content loads.
6. Open Care Profile > Data Safety and export an encrypted backup after entering test data.
7. Test refresh, browser restart, offline reopening, backup restore, adding/editing/deleting records, and mobile navigation.

## Existing customer/browser data

The app automatically looks for the earlier root key `careplan-v98:local-preview` when the new `careplan-v99:local` key is empty. It copies the data forward without deleting the old key.

## Customer disclosure required at sale

CarePlan v9.9 is local-first. Records remain in the customer's current browser and device. Clearing site data, using private/incognito browsing, uninstalling the browser, resetting the device, or losing the device can remove records. Customers should export password-encrypted backups regularly and keep the password separately.
