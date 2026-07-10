# Google Services API 串接備忘錄 & 實作指南

本文件記錄了未來將「極簡個人儀表板」升級串接真實 Google 帳號資料（Google Calendar、Google Tasks）的架構與步驟。當您準備好進行串接時，可以隨時參考此指南。

---

## 🔑 核心運作架構：OAuth 2.0 隱式授權流程 (Implicit Flow)
因為本儀表板是「純前端網頁」，我們不需要伺服器，直接在瀏覽器端使用 **Google Identity Services SDK** 進行登入，取得 Access Token 後直接向 Google API 發送請求。

---

## 🛠️ 第一階段：Google Cloud Console 設定步驟

1. **建立專案**：
   - 前往 [Google Cloud Console](https://console.cloud.google.com/)。
   - 點擊「選取專案」->「新增專案」，命名為 `Minimal Personal Dashboard`。

2. **啟用 API 服務**：
   - 在左側選單選擇「API 和服務」 > 「庫 (Library)」。
   - 搜尋並啟用以下兩個 API：
     - **Google Calendar API**
     - **Google Tasks API**

3. **設定 OAuth 同意畫面 (OAuth Consent Screen)**：
   - 選擇「外部 (External)」（或在個人 Workspace 帳號下選擇「內部」）。
   - 填寫應用程式名稱（例如：`My Personal Dashboard`）及您的電子郵件。
   - **範圍 (Scopes)** 選擇：
     - `.../auth/calendar.readonly` (唯讀取日曆行程)
     - `.../auth/tasks` (讀取與寫入您的 Tasks 任務)
   - **測試使用者 (Test Users)**：新增您自己的 Google 帳號（在發布前，只有被列入此處的帳號可以登入）。

4. **建立憑證 (Credentials)**：
   - 點擊「建立憑證」 > 「OAuth 客戶端 ID (OAuth Client ID)」。
   - 應用程式類型選擇「網頁應用程式 (Web Application)」。
   - **已授權的 JavaScript 來源 (Authorized JavaScript origins)**：
     - 新增 `http://localhost` 及其運行的連接埠（例如：`http://localhost:5500` 或 `http://127.0.0.1:5500`）。
   - 點擊建立，取得您的 **Client ID**。

---

## 💻 第二階段：前端程式碼修改指南

當您準備好時，我們將進行以下修改：

### 1. 在 `index.html` 引入 Google SDK
```html
<!-- 在 </head> 前載入 Google Identity Services -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### 2. 在 `app.js` 設定授權與資料抓取
```javascript
const CLIENT_ID = '您的_CLIENT_ID.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// 1. 初始化 Google 登入客戶端
function initGoogleAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: handleAuthCallback, // 授權成功後的 callback
  });
}

// 2. 請求 Token
function handleSyncClick() {
  // 這會觸發 Google 登入彈出視窗
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// 3. 取得 Token 後呼叫 Google API 抓取資料
async function handleAuthCallback(tokenResponse) {
  if (tokenResponse.error !== undefined) {
    throw (tokenResponse);
  }
  const accessToken = tokenResponse.access_token;
  
  // 抓取日曆資料
  await fetchCalendarEvents(accessToken);
  // 抓取 Tasks 資料
  await fetchTasks(accessToken);
}
```
