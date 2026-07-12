// Mock Google Calendar Data (Emojis removed, using clean text only)
const MOCK_EVENTS = [
  {
    id: 1,
    title: "朝晨正念與拉伸",
    start: "08:15",
    end: "09:00",
    type: "break"
  },
  {
    id: 2,
    title: "核心專案進度對齊會議",
    start: "09:30",
    end: "11:00",
    type: "task"
  },
  {
    id: 3,
    title: "下季度儀表板產品規劃",
    start: "11:15",
    end: "12:30",
    type: "planning"
  },
  {
    id: 4,
    title: "午餐 & 散步放鬆",
    start: "12:30",
    end: "13:30",
    type: "break"
  },
  {
    id: 5,
    title: "系統架構重構與程式碼編寫",
    start: "14:00",
    end: "16:30",
    type: "task"
  },
  {
    id: 6,
    title: "讀書會 / 技術文章研讀",
    start: "17:00",
    end: "18:00",
    type: "planning"
  },
  {
    id: 7,
    title: "慢跑 5 公里 / 核心訓練",
    start: "19:00",
    end: "20:00",
    type: "break"
  },
  {
    id: 8,
    title: "撰寫今日覆盤與明日規劃",
    start: "20:30",
    end: "21:30",
    type: "planning"
  }
];

// Google OAuth Settings
const CLIENT_ID = '207400675861-rdrar5tbitmjhouimpktvbpv4q80g4ct.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.appdata'
].join(' ');

// Storage Key for Google Token
const STORAGE_TOKEN_KEY = 'google_oauth_token';
const STORAGE_SCOPE_VERSION_KEY = 'google_oauth_scope_version';
const OAUTH_SCOPE_VERSION = 'calendar-write-v3';
const SCRATCHPAD_STORAGE_KEY = 'scratchpad_notes';
const SCRATCHPAD_DRIVE_FILE_NAME = 'scratchpad.json';

// Global variables for Google integration
let googleAccessToken = null;
let googleEvents = [];
let googleTaskLists = []; // Cache list IDs and names
let googleCalendarLists = []; // Cache calendar IDs and names
let scratchpadDriveFileId = null;
let scratchpadSyncTimer = null;
let scratchpadSyncInProgress = false;
let scratchpadSyncQueued = false;

// DOM Elements
const currentDateEl = document.getElementById('current-date');
const currentTimeTextEl = document.getElementById('current-time-text');
const greetingEl = document.getElementById('greeting');
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');
const todoCounter = document.getElementById('todo-counter');
const todoWarning = document.getElementById('todo-warning');
const timelineEvents = document.getElementById('timeline-events');
const timeSpineIndicator = document.getElementById('time-spine-indicator');
const spineTimeLabel = document.getElementById('spine-time-label');
const syncBtn = document.getElementById('sync-btn');

// State
let overdueTodos = [];
let todayTodos = [];
let backlogTodos = [];
let selectedBacklogTodoId = null;
let scratchpadNotes = [];
let overlayIsEditing = false;
let activeOverlayTodo = null;

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  initDateAndTime();
  initTodo();
  initTimeline();
  initDashboardTabs();
  initScratchpad();
  initGoogleAuth();
  initTodoAccordion();
  
  // Refresh interactive icon elements loaded via Lucide
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Update time indicator immediately and set interval for every 1 minute
  updateTimeIndicator();
  setInterval(() => {
    updateTimeIndicator();
    updateHeaderTime();
  }, 60000);

  // Bind Overlay Actions
  const detailOverlay = document.getElementById('detail-overlay');
  const overlayCloseBtn = document.getElementById('overlay-close-btn');
  const overlayEditBtn = document.getElementById('overlay-edit-btn');
  
  if (overlayCloseBtn && detailOverlay) {
    overlayCloseBtn.addEventListener('click', () => {
      // Exit edit mode if active before closing overlay
      if (overlayIsEditing) {
        toggleOverlayEditMode(false);
      }
      detailOverlay.classList.add('hidden');
    });
    // Click backdrop to close
    detailOverlay.addEventListener('click', (e) => {
      if (e.target === detailOverlay) {
        if (overlayIsEditing) {
          toggleOverlayEditMode(false);
        }
        detailOverlay.classList.add('hidden');
      }
    });
  }

  if (overlayEditBtn) {
    overlayEditBtn.addEventListener('click', () => {
      if (overlayIsEditing) {
        // Save action
        saveOverlayChanges();
      } else {
        // Enter edit mode action
        toggleOverlayEditMode(true);
      }
    });
  }
});

// Bind accordion click handlers
function initTodoAccordion() {
  const overdueTitle = document.getElementById('title-overdue');
  const overdueWrapper = document.getElementById('wrapper-overdue');

  if (overdueTitle && overdueWrapper) {
    overdueTitle.addEventListener('click', () => {
      overdueTitle.classList.toggle('active');
      overdueWrapper.classList.toggle('collapsed');
    });
  }

  const rerollButton = document.getElementById('backlog-reroll-btn');
  if (rerollButton) {
    rerollButton.addEventListener('click', () => {
      pickRandomBacklogTodo(true);
      renderTodos();
    });
  }
}

// Dashboard Tabs Handler (Global single column)
function initDashboardTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.dashboard-panel, .card-timeline');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      const target = button.getAttribute('data-target');
      panels.forEach(panel => {
        panel.classList.toggle('active-panel', panel.id === `panel-${target}`);
      });

      if (target === 'timeline') {
        // Recalculate after the timeline becomes visible on mobile.
        updateTimeIndicator();
      }
    });
  });
}

// Scratchpad / Flash Capsule (local-first, no Google sync required)
function initScratchpad() {
  const form = document.getElementById('scratchpad-form');
  const input = document.getElementById('scratchpad-input');
  const list = document.getElementById('scratchpad-list');
  const retryButton = document.getElementById('scratchpad-sync-retry');

  if (!form || !input || !list) return;

  try {
    const savedNotes = JSON.parse(localStorage.getItem(SCRATCHPAD_STORAGE_KEY) || '[]');
    scratchpadNotes = Array.isArray(savedNotes)
      ? savedNotes.map(normalizeScratchpadNote).filter(Boolean)
      : [];
  } catch (error) {
    console.warn('Unable to read saved scratchpad notes:', error);
    scratchpadNotes = [];
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    addScratchpadNote(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  list.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-action="delete-scratchpad-note"]');
    if (deleteButton) {
      const deletedAt = new Date().toISOString();
      scratchpadNotes = scratchpadNotes.map(note => note.id === deleteButton.dataset.noteId
        ? { ...note, updatedAt: deletedAt, deletedAt }
        : note);
      saveScratchpadNotes();
      renderScratchpadNotes();
      scheduleScratchpadDriveSync();
      return;
    }

    const convertButton = event.target.closest('[data-action="convert-scratchpad-note"]');
    if (convertButton) {
      if (!googleAccessToken) {
        document.getElementById('scratchpad-auth-notice')?.classList.remove('hidden');
        authenticateWithGoogle();
        return;
      }
      openScratchpadConvertPanel(convertButton.dataset.noteId, convertButton.dataset.convertType);
      return;
    }

    const cancelButton = event.target.closest('[data-action="cancel-scratchpad-convert"]');
    if (cancelButton) {
      cancelButton.closest('.scratchpad-convert-panel')?.remove();
    }
  });

  list.addEventListener('submit', (event) => {
    const convertForm = event.target.closest('.scratchpad-convert-panel');
    if (!convertForm) return;
    event.preventDefault();
    submitScratchpadConversion(convertForm);
  });

  if (retryButton) {
    retryButton.addEventListener('click', () => {
      if (!googleAccessToken) {
        authenticateWithGoogle();
        return;
      }
      syncScratchpadWithDrive().catch(error => {
        console.error('Manual scratchpad sync failed:', error);
      });
    });
  }

  renderScratchpadNotes();
  updateScratchpadSyncStatus(googleAccessToken ? 'syncing' : 'local');
}

function addScratchpadNote(rawText) {
  const input = document.getElementById('scratchpad-input');
  const text = rawText.trim();
  if (!text) return;

  scratchpadNotes.unshift({
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    convertedTo: null,
    conversions: []
  });

  saveScratchpadNotes();
  renderScratchpadNotes();
  input.value = '';
  input.focus();
  scheduleScratchpadDriveSync();
}

