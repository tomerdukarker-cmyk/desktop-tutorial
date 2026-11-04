import * as cloud from './cloud.js?v=6';

const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const categoryInput = document.getElementById('categoryInput');
const dateInput = document.getElementById('dateInput');
const endDateInput = document.getElementById('endDateInput');
const timeInput = document.getElementById('timeInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const categoryFilter = document.getElementById('categoryFilter');
const taskCounter = document.getElementById('taskCounter');
const clearDoneBtn = document.getElementById('clearDoneBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const urgentBadge = document.getElementById('urgentBadge');
const urgentCount = document.getElementById('urgentCount');
const filterButtons = document.querySelectorAll('.filter-btn');
const tabButtons = document.querySelectorAll('.tab');
const calendarGrid = document.getElementById('calendarGrid');
const monthTitle = document.getElementById('monthTitle');
const dayTitle = document.getElementById('dayTitle');
const dayTaskList = document.getElementById('dayTaskList');
const dayEvents = document.getElementById('dayEvents');
const dayEmptyState = document.getElementById('dayEmptyState');
const categoryTable = document.getElementById('categoryTable');
const matrixTable = document.getElementById('matrixTable');
const monthTable = document.getElementById('monthTable');
const undatedNote = document.getElementById('undatedNote');
const loadingState = document.getElementById('loadingState');
const authScreen = document.getElementById('authScreen');
const authMessage = document.getElementById('authMessage');
const signInBtn = document.getElementById('signInBtn');
const appContent = document.getElementById('appContent');
const userBox = document.getElementById('userBox');
const userName = document.getElementById('userName');
const syncText = document.getElementById('syncText');
const toast = document.getElementById('toast');

// המשימות הישנות שנשמרו בדפדפן לפני המעבר לענן
const STORAGE_KEY = 'tasks';
const MIGRATED_KEY = 'tasksMigratedToCloud';
const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITIES = {
    high: { label: '🔥 גבוהה', order: 0 },
    medium: { label: 'בינונית', order: 1 },
    low: { label: 'נמוכה', order: 2 }
};

const CATEGORIES = {
    work: { label: 'עבודה', icon: '💼' },
    personal: { label: 'אישי', icon: '👤' },
    home: { label: 'בית', icon: '🏠' },
    study: { label: 'לימודים', icon: '📚' },
    health: { label: 'בריאות', icon: '💪' },
    other: { label: 'אחר', icon: '📌' }
};

const EMPTY_MESSAGES = {
    all: 'אין משימות עדיין. הוסף את הראשונה למעלה ✨',
    high: 'אין משימות דחופות 🎉',
    active: 'כל המשימות הושלמו! 🎉',
    done: 'עוד לא הושלמו משימות'
};

let currentView = 'list';
let currentFilter = 'all';
let currentCategory = 'all';
let calendarMonth = startOfMonth(new Date());
let selectedDay = toDateKey(new Date());

function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- תאריכים ----------

function pad(n) {
    return String(n).padStart(2, '0');
}

// תאריך מקומי בפורמט YYYY-MM-DD (כמו בשדה תאריך)
function toDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nowTimeKey() {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatDay(key) {
    const diff = Math.round((fromDateKey(key) - fromDateKey(toDateKey(new Date()))) / DAY_MS);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'מחר';
    if (diff === -1) return 'אתמול';
    return fromDateKey(key).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

function formatDue(task) {
    const text = task.endDate ? `${formatDay(task.dueDate)} – ${formatDay(task.endDate)}` : formatDay(task.dueDate);
    return task.dueTime ? `${text}, ${task.dueTime}` : text;
}

// היום האחרון של המשימה: סוף הטווח, או התאריך היחיד
function lastDay(task) {
    return task.endDate || task.dueDate;
}

// האם המשימה נמשכת (גם) בטווח הימים from..to
function overlapsDays(task, from, to) {
    return Boolean(task.dueDate) && task.dueDate <= to && lastDay(task) >= from;
}

function isOverdue(task) {
    if (task.done || !task.dueDate) return false;
    const today = toDateKey(new Date());
    const end = lastDay(task);
    if (end < today) return true;
    return end === today && Boolean(task.dueTime) && task.dueTime < nowTimeKey();
}

// משימה בטווח שהתחיל וטרם הסתיים
function isInProgress(task) {
    const today = toDateKey(new Date());
    return Boolean(task.endDate) && !task.done && task.dueDate <= today && today <= task.endDate;
}

// ---------- שמירה וטעינה ----------

// משימה תקינה עם ערכי ברירת מחדל לשדות חסרים
function normalizeTask(task) {
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    const dueDate = isDate(task.dueDate) ? task.dueDate : '';
    return {
        id: String(task.id || createId()),
        text: String(task.text ?? '').slice(0, 200),
        done: Boolean(task.done),
        priority: PRIORITIES[task.priority] ? task.priority : 'medium',
        category: CATEGORIES[task.category] ? task.category : 'other',
        dueDate,
        // סוף טווח: רק אם יש התחלה והוא אחריה
        endDate: dueDate && isDate(task.endDate) && task.endDate > dueDate ? task.endDate : '',
        dueTime: /^\d{2}:\d{2}$/.test(task.dueTime) ? task.dueTime : '',
        createdAt: Number(task.createdAt) || Date.now(),
        updatedAt: Number(task.updatedAt) || Number(task.createdAt) || Date.now()
    };
}

function loadLocalTasks() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        return saved.filter((t) => t && t.text).map(normalizeTask);
    } catch {
        return [];
    }
}

// העברה חד-פעמית של משימות שנשמרו בדפדפן הזה אל הלוח המשותף
async function migrateLocalTasks() {
    try {
        if (localStorage.getItem(MIGRATED_KEY)) return;
        const local = loadLocalTasks();
        if (local.length) {
            await cloud.uploadTasks(local);
            showToast(`הועברו ${local.length} משימות מהדפדפן ללוח המשותף ☁️`);
        }
        localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    } catch (error) {
        console.error(error);
    }
}

let tasks = [];

// ---------- פעולות על משימות ----------

// מיון: פתוחות לפני שהושלמו, אחר כך עדיפות, תאריך יעד (בלי תאריך בסוף) וזמן יצירה
function sortTasks(list) {
    const dueKey = (t) => (t.dueDate ? t.dueDate + (t.dueTime || '99:99') : '9999');
    return [...list].sort((a, b) =>
        (a.done - b.done) ||
        (PRIORITIES[a.priority].order - PRIORITIES[b.priority].order) ||
        dueKey(a).localeCompare(dueKey(b)) ||
        (a.createdAt - b.createdAt)
    );
}

function filterTasks(list) {
    if (currentCategory !== 'all') {
        list = list.filter((t) => t.category === currentCategory);
    }
    switch (currentFilter) {
        case 'high': return list.filter((t) => t.priority === 'high' && !t.done);
        case 'active': return list.filter((t) => !t.done);
        case 'done': return list.filter((t) => t.done);
        default: return list;
    }
}

// שינויים נשלחים לענן. המסך מתעדכן מיד דרך המאזין ב-startCloud, אצל שני המשתמשים
function reportWriteError(error) {
    console.error(error);
    showToast(error.code === 'permission-denied'
        ? 'אין הרשאה לשמור. ייתכן שהחשבון לא מורשה ללוח הזה'
        : 'השמירה נכשלה, נסה שוב');
}

function updateTask(id, changes) {
    cloud.updateTask(id, changes).catch(reportWriteError);
}

function deleteTask(id) {
    cloud.deleteTask(id).catch(reportWriteError);
}

let toastTimer;
function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 4000);
}

