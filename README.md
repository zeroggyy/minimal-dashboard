# 今日歷歷 · Kontext Dashboard

> 一張打開即用的極簡個人作戰桌。把今天的任務、行程、閃念與生活提醒，收進同一個安靜的工作介面。

---

## 專案定位

今日歷歷不是傳統的數據 Dashboard，而是一個以每日專注為中心的個人工作台。它將 Google Tasks、Google Calendar、Google Drive App Data 與 Google Sheets 整合在一個純前端頁面中，同時保留未登入與離線時的本機使用能力。

設計靈感來自 Kontext.jp 的編輯風格：大量留白、細框線、紙張色調、serif 標題與克制的陶土紅強調色。

- **少，但更好。** 只保留當下真正需要的資訊。
- **本機優先。** 即使尚未登入 Google，仍能使用閃念與部分本機資料。
- **需要時才提醒。** 紅色只用於操作、錯誤與具時效性的特殊提示。
- **資料屬於使用者。** 雲端內容保存在使用者自己的 Google 帳號中。

---

## 目前功能

### 頁首

- 自動顯示 `YYYY . MM . DD / 星期`。
- 隨機顯示一則中英對照的每日短句。
- 顯示目前時間並每分鐘更新。
- `SYNC` 統一處理 Google OAuth 授權與資料重新整理。
- 授權有效期間每 10 分鐘自動更新 Tasks、Calendar、Drive 與訂閱資料。
- 切回分頁或重新聚焦視窗時，若距離上次同步已超過 10 分鐘會立即補同步。
- 權杖到期時顯示 `RECONNECT`；部分資料更新失敗時顯示 `RETRY`，避免把舊資料誤標為已同步。

### 手頭的事 · Google Tasks

- 讀取使用者的所有 Google Task Lists，並支援 API 分頁。
- **今日焦點**：顯示今天到期的任務，最多保留三項，維持真正的專注範圍。
- **過期未完**：集中顯示已超過到期日但尚未完成的任務，標題會顯示未完數量並可摺疊收合。
- **SOMEDAY / 有空解決**：從沒有設定到期日的未完成任務中隨機挑選一項。
  - 顯示候選任務數量。
  - 可點擊「換一個」重新抽選。
  - 同一次瀏覽期間保持穩定，不會因重新渲染任意跳動。
- 可快速新增今天的任務。
- 可勾選完成並同步回 Google Tasks。
- 點擊任務可開啟編輯風格詳情視窗，查看或修改標題與備註。
- 可開啟 Google Tasks 原始來源。
- 未登入時使用 `localStorage` 保存本機快取。

### 今日歷歷 · Google Calendar

- 讀取使用者可見的 Google Calendars 與今天的所有行程。
- 可從卡片右上角查看前一天或後一天，並點擊日期快速回到今天。
- 全天事件集中顯示在 All-Day Highlights。
- 有時間的行程以左右交錯的垂直時間軸呈現。
- 依當日行程範圍動態調整時間軸比例。
- 顯示現在時間指示線，已結束行程會降低視覺權重。
- 點擊行程可查看：
  - 標題與所屬日曆
  - 開始與結束時間
  - 地點
  - 建立者
  - 詳細說明與原始連結
- 無行程時顯示安靜的空狀態畫面。

### 閃念膠囊 · Scratchpad

- 按 `Enter` 或 `+` 快速新增閃念。
- `Shift + Enter` 可在同一則閃念內換行。
- 閃念中的 `http://`、`https://` 與 `www.` 網址會自動轉成可點擊的新分頁連結。
- 支援安全的常用 Markdown：標題、粗體、斜體、刪除線、行內／區塊程式碼、引用、清單、核取清單與 `[文字](網址)`。
- 可直接在輸入框貼上 JPG、PNG 或 WebP 圖片，預覽後建立純圖片或圖文閃念。
- 圖片會先壓縮並保存在瀏覽器 IndexedDB；登入後以獨立檔案同步到 Google Drive App Data。
- 刪除圖片閃念時會一併移除對應的雲端圖片檔案。
- 未登入時，文字與圖片中繼資料保存在 `localStorage`，圖片檔案保存在 IndexedDB。
- 登入後同步到 Google Drive 的 `appDataFolder`，可在其他裝置登入同一帳號後讀取。
- 顯示獨立同步狀態：
  - 僅本機
  - 正在同步
  - 已同步至 Google Drive
  - 同步失敗／重試