function saveScratchpadNotes() {
  localStorage.setItem(SCRATCHPAD_STORAGE_KEY, JSON.stringify(scratchpadNotes));
}

function renderScratchpadNotes() {
  const list = document.getElementById('scratchpad-list');
  const emptyState = document.getElementById('scratchpad-empty');
  if (!list || !emptyState) return;

  list.innerHTML = '';
  const visibleNotes = scratchpadNotes.filter(note => !note.deletedAt);
  emptyState.classList.toggle('hidden', visibleNotes.length > 0);

  visibleNotes
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach(note => {
    const noteElement = document.createElement('article');
    noteElement.className = 'scratchpad-note';
    noteElement.dataset.noteId = note.id;

    const row = document.createElement('div');
    row.className = 'scratchpad-note-row';

    const content = document.createElement('div');
    content.className = 'scratchpad-note-content';

    const textElement = document.createElement('div');
    textElement.className = 'scratchpad-note-text';
    textElement.textContent = note.text;
    content.appendChild(textElement);

    if (note.conversions.length > 0) {
      const conversionMeta = document.createElement('div');
      conversionMeta.className = 'scratchpad-conversion-meta';
      note.conversions.forEach(conversion => {
        const link = document.createElement('a');
        link.href = conversion.url || '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = conversion.type === 'task' ? '已加入 Tasks ↗' : '已加入 Calendar ↗';
        if (!conversion.url) link.removeAttribute('href');
        conversionMeta.appendChild(link);
      });
      content.appendChild(conversionMeta);
    }

    const actions = document.createElement('div');
    actions.className = 'scratchpad-note-actions';

    const taskButton = createScratchpadActionButton({
      noteId: note.id,
      type: 'task',
      icon: 'list-checks',
      label: '加入 Google Tasks',
      disabled: note.conversions.some(conversion => conversion.type === 'task')
    });

    const calendarButton = createScratchpadActionButton({
      noteId: note.id,
      type: 'calendar',
      icon: 'calendar-plus',
      label: '加入 Google Calendar',
      disabled: note.conversions.some(conversion => conversion.type === 'calendar')
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'scratchpad-action-btn btn-delete';
    deleteButton.dataset.action = 'delete-scratchpad-note';
    deleteButton.dataset.noteId = note.id;
    deleteButton.setAttribute('aria-label', '刪除閃念');
    deleteButton.title = '刪除';
    deleteButton.innerHTML = '<i data-lucide="trash-2"></i>';

    actions.append(taskButton, calendarButton, deleteButton);
    row.append(content, actions);
    noteElement.appendChild(row);
    list.appendChild(noteElement);
    });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function createScratchpadActionButton({ noteId, type, icon, label, disabled }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scratchpad-action-btn';
  button.dataset.action = 'convert-scratchpad-note';
  button.dataset.noteId = noteId;
  button.dataset.convertType = type;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = disabled;
  button.innerHTML = `<i data-lucide="${icon}"></i>`;
  return button;
}

function openScratchpadConvertPanel(noteId, type) {
  document.querySelectorAll('.scratchpad-convert-panel').forEach(panel => panel.remove());
  const note = scratchpadNotes.find(item => item.id === noteId && !item.deletedAt);
  const noteElement = document.querySelector(`.scratchpad-note[data-note-id="${CSS.escape(noteId)}"]`);
  if (!note || !noteElement) return;

  const today = formatLocalDateInput(new Date());
  const panel = document.createElement('form');
  panel.className = 'scratchpad-convert-panel';
  panel.dataset.noteId = noteId;
  panel.dataset.convertType = type;

  if (type === 'task') {
    const taskLists = googleTaskLists.length > 0
      ? googleTaskLists
      : [{ id: '@default', title: 'My Tasks' }];
    panel.innerHTML = `
      <div class="convert-panel-type"><i data-lucide="list-checks"></i>轉成 Google Task</div>
      <div class="convert-field"><label>任務名稱</label><input name="title" value="${escapeHtml(note.text)}" required></div>
      <div class="convert-field"><label>到期日（選填）</label><input name="date" type="date" value=""></div>
      <div class="convert-field"><label>任務清單</label><select name="destination">${taskLists.map(list => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.title)}</option>`).join('')}</select></div>
      <div class="convert-panel-actions">
        <button class="convert-cancel-btn" data-action="cancel-scratchpad-convert" type="button">取消</button>
        <button class="convert-confirm-btn" type="submit">加入 Tasks</button>
      </div>`;
  } else {
    const writableCalendars = googleCalendarLists.filter(calendar =>
      calendar.accessRole === 'owner' || calendar.accessRole === 'writer'
    );
    const calendars = writableCalendars.length > 0
      ? writableCalendars
      : [{ id: 'primary', summary: '主要日曆' }];
    const startHour = String(Math.min(22, new Date().getHours() + 1)).padStart(2, '0');
    const endHour = String(Math.min(23, Number(startHour) + 1)).padStart(2, '0');
    panel.innerHTML = `
      <div class="convert-panel-type"><i data-lucide="calendar-plus"></i>轉成 Google Calendar 行程</div>
      <div class="convert-field"><label>行程名稱</label><input name="title" value="${escapeHtml(note.text)}" required></div>
      <div class="convert-field"><label>日期</label><input name="date" type="date" value="${today}" required></div>
      <div class="convert-time-row">
        <div class="convert-field"><label>開始</label><input name="startTime" type="time" value="${startHour}:00" required></div>
        <div class="convert-field"><label>結束</label><input name="endTime" type="time" value="${endHour}:00" required></div>
      </div>
      <div class="convert-field"><label>地址（選填）</label><input name="location" type="text" placeholder="加入地點或地址"></div>
      <div class="convert-field"><label>詳細資訊（選填）</label><textarea name="description" rows="3" placeholder="加入說明、連結或備註">${escapeHtml(note.text)}</textarea></div>
      <div class="convert-field"><label>日曆</label><select name="destination">${calendars.map(calendar => `<option value="${escapeHtml(calendar.id)}">${escapeHtml(calendar.summary)}</option>`).join('')}</select></div>
      <div class="convert-panel-actions">
        <button class="convert-cancel-btn" data-action="cancel-scratchpad-convert" type="button">取消</button>
        <button class="convert-confirm-btn" type="submit">加入 Calendar</button>
      </div>`;
  }

  noteElement.appendChild(panel);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function submitScratchpadConversion(form) {
  if (!googleAccessToken) {
    authenticateWithGoogle();
    return;
  }

  const note = scratchpadNotes.find(item => item.id === form.dataset.noteId);
  if (!note) return;
  const type = form.dataset.convertType;
  const title = form.elements.namedItem('title').value.trim();
  const date = form.elements.namedItem('date').value;
  const destination = form.elements.namedItem('destination').value;
  const submitButton = form.querySelector('.convert-confirm-btn');
  if (!title || !destination || !submitButton) return;

  submitButton.disabled = true;
  submitButton.textContent = '處理中…';
  form.closest('.scratchpad-note')?.classList.add('sending');

  try {
    let conversion;
    if (type === 'task') {
      const taskPayload = {
        title,
        notes: `來自閃念膠囊：${note.text}`
      };
      if (date) {
        taskPayload.due = new Date(`${date}T00:00:00`).toISOString();
      }
      const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${encodeURIComponent(destination)}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskPayload)
      });
      await throwForGoogleApiError(response, 'Unable to create Google Task');
      const task = await response.json();
      conversion = {
        type: 'task',
        id: task.id,
        url: task.webViewLink || 'https://calendar.google.com/calendar/u/0/r/week?sidebar=tasks',
        convertedAt: new Date().toISOString()
      };
    } else {
      const startTime = form.elements.namedItem('startTime').value;
      const endTime = form.elements.namedItem('endTime').value;
      const location = form.elements.namedItem('location').value.trim();
      const description = form.elements.namedItem('description').value.trim();
      const start = new Date(`${date}T${startTime}:00`);
      let end = new Date(`${date}T${endTime}:00`);
      if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);

      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(destination)}/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: title,
          description,
          location,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() }
        })
      });
      await throwForGoogleApiError(response, 'Unable to create Google Calendar event');
      const event = await response.json();
      conversion = {
        type: 'calendar',
        id: event.id,
        url: event.htmlLink || '',
        convertedAt: new Date().toISOString()
      };
    }

    const updatedAt = new Date().toISOString();
    scratchpadNotes = scratchpadNotes.map(item => item.id === note.id
      ? { ...item, updatedAt, conversions: [...item.conversions, conversion] }
      : item);
    saveScratchpadNotes();
    renderScratchpadNotes();
    scheduleScratchpadDriveSync();
  } catch (error) {
    console.error('Scratchpad conversion failed:', error);
    submitButton.disabled = false;
    submitButton.textContent = type === 'task' ? '加入 Tasks' : '加入 Calendar';
    form.closest('.scratchpad-note')?.classList.remove('sending');
    alert(type === 'task' ? '無法加入 Google Tasks，請稍後重試。' : '無法加入 Google Calendar，請稍後重試。');
  }
}

function formatLocalDateInput(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeScratchpadNote(note) {
  if (!note || typeof note !== 'object' || !note.id || typeof note.text !== 'string') {
    return null;
  }

  const createdAt = note.createdAt || new Date().toISOString();
  return {
    id: String(note.id),
    text: note.text,
    createdAt,
    updatedAt: note.updatedAt || createdAt,
    deletedAt: note.deletedAt || null,
    convertedTo: note.convertedTo || null,
    conversions: Array.isArray(note.conversions)
      ? note.conversions
      : (note.convertedTo ? [note.convertedTo] : [])
  };
}

function mergeScratchpadNotes(localNotes, remoteNotes) {
  const mergedById = new Map();

  [...localNotes, ...remoteNotes]
    .map(normalizeScratchpadNote)
    .filter(Boolean)
    .forEach(note => {
      const existing = mergedById.get(note.id);
      const noteUpdatedAt = new Date(note.updatedAt).getTime();
      const existingUpdatedAt = existing ? new Date(existing.updatedAt).getTime() : -1;
      if (!existing || noteUpdatedAt >= existingUpdatedAt) {
        mergedById.set(note.id, note);
      }
    });

  return Array.from(mergedById.values());
}

function scheduleScratchpadDriveSync() {
  if (!googleAccessToken) {
    updateScratchpadSyncStatus('local');
    return;
  }
  updateScratchpadSyncStatus('syncing');
  clearTimeout(scratchpadSyncTimer);
  scratchpadSyncTimer = setTimeout(() => syncScratchpadWithDrive().catch(error => {
    console.error('Background scratchpad sync failed:', error);
  }), 700);
}

async function syncScratchpadWithDrive() {
  if (!googleAccessToken) {
    updateScratchpadSyncStatus('local');
    return;
  }

  if (scratchpadSyncInProgress) {
    scratchpadSyncQueued = true;
    return;
  }

  scratchpadSyncInProgress = true;
  updateScratchpadSyncStatus('syncing');
  try {
    if (!scratchpadDriveFileId) {
      scratchpadDriveFileId = await findScratchpadDriveFile();
    }

    let remoteNotes = [];
    if (scratchpadDriveFileId) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(scratchpadDriveFileId)}?alt=media`,
        { headers: { 'Authorization': `Bearer ${googleAccessToken}` } }
      );
      await throwForGoogleApiError(response, 'Unable to download scratchpad data');
      const payload = await response.json();
      remoteNotes = Array.isArray(payload) ? payload : (payload.notes || []);
    }

    scratchpadNotes = mergeScratchpadNotes(scratchpadNotes, remoteNotes);
    saveScratchpadNotes();
    renderScratchpadNotes();
    scratchpadDriveFileId = await uploadScratchpadToDrive(scratchpadDriveFileId);
    updateScratchpadSyncStatus('synced', new Date());
  } catch (error) {
    updateScratchpadSyncStatus('error');
    throw error;
  } finally {
    scratchpadSyncInProgress = false;
    if (scratchpadSyncQueued) {
      scratchpadSyncQueued = false;
      scheduleScratchpadDriveSync();
    }
  }
}