// ---------- תצוגת משימה ----------

function createTag(text, className) {
    const tag = document.createElement('span');
    tag.className = `meta-tag ${className}`;
    tag.textContent = text;
    return tag;
}

function createTaskElement(task) {
    const li = document.createElement('li');
    li.className = `task priority-${task.priority}`;
    if (task.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', 'סמן כבוצעה');
    checkbox.addEventListener('change', () => updateTask(task.id, { done: checkbox.checked }));

    const body = document.createElement('div');
    body.className = 'task-body';

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const category = CATEGORIES[task.category];
    meta.append(createTag(`${category.icon} ${category.label}`, 'tag-category'));
    if (task.dueDate) {
        const overdue = isOverdue(task);
        meta.append(createTag(`${overdue ? '⚠️' : '📅'} ${formatDue(task)}`, overdue ? 'tag-overdue' : 'tag-date'));
        if (isInProgress(task)) meta.append(createTag('▶️ בביצוע', 'tag-progress'));
    }
    if (task.pending) {
        meta.append(createTag('⏳ עוד לא נשמר בענן', 'tag-pending'));
    }
    body.append(text, meta);

    // לחיצה על התגית מחליפה עדיפות: גבוהה ← בינונית ← נמוכה ← גבוהה
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'priority-badge';
    badge.textContent = PRIORITIES[task.priority].label;
    badge.title = 'לחץ לשינוי עדיפות';
    badge.addEventListener('click', () => {
        const keys = Object.keys(PRIORITIES);
        const next = keys[(keys.indexOf(task.priority) + 1) % keys.length];
        updateTask(task.id, { priority: next });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'מחק משימה';
    deleteBtn.setAttribute('aria-label', 'מחק משימה');
    deleteBtn.addEventListener('click', () => {
        li.classList.add('removing');
        setTimeout(() => deleteTask(task.id), 200);
    });

    li.append(checkbox, body, badge, deleteBtn);
    return li;
}

// ---------- תצוגת רשימה ----------

function renderList() {
    const visible = filterTasks(sortTasks(tasks));
    taskList.replaceChildren(...visible.map(createTaskElement));
    emptyState.hidden = visible.length > 0;
    emptyState.textContent = currentCategory !== 'all' && tasks.length
        ? 'אין משימות שמתאימות לסינון'
        : EMPTY_MESSAGES[currentFilter];
}

// ---------- תצוגת לוח שנה ----------

// חגים לפי תאריך (מתוך holidays.js)
const holidaysByDate = {};
HOLIDAYS.forEach((h) => {
    (holidaysByDate[h.date] ||= []).push(h);
});

// התאריכים בפורמט YYYY-MM-DD, אז אפשר להשוות אותם כמחרוזות
function vacationsOn(key) {
    return SCHOOL_VACATIONS.filter((v) => v.start <= key && key <= v.end);
}

function createEventItem(icon, text, className) {
    const li = document.createElement('li');
    li.className = `day-event ${className}`;
    li.textContent = `${icon} ${text}`;
    return li;
}

function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = calendarMonth.getDay(); // השבוע מתחיל ביום ראשון
    const todayKey = toDateKey(new Date());

    monthTitle.textContent = calendarMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

    // קיבוץ המשימות לפי תאריך. משימה עם טווח מופיעה בכל יום בטווח שנמצא בחודש הזה
    const monthStart = toDateKey(new Date(year, month, 1));
    const monthEnd = toDateKey(new Date(year, month, daysInMonth));
    const byDate = {};
    sortTasks(tasks).forEach((t) => {
        if (!overlapsDays(t, monthStart, monthEnd)) return;
        const from = t.dueDate > monthStart ? t.dueDate : monthStart;
        const to = lastDay(t) < monthEnd ? lastDay(t) : monthEnd;
        for (let d = fromDateKey(from); toDateKey(d) <= to; d.setDate(d.getDate() + 1)) {
            (byDate[toDateKey(d)] ||= []).push(t);
        }
    });

    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-blank';
        cells.push(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const key = toDateKey(new Date(year, month, day));
        const dayTasks = byDate[key] || [];
        const openTasks = dayTasks.filter((t) => !t.done);

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cal-day';
        cell.dataset.date = key;
        if (key === todayKey) cell.classList.add('today');
        if (key === selectedDay) cell.classList.add('selected');
        if (dayTasks.some(isOverdue)) cell.classList.add('has-overdue');

        const holidays = holidaysByDate[key] || [];
        const vacations = vacationsOn(key);
        if (vacations.length) cell.classList.add('vacation');
        if (holidays.length) cell.classList.add('holiday');

        const labels = [...holidays.map((h) => h.name), ...vacations.map((v) => v.name)];
        cell.title = labels.join('\n');
        cell.setAttribute('aria-label', [`${day}`, ...labels, `${dayTasks.length} משימות`].join(', '));

        const number = document.createElement('span');
        number.className = 'cal-number';
        number.textContent = day;

        if (holidays.length) {
            const icon = document.createElement('span');
            icon.className = 'cal-holiday-icon';
            icon.textContent = holidays[0].icon;
            cell.append(icon);
        }

        const dots = document.createElement('span');
        dots.className = 'cal-dots';
        openTasks.slice(0, 3).forEach((t) => {
            const dot = document.createElement('span');
            dot.className = `dot priority-${t.priority}`;
            dots.append(dot);
        });
        if (openTasks.length > 3) {
            const more = document.createElement('span');
            more.className = 'cal-more';
            more.textContent = `+${openTasks.length - 3}`;
            dots.append(more);
        }
        if (dayTasks.length && !openTasks.length) {
            const check = document.createElement('span');
            check.className = 'cal-more';
            check.textContent = '✓';
            dots.append(check);
        }

        cell.append(number, dots);
        cells.push(cell);
    }

    calendarGrid.replaceChildren(...cells);

    // המשימות של היום שנבחר
    const selectedTasks = sortTasks(tasks.filter((t) => overlapsDays(t, selectedDay, selectedDay)));
    dayTitle.textContent = `משימות ל${fromDateKey(selectedDay).toLocaleDateString('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    })}`;
    dayEvents.replaceChildren(
        ...(holidaysByDate[selectedDay] || []).map((h) => createEventItem(h.icon, h.name, 'event-holiday')),
        ...vacationsOn(selectedDay).map((v) => createEventItem('🎒', v.name, 'event-vacation'))
    );
    dayTaskList.replaceChildren(...selectedTasks.map(createTaskElement));
    dayEmptyState.hidden = selectedTasks.length > 0;
}

function selectDay(key) {
    selectedDay = key;
    dateInput.value = key;
    endDateInput.min = key;
    renderCalendar();
}

calendarGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-day');
    if (cell) selectDay(cell.dataset.date);
});

