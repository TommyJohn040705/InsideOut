# Deploying InsideOut (browser only, no local terminal)

These steps put InsideOut online with a URL you can open on your laptop and phone. They also turn on Gemini, with the key kept on the server, and live Firestore sync for reports and approved map updates. Everything is done in the Firebase console, Google Cloud console and GitHub websites.

**Cost:** Firebase App Hosting needs the pay-as-you-go **Blaze** plan. A student prototype normally stays within the free usage tiers, but set a budget alert (step 1) so you are emailed long before any charge matters. Gemini usage is billed separately by Google AI Studio according to your key's plan.

## Option A (recommended): Firebase App Hosting from GitHub

### 1. Create the Firebase project
1. Go to https://console.firebase.google.com and click **Create a project**. Name it, for example, `insideout-uw`. Google Analytics is optional.
2. When prompted, upgrade to **Blaze**. In Google Cloud Billing, open **Budgets & alerts** and create a budget of, for example, $5 with email alerts.

### 2. Firestore
1. Go to **Build > Firestore Database > Create database**. Choose **Production mode**. For the location, choose `northamerica-northeast2` (Toronto) or the region closest to Waterloo.
2. Open the **Rules** tab. Replace everything with the contents of [`firestore.rules`](firestore.rules) and click **Publish**.
3. Indexes: the app needs two composite indexes (listed in [`firestore.indexes.json`](firestore.indexes.json)). The first time the app runs a query that needs one, Firestore logs an error containing a direct "create index" link. Open it and click **Create**. You can also add them under **Indexes > Composite**:
   - `reports`: `buildingId` Ascending, `expiresAt` Ascending
   - `mapProposals`: `status` Ascending, `createdAt` Descending

### 3. Authentication
1. Go to **Build > Authentication > Get started**.
2. Enable **Anonymous**. Every visitor signs in anonymously so reports are attributed and protected by the rules.
3. Enable **Google**. This is for reviewers who approve map changes.

### 4. Gemini key (secret)
1. Create a key at https://aistudio.google.com/apikey if you do not have one.
2. You will add it as a secret during step 5. App Hosting stores it in Google Secret Manager, and `apphosting.yaml` only references it by name (`GEMINI_API_KEY`). It never appears in the code, the browser or GitHub.

### 5. Connect GitHub and deploy
1. Go to **Build > App Hosting > Get started**.
2. Connect GitHub, authorise the Firebase app for `TommyJohn040705/InsideOut`, and choose:
   - Root directory: `/`
   - Live branch: `feature/preview-firebase` for testing (switch to `main` after merging)
   - Automatic rollouts: on
   - Region: the closest one offered
   - When asked, create or link a **Firebase web app**. This is what turns on Firestore sync automatically.
3. Before or after the first rollout, open the backend's **Settings > Environment** and add a **secret** named `GEMINI_API_KEY` with your key value. Grant the backend access when prompted. Then roll out again from the **Rollouts** tab.
4. When the rollout finishes, open the `...hosted.app` URL. Check that the header pill says **Live** and that Add floor says "Gemini is configured on the server".

Every push to the live branch redeploys automatically.

### 6. Make yourself a reviewer (admin)
1. Open the deployed app, go to **Edit map**, click **Sign in with Google (reviewers)**, and copy **Your user ID**.
2. In **Firestore > Data**, create the collection `admins` with a document whose **ID is that user ID**. The document needs no fields.
3. Reload the app. Edit map now shows the **Review queue**, where you approve or reject submitted map updates.

## Testing Gemini without deploying (GitHub Actions)
1. In GitHub, open the repo and go to **Settings > Secrets and variables > Actions > New repository secret**. Name it `GEMINI_API_KEY` and paste your key.
2. Go to **Actions > Gemini live check > Run workflow**. The run sends a real floor plan image and an assistant question to `gemini-3.8-flash`, converts the result into a routable floor, and reports the results. The key is never printed.

## Option B: Firebase Hosting + Cloud Functions via GitHub Actions
This option uses `firebase.json`, `functions/` and `.github/workflows/deploy-firebase.yml`. It needs a Google Cloud service account (created in the Cloud console IAM page) with these roles:
- Firebase Admin
- Cloud Functions Admin
- Cloud Run Admin
- Secret Manager Admin
- Artifact Registry Administrator
- Service Account User
- Service Usage Consumer

Add its JSON key as the repository secret `FIREBASE_SERVICE_ACCOUNT`, add the repository variable `FIREBASE_PROJECT_ID`, and run **Actions > Deploy to Firebase Hosting + Functions**. A non-`live` channel name gives a temporary preview URL. Option A is simpler; use B only if you prefer Firebase Hosting.

## What syncs
| Data | Where | Who can write |
| --- | --- | --- |
| Reports (blocked corridor, elevator out, stairwell closed) | `reports` | Any visitor can create one and confirm or clear by +1. Rules block edits, deletes and fake counts |
| Approved maps | `buildings` | Admins only, by approving a proposal |
| Suggested map edits | `mapProposals` | Visitors submit; admins approve or reject |
| Admin list | `admins` | Firebase console only |

Without Firebase (local runs, the static preview), everything still works but stays on the one device.