function updateScratchpadSyncStatus(state, syncedAt = null) {
  const status = document.getElementById('scratchpad-sync-status');
  const text = document.getElementById('scratchpad-sync-text');
  const retryButton = document.getElementById('scratchpad-sync-retry');
  if (!status || !text || !retryButton) return;

  const labels = {
    local: '僅本機',
    syncing: '正在同步…',
    error: '同步失敗'
  };

  status.dataset.state = state;
  if (state === 'synced' && syncedAt) {
    text.textContent = `已同步至 Google Drive · ${syncedAt.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}`;
  } else {
    text.textContent = labels[state] || labels.local;
  }
  retryButton.classList.toggle('hidden', state !== 'error');
}

async function findScratchpadDriveFile() {
  const query = encodeURIComponent(`name = '${SCRATCHPAD_DRIVE_FILE_NAME}' and 'appDataFolder' in parents`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id,name,modifiedTime)`,
    { headers: { 'Authorization': `Bearer ${googleAccessToken}` } }
  );
  await throwForGoogleApiError(response, 'Unable to find scratchpad data');
  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function uploadScratchpadToDrive(fileId) {
  const metadata = fileId
    ? { name: SCRATCHPAD_DRIVE_FILE_NAME }
    : { name: SCRATCHPAD_DRIVE_FILE_NAME, parents: ['appDataFolder'] };
  const fileContent = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    notes: scratchpadNotes
  });
  const boundary = `scratchpad_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    fileContent,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const endpoint = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const response = await fetch(endpoint, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });
  await throwForGoogleApiError(response, 'Unable to upload scratchpad data');
  const data = await response.json();
  return data.id;
}

async function throwForGoogleApiError(response, message) {
  if (response.ok) return;
  const error = new Error(`${message} (${response.status})`);
  error.status = response.status;
  throw error;
}

// 1. Date and Time Init
function initDateAndTime() {
  const now = new Date();
  
  // Format Date to a clean editorial dot separated Chinese style (e.g., 2026 . 07 . 10 / 五)
  const weekdaysChinese = ["日", "一", "二", "三", "四", "五", "六"];
  
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dayName = weekdaysChinese[now.getDay()];
  
  currentDateEl.innerHTML = `${yyyy} . ${mm} . ${dd} / <span class="header-day-chinese">${dayName}</span>`;
  
  // Curated list of Zen/Minimal Focus and warm literary/movie-like quotes to randomly display (Optimized for short single line)
  const focusQuotes = [
    "少，但是更好。 / LESS, BUT BETTER.",
    "心無旁騖，純粹前行。 / STAY FOCUS.",
    "專注當下，日拱一卒。 / HERE AND NOW.",
    "簡約是把雜訊降到最低。 / SILENT MIND.",
    "做好手頭這一件事。 / ONE TASK.",
    "靜水流深，行穩致遠。 / FLOW DEEP.",
    "心有所定，萬物不侵。 / STAY CENTERED.",
    "你所謂的歲月靜好，不過是有人替你負重前行。 / SILENT SACRIFICE.",
    "願你在平淡日常，看見深刻溫柔。 / FIND WARMTH.",
    "慢下來，聽聽時間的聲音。 / SLOW FLOW.",
    "給自己留一處純粹的偏安。 / STAY CALM.",
    "所有日常，都有人在替你擋雨。 / SHIELD THE RAIN.",
    "既隨遇而安，也默默堅持。 / STAY RESILIENT.",
    "最珍貴的日常，藏在微小瞬間。 / GOLDEN MOMENTS.",
    "慢慢走，風景都是生活的饋贈。 / SLOW JOURNEY.",
    "有熱湯，有夢想，也有力量。 / HEAT AND DREAMS.",
    "平凡的今天，就是最好的致敬。 / CHERISH TODAY."
  ];
  
  // Pick a random quote
  const randomIndex = Math.floor(Math.random() * focusQuotes.length);
  greetingEl.textContent = focusQuotes[randomIndex];

  updateHeaderTime();
}

function updateHeaderTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  currentTimeTextEl.textContent = `${hours}:${minutes}`;
}

// 2. Google OAuth 2.0 Integration
let tokenClient;

// Global Timeline Scale configuration parameters for Scheme B
let timelineStartMin = 540; // 09:00 default
let timelineDurationMins = 860; // 09:00 to 23:20 default
const TIMELINE_HEIGHT = 700; // 700px physical scale ruler height