document.getElementById('prevMonth').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
});

document.getElementById('todayBtn').addEventListener('click', () => {
    calendarMonth = startOfMonth(new Date());
    selectDay(toDateKey(new Date()));
});

// ---------- תצוגת פילוח ----------

// סיכום של קבוצת משימות - משמש את כל הטבלאות
function summarize(list) {
    const done = list.filter((t) => t.done).length;
    return {
        total: list.length,
        open: list.length - done,
        done,
        urgent: list.filter((t) => t.priority === 'high' && !t.done).length,
        overdue: list.filter(isOverdue).length,
        percent: list.length ? Math.round((done / list.length) * 100) : 0
    };
}

// תא בטבלה: אפס מוצג כמקף כדי שהמספרים החשובים יבלטו
function createCell(value, className = '') {
    const td = document.createElement('td');
    if (value instanceof Node) {
        td.append(value);
    } else if (value === 0) {
        td.textContent = '–';
        td.classList.add('zero');
    } else {
        td.textContent = value;
    }
    if (className) td.classList.add(...className.split(' '));
    return td;
}

function createPercentCell(percent) {
    const wrap = document.createElement('span');
    wrap.className = 'percent-cell';
    const bar = document.createElement('progress');
    bar.max = 100;
    bar.value = percent;
    bar.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = `${percent}%`;
    wrap.append(bar, text);
    return createCell(wrap);
}

