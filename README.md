# Language Translator — SAPUI5 Frontend Application

A **100% frontend** SAPUI5 application that translates text using the
**Google Cloud Translation API v2** directly from the browser.

| ✅ Included | ❌ Excluded |
|---|---|
| SAPUI5 / OpenUI5 | Node.js backend |
| Google Cloud Translation REST API v2 | CAP / Express / HANA |
| HTML5 Application Repository deploy | Database / OData service |
| Fiori–style UI (Horizon theme) | `@google-cloud/translate` SDK |

---

## Architecture

```
SAPUI5 (Browser)
    │
    ├── GET  /language/translate/v2/languages   →  populate dropdown
    │
    └── POST /language/translate/v2             →  translate text
    │
    ▼
Google Cloud Translation API v2  (REST / HTTPS)
```

There is **no** intermediary backend.

---

## 1 — Google Cloud Setup  (step-by-step)

### 1.1 Create / select a Google Cloud project

1. Go to **https://console.cloud.google.com/**
2. Click the project selector → **New Project** (or select an existing one).
3. Note the **Project ID**.

### 1.2 Enable the Cloud Translation API

1. Navigate to **APIs & Services → Library**.
2. Search for **Cloud Translation API**.
3. Click **Enable**.

### 1.3 Create an API key

1. Go to **APIs & Services → Credentials**.
2. Click **+ CREATE CREDENTIALS → API key**.
3. Copy the key.

### 1.4 Restrict the API key  ⚠️

Since this key is embedded in frontend JavaScript it is **not secret**.
You **must** restrict it:

| Restriction | Value |
|---|---|
| **Application restriction** | HTTP referrers — add your domain(s), e.g. `https://your-app.launchpad.cfapps.eu10.hana.ondemand.com/*` and `http://localhost:*/*` for local dev |
| **API restriction** | **Cloud Translation API** only |

### 1.5 Verify the API works

```powershell
# Test supported languages
curl "https://translation.googleapis.com/language/translate/v2/languages?key=YOUR_KEY&target=en"

# Test translation
curl -X POST "https://translation.googleapis.com/language/translate/v2?key=YOUR_KEY" ^
     -H "Content-Type: application/json" ^
     -d "{\"q\":\"Hello world\",\"target\":\"fr\",\"format\":\"text\"}"
```

---

## 2 — Configure the Application

Open **`webapp/controller/App.controller.js`** and replace the placeholder:

```js
var API_KEY = "YOUR_GOOGLE_CLOUD_API_KEY";
//            ^^^^^^^^^^^^^^^^^^^^^^^^^^^
//            paste your real key here
```

---

## 3 — Local Development  (Windows)

```powershell
# Install dependencies (one-time)
npm install

# Start the local UI5 dev-server
npm start
```

The browser opens at **http://localhost:8080/index.html**.

The SAPUI5 application communicates directly with `https://translation.googleapis.com` — no proxy needed.

---

## 4 — Project Structure

```
language-translator/
│
├── webapp/
│   ├── controller/
│   │   └── App.controller.js      ← onInit / loadSupportedLanguages / onTranslate / onClear
│   ├── view/
│   │   └── App.view.xml           ← Fiori-style XML view
│   ├── model/
│   │   └── models.js              ← JSONModel factory
│   ├── i18n/
│   │   └── i18n.properties        ← all UI strings
│   ├── Component.js               ← UIComponent
│   ├── manifest.json              ← app descriptor
│   └── index.html                 ← bootstrap
│
├── package.json
├── ui5.yaml
└── README.md
```

---

## 5 — How It Works

### Startup — Loading Languages

```
onInit()
   │
   ▼
loadSupportedLanguages()          ← async
   │
   ▼
GET /language/translate/v2/languages?key=…&target=en
   │
   ▼
Google returns  { data: { languages: [ { language: "af", name: "Afrikaans" }, … ] } }
   │
   ▼
Transform →  [{ code: "af", name: "Afrikaans" }, … ]
   │
   ▼
Model  /languages  ← bound to <Select> dropdown
```

The language dropdown is **not hardcoded**.
If Google adds or removes languages, the dropdown updates automatically.

### Translation

```
User types text  →  selects target language  →  clicks Translate
   │
   ▼
onTranslate()                     ← async
   │
   ▼
POST /language/translate/v2?key=…
     body: { q: "Hello", target: "fr", format: "text" }
   │
   ▼
Google returns  { data: { translations: [{ translatedText: "Bonjour", detectedSourceLanguage: "en" }] } }
   │
   ▼
Model  /translatedText  ← bound to output TextArea
```

---

## 6 — SAP BTP HTML5 Application Repository Deployment

### Option A — Standalone Deploy (no MTA)

1. Build:
   ```powershell
   npx ui5 build --clean-dest
   ```
2. The output is in `dist/`.
3. Deploy `dist/` to the HTML5 Application Repository using the
   **`@sap/html5-app-deployer`** or the BTP cockpit.

### Option B — MTA (frontend only)

Create `mta.yaml`:

```yaml
_schema-version: "3.1"
ID: language-translator
version: 1.0.0
modules:
  - name: language-translator-html5
    type: html5
    path: webapp
    build-parameters:
      builder: custom
      commands:
        - npm run build
      supported-platforms: []
```

Then:

```powershell
npx mbt build
cf deploy mta_archives/language-translator_1.0.0.mtar
```

> **Note:** There is no backend module, no CAP module, no HANA module.

---

## 7 — Security Considerations

| Concern | Mitigation |
|---|---|
| API key is visible in JS | Restrict by HTTP referrer **and** API scope |
| No service-account JSON | Correct — never embed SA keys in frontend |
| HTTPS | Google API is HTTPS-only; BTP serves over HTTPS |
| Quota | Set daily quotas in Google Cloud Console |
| Monitoring | Enable Cloud Logging for the Translation API |
| Production hardening | For true credential secrecy, introduce a backend proxy (outside scope of this project) |

---

## 8 — Troubleshooting

| Symptom | Fix |
|---|---|
| `API key not valid` | Re-check the key; ensure Cloud Translation API is enabled |
| CORS error | Add `http://localhost:*/*` to the key's HTTP-referrer allowlist |
| Empty language dropdown | Check browser console; verify the `/languages` endpoint returns 200 |
| 403 `PERMISSION_DENIED` | Enable Cloud Translation API in the project |
| 429 `RESOURCE_EXHAUSTED` | Quota exceeded — increase or wait |
| `TypeError: Failed to fetch` | Network issue or browser extension blocking requests |

---

## 9 — Testing the API Independently

### Test 1 — Supported Languages

```powershell
Invoke-RestMethod -Uri "https://translation.googleapis.com/language/translate/v2/languages?key=YOUR_KEY&target=en"
```

Expected: a JSON object with `data.languages[]`.

### Test 2 — Translation

```powershell
$body = @{ q = "Good morning"; target = "de"; format = "text" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "https://translation.googleapis.com/language/translate/v2?key=YOUR_KEY" `
  -ContentType "application/json" `
  -Body $body
```

Expected: `data.translations[0].translatedText` = `"Guten Morgen"`.

### Test 3 — SAPUI5 Integration

1. `npm start`
2. Open DevTools → Network tab.
3. On page load, verify a request to `/languages` returns 200.
4. Enter text, select language, click Translate.
5. Verify a POST to `/translate/v2` returns 200 with `translatedText`.

---

© 2026 Datanub · Language Translator · SAPUI5 + Google Cloud Translation API v2