function initGoogleAuth() {
  // Check if we already have a token stored in session storage (lasts until tab close)
  const savedToken = sessionStorage.getItem(STORAGE_TOKEN_KEY);
  const savedScopeVersion = sessionStorage.getItem(STORAGE_SCOPE_VERSION_KEY);
  if (savedToken && savedScopeVersion === OAUTH_SCOPE_VERSION) {
    googleAccessToken = savedToken;
    updateSyncButtonState('synced');
    syncGoogleData();
  } else if (savedToken) {
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_SCOPE_VERSION_KEY);
  }

  // Bind click event to Sync button
  syncBtn.addEventListener('click', () => {
    if (googleAccessToken) {
      // If already synced, click forces a data reload
      syncGoogleData();
    } else {
      authenticateWithGoogle();
    }
  });
}

function authenticateWithGoogle() {
  updateSyncButtonState('syncing');
  
  try {
    if (typeof google === 'undefined') {
      alert("Google SDK 尚未載入完成，請確認網路連線或重新整理頁面。");
      updateSyncButtonState('idle');
      return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          console.error("Google Auth Error: ", tokenResponse);
          updateSyncButtonState('idle');
          return;
        }
        
        // Save token to session and global state
        googleAccessToken = tokenResponse.access_token;
        sessionStorage.setItem(STORAGE_TOKEN_KEY, googleAccessToken);
        sessionStorage.setItem(STORAGE_SCOPE_VERSION_KEY, OAUTH_SCOPE_VERSION);
        document.getElementById('scratchpad-auth-notice')?.classList.add('hidden');
        
        updateSyncButtonState('synced');
        syncGoogleData();
      },
      error_callback: (err) => {
        console.error("Google Auth Init Error: ", err);
        updateSyncButtonState('idle');
      }
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (err) {
    console.error("Authentication trigger failed: ", err);
    updateSyncButtonState('idle');
  }
}

function updateSyncButtonState(state) {
  if (state === 'syncing') {
    syncBtn.className = 'sync-btn syncing';
    syncBtn.innerHTML = `<span>SYNCING...</span><span class="slash"> /</span>`;
    syncBtn.disabled = true;
  } else if (state === 'synced') {
    syncBtn.className = 'sync-btn synced';
    syncBtn.innerHTML = `<span>SYNCED</span><span class="slash"> /</span>`;
    syncBtn.disabled = false;
  } else {
    syncBtn.className = 'sync-btn';
    syncBtn.innerHTML = `<span>SYNC</span><span class="slash"> /</span>`;
    syncBtn.disabled = false;
  }
}

// Global data synchronization coordinator
async function syncGoogleData() {
  if (!googleAccessToken) return;
  document.getElementById('scratchpad-auth-notice')?.classList.add('hidden');
  updateSyncButtonState('syncing');
  
  // Decouple task and calendar synchronization to prevent one failing service from crashing the other
  try {
    await syncAllGoogleTasks();
  } catch (err) {
    console.error("Syncing Google Tasks failed: ", err);
    if (err.status === 401) {
      handleAuthExpired();
      return;
    }
  }

  try {
    await syncAllGoogleCalendars();
  } catch (err) {
    console.error("Syncing Google Calendars failed: ", err);
    if (err.status === 401) {
      handleAuthExpired();
      return;
    }
  }

  try {
    await syncScratchpadWithDrive();
  } catch (err) {
    console.error('Syncing scratchpad with Google Drive failed:', err);
    if (err.status === 401) {
      handleAuthExpired();
      return;
    }
  }

  updateSyncButtonState('synced');
}

function handleAuthExpired() {
  googleAccessToken = null;
  scratchpadDriveFileId = null;
  sessionStorage.removeItem(STORAGE_TOKEN_KEY);
  sessionStorage.removeItem(STORAGE_SCOPE_VERSION_KEY);
  updateSyncButtonState('idle');
  updateScratchpadSyncStatus('local');
  document.getElementById('scratchpad-auth-notice')?.classList.remove('hidden');
}

// Helper to determine if a date string is in the past (overdue)
function isOverdue(dueStr) {
  if (!dueStr) return false;
  const due = new Date(dueStr);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return due.getTime() < todayStart.getTime();
}

// Helper to determine if a date string is today
function isToday(dueStr) {
  if (!dueStr) return false;
  const due = new Date(dueStr);
  const today = new Date();
  return due.getFullYear() === today.getFullYear() &&
         due.getMonth() === today.getMonth() &&
         due.getDate() === today.getDate();
}

// 3. Multi-TaskList Explorer & Google Tasks API
function initTodo() {
  if (!googleAccessToken) {
    const savedOverdue = localStorage.getItem('overdue_todos');
    const savedToday = localStorage.getItem('today_todos');
    const savedBacklog = localStorage.getItem('backlog_todos');

    overdueTodos = savedOverdue ? JSON.parse(savedOverdue) : [];
    todayTodos = savedToday ? JSON.parse(savedToday) : [
      { id: 'mock-1', text: "點擊頂部 SYNC 串接您的 Google Tasks", listId: '@default', completed: false, taskLink: 'https://calendar.google.com/calendar/u/0/r/week?sidebar=tasks' }
    ];
    backlogTodos = savedBacklog ? JSON.parse(savedBacklog) : [];
    
    renderTodos();
  }

  todoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;

    // Today's focus is limited to 3
    if (todayTodos.length >= 3) {
      showWarning();
      return;
    }

    const targetListId = googleTaskLists.length > 0 ? googleTaskLists[0].id : '@default';

    const newTodo = {
      id: Date.now().toString(),
      text,
      listId: targetListId,
      notes: '', // Initialize empty notes to prevent hasNotes check issues
      taskLink: 'https://calendar.google.com/calendar/u/0/r/week?sidebar=tasks', // Fallback link
      completed: false
    };

    todayTodos.push(newTodo);
    todoInput.value = '';
    hideWarning();
    renderTodos();
    saveTodosLocal();

    if (googleAccessToken) {
      try {
        const todayStr = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'; // Set due date to today
        const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${targetListId}/tasks`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: text,
            status: 'needsAction',
            due: todayStr
          })
        });
        
        if (!response.ok) throw new Error("Failed to insert task on Google.");
        
        const taskData = await response.json();
        todayTodos = todayTodos.map(t => t.id === newTodo.id ? { ...t, id: taskData.id } : t);
        saveTodosLocal();
      } catch (err) {
        console.error("Google Task push failed: ", err);
      }
    }
  });
}

// Fetch all TaskLists and categorise tasks by due date
async function syncAllGoogleTasks() {
  try {
    const listResponse = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    
    if (listResponse.status === 401) {
      handleAuthExpired();
      const err = new Error("Unauthorized (401)");
      err.status = 401;
      throw err;
    }
    if (!listResponse.ok) throw new Error("Fetch TaskLists Failed");
    
    const listsData = await listResponse.json();
    googleTaskLists = listsData.items || [];
    
    if (googleTaskLists.length === 0) {
      overdueTodos = [];
      todayTodos = [];
      backlogTodos = [];
      renderTodos();
      return;
    }

    let allFetchedTasks = [];
    
    const taskFetchPromises = googleTaskLists.map(async (list) => {
      try {
        // Fetch every page of unfinished tasks so the random pool is complete.
        let pageToken = null;
        do {
          const params = new URLSearchParams({
            showCompleted: 'false',
            showDeleted: 'false',
            showHidden: 'false',
            maxResults: '100'
          });
          if (pageToken) params.set('pageToken', pageToken);

          const tasksRes = await fetch(`https://www.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?${params}`, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
          });
          if (!tasksRes.ok) return;

          const tasksData = await tasksRes.json();
          const items = tasksData.items || [];
          items.forEach(task => {
            if (task.title && task.title.trim() !== '') {
              const taskLink = task.links && task.links.length > 0
                ? task.links[0].link
                : 'https://calendar.google.com/calendar/u/0/r/week?sidebar=tasks';

              allFetchedTasks.push({
                id: task.id,
                text: task.title,
                listId: list.id,
                listName: list.title,
                completed: false,
                due: task.due,
                notes: task.notes || '',
                taskLink,
                updated: new Date(task.updated || 0).getTime()
              });
            }
          });
          pageToken = tasksData.nextPageToken || null;
        } while (pageToken);
      } catch (e) {
        console.error(`Error loading tasks from list ${list.title}:`, e);
      }
    });

    await Promise.all(taskFetchPromises);

    // Classify
    const overdueList = [];
    const todayList = [];
    const backlogList = [];

    allFetchedTasks.forEach(task => {
      if (!task.due) {
        backlogList.push(task);
      } else if (isOverdue(task.due)) {
        overdueList.push(task);
      } else if (isToday(task.due)) {
        todayList.push(task);
      }
    });

    // Today Focus is limited to 3 items
    todayList.sort((a, b) => b.updated - a.updated);
    overdueList.sort((a, b) => b.updated - a.updated);
    backlogList.sort((a, b) => b.updated - a.updated);

    todayTodos = todayList.slice(0, 3);
    overdueTodos = overdueList;
    backlogTodos = backlogList;
    
    saveTodosLocal();
    renderTodos();
  } catch (err) {
    console.error("syncAllGoogleTasks failed: ", err);
    throw err;
  }
}