// בניית טבלה: headers = כותרות, rows = [{ cells, onClick, title, className }], footer = שורת סיכום
function createTable(headers, rows, footer) {
    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach((h) => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = h;
        headRow.append(th);
    });
    thead.append(headRow);

    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
        const tr = document.createElement('tr');
        if (row.className) tr.className = row.className;
        if (row.onClick) {
            tr.classList.add('clickable');
            tr.tabIndex = 0;
            tr.title = row.title || '';
            tr.addEventListener('click', row.onClick);
            tr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    row.onClick();
                }
            });
        }
        tr.append(...row.cells);
        tbody.append(tr);
    });
    table.append(thead, tbody);

    if (footer) {
        const tfoot = document.createElement('tfoot');
        const tr = document.createElement('tr');
        tr.append(...footer);
        tfoot.append(tr);
        table.append(tfoot);
    }
    return table;
}

function createTableEmpty(text) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = text;
    return p;
}

// שם קצר לחג, כדי ש"ערב פסח", "פסח" ו"חול המועד פסח" יופיעו פעם אחת
function shortHolidayName(name) {
    return name.split(' · ').map((part) => part
        .replace(/\s*\(.*\)/, '')
        .replace(/ – .*/, '')
        .replace(/ תשפ״\S+$/, '')
        .replace(/^(ערב|חול המועד|שביעי של) /, '')
    );
}