- 支援將閃念轉成 Google Task：
  - 任務名稱
  - 選填到期日
  - 指定 Tasks 清單
- 支援將閃念轉成 Google Calendar 行程：
  - 標題
  - 日期與開始／結束時間
  - 地址
  - 詳細資訊
  - 指定可寫入的日曆
- 轉換成功後保留原始閃念，顯示 Google 項目的快捷連結並避免重複轉換。
- 刪除閃念只會刪除膠囊內的筆記，不會刪除已建立的 Google Task 或 Calendar 行程。

### 即將續訂 · Google Sheets

- 連結使用者指定的 Google Sheet 與工作表名稱。
- 依第一列欄位名稱動態索引資料，不依賴固定欄號。
- 必要欄位：
  - `訂閱項目`
  - `台幣換算(自動)`
  - `支付管道`
  - `下次到期日`
  - `狀態`
- 只讀取狀態為「使用中」且七日內即將到期的訂閱。
- 若仍標記為使用中但日期已過，也會顯示逾期警示。
- 顯示訂閱名稱、剩餘天數、到期日、台幣金額與支付管道。
- 三天內、今天到期與逾期項目使用克制的陶土紅提示。
- 點擊提醒可開啟與 Tasks／Calendar 相同的詳情視窗，並動態顯示該列所有非空欄位。
- 可重新整理資料或開啟來源試算表。
- Sheet 設定同時保存在本機與 Google Drive App Data，其他裝置可以沿用。
- 已設定資料源但七日內沒有續訂項目時，整個區域自動隱藏，維持簡潔版面。
- 最後成功資料會快取於本機，短暫離線時仍可顯示。

### 響應式介面

- 桌面版以 Tasks、Calendar 雙欄呈現，閃念膠囊橫跨底部。
- 手機版改為 Tasks、Calendar、Scratchpad 三個頁籤。
- 訂閱提醒維持在主要內容上方，並針對窄螢幕改成單欄排列。

---

## 資料流

```text
Google Tasks ───────→ 今日焦點／過期未完／有空解決
Google Calendar ────→ 今日時間軸
Google Sheets ──────→ 七日內訂閱提醒
Google Drive App Data ↔ 閃念與資料來源設定
localStorage ───────→ 本機快取與離線顯示
IndexedDB ──────────→ 閃念圖片的本機 Blob 快取
sessionStorage ─────→ 當前分頁的 Google Access Token
```

### 跨裝置行為

- Tasks、Calendar 與 Sheets 資料直接來自登入的 Google 帳號。
- 閃念與訂閱 Sheet 設定透過 Google Drive App Data 同步。
- `localStorage` 只屬於當前網域、裝置與瀏覽器，不會自行跨裝置。
- `localhost` 與 GitHub Pages 是不同網站來源，但登入同一 Google 帳號後可以從 App Data 取得相同閃念與設定。

---

## 技術架構

```text
minimal-dashboard/
├── index.html                  # 頁面結構與主要區域
├── style.css                   # 設計系統、元件與響應式樣式
├── app.js                      # 狀態、Google API、資料合併與渲染
├── README.md                   # 專案說明
├── GOOGLE_API_INTEGRATION.md   # Google Cloud 與 OAuth 設定指南
├── FEATURE_SCRATCHPAD.md       # 閃念膠囊早期設計規格
└── backup_YYYYMMDD_HHMMSS/     # 重要修改前的時間戳備份
```

| 技術 | 用途 |
|---|---|
| HTML / CSS / Vanilla JavaScript | 無框架、無建置流程的純前端應用 |
| Google Identity Services | OAuth 2.0 瀏覽器授權 |
| Google Tasks API v1 | 讀取、新增、完成與編輯任務 |
| Google Calendar API v3 | 讀取行程與建立 Calendar Event |
| Google Drive API v3 | 使用 `appDataFolder` 保存應用資料 |
| Google Sheets API v4 | 唯讀取訂閱服務資料 |
| localStorage | 閃念、設定、Tasks 與訂閱資料快取 |
| IndexedDB | 閃念圖片的本機二進位檔案快取 |
| sessionStorage | Access Token 與 OAuth scope 版本 |
| Lucide Icons | 介面圖示 |