function renderTodos() {
  const containerOverdueSection = document.getElementById('todo-section-overdue');
  const listOverdue = document.getElementById('todo-list-overdue');
  const listToday = document.getElementById('todo-list');
  const containerBacklogSection = document.getElementById('todo-section-backlog');
  const listBacklog = document.getElementById('todo-list-backlog');
  const backlogCount = document.getElementById('backlog-count');

  // Render Overdue Section
  listOverdue.innerHTML = '';
  if (overdueTodos.length > 0) {
    containerOverdueSection.classList.remove('hidden');
    overdueTodos.forEach(todo => {
      const li = createTodoListItem(todo, 'overdue');
      listOverdue.appendChild(li);
    });
  } else {
    containerOverdueSection.classList.add('hidden');
  }

  // Render Today
  listToday.innerHTML = '';
  if (todayTodos.length > 0) {
    todayTodos.forEach(todo => {
      const li = createTodoListItem(todo, 'today');
      listToday.appendChild(li);
    });
  } else {
    listToday.innerHTML = `<li style="font-size:0.85rem; color:var(--text-secondary); text-align:center; padding: 24px 0;">NO FOCUS ITEMS TODAY /</li>`;
  }

  // Render one stable random task without a due date.
  const selectedBacklogTodo = pickRandomBacklogTodo(false);
  listBacklog.innerHTML = '';
  if (selectedBacklogTodo) {
    containerBacklogSection.classList.remove('hidden');
    backlogCount.textContent = `/ ${backlogTodos.length} 個候選`;
    listBacklog.appendChild(createTodoListItem(selectedBacklogTodo, 'backlog'));
  } else {
    containerBacklogSection.classList.add('hidden');
    backlogCount.textContent = '';
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function pickRandomBacklogTodo(forceNew = false) {
  const candidates = backlogTodos.filter(todo => !todo.completed);
  if (candidates.length === 0) {
    selectedBacklogTodoId = null;
    return null;
  }

  const current = candidates.find(todo => todo.id === selectedBacklogTodoId);
  if (current && !forceNew) return current;

  const pool = forceNew && candidates.length > 1
    ? candidates.filter(todo => todo.id !== selectedBacklogTodoId)
    : candidates;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  selectedBacklogTodoId = selected.id;
  return selected;
}

function createTodoListItem(todo, sectionClass) {
  const li = document.createElement('li');
  li.className = `todo-item ${sectionClass} ${todo.completed ? 'completed' : ''}`;
  
  const checkIcon = todo.completed ? '<i data-lucide="check" style="display:block;"></i>' : '<i data-lucide="check"></i>';
  const listLabel = todo.listName ? `<span class="todo-list-tag">[${escapeHtml(todo.listName)}]</span> ` : '';
  const cleanText = truncateString(todo.text, 36);

  // Render native origin link icon button if it exists
  const linkBtnHtml = todo.taskLink ? `
    <a href="${todo.taskLink}" target="_blank" class="todo-link-btn" onclick="event.stopPropagation();" aria-label="打開來源連結">
      <i data-lucide="external-link"></i>
    </a>
  ` : '';

  // Store whole serialized todo dataset as an attribute for clean popups
  li.setAttribute('data-todo-json', JSON.stringify(todo));

  li.innerHTML = `
    <!-- Row 1: Controllers and Text (Perfect alignment column check) -->
    <div class="todo-item-main-row">
      <div class="todo-item-left" onclick="showEditorialOverlay(this)">
        <div class="todo-checkbox" onclick="event.stopPropagation(); toggleTodo('${todo.id}', '${todo.listId}', '${sectionClass}')">
          ${checkIcon}
        </div>
        <div class="todo-item-content">
          <span class="todo-text">${listLabel}${escapeHtml(cleanText)}</span>
        </div>
      </div>
      <div class="todo-item-right-controls">
        ${linkBtnHtml}
      </div>
    </div>
  `;
  return li;
}

// Kontext.jp Editorial Overlay Popup Builder for Google Calendar Events (Read-only)
function showCalendarEventOverlay(eventId) {
  const event = googleEvents.find(e => e.id === eventId);
  if (!event) {
    console.warn(`Calendar event with ID [${eventId}] not found in cache.`);
    return;
  }
  
  try {
    // Bind overlay DOM components
    const overlay = document.getElementById('detail-overlay');
    const metaList = document.getElementById('overlay-meta-list');
    const metaDate = document.getElementById('overlay-meta-date');
    const titleText = document.getElementById('overlay-title-text');
    const bodyContent = document.getElementById('overlay-body-content');
    const tagsContainer = document.getElementById('overlay-tags-container');
    const linkBtn = document.getElementById('overlay-link-btn');
    const editBtn = document.getElementById('overlay-edit-btn');

    // 1. Populate metadata
    metaList.textContent = (event.calendarName || "CALENDAR").toUpperCase();
    
    // 2. Populate date / time span
    metaDate.textContent = `${event.start} - ${event.end}`;

    // 3. Populate title
    titleText.textContent = event.title;

    // 4. Populate description, location and creator details (Concatenated strictly in single lines to bypass pre-wrap newlines)
    let detailsHtml = '';
    
    // If location or creator displayName is present, construct a metadata block
    if (event.location || event.creator) {
      detailsHtml += `<div class="overlay-calendar-details" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px dashed var(--border-color); display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; white-space: normal;">`;
      if (event.location) {
        detailsHtml += `<div style="display: flex; align-items: flex-start; gap: 10px;"><svg style="width: 14px; height: 14px; margin-top: 3px; flex-shrink: 0; color: var(--text-secondary);" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3"></circle></svg><span style="font-weight: 500; color: var(--text-primary);">${escapeHtml(event.location)}</span></div>`;
      }
      if (event.creator) {
        detailsHtml += `<div style="display: flex; align-items: center; gap: 10px;"><svg style="width: 14px; height: 14px; flex-shrink: 0; color: var(--text-secondary);" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span>建立者：<span style="color: var(--text-primary); font-weight: 500;">${escapeHtml(event.creator)}</span></span></div>`;
      }
      detailsHtml += `</div>`;
    }
    
    // Append description notes content
    const cleanedDesc = cleanHtmlDescription(event.description);
    if (cleanedDesc !== '') {
      detailsHtml += `<div style="line-height: 1.6; white-space: pre-wrap;">${cleanedDesc}</div>`;
    } else if (!event.location && !event.creator) {
      // Display blank info notice if event description/details are completely empty
      detailsHtml += '<span style="color:var(--text-secondary); font-style:italic;">此行程沒有說明內容。</span>';
    }
    
    bodyContent.innerHTML = detailsHtml;
    bodyContent.style.display = 'block';

    // 5. Detect and populate hashtags from body content or title (like #SGF)
    const combinedText = `${event.title} ${event.description || ''}`;
    const hashtagPattern = /(#[a-zA-Z0-9\u4e00-\u9fa5_]+)/g;
    const foundTags = combinedText.match(hashtagPattern);
    
    if (foundTags && foundTags.length > 0) {
      const uniqueTags = [...new Set(foundTags)];
      tagsContainer.textContent = uniqueTags.join(', ');
      tagsContainer.style.display = 'block';
    } else {
      tagsContainer.textContent = '';
      tagsContainer.style.display = 'none';
    }

    // 6. Bind External Google Link (points to the specific calendar event)
    if (event.htmlLink) {
      linkBtn.href = event.htmlLink;
      linkBtn.style.display = 'inline-flex';
    } else {
      linkBtn.style.display = 'none';
    }

    // 7. Prevent Calendar edit mode (Calendar items are read-only in this UI)
    activeOverlayTodo = null; // Clear active todo to prevent edit mode saving
    overlayIsEditing = false;
    editBtn.style.display = 'none'; // Hide the Edit button completely

    // Show overlay modal smoothly
    overlay.classList.remove('hidden');
  } catch (err) {
    console.error("Failed to render calendar event data for detail overlay:", err);
  }
}

// Kontext.jp Editorial Overlay Popup Builder for Tasks
function showEditorialOverlay(element) {
  const item = element.closest('.todo-item');
  if (!item) return;
  
  const todoDataRaw = item.getAttribute('data-todo-json');
  if (!todoDataRaw) return;
  
  try {
    const todo = JSON.parse(todoDataRaw);
    
    // Bind overlay DOM components
    const overlay = document.getElementById('detail-overlay');
    const metaList = document.getElementById('overlay-meta-list');
    const metaDate = document.getElementById('overlay-meta-date');
    const titleText = document.getElementById('overlay-title-text');
    const bodyContent = document.getElementById('overlay-body-content');
    const tagsContainer = document.getElementById('overlay-tags-container');
    const linkBtn = document.getElementById('overlay-link-btn');
    const editBtn = document.getElementById('overlay-edit-btn');

    // Ensure the Edit button is visible for Tasks
    editBtn.style.display = 'inline-flex';

    // 1. Populate metadata (List Name + Custom Folder corners styling)
    metaList.textContent = (todo.listName || "TASKS").toUpperCase();
    
    // 2. Populate date
    if (todo.due) {
      const d = new Date(todo.due);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      metaDate.textContent = `${yyyy}.${mm}.${dd}`;
    } else {
      metaDate.textContent = "MEMO";
    }

    // 3. Populate title
    titleText.textContent = todo.text;

    // 4. Populate Notes Body and convert URLs to anchors
    if (todo.notes && todo.notes.trim() !== '') {
      // Escape HTML first
      let cleanNotes = escapeHtml(todo.notes);
      // Regex pattern to extract URLs
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      cleanNotes = cleanNotes.replace(urlPattern, '<a href="$1" target="_blank">$1</a>');
      bodyContent.innerHTML = cleanNotes;
      bodyContent.style.display = 'block';
    } else {
      bodyContent.innerHTML = '';
      bodyContent.style.display = 'none';
    }

    // 5. Detect and populate hashtags from body content or title (like #SGF)
    const combinedText = `${todo.text} ${todo.notes || ''}`;
    const hashtagPattern = /(#[a-zA-Z0-9\u4e00-\u9fa5_]+)/g;
    const foundTags = combinedText.match(hashtagPattern);
    
    if (foundTags && foundTags.length > 0) {
      // Remove duplicates
      const uniqueTags = [...new Set(foundTags)];
      tagsContainer.textContent = uniqueTags.join(', ');
      tagsContainer.style.display = 'block';
    } else {
      tagsContainer.textContent = '';
      tagsContainer.style.display = 'none';
    }

    // 6. Bind External Google Link
    if (todo.taskLink) {
      linkBtn.href = todo.taskLink;
      linkBtn.style.display = 'inline-flex';
    } else {
      linkBtn.style.display = 'none';
    }

    // Store reference in global state for edits
    activeOverlayTodo = todo;
    overlayIsEditing = false;
    toggleOverlayEditMode(false); // Reset to view mode initially

    // Show overlay modal smoothly
    overlay.classList.remove('hidden');
  } catch (err) {
    console.error("Failed to parse todo data for detail overlay:", err);
  }
}

// Switch between view (editorial serif) and edit input/textarea mode
function toggleOverlayEditMode(isEditing) {
  overlayIsEditing = isEditing;
  
  const titleText = document.getElementById('overlay-title-text');
  const bodyContent = document.getElementById('overlay-body-content');
  const editBtn = document.getElementById('overlay-edit-btn');
  
  if (!activeOverlayTodo) return;
  
  if (isEditing) {
    // 1. Convert title h2 to clean input form
    const currentTitle = titleText.textContent;
    titleText.innerHTML = `<input type="text" id="overlay-edit-title-input" class="overlay-edit-input" value="${escapeHtml(currentTitle)}" aria-label="編輯任務主旨">`;
    
    // 2. Convert notes div to textarea form (use raw notes state)
    const currentNotes = activeOverlayTodo.notes || "";
    bodyContent.innerHTML = `<textarea id="overlay-edit-notes-textarea" class="overlay-edit-textarea" placeholder="在此輸入備忘說明（可貼上 Google Keep 或其他網址連結）..." aria-label="編輯備忘說明">${escapeHtml(currentNotes)}</textarea>`;
    bodyContent.style.display = 'block';
    
    // 3. Switch Edit button text to Save
    editBtn.innerHTML = `Save <span class="action-slash">\\</span>`;
  } else {
    // Restore View Mode
    // 1. Re-render title text
    titleText.innerHTML = escapeHtml(activeOverlayTodo.text);
    
    // 2. Re-render notes body with URL link parser
    if (activeOverlayTodo.notes && activeOverlayTodo.notes.trim() !== '') {
      let cleanNotes = escapeHtml(activeOverlayTodo.notes);
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      cleanNotes = cleanNotes.replace(urlPattern, '<a href="$1" target="_blank">$1</a>');
      bodyContent.innerHTML = cleanNotes;
      bodyContent.style.display = 'block';
    } else {
      bodyContent.innerHTML = '';
      bodyContent.style.display = 'none';
    }
    
    // 3. Re-render hashtag tags
    const tagsContainer = document.getElementById('overlay-tags-container');
    const combinedText = `${activeOverlayTodo.text} ${activeOverlayTodo.notes || ''}`;
    const hashtagPattern = /(#[a-zA-Z0-9\u4e00-\u9fa5_]+)/g;
    const foundTags = combinedText.match(hashtagPattern);
    
    if (foundTags && foundTags.length > 0) {
      const uniqueTags = [...new Set(foundTags)];
      tagsContainer.textContent = uniqueTags.join(', ');
      tagsContainer.style.display = 'block';
    } else {
      tagsContainer.textContent = '';
      tagsContainer.style.display = 'none';
    }
    
    // 4. Switch button text back to Edit
    editBtn.innerHTML = `Edit <span class="action-slash">\\</span>`;
  }
}

// Save editorial edits back to Google Tasks and local caches
async function saveOverlayChanges() {
  if (!activeOverlayTodo) return;
  
  const titleInput = document.getElementById('overlay-edit-title-input');
  const notesTextarea = document.getElementById('overlay-edit-notes-textarea');
  
  if (!titleInput) return;
  
  const newTitle = titleInput.value.trim();
  const newNotes = notesTextarea ? notesTextarea.value.trim() : "";
  
  if (!newTitle) {
    alert("任務名稱不能為空！");
    return;
  }
  
  // Set UI button to Syncing state
  const editBtn = document.getElementById('overlay-edit-btn');
  editBtn.innerHTML = `Syncing <span class="action-slash">\\</span>`;
  editBtn.disabled = true;
  
  // 1. Update global RAM state references
  activeOverlayTodo.text = newTitle;
  activeOverlayTodo.notes = newNotes;
  
  const updateStateList = (todoList) => {
    return todoList.map(item => {
      if (item.id === activeOverlayTodo.id) {
        return { ...item, text: newTitle, notes: newNotes };
      }
      return item;
    });
  };
  
  todayTodos = updateStateList(todayTodos);
  overdueTodos = updateStateList(overdueTodos);
  backlogTodos = updateStateList(backlogTodos);
  
  // 2. Render main dashboard checklist with new labels instantly
  renderTodos();
  saveTodosLocal();
  
  // 3. Sync PATCH changes back to Google server if authorized
  if (googleAccessToken && !activeOverlayTodo.id.startsWith('mock-')) {
    try {
      const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${activeOverlayTodo.listId}/tasks/${activeOverlayTodo.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: activeOverlayTodo.id,
          title: newTitle,
          notes: newNotes
        })
      });
      
      if (!response.ok) {
        throw new Error(`Google Tasks Update failed with status: ${response.status}`);
      }
      
      // Pull fresh data in background silently to verify list ordering
      setTimeout(syncAllGoogleTasks, 800);
    } catch (err) {
      console.error("Error writing edits back to Google Tasks:", err);
      alert("同步至 Google Tasks 失敗，新編輯已保存在本機快取中。");
    }
  }
  
  // 4. Return to View Mode
  editBtn.disabled = false;
  toggleOverlayEditMode(false);
}

async function toggleTodo(id, listId, sectionClass) {
  let toggledTask = null;
  
  const mapper = (todo) => {
    if (todo.id === id) {
      toggledTask = { ...todo, completed: !todo.completed };
      return toggledTask;
    }
    return todo;
  };

  if (sectionClass === 'overdue') overdueTodos = overdueTodos.map(mapper);
  else if (sectionClass === 'today') todayTodos = todayTodos.map(mapper);
  else if (sectionClass === 'backlog') backlogTodos = backlogTodos.map(mapper);

  renderTodos();
  saveTodosLocal();

  if (googleAccessToken && toggledTask && !id.startsWith('mock-')) {
    try {
      const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: id,
          status: toggledTask.completed ? 'completed' : 'needsAction'
        })
      });
      if (!response.ok) throw new Error("Toggle sync failed.");
      
      setTimeout(syncAllGoogleTasks, 800);
    } catch (err) {
      console.error(err);
    }
  }
}