function renderCategoryTable() {
    const rows = Object.entries(CATEGORIES)
        .map(([key, cat]) => ({ key, cat, s: summarize(tasks.filter((t) => t.category === key)) }))
        .filter(({ s }) => s.total)
        .sort((a, b) => b.s.open - a.s.open || b.s.total - a.s.total)
        .map(({ key, cat, s }) => ({
            title: `הצג משימות ${cat.label} ברשימה`,
            onClick: () => {
                currentCategory = key;
                categoryFilter.value = key;
                switchView('list');
            },
            cells: [
                createCell(`${cat.icon} ${cat.label}`, 'row-label'),
                createCell(s.total),
                createCell(s.open),
                createCell(s.urgent, s.urgent ? 'danger' : ''),
                createCell(s.overdue, s.overdue ? 'danger' : ''),
                createCell(s.done),
                createPercentCell(s.percent)
            ]
        }));

    if (!rows.length) {
        categoryTable.replaceChildren(createTableEmpty('הוסף משימות כדי לראות פילוח'));
        return;
    }

    const all = summarize(tasks);
    categoryTable.replaceChildren(createTable(
        ['קטגוריה', 'סה״כ', 'פתוחות', '🔥 דחופות', '⚠️ באיחור', 'הושלמו', 'השלמה'],
        rows,
        [
            createCell('סה״כ', 'row-label'),
            createCell(all.total),
            createCell(all.open),
            createCell(all.urgent),
            createCell(all.overdue),
            createCell(all.done),
            createPercentCell(all.percent)
        ]
    ));
}

function renderMatrixTable() {
    const openTasks = tasks.filter((t) => !t.done);
    const priorityKeys = Object.keys(PRIORITIES);
    const count = (list, priority) => list.filter((t) => t.priority === priority).length;

    const rows = Object.entries(CATEGORIES)
        .map(([key, cat]) => ({ cat, list: openTasks.filter((t) => t.category === key) }))
        .filter(({ list }) => list.length)
        .sort((a, b) => count(b.list, 'high') - count(a.list, 'high') || b.list.length - a.list.length)
        .map(({ cat, list }) => ({
            cells: [
                createCell(`${cat.icon} ${cat.label}`, 'row-label'),
                ...priorityKeys.map((p) => createCell(count(list, p), `priority-cell priority-${p}`)),
                createCell(list.length, 'strong')
            ]
        }));

    if (!rows.length) {
        matrixTable.replaceChildren(createTableEmpty('אין משימות פתוחות 🎉'));
        return;
    }

    matrixTable.replaceChildren(createTable(
        ['קטגוריה', ...priorityKeys.map((p) => PRIORITIES[p].label), 'סה״כ'],
        rows,
        [
            createCell('סה״כ', 'row-label'),
            ...priorityKeys.map((p) => createCell(count(openTasks, p), `priority-cell priority-${p}`)),
            createCell(openTasks.length, 'strong')
        ]
    ));
}