---

## Google Cloud 設定

在 [Google Cloud Console](https://console.cloud.google.com/) 中，為同一個專案啟用：

- Google Calendar API
- Google Tasks API
- Google Drive API
- Google Sheets API

OAuth scopes：

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/tasks
https://www.googleapis.com/auth/drive.appdata
https://www.googleapis.com/auth/spreadsheets.readonly
```

目前使用 Web OAuth Client。請將實際使用的來源加入「已授權的 JavaScript 來源」，例如：

```text
http://localhost:5500
http://127.0.0.1:5500
https://您的帳號.github.io
```

更完整的操作步驟請參考 [GOOGLE_API_INTEGRATION.md](./GOOGLE_API_INTEGRATION.md)。

---

## 本機使用

Google OAuth 不能直接從 `file://` 頁面正常運作，請使用本機 Web Server。

```powershell
cd "C:\path\to\minimal-dashboard"
python -m http.server 5500
```

若系統使用 Python Launcher：

```powershell
py -m http.server 5500
```

接著開啟：

```text
http://localhost:5500
```

PowerShell 視窗需要保持開啟；按 `Ctrl + C` 可停止伺服器。

---

## 部署到 GitHub Pages

1. 將 `index.html`、`style.css`、`app.js` 與說明文件上傳到 repository 根目錄。
2. 前往 `Settings > Pages`。
3. Source 選擇 `Deploy from a branch`。
4. Branch 選擇 `main`，Folder 選擇 `/ (root)`。
5. 在 OAuth Client 的「已授權的 JavaScript 來源」加入：

   ```text
   https://您的帳號.github.io
   ```

6. 等待 GitHub Pages 部署完成後，開啟：

   ```text
   https://您的帳號.github.io/minimal-dashboard/
   ```

發布後若仍看到舊版，可使用 `Ctrl + F5` 強制重新整理。

---

## 隱私與安全

- 本專案沒有自建後端或資料庫。
- Google 資料只在使用者完成 OAuth 授權後，由瀏覽器直接向 Google API 請求。
- 閃念與應用設定存放在使用者自己的 Google Drive App Data 隱藏空間；一般 Drive 介面不會顯示該檔案。
- 訂閱 Sheet 使用唯讀 scope，Dashboard 不會修改試算表。
- GitHub Pages 公開的是程式碼，不是使用者的 Google 資料。
- OAuth Client ID 可以出現在前端；Client Secret、服務帳號金鑰與其他私密憑證不得提交到 repository。
- Access Token 與到期時間只保存在 `sessionStorage`，失效後需要點擊 `RECONNECT` 重新取得短效權杖。
- 若 OAuth 應用仍為測試狀態，只有 Google Auth Platform 中設定的測試使用者可以登入。

---

## 已知限制

- Google Tasks API 只能寫入到期「日期」，不能讀寫原生到期時間。
- Google Tasks API 沒有開放建立原生重複規則，因此 Dashboard 不會假裝建立循環任務。
- 訂閱提醒目前只在開啟 Dashboard 時顯示，不會在網頁關閉後寄信或發送系統通知。
- Google Access Token 有效期限有限；純前端 OAuth 無法在無使用者操作時取得新權杖，過期後仍需點擊一次 `RECONNECT`。
- 靜態前端無法安全保存 Client Secret，也不應嘗試加入。

---

## 後續方向

- 訂閱提醒可選擇建立 Google Calendar 行程或由 Apps Script 寄送 Gmail 提醒。
- 閃念增加搜尋、封存與標籤。
- 增加極簡番茄鐘與環境音。
- 增加習慣追蹤與每日回顧。
- 加入同步衝突提示與更完整的離線狀態。
- 為主要資料流程補上自動化測試。

---

## 設計系統

| 角色 | 色彩 |
|---|---|
| 紙張背景 | `#f6f5f0` |
| 卡片背景 | `#fbfbfa` |
| 主要文字與邊框 | `#111111` |
| 次要文字 | `#6e6e6a` |
| 輔助文字 | `#a8a8a4` |
| 操作／警示強調色 | `#d0564f` |

字型：

- Sans-serif：Inter
- Serif：Playfair Display、Noto Serif TC

---

*設計理念受 Kontext.jp 啟發，致力於讓日常工作工具也保有紙張、時間與留白的溫度。*