function showWarning() {
  todoWarning.classList.remove('hidden');
  todoWarning.style.animation = 'none';
  todoWarning.offsetHeight; 
  todoWarning.style.animation = null;
}

function hideWarning() {
  todoWarning.classList.add('hidden');
}

function saveTodosLocal() {
  localStorage.setItem('overdue_todos', JSON.stringify(overdueTodos));
  localStorage.setItem('today_todos', JSON.stringify(todayTodos));
  localStorage.setItem('backlog_todos', JSON.stringify(backlogTodos));
}

// 4. Multi-Calendar Explorer & Google Calendar API
async function syncAllGoogleCalendars() {
  try {
    // 1. Fetch list of all subscribed calendars
    const calendarsRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    
    if (calendarsRes.status === 401) {
      handleAuthExpired();
      const err = new Error("Unauthorized (401)");
      err.status = 401;
      throw err;
    }
    if (!calendarsRes.ok) throw new Error("Fetch CalendarList Failed");
    
    const calendarsData = await calendarsRes.json();
    // Use calendars that are selected/visible in UI to avoid cluttering
    googleCalendarLists = (calendarsData.items || []).filter(c => c.selected !== false);

    if (googleCalendarLists.length === 0) {
      googleEvents = [];
      renderTimeline();
      return;
    }

    const now = new Date();
    // Calculate local start and end times formatted as RFC3339 strings with correct offsets
    const pad = (num) => String(num).padStart(2, '0');
    
    // Convert local start of day to offset RFC3339 string (e.g. YYYY-MM-DDT00:00:00+08:00)
    const tzo = -now.getTimezoneOffset();
    const dif = tzo >= 0 ? '+' : '-';
    const offsetStr = `${dif}${pad(Math.floor(Math.abs(tzo) / 60))}:${pad(Math.abs(tzo) % 60)}`;
    
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    
    const startOfDay = `${yyyy}-${mm}-${dd}T00:00:00${offsetStr}`;
    const endOfDay = `${yyyy}-${mm}-${dd}T23:59:59${offsetStr}`;

    let allFetchedEvents = [];

    // 2. Fetch events from all calendars concurrently
    const eventFetchPromises = googleCalendarLists.map(async (calendar) => {
      try {
        const eventsRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?timeMin=${encodeURIComponent(startOfDay)}&timeMax=${encodeURIComponent(endOfDay)}&singleEvents=true&orderBy=startTime`, {
          headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        
        if (!eventsRes.ok) {
          const errText = await eventsRes.text();
          console.warn(`Fetch events failed for calendar [${calendar.summary}] (ID: ${calendar.id}) - Status: ${eventsRes.status}, Error: ${errText}`);
          return;
        }
        const eventsData = await eventsRes.json();
        const items = eventsData.items || [];
        
        items.forEach(event => {
          if (event.start) {
            let start = null;
            let end = null;
            let isAllDay = false;
            let timeStr = "";

            // Filter out auto-generated Tasks reminders in Google Calendar to avoid duplication with the left Todo list
            const summary = event.summary ? event.summary.toLowerCase() : '';
            if (summary.includes('待處理工作') || summary.includes('task') || summary.includes('待辦工作') || summary.includes('待辦事項')) {
              return; // Skip Tasks placeholder events
            }

            if (event.start.dateTime) {
              start = new Date(event.start.dateTime);
              end = new Date(event.end.dateTime);
              
              const formatTime = (dateObj) => {
                const hh = String(dateObj.getHours()).padStart(2, '0');
                const mm = String(dateObj.getMinutes()).padStart(2, '0');
                return `${hh}:${mm}`;
              };
              timeStr = `${formatTime(start)} - ${formatTime(end)}`;
            } else if (event.start.date) {
              // All-day event fallback
              isAllDay = true;
              timeStr = "ALL DAY";
              // Sort all-day events to the top of the day
              start = new Date(event.start.date + 'T00:00:00');
              end = new Date(event.start.date + 'T23:59:59');
            }

            if (start && end) {
              // Categorize by title keywords
              let type = 'task'; // Default
              if (summary.includes('break') || summary.includes('運動') || summary.includes('休息') || summary.includes('吃') || summary.includes('跑') || summary.includes('休')) {
                type = 'break';
              } else if (summary.includes('plan') || summary.includes('規劃') || summary.includes('研讀') || summary.includes('讀書') || summary.includes('思索') || summary.includes('會議') || summary.includes('meet')) {
                type = 'planning';
              }
              
              allFetchedEvents.push({
                id: event.id,
                calendarId: calendar.id,
                calendarName: calendar.summary,
                title: event.summary || "無主旨活動",
                startTimeObj: start, // for sorting
                start: timeStr.split(' - ')[0],
                end: timeStr.split(' - ')[1] || "23:59",
                isAllDay: isAllDay,
                type: type,
                description: event.description || "",
                htmlLink: event.htmlLink || "",
                location: event.location || "",
                creator: event.creator ? (event.creator.displayName || event.creator.email || "") : ""
              });
            }
          }
        });
      } catch (e) {
        console.error(`Error loading calendar events for ${calendar.summary}:`, e);
      }
    });

    await Promise.all(eventFetchPromises);

    // Sort combined schedules by chronologic starting time
    allFetchedEvents.sort((a, b) => a.startTimeObj.getTime() - b.startTimeObj.getTime());
    
    googleEvents = allFetchedEvents;
    renderTimeline();
  } catch (err) {
    console.error("syncAllGoogleCalendars failed: ", err);
    // If permission or calendar API fail specifically, clear cached list to notify user but do not crash tasks sync
    googleEvents = [];
    renderTimeline();
  }
}

function initTimeline() {
  // If not logged in, render default mock timeline list
  if (!googleAccessToken) {
    googleEvents = [
      { id: 'm-1', title: "點擊頂部 SYNC 按鈕授權", start: "09:00", end: "10:00", type: "planning" },
      { id: 'm-2', title: "串接您的 Google 日曆行程", start: "11:00", end: "12:00", type: "task" },
      { id: 'm-3', title: "享受無雜訊日系網格時間流", start: "14:00", end: "15:00", type: "break" }
    ];
  }
  renderTimeline();
}

function renderEmptyTimelineState() {
  const centralSpine = document.querySelector('.timeline-central-spine');
  if (centralSpine) centralSpine.style.display = 'none';
  if (timeSpineIndicator) timeSpineIndicator.classList.add('hidden');
  
  timelineEvents.style.position = 'static';
  timelineEvents.style.height = 'auto';

  timelineEvents.innerHTML = `
    <div class="timeline-empty-card" style="margin-top: 24px; padding: 48px 32px; border: 1px solid var(--border-color); border-radius: 0px; background-color: rgba(0, 0, 0, 0.005); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;">
      <!-- Elegant Sun/Focus Zen Outline Icon -->
      <svg style="width: 40px; height: 40px; color: var(--accent-color); opacity: 0.85; stroke-width: 1.2; flex-shrink: 0;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
      </svg>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <h3 style="font-family: var(--font-serif); font-size: 1.1rem; font-weight: 700; color: var(--text-primary); letter-spacing: 0.5px;">今天，時光無痕</h3>
        <span style="font-size: 0.7rem; color: var(--text-secondary); letter-spacing: 1px; text-transform: uppercase; font-weight: 500;">A Day in Quietude</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; max-width: 280px; margin: 0;">
        當下沒有任何安排。不妨慢下來，泡杯茶，享受這段安靜的留白。
      </p>
    </div>
  `;
}

function renderTimeline() {
  // Clear timeline list
  timelineEvents.innerHTML = '';
  
  // Find or create All-Day Highlights box container inside the panel
  const panelTimeline = document.getElementById('panel-timeline');
  let allDayContainer = document.getElementById('timeline-allday-container');
  
  if (!allDayContainer) {
    allDayContainer = document.createElement('div');
    allDayContainer.id = 'timeline-allday-container';
    // Insert after subtitle but before the timeline container spine
    const subtitle = panelTimeline.querySelector('.card-subtitle');
    subtitle.parentNode.insertBefore(allDayContainer, subtitle.nextSibling);
  }
  allDayContainer.innerHTML = '';
  
  if (googleEvents.length === 0) {
    allDayContainer.style.display = 'none';
    renderEmptyTimelineState();
    return;
  }

  // Group events into allDay highlights vs timed schedule
  const allDayEvents = googleEvents.filter(e => e.isAllDay);
  const timedEvents = googleEvents.filter(e => !e.isAllDay);

  // Render All-Day Highlights Block at the top
  if (allDayEvents.length > 0) {
    allDayContainer.style.display = 'block';
    allDayContainer.style.marginBottom = '24px';
    
    let highlightsHtml = `
      <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 10px; letter-spacing: 1px; padding: 0 8px;">ALL-DAY HIGHLIGHTS / 今日摘要</div>
      <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
    `;
    
    allDayEvents.forEach(event => {
      const calLabel = event.calendarName && !event.calendarName.includes('@') ? ` <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:400; letter-spacing:0px;">(${escapeHtml(event.calendarName)})</span>` : '';
      highlightsHtml += `
        <div style="padding: 12px 16px; border: 1px solid var(--border-color); background-color: rgba(0,0,0,0.01); display: flex; align-items: center; gap: 10px;">
          <svg style="width: 13px; height: 13px; color: var(--text-secondary); flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="12 6 12 12 16 14"></polygon></svg>
          <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary); line-height: 1.4;">${escapeHtml(event.title)}${calLabel}</span>
        </div>
      `;
    });
    
    highlightsHtml += `</div>`;
    allDayContainer.innerHTML = highlightsHtml;
  } else {
    allDayContainer.style.display = 'none';
  }

  // Render Timed Events Timeline at the bottom
  if (timedEvents.length === 0) {
    const centralSpine = document.querySelector('.timeline-central-spine');
    if (centralSpine) centralSpine.style.display = 'none';
    if (timeSpineIndicator) timeSpineIndicator.classList.add('hidden');
    
    timelineEvents.style.position = 'static';
    timelineEvents.style.height = 'auto';
    
    timelineEvents.innerHTML = `
      <div class="timeline-empty-card" style="margin-top: 16px; padding: 32px 0; border: 1px dashed var(--border-color); text-align: center; color: var(--text-secondary); font-size: 0.85rem; font-family: var(--font-serif); letter-spacing: 0.5px;">
        今日無特定時間行程 / NO TIMED EVENTS
      </div>
    `;
    return;
  }

  // Restore spine visibility and container styles when we have timedEvents
  const centralSpine = document.querySelector('.timeline-central-spine');
  if (centralSpine) centralSpine.style.display = 'block';

  // Calculate timeline start & end boundaries based on today's events range
  const firstStart = parseTimeToMinutes(timedEvents[0].start);
  const lastEnd = parseTimeToMinutes(timedEvents[timedEvents.length - 1].end);
  
  timelineStartMin = Math.max(0, firstStart - 60); // Starts 1 hour before first event
  const timelineEndMin = Math.min(1439, lastEnd + 60); // Ends 1 hour after last event
  timelineDurationMins = timelineEndMin - timelineStartMin;
  
  // Force the timeline list container to match our scale ruler height and enable absolute positioning
  timelineEvents.style.position = 'relative';
  timelineEvents.style.height = `${TIMELINE_HEIGHT}px`;

  // We rewrite index-based alignment to respect only timedEvents index list
  timedEvents.forEach((event, index) => {
    const alignment = index % 2 === 0 ? 'align-left' : 'align-right';
    
    const cleanTitle = truncateString(event.title, 36);
    
    // Compute start top offset and height duration on the physical timeline
    const startMin = parseTimeToMinutes(event.start);
    const endMin = parseTimeToMinutes(event.end);
    
    const itemTop = ((startMin - timelineStartMin) / timelineDurationMins) * TIMELINE_HEIGHT;
    const itemHeight = Math.max(45, ((endMin - startMin) / timelineDurationMins) * TIMELINE_HEIGHT); // Ensure a minimum card display height
    
    const milestoneItem = document.createElement('div');
    milestoneItem.className = `timeline-milestone-item ${alignment} type-${event.type}`;
    milestoneItem.setAttribute('data-start-time', event.start);
    milestoneItem.setAttribute('data-end-time', event.end);
    
    // Apply inline style absolute parameters
    milestoneItem.style.top = `${itemTop}px`;
    milestoneItem.style.height = `${itemHeight}px`;
    
    milestoneItem.innerHTML = `
      <div class="milestone-card" onclick="showCalendarEventOverlay('${event.id}')">
        <span class="milestone-time">${event.start} - ${event.end}</span>
        <h3 class="milestone-title">
          ${escapeHtml(cleanTitle)}
        </h3>
      </div>
      <div class="milestone-connector"></div>
      <div class="spine-time-bar" title="${event.start} - ${event.end}"></div>
    `;
    
    timelineEvents.appendChild(milestoneItem);
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  updateTimeIndicator();
}

function updateTimeIndicator() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const milestoneItems = document.querySelectorAll('.timeline-milestone-item');
  const timedEvents = googleEvents.filter(e => !e.isAllDay);
  
  if (milestoneItems.length === 0 || timedEvents.length === 0) {
    timeSpineIndicator.classList.add('hidden');
    return;
  }
  
  const listContainer = document.getElementById('timeline-events');
  const containerOffset = listContainer ? listContainer.offsetTop : 0;
  
  // Calculate dynamic position ratio linearly based on the true 24h timeline boundary scale
  let ratio = (currentMinutes - timelineStartMin) / timelineDurationMins;
  ratio = Math.max(0, Math.min(1, ratio)); // Clamp between 0% and 100% boundary
  
  const indicatorTop = containerOffset + (ratio * TIMELINE_HEIGHT);
  
  // Apply position
  timeSpineIndicator.classList.remove('hidden');
  timeSpineIndicator.style.top = `${indicatorTop}px`;
  
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  spineTimeLabel.textContent = `NOW / ${hh}:${mm}`;

  // Update visually 'past' meetings in DOM
  milestoneItems.forEach((item, idx) => {
    const event = timedEvents[idx];
    if (event) {
      const endMin = parseTimeToMinutes(event.end);
      if (currentMinutes > endMin) {
        item.classList.add('past');
      } else {
        item.classList.remove('past');
      }
    }
  });
}

function cleanHtmlDescription(htmlStr) {
  if (!htmlStr) return '';
  let clean = htmlStr.trim();
  // Strip leading and trailing newlines, backslash-n, and HTML br tags
  clean = clean.replace(/^(?:\s*<br\s*\/?>\s*|\s*\\n\s*|\s*\n\s*)+/gi, '');
  clean = clean.replace(/(?:\s*<br\s*\/?>\s*|\s*\\n\s*|\s*\n\s*)+$/gi, '');
  return clean.trim();
}

// Helper Utilities
function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncateString(str, num) {
  if (str.length <= num) {
    return str;
  }
  return str.slice(0, num) + '...';
}