function renderMonthTable() {
    const start = startOfMonth(new Date());
    const thisMonth = toDateKey(start).slice(0, 7);

    const rows = [];
    for (let i = 0; i < 12; i++) {
        const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const monthKey = toDateKey(month).slice(0, 7); // YYYY-MM
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

        let vacationDays = 0;
        const holidayNames = new Set();
        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${monthKey}-${pad(day)}`;
            if (vacationsOn(key).length) vacationDays++;
            (holidaysByDate[key] || []).forEach((h) => shortHolidayName(h.name).forEach((n) => holidayNames.add(n)));
        }

        const s = summarize(tasks.filter((t) => overlapsDays(t, `${monthKey}-01`, `${monthKey}-${pad(daysInMonth)}`)));
        const holidaysText = document.createElement('span');
        holidaysText.className = 'holiday-list';
        holidaysText.textContent = holidayNames.size ? [...holidayNames].join(', ') : '–';

        rows.push({
            className: monthKey === thisMonth ? 'current' : '',
            title: 'פתח בלוח השנה',
            onClick: () => {
                calendarMonth = month;
                selectedDay = monthKey === thisMonth ? toDateKey(new Date()) : `${monthKey}-01`;
                switchView('calendar');
            },
            cells: [
                createCell(month.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }), 'row-label'),
                createCell(s.total),
                createCell(s.done),
                createCell(s.urgent, s.urgent ? 'danger' : ''),
                createCell(vacationDays, vacationDays ? 'vacation-cell' : ''),
                createCell(holidaysText)
            ]
        });
    }

    monthTable.replaceChildren(createTable(
        ['חודש', 'משימות', 'הושלמו', '🔥 דחופות', '🎒 ימי חופשה', 'חגים ומועדים'],
        rows
    ));

    const undated = tasks.filter((t) => !t.dueDate && !t.done).length;
    undatedNote.textContent = undated
        ? `📌 ${undated === 1 ? 'משימה פתוחה אחת' : `${undated} משימות פתוחות`} בלי תאריך לא מופיעות בטבלה הזאת`
        : '';
}

function renderStats() {
    const all = summarize(tasks);
    document.getElementById('statTotal').textContent = all.total;
    document.getElementById('statDone').textContent = all.done;
    document.getElementById('statUrgent').textContent = all.urgent;
    document.getElementById('statOverdue').textContent = all.overdue;
    document.getElementById('overdueTile').classList.toggle('danger', all.overdue > 0);

    renderCategoryTable();
    renderMatrixTable();
    renderMonthTable();
}

// ---------- סיכום כללי ----------

function updateHeader() {
    const total = tasks.length;
    const doneCount = tasks.filter((t) => t.done).length;
    const urgent = tasks.filter((t) => t.priority === 'high' && !t.done).length;
    const percent = total ? Math.round((doneCount / total) * 100) : 0;

    progressBar.value = percent;
    progressPercent.textContent = `${percent}%`;
    progressText.textContent = total ? `${doneCount} מתוך ${total} הושלמו` : 'אין משימות עדיין';

    urgentCount.textContent = urgent;
    urgentBadge.hidden = urgent === 0;

    const remaining = total - doneCount;
    taskCounter.textContent = remaining === 1 ? 'נשארה משימה אחת' : `נשארו ${remaining} משימות`;
    clearDoneBtn.hidden = doneCount === 0;
}

function render() {
    updateHeader();
    if (currentView === 'list') renderList();
    if (currentView === 'calendar') renderCalendar();
    if (currentView === 'stats') renderStats();
}

function switchView(view) {
    currentView = view;
    tabButtons.forEach((tab) => {
        const active = tab.dataset.view === view;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active);
    });
    document.querySelectorAll('.view').forEach((section) => {
        section.hidden = section.id !== `view-${view}`;
    });
    if (view === 'calendar') dateInput.value = selectedDay;
    render();
}

// ---------- אירועים ----------

// הוספת משימה חדשה
taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;

    const dueTime = timeInput.value;
    const today = toDateKey(new Date());
    let endDate = endDateInput.value;
    // בלי תאריך התחלה: מתחילים היום (או ביום הסיום, אם הוא כבר עבר). שעה בלי תאריך = היום
    let dueDate = dateInput.value || (endDate ? (endDate < today ? endDate : today) : (dueTime ? today : ''));

    if (endDate && endDate < dueDate) {
        showToast('תאריך הסיום לפני תאריך ההתחלה');
        endDateInput.focus();
        return;
    }
    if (endDate === dueDate) endDate = '';

    const now = Date.now();
    cloud.saveTask({
        id: createId(),
        text,
        done: false,
        priority: taskForm.querySelector('input[name="priority"]:checked').value,
        category: categoryInput.value,
        dueDate,
        endDate,
        dueTime,
        createdAt: now,
        updatedAt: now
    }).catch(reportWriteError);

    // בלוח השנה - מעבר לחודש וליום של המשימה החדשה
    if (currentView === 'calendar' && dueDate) {
        selectedDay = dueDate;
        calendarMonth = startOfMonth(fromDateKey(dueDate));
        render();
    }

    taskInput.value = '';
    timeInput.value = '';
    endDateInput.value = '';
    if (currentView !== 'calendar') dateInput.value = '';
    endDateInput.min = dateInput.value;
    taskInput.focus();
});

// אי אפשר לבחור סיום לפני ההתחלה
dateInput.addEventListener('change', () => {
    endDateInput.min = dateInput.value;
    if (endDateInput.value && endDateInput.value < dateInput.value) endDateInput.value = '';
});

tabButtons.forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
});

filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
        renderList();
    });
});

categoryFilter.addEventListener('change', () => {
    currentCategory = categoryFilter.value;
    renderList();
});

clearDoneBtn.addEventListener('click', () => {
    const doneIds = tasks.filter((t) => t.done).map((t) => t.id);
    cloud.deleteTasks(doneIds).catch(reportWriteError);
});

document.getElementById('signOutBtn').addEventListener('click', () => {
    cloud.signOut();
});

signInBtn.addEventListener('click', async () => {
    authMessage.textContent = '';
    try {
        await cloud.signIn();
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return;
        console.error(error);
        authMessage.textContent = error.code === 'auth/popup-blocked'
            ? 'הדפדפן חסם את חלון הכניסה. אפשר חלונות קופצים לאתר הזה ונסה שוב'
            : 'הכניסה נכשלה, נסה שוב';
    }
});

// ---------- כניסה וסנכרון ----------

// מצב הסנכרון בכותרת: ירוק = הכול בענן, כתום = שומר / אין חיבור
let lastSync = { fromCache: true, pending: false };

function updateSyncStatus() {
    let state = 'ok';
    let text = 'מסונכרן';
    if (!navigator.onLine) {
        state = 'offline';
        text = 'אין חיבור – יסתנכרן כשהחיבור יחזור';
    } else if (lastSync.pending) {
        state = 'pending';
        text = 'שומר...';
    } else if (lastSync.fromCache) {
        state = 'pending';
        text = 'מתחבר...';
    }
    userBox.dataset.sync = state;
    syncText.textContent = text;
}

window.addEventListener('online', updateSyncStatus);
window.addEventListener('offline', updateSyncStatus);

// מצבי המסך: טעינה / מסך כניסה / האתר עצמו
function showScreen(screen) {
    loadingState.hidden = screen !== 'loading';
    authScreen.hidden = screen !== 'auth';
    appContent.hidden = screen !== 'app';
}

cloud.startCloud({
    onUser(user) {
        tasks = [];
        userBox.hidden = !user;
        if (!user) {
            signInBtn.textContent = 'התחבר עם Google';
            showScreen('auth');
            return;
        }
        userName.textContent = user.displayName || user.email;
        showScreen('loading');
    },
    onTasks(cloudTasks, sync) {
        const firstLoad = appContent.hidden;
        tasks = cloudTasks.map((t) => ({ ...normalizeTask(t), pending: t.pending }));
        lastSync = sync;
        updateSyncStatus();
        showScreen('app');
        render();
        if (firstLoad) migrateLocalTasks();
    },
    onError(error) {
        console.error(error);
        if (error.code === 'permission-denied') {
            authMessage.textContent = 'לחשבון הזה אין גישה ללוח המשותף. התחבר עם החשבון המורשה.';
            signInBtn.textContent = 'התחבר עם חשבון אחר';
        } else {
            authMessage.textContent = 'לא הצלחנו לטעון את המשימות. בדוק את החיבור לאינטרנט ורענן את הדף.';
        }
        showScreen('auth');
    }
});

// ---------- התחלה ----------

function fillCategoryOptions() {
    const options = Object.entries(CATEGORIES).map(([key, cat]) => new Option(`${cat.icon} ${cat.label}`, key));
    categoryInput.replaceChildren(...options);
    categoryInput.value = 'other';

    categoryFilter.replaceChildren(
        new Option('כל הקטגוריות', 'all'),
        ...options.map((o) => new Option(o.text, o.value))
    );
}

document.getElementById('today').textContent = new Date().toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
});

fillCategoryOptions();
