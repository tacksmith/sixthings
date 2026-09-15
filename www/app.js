/* ============================================================
 * 六件事 · Six Things  — 适配 Ivy Lee 法（六件事法）
 * 睡前列清单(上限N) → 按重要排序 → 白天只做第一件(顺序锁定) → 做不完顺延到明天
 * 纯前端 + localStorage，可安装为 PWA。
 * ============================================================ */
"use strict";

const KEY = "sixthings:v1";
// 应用版本号（与 index.html 的 ?v= 保持同步）
const APP_VERSION = "20260915e";

/* ---------------- 状态 ---------------- */
let S = load();
// 若本地存储被清空（浏览器清缓存/隐私模式），尝试从 IndexedDB 自动恢复
// 延迟+重试：确保 IndexedDB 就绪后再读（首次打开数据库需要时间）
function autoRestore(attempt) {
  if (localStorage.getItem(KEY)) return; // 已有数据
  tryRestoreFromBackup().then(ok => {
    if (ok) { render(); }
    else if (attempt < 5) { setTimeout(() => autoRestore(attempt + 1), 600); }
  });
}
if (!localStorage.getItem(KEY)) {
  setTimeout(() => autoRestore(0), 500);
}
let currentTab = "today";
let reorder = null; // 拖拽排序临时状态
let editingPlanId = null; // 规划页正在编辑的条目 id（null = 没有在编辑）
let histYear = 0; // 坚持页日历：当前显示年份（0=未初始化）
let histMonth = -1; // 坚持页日历：当前显示月份（0-11，-1=未初始化）
let histSelected = null; // 坚持页日历：选中的日期 key（如 "2026-08-21"）

/* ---------------- 工具 ---------------- */
function uid() { return crypto.randomUUID(); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function keyToday(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return fmtDate(d); }
function keyTomorrow() { return keyToday(1); }
function prettyDate(key) {
  if (key === keyToday()) return I18n.t("date_today");
  if (key === keyToday(1)) return I18n.t("date_tomorrow");
  if (key === keyToday(-1)) return I18n.t("date_yesterday");
  return I18n.formatDateKey(key);
}
function nowHM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function timeToMin(hm) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

function defaultState() {
  return {
    settings: {
      itemLimit: 6,          // 3~6
      allowSkip: false,
      planReminder: "21:00",
      morningReminder: "09:00",
      notify: false,
    },
    days: {},                // dateKey -> { items:[{id,text,done,skipped}], closed:bool }
    plan: null,              // { date, items:[...] } 未来某天的清单（通常明天）
    inbox: [],               // 收件箱（插入事项）
    lastNotified: {},        // { morning:'date', evening:'date' }
    usedTodayChance: false,  // 「一次机会」是否已用掉：今天清单定型后，给一次把新规划当今日任务执行的机会
    resetId: null,           // 显式清空的标记，防止离线设备复活旧内容
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    return Object.assign(defaultState(), p, { settings: Object.assign(defaultState().settings, p.settings || {}) });
  } catch (e) { return defaultState(); }
}
function save() {
  try {
    if (typeof Sync !== "undefined") Sync.syncCapture(S);
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (error) {
    toast(I18n.t("toast_save_failed"));
    return;
  }
  idbBackup(); // 异步双写 IndexedDB 备份
  if (typeof Sync !== "undefined" && Sync.enabled && Sync.paired) Sync.syncPush();
}
// ---- IndexedDB 自动备份 ----
const IDB_NAME = "sixthings-db";
const IDB_STORE = "backup";
const IDB_KEY = "latest";
let _idbReady = false;
function idbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}
function idbBackup() {
  try {
    idbOpen().then(db => {
      _idbReady = true;
      return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put({ data: JSON.stringify(S), savedAt: Date.now() }, IDB_KEY);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    }).catch(() => {});
  } catch (e) {}
}
// 读备份（返回 Promise<string|null>）
function idbRead() {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const get = tx.objectStore(IDB_STORE).get(IDB_KEY);
    get.onsuccess = () => res(get.result ? get.result.data : null);
    get.onerror = () => rej(get.error);
  })).catch(() => null);
}
// 从备份恢复（本地存储为空时调用）；返回是否恢复成功
async function tryRestoreFromBackup() {
  const raw = await idbRead();
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && p.days) {
      S = Object.assign(defaultState(), p, { settings: Object.assign(defaultState().settings, p.settings || {}) });
      save();
      return true;
    }
  } catch (e) {}
  return false;
}

/* ---------------- 核心逻辑 ---------------- */
function getToday() { return S.days[keyToday()] || null; }
function ensureToday() { const k = keyToday(); if (!S.days[k]) { S.days[k] = { items: [], closed: false }; } return S.days[keyToday()]; }

// 把「规划」里到期的清单激活成今天的清单
function activateToday() {
  const k = keyToday();
  if (!S.plan) return;
  if (S.plan.date < k) {
    // 过期规划（date < 今天）：若今天还没有清单则激活，否则丢弃；无论哪种都不再残留
    if (!S.days[k] && S.plan.items && S.plan.items.length > 0) {
      S.days[k] = { items: S.plan.items.map(i => ({ id: i.id || uid(), text: i.text, done: false, skipped: false })), closed: false };
    }
    S.plan = null;
    save();
  } else if (!S.days[k] && S.plan.date <= k) {
    S.days[k] = { items: S.plan.items.map(i => ({ id: i.id || uid(), text: i.text, done: false, skipped: false })), closed: false };
    S.plan = null;
    save();
  }
}
// 当前该做的那一件（第一个未完成、未跳过）
function activeIndex(day) { return day.items.findIndex(i => !i.done && !i.skipped); }
function activeItem(day) { const i = activeIndex(day); return i >= 0 ? day.items[i] : null; }

function planTarget() {
  if (!S.plan) S.plan = { date: keyTomorrow(), items: [] };
  return S.plan;
}
function addPlanItem(text) {
  const p = planTarget();
  text = text.trim();
  if (!text) return;
  p.items.push({ id: uid(), text, done: false, skipped: false });
  save();
}
function removePlanItem(id) { const p = planTarget(); p.items = p.items.filter(i => i.id !== id); save(); }
function updatePlanItem(id, text) {
  const p = planTarget();
  const it = p.items.find(i => i.id === id);
  text = (text || "").trim();
  if (!it || !text) return;
  it.text = text;
  save();
}
function movePlanItem(from, to) {
  const p = planTarget();
  if (from < 0 || from >= p.items.length || to < 0 || to >= p.items.length) return;
  const [it] = p.items.splice(from, 1);
  p.items.splice(to, 0, it);
  save();
}
function planDateLabel() {
  const p = S.plan;
  return p ? (p.date === keyTomorrow() ? I18n.t("date_tomorrow") : prettyDate(p.date)) : I18n.t("date_tomorrow");
}
// 顺延：今天没做完的 → 明天清单（与已规划的去重合并）
function rolloverToday() {
  const day = getToday();
  const k = keyToday();
  const carry = day ? day.items.filter(i => !i.done) : []; // 未完成(含跳过)都顺延
  if (day) { day.closed = true; }
  if (carry.length > 0) {
    const p = planTarget();
    if (p.date !== keyTomorrow()) { p.date = keyTomorrow(); }
    const has = new Set(p.items.map(i => i.text));
    carry.forEach(i => { if (!has.has(i.text)) { p.items.push({ id: i.id || uid(), text: i.text, done: false, skipped: false }); has.add(i.text); } });
  }
  save();
  return carry.length;
}
// 从现在开始写今天的清单（首日/没规划的情况）

/* ---------------- 一次机会机制 ---------------- */
// 今天清单是否已"定型"：已顺延(closed)，或已开始且全部做完/跳过
function todayIsDone() {
  const day = getToday();
  if (!day || day.items.length === 0) return false;
  if (day.closed) return true;
  return day.items.every(i => i.done || i.skipped);
}
// 是否还有机会可用（今天没定型，或机会尚未用掉）
function chanceAvailable() {
  return !todayIsDone() || !S.usedTodayChance;
}
// 用掉一次机会：把当前规划(明天)的任务一次性转入今日清单，立即可执行
function useTodayChance() {
  const day = ensureToday();
  // 若今天清单还残留(理论不该进来)，先清掉旧的已定型项，给全新清单
  day.closed = false;
  const planItems = (S.plan && S.plan.items) ? S.plan.items : [];
  // 把规划里的任务转进今日
  if (planItems.length > 0) {
    day.items = planItems.map(i => ({ id: i.id || uid(), text: i.text, done: false, skipped: false }));
    S.plan = null;
  } else {
    // 规划为空：开启今日清单让用户直接写
    day.items = day.items.filter(i => !i.done && !i.skipped);
  }
  S.usedTodayChance = true;
  save();
}
function startToday() { const d = ensureToday(); return d; }

function completeActive() {
  const day = getToday();
  const i = activeIndex(day);
  if (i < 0) return;
  day.items[i].done = true;
  save();
}
function skipActive() {
  const day = getToday();
  const i = activeIndex(day);
  if (i < 0) return;
  day.items[i].skipped = true;
  save();
}

// 收件箱
function addInbox(text) { text = text.trim(); if (!text) return; S.inbox.unshift({ id: uid(), text, addedAt: Date.now() }); save(); }
function addTodayItem(text) {
  const day = ensureToday();
  text = text.trim();
  if (!text) return false;
  if (day.items.length >= S.settings.itemLimit) return false;
  day.items.push({ id: uid(), text, done: false, skipped: false });
  save();
  return true;
}
function doAddToday() {
  const inp = el("today-input");
  if (!inp || !inp.value.trim()) return;
  const ok = addTodayItem(inp.value);
  inp.value = "";
  if (ok) { toast(I18n.t("toast_added_today")); } else { toast(I18n.t("toast_today_full", { n: S.settings.itemLimit })); }
  renderToday();
  const ti = el("today-input");
  if (ti) ti.focus();
}
function removeInbox(id) { S.inbox = S.inbox.filter(i => i.id !== id); save(); }
function promoteInboxToPlan(id) {
  const it = S.inbox.find(i => i.id === id);
  if (!it) return;
  addPlanItem(it.text);
  S.inbox = S.inbox.filter(i => i.id !== id);
  save();
}

/* ---------------- 统计 ---------------- */
function dayStats(key) {
  const day = S.days[key];
  if (!day || !day.items || day.items.length === 0) return null;
  const done = day.items.filter(i => i.done).length;
  return { done, total: day.items.length, pct: Math.round(done / day.items.length * 100) };
}
function currentStreak() {
  let streak = 0;
  let k = keyToday();
  // 今天还没有完成记录时，从昨天开始数
  const todayS = dayStats(k);
  if (!todayS || todayS.done === 0) k = keyToday(-1);
  while (S.days[k] && dayStats(k) && dayStats(k).done > 0) { streak++; k = keyToday(-1 - streak); }
  return streak;
}
function bestStreak() {
  const keys = Object.keys(S.days).filter(k => dayStats(k) && dayStats(k).done > 0).sort();
  if (keys.length === 0) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = new Date(keys[i - 1] + "T00:00:00");
    const curD = new Date(keys[i] + "T00:00:00");
    const diff = (curD - prev) / 86400000;
    cur = diff === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
  }
  return best;
}
function totalDone() {
  let n = 0;
  for (const k in S.days) { const s = dayStats(k); if (s) n += s.done; }
  return n;
}

/* ---------------- 提醒 ---------------- */
function checkReminders() {
  const s = S.settings;
  if (!s.notify) return;
  const now = nowHM();
  const today = keyToday();
  const n = S.lastNotified || (S.lastNotified = {});
  // 早晨：今天的第一件事
  activateToday();
  const day = getToday();
  const cur = day ? activeItem(day) : null;
  if (cur && timeToMin(now) >= timeToMin(s.morningReminder) && n.morning !== today) {
    n.morning = today; save();
    const msg = I18n.t("notify_morning_body", { text: cur.text });
    notify(I18n.t("notify_morning_title"), msg);
  }
  // 晚间：该规划明天了
  const planReady = S.plan && S.plan.date === keyTomorrow() && S.plan.items.length > 0;
  if ((day && day.items.length > 0) && !planReady && timeToMin(now) >= timeToMin(s.planReminder) && n.evening !== today) {
    n.evening = today; save();
    notify(I18n.t("notify_evening_title"), I18n.t("notify_evening_body", { n: s.itemLimit }));
  }
}
function notify(title, body) {
  try {
    if (("Notification" in window) && Notification.permission === "granted") {
      new Notification(title, { body, tag: "sixthings" });
    } else {
      toast(body);
    }
  } catch (e) { toast(body); }
}

/* ---------------- 渲染 ---------------- */
function el(id) { return document.getElementById(id); }

function renderTop() {
  el("top-date").textContent = I18n.formatTopDate(new Date());
}

// 离开设置页或切换语言时，关闭仍在运行的扫码摄像头
function stopSyncScanner() {
  const wrap = el("sync-scanner-wrap");
  if (wrap) wrap.style.display = "none";
  if (typeof Sync !== "undefined" && Sync._scanStop) {
    try { Sync._scanStop(); } catch (e) {}
    Sync._scanStop = null;
  }
}

function render() {
  if (currentTab !== "settings") stopSyncScanner();
  renderTop();
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === currentTab));
  if (currentTab === "history" && histMonth < 0) {
    const now = new Date();
    histYear = now.getFullYear();
    histMonth = now.getMonth();
    histSelected = null;
  }
  if (currentTab === "today") renderToday();
  else if (currentTab === "plan") renderPlan();
  else if (currentTab === "history") renderHistory();
  else if (currentTab === "settings") renderSettings();
}

function renderToday() {
  activateToday();
  const day = getToday();
  const screen = el("screen");
  const s = S.settings;
  let html = "";

  // 收尾横幅：晚间且今天有没做完的
  const isEvening = timeToMin(nowHM()) >= timeToMin(s.planReminder);
  if (isEvening && day && !day.closed && day.items.length > 0) {
    const carry = day.items.filter(i => !i.done && !i.skipped);
    if (carry.length > 0) {
      html += '<div class="banner">' + I18n.t("today_banner_unfinished", { n: carry.length }) + '<div class="banner-actions"><button class="btn" data-act="rollover">' + I18n.t("today_banner_rollover_btn") + '</button></div></div>';
    }
  }

  if (!day) {
    html += '<div class="empty"><div class="big">✍️</div><p>' + I18n.t("today_empty_1") + '<br/>' + I18n.t("today_empty_2") + '<br/>' + I18n.t("today_empty_3") + '</p><button class="btn btn-primary" data-act="start-today">' + I18n.t("today_empty_start_btn") + '</button><p class="muted" style="margin-top:14px">' + I18n.t("today_empty_alt") + '</p></div>';
    html += renderInboxHTML();
    screen.innerHTML = html;
    bind(screen);
    return;
  }

  if (day.items.length === 0) {
    // 刚创建今天的清单，还没写事项
    html += '<div class="card" style="margin-top:12px"><b style="font-size:15px">' + I18n.t("today_write_title") + '</b><div class="add-row" style="margin-top:10px"><input id="today-input" placeholder="' + I18n.t("today_input_placeholder") + '" maxlength="80" /><button data-act="add-today">+</button></div><p class="muted" style="margin-top:10px">' + I18n.t("today_input_max", { n: s.itemLimit }) + '</p></div>';
    html += renderInboxHTML();
    screen.innerHTML = html;
    bind(screen);
    const ti = el("today-input");
    if (ti) { ti.focus(); ti.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) doAddToday(); }); }
    return;
  }

  const idx = activeIndex(day);
  const cur = idx >= 0 ? day.items[idx] : null;
  const doneN = day.items.filter(i => i.done).length;
  const total = day.items.length;
  const pct = Math.round(doneN / total * 100);

  html += '<div class="progress-wrap"><div class="progress-meta"><span>' + I18n.t("today_progress_label") + '</span><span>' + doneN + '/' + total + (pct === 100 ? ' ' + I18n.t("today_all_done_suffix") : '') + '</span></div><div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';

  if (cur) {
    html += '<div class="now-card"><div class="now-label">▶ ' + I18n.t("today_now", { idx: idx + 1, total }) + '</div><p class="now-text">' + esc(cur.text) + '</p><div class="now-actions">';
    html += '<button class="btn btn-done" data-act="complete">' + I18n.t("today_done_btn") + '</button>';
    if (s.allowSkip) html += '<button class="btn btn-skip" data-act="skip">' + I18n.t("today_skip_btn") + '</button>';
    html += '</div></div>';
  } else {
    html += '<div class="now-card"><div class="now-label">' + I18n.t("today_all_done_label") + '</div><p class="now-text">' + I18n.t("today_all_done_desc", { total }) + '</p></div>';
  }

  // 清单
  html += '<ul class="todo-list">';
  day.items.forEach((it, i) => {
    const cls = it.done ? "done" : (i > idx ? "locked" : "");
    const state = it.done ? "✓" : (it.skipped ? I18n.t("today_state_skipped") : (i === idx ? I18n.t("today_state_active") : "🔒"));
    html += '<li class="' + cls + '"><span class="todo-num">' + (i + 1) + '</span><span class="todo-text">' + esc(it.text) + '</span><span class="todo-state">' + state + '</span></li>';
  });
  html += "</ul>";

  if (idx >= 0 && s.allowSkip) {
    html += '<p class="muted" style="margin-top:10px">' + I18n.t("today_skip_note") + '</p>';
  }

  // 还没完成任何一件时，保留「再写一件」输入行（清单还没定稿）
  if (doneN === 0 && day.items.length < s.itemLimit) {
    html += '<div class="add-row" style="margin-top:14px"><input id="today-input" placeholder="' + I18n.t("today_add_more_placeholder", { n: s.itemLimit }) + '" maxlength="80" /><button data-act="add-today">+</button></div>';
  }

  html += renderInboxHTML();
  screen.innerHTML = html;
  bind(screen);
  const ti = el("today-input");
  if (ti) ti.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) doAddToday(); });
}

function renderInboxHTML() {
  let html = '<div class="card" style="margin-top:16px"><div style="display:flex;align-items:center;justify-content:space-between"><b style="font-size:15px">' + I18n.t("inbox_title") + '</b><span class="muted">' + I18n.t("inbox_subtitle") + '</span></div>';
  html += '<div class="add-row" style="margin-top:10px"><input id="inbox-input" placeholder="' + I18n.t("inbox_placeholder") + '" maxlength="80" /><button data-act="add-inbox">+</button></div>';
  if (S.inbox.length > 0) {
    html += '<ul class="plan-list">';
    S.inbox.forEach(it => {
      html += '<li><span class="plan-rank" style="background:#eee">✎</span><span class="plan-text">' + esc(it.text) + '</span><button class="plan-del" data-act="inbox-promote" data-id="' + it.id + '" title="' + I18n.t("inbox_promote_title") + '">→</button><button class="plan-del" data-act="inbox-del" data-id="' + it.id + '">✕</button></li>';
    });
    html += '</ul>';
  }
  html += '</div>';
  return html;
}

function renderPlan() {
  activateToday();
  const p = planTarget();
  const s = S.settings;
  const day = getToday();
  const screen = el("screen");

  // 今天没做完的横幅
  let banner = "";
  if (day && !day.closed && day.items.length > 0) {
    const carry = day.items.filter(i => !i.done && !i.skipped);
    if (carry.length > 0) banner = '<div class="banner">' + I18n.t("plan_banner_unfinished", { n: carry.length }) + '<div class="banner-actions"><button class="btn" data-act="rollover">' + I18n.t("plan_rollover_btn") + '</button></div></div>';
  }

  // 一次机会：今天清单已定型（全做完/顺延），且机会未用 → 允许把新规划当今日任务执行
  if (todayIsDone() && !S.usedTodayChance) {
    const hasPlan = S.plan && S.plan.items && S.plan.items.length > 0;
    banner += '<div class="banner chance-banner">' + I18n.t("plan_chance_banner", {
      state: day.closed ? I18n.t("plan_chance_rolled") : I18n.t("plan_chance_done"),
      what: hasPlan ? I18n.t("plan_chance_plan") : I18n.t("plan_chance_write"),
    }) + '<div class="banner-actions"><button class="btn" data-act="use-chance">' + I18n.t("plan_chance_btn") + '</button></div></div>';
  }

  const capNote = p.items.length >= s.itemLimit ? I18n.t("plan_cap_full", { n: s.itemLimit }) : I18n.t("plan_cap_note", { n: s.itemLimit });

  let html = banner;
  html += '<div class="plan-header"><h2 class="plan-title">' + I18n.t("plan_title_for", { date: (p.date === keyTomorrow() ? I18n.t("date_tomorrow") : prettyDate(p.date)) }) + '</h2><div class="plan-cap">' + capNote + ' · ' + I18n.t("plan_first_note") + '</div></div>';

  html += '<div class="add-row"><input id="plan-input" placeholder="' + (p.items.length >= s.itemLimit ? I18n.t("plan_input_placeholder_full") : I18n.t("plan_input_placeholder")) + '" maxlength="80" ' + (p.items.length >= s.itemLimit ? "disabled" : "") + ' /><button data-act="add-plan" ' + (p.items.length >= s.itemLimit ? "disabled" : "") + '>+</button></div>';

  if (p.items.length === 0) {
    html += '<div class="empty" style="padding:24px 12px"><div class="big">🌙</div><p>' + I18n.t("plan_empty_1") + '<br/>' + I18n.t("plan_empty_2") + '</p></div>';
  } else {
    html += '<ul class="plan-list" id="plan-list">';
    p.items.forEach((it, i) => {
      if (editingPlanId === it.id) {
        // 编辑模式：显示输入框 + 保存/取消
        html += '<li data-id="' + it.id + '" data-idx="' + i + '" class="editing"><span class="plan-rank">' + (i + 1) + '</span><input id="plan-edit-input" class="plan-edit-input" value="' + esc(it.text) + '" maxlength="80" data-id="' + it.id + '" /><button class="plan-del" data-act="save-plan-edit" data-id="' + it.id + '" title="' + I18n.t("plan_edit_save_title") + '">✓</button><button class="plan-del" data-act="cancel-plan-edit" title="' + I18n.t("plan_edit_cancel_title") + '">✕</button></li>';
      } else {
        html += '<li data-id="' + it.id + '" data-idx="' + i + '"><span class="plan-rank">' + (i + 1) + '</span><span class="plan-text">' + esc(it.text) + '</span><button class="plan-del" data-act="edit-plan" data-id="' + it.id + '" title="' + I18n.t("plan_edit_title") + '">✎</button><span class="plan-drag" title="' + I18n.t("plan_drag_title") + '">⠿</span><button class="plan-del" data-act="del-plan" data-id="' + it.id + '">✕</button></li>';
      }
    });
    html += '</ul>';
    if (p.items.length > s.itemLimit) {
      html += '<p class="muted" style="margin-top:8px">' + I18n.t("plan_over_limit", { n: p.items.length - s.itemLimit }) + '</p>';
    }
  }

  if (S.inbox.length > 0) {
    html += '<div class="card" style="margin-top:16px"><b style="font-size:15px">' + I18n.t("plan_inbox_title") + '</b><ul class="plan-list">';
    S.inbox.forEach(it => {
      html += '<li><span class="plan-rank" style="background:#eee">✎</span><span class="plan-text">' + esc(it.text) + '</span><button class="plan-del" data-act="inbox-promote" data-id="' + it.id + '">' + I18n.t("plan_inbox_promote_btn") + '</button></li>';
    });
    html += '</ul></div>';
  }

  html += '<div class="hint-note">' + I18n.t("plan_hint_1") + '<br/>' + I18n.t("plan_hint_2") + '</div>';

  screen.innerHTML = html;
  bind(screen);
  setupDrag();
  const pi = el("plan-input");
  if (pi) { pi.focus(); pi.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) doAddPlan(); }); }
  // 编辑输入框：Enter 保存，Esc 取消
  const ei = el("plan-edit-input");
  if (ei) {
    ei.focus();
    ei.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.isComposing) { const id = ei.dataset.id; updatePlanItem(id, ei.value); editingPlanId = null; renderPlan(); }
      else if (e.key === "Escape") { editingPlanId = null; renderPlan(); }
    });
  }
}

function renderHistory() {
  const screen = el("screen");
  const streak = currentStreak();
  const best = bestStreak();
  const total = totalDone();

  let html = '<div class="card"><div class="streak-hero"><div class="streak-num">' + streak + '</div><div class="streak-label">' + I18n.t("hist_streak_label") + '</div><div class="streak-tip">' + I18n.t("hist_streak_tip") + '</div></div><div style="display:flex;justify-content:space-around;padding:8px 0 2px"><div style="text-align:center"><div style="font-size:22px;font-weight:800;color:var(--ink-2)">' + best + '</div><div class="muted">' + I18n.t("hist_best") + '</div></div><div style="text-align:center"><div style="font-size:22px;font-weight:800;color:var(--ink-2)">' + total + '</div><div class="muted">' + I18n.t("hist_total") + '</div></div></div></div>';

  // 月历
  html += renderCalendarHTML();

  // 选中日明细（所有历史任务都能查看）
  if (histSelected) {
    html += renderDayDetail(histSelected);
  }

  screen.innerHTML = html;
  bind(screen);
}

// 生成月历 HTML
function renderCalendarHTML() {
  const y = histYear, m = histMonth;
  const firstDay = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  // 当月 1 号是星期几（0=周日）
  const lead = firstDay.getDay();
  const today = keyToday();
  const monthLabel = I18n.formatMonth(y, m);

  let html = '<div class="card"><div class="cal-header"><button class="cal-nav" data-act="hist-prev" data-delta="-1">‹</button><div class="cal-title">' + monthLabel + '</div><button class="cal-nav" data-act="hist-next" data-delta="1">›</button></div><div class="cal-grid">';
  I18n.weekdays().forEach(w => { html += '<div class="cal-wd">' + w + '</div>'; });
  // 前导空格
  for (let i = 0; i < lead; i++) html += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const st = dayStats(key);
    const day = S.days[key];
    // 状态：full=全完成，partial=部分完成，some=有任务未完成，blank=无记录
    let cls = "blank";
    if (day && day.items.length > 0) {
      const done = day.items.filter(i => i.done).length;
      if (done === day.items.length) cls = "full";
      else if (done > 0) cls = "partial";
      else cls = "some";
    }
    const isToday = key === today;
    const isSel = key === histSelected;
    html += '<button class="cal-cell ' + cls + (isToday ? " today" : "") + (isSel ? " sel" : "") + '" data-act="hist-day" data-id="' + key + '">' + d + '</button>';
  }
  html += '</div><div class="cal-legend"><span class="lg lg-full"></span>' + I18n.t("cal_legend_full") + ' <span class="lg lg-partial"></span>' + I18n.t("cal_legend_partial") + ' <span class="lg lg-some"></span>' + I18n.t("cal_legend_some") + ' <span class="lg lg-blank"></span>' + I18n.t("cal_legend_blank") + '</div></div>';
  return html;
}

// 生成选中日的任务明细
function renderDayDetail(key) {
  const day = S.days[key];
  if (!day || day.items.length === 0) {
    return '<div class="card"><h2 class="sec-title" style="font-size:16px">' + prettyDate(key) + '</h2><p class="muted" style="padding:8px 2px">' + I18n.t("hist_day_no_record") + '</p></div>';
  }
  const st = dayStats(key);
  let html = '<div class="card"><div class="day-detail-head"><h2 class="sec-title" style="font-size:16px">' + prettyDate(key) + '</h2><span class="day-detail-sum">' + I18n.t("hist_day_sum", { done: st.done, total: st.total }) + '</span></div><ul class="day-detail-list">';
  day.items.forEach((it, idx) => {
    const stCls = it.done ? "done" : (it.skipped ? "skipped" : "todo");
    const stTxt = it.done ? "✓" : (it.skipped ? I18n.t("hist_day_state_skipped") : I18n.t("hist_day_state_todo"));
    html += '<li class="dd-' + stCls + '"><span class="dd-rank">' + (idx + 1) + '</span><span class="dd-text">' + esc(it.text) + '</span><span class="dd-state">' + stTxt + '</span></li>';
  });
  html += '</ul></div>';
  return html;
}

function renderSettings() {
  stopSyncScanner(); // 设置页重渲染时关闭仍在运行的扫码摄像头
  const s = S.settings;
  const screen = el("screen");
  let html = '';

  // 语言选择：顶部、双语显示，选项名两种模式下都用原生名称
  const langEn = I18n.lang() === "en";
  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">' + I18n.t("settings_language_title") + '</h2>';
  html += '<div class="set-row lang-row"><div><div class="set-label">' + I18n.t("settings_language_label") + '</div><div class="set-desc">' + I18n.t("settings_language_desc") + '</div></div>';
  html += '<select id="lang-select" class="lang-select" data-act="set-lang" aria-label="' + I18n.t("settings_language_label") + '"><option value="zh"' + (langEn ? "" : " selected") + '>简体中文</option><option value="en"' + (langEn ? " selected" : "") + '>English</option></select></div>';
  html += '</div>';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">' + I18n.t("set_rules_title") + '</h2>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_item_limit") + '</div><div class="set-desc">' + I18n.t("set_item_limit_desc") + '</div></div><div class="limit-stepper"><button data-act="limit-down" ' + (s.itemLimit <= 3 ? "disabled" : "") + '>−</button><span class="set-value">' + s.itemLimit + '</span><button data-act="limit-up" ' + (s.itemLimit >= 6 ? "disabled" : "") + '>+</button></div></div>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_allow_skip") + '</div><div class="set-desc">' + I18n.t("set_allow_skip_desc") + '</div></div><label class="switch"><input type="checkbox" data-act="toggle-skip" ' + (s.allowSkip ? "checked" : "") + '/><span class="track"></span></label></div>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_chance") + '</div><div class="set-desc">' + I18n.t("set_chance_desc") + '</div></div><label class="switch"><input type="checkbox" data-act="toggle-chance" ' + (!S.usedTodayChance ? "checked" : "") + '/><span class="track"></span></label></div>';
  html += '</div>';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">' + I18n.t("set_reminders_title") + '</h2>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_plan_reminder") + '</div><div class="set-desc">' + I18n.t("set_plan_reminder_desc") + '</div></div><input type="time" data-act="plan-reminder" value="' + s.planReminder + '" style="border:1.5px solid var(--line);border-radius:10px;padding:6px;font-size:15px" /></div>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_morning_reminder") + '</div><div class="set-desc">' + I18n.t("set_morning_reminder_desc") + '</div></div><input type="time" data-act="morning-reminder" value="' + s.morningReminder + '" style="border:1.5px solid var(--line);border-radius:10px;padding:6px;font-size:15px" /></div>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_notify") + '</div><div class="set-desc">' + I18n.t("set_notify_desc") + '</div></div><label class="switch"><input type="checkbox" data-act="toggle-notify" ' + (s.notify ? "checked" : "") + '/><span class="track"></span></label></div>';
  html += '</div>';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">' + I18n.t("set_method_title") + '</h2>';
  const steps = [
    [I18n.t("method_1_title"), I18n.t("method_1_desc")],
    [I18n.t("method_2_title"), I18n.t("method_2_desc")],
    [I18n.t("method_3_title"), I18n.t("method_3_desc")],
    [I18n.t("method_4_title"), I18n.t("method_4_desc")],
  ];
  steps.forEach(([t, d], i) => {
    html += '<div class="method-step"><span class="n">' + (i + 1) + '</span><p><b>' + t + '</b> — ' + d + '</p></div>';
  });
  html += '<p class="muted" style="margin-top:10px">' + I18n.t("set_method_note") + '</p>';
  html += '</div>';

  const syncOk = typeof Sync !== "undefined" && Sync.enabled;
  const paired = typeof Sync !== "undefined" && Sync.paired;
  html += '<div class="card sync-status-card" data-sync-mode="' + syncOk + ':' + paired + '"><h2 class="sec-title" style="font-size:16px">' + I18n.t("set_sync_title") + '</h2>';
  html += '<p class="sync-label muted">' + syncStatusLabel() + '</p><p class="sync-error muted"></p>';
  if (paired) {
    html += '<p class="sync-members muted">' + esc(I18n.t("set_sync_members", { n: Sync.members })) + '</p>';
    html += '<button class="btn ghost-btn" data-act="sync-disconnect">' + I18n.t("set_sync_disconnect_btn") + '</button> ';
  } else {
    html += '<p class="muted">' + (syncOk ? I18n.t("set_sync_unpaired_host") : I18n.t("set_sync_unpaired_local")) + '</p>';
  }
  html += '<button class="btn" data-act="sync-pair">' + (paired ? I18n.t("set_sync_add_device_btn") : I18n.t("set_sync_show_code_btn")) + '</button>';
  html += '<div id="sync-pair-area"></div>';
  html += '<div style="display:flex;gap:8px;margin-top:10px;align-items:center"><input id="sync-code-input" placeholder="' + I18n.t("set_sync_code_placeholder") + '" maxlength="12" style="flex:1;min-width:0;border:1.5px solid var(--line);border-radius:10px;padding:8px;font-size:15px" /><button class="btn" data-act="sync-join">' + I18n.t("set_sync_join_btn") + '</button><button class="btn ghost-btn" data-act="sync-scan">' + I18n.t("set_sync_scan_btn") + '</button></div>';
  html += '<div id="sync-scanner-wrap" style="display:none;margin-top:10px"><video id="sync-scanner" playsinline muted style="width:100%;max-width:280px;border-radius:12px;background:#000"></video><p class="muted">' + I18n.t("set_sync_scan_hint") + '</p></div>';
  html += '<p class="muted" style="font-size:12px">' + I18n.t("set_sync_code_note") + '</p></div>';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">' + I18n.t("set_backup_title") + '</h2>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_export_label") + '</div><div class="set-desc">' + I18n.t("set_export_desc") + '</div></div><button class="btn" style="padding:8px 14px;font-size:13px" data-act="export-data">' + I18n.t("set_export_btn") + '</button></div>';
  html += '<div class="set-row"><div><div class="set-label">' + I18n.t("set_import_label") + '</div><div class="set-desc">' + I18n.t("set_import_desc") + '</div></div><button class="btn ghost-btn" style="padding:8px 14px;font-size:13px" data-act="import-data">' + I18n.t("set_import_btn") + '</button></div>';
  html += '<input type="file" id="import-file" accept="application/json,.json" style="display:none" />';
  html += '</div>';
  html += '<div class="card" style="margin-top:16px"><div class="set-row"><div><div class="set-label">' + I18n.t("set_reset_label") + '</div><div class="set-desc">' + I18n.t("set_reset_desc") + '</div></div><button class="btn ghost-btn" style="padding:8px 14px;font-size:13px" data-act="reset">' + I18n.t("set_reset_btn") + '</button></div></div>';
  html += '<p class="muted" style="text-align:center;margin-top:18px">' + I18n.t("set_footer_note") + '</p>';
  html += '<p class="muted" style="text-align:center;margin-top:6px;font-size:11px;opacity:.7">' + I18n.t("set_footer_version", { v: APP_VERSION }) + '</p>';

  screen.innerHTML = html;
  bind(screen);
  // 导入：文件选择后读取合并
  const fi = el("import-file");
  if (fi) {
    fi.addEventListener("change", (e) => {
      const f = fi.files && fi.files[0];
      fi.value = "";
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const p = JSON.parse(rd.result);
          if (!p || typeof p !== "object" || !p.days) throw new Error("bad");
          // 合并导入：保留现有 + 补入备份里的历史天（不覆盖现有同一天的记录）
          for (const k in p.days) {
            if (!S.days[k]) S.days[k] = p.days[k];
          }
          if (p.inbox && Array.isArray(p.inbox)) S.inbox = [...new Set([...S.inbox.map(i => i.text), ...p.inbox.map(i => i.text)])].map(t => ({ id: uid(), text: t }));
          if (p.plan && p.plan.items && (!S.plan || S.plan.items.length === 0)) S.plan = p.plan;
          save();
          toast(I18n.t("toast_imported_days", { n: Object.keys(p.days).length }));
          render();
        } catch (err) { toast(I18n.t("toast_import_failed")); }
      };
      rd.readAsText(f);
    });
  }
}

/* ---------------- 事件绑定 ---------------- */
function bind(root) {
  // 顶部同步指示器 → 设置页
  const sind = root.querySelector && root.querySelector("#sync-indicator");
  if (sind) sind.addEventListener("click", () => { currentTab = "settings"; render(); });
  root.querySelectorAll("[data-act]").forEach(b => {
    const event = b.matches('input[type="checkbox"], input[type="time"], select') ? "change" : "click";
    b.addEventListener(event, (e) => {
      if (event === "click") e.preventDefault();
      const act = b.dataset.act;
      const id = b.dataset.id;
      handle(act, id, b);
    });
  });
}

function handle(act, id, btn) {
  switch (act) {
    case "set-lang":
      // 切换界面语言：立即生效并持久化到独立 key；不触碰任务与同步数据
      I18n.setLang(btn.value);
      stopSyncScanner();
      render();
      updateSyncIndicator();
      return;
    case "complete": {
      completeActive();
      const done = getToday().items.filter(i => i.done).length;
      const total = getToday().items.length;
      if (done === total) {
        burst("🎉");
        toast(I18n.t("toast_complete_all"));
      } else {
        burst("✓");
        const nxt = activeItem(getToday());
        toast(nxt ? I18n.t("toast_complete_next", { text: nxt.text }) : I18n.t("toast_complete_plain"));
      }
      break;
    }
    case "skip":
      skipActive();
      toast(I18n.t("toast_skipped"));
      break;
    case "rollover": {
      const n = rolloverToday();
      toast(n > 0 ? I18n.t("toast_rollover_n", { n }) : I18n.t("toast_rollover_none"));
      if (currentTab === "plan") renderPlan(); else renderToday();
      return;
    }
    case "use-chance": {
      const hadPlan = !!(S.plan && S.plan.items && S.plan.items.length > 0);
      useTodayChance();
      currentTab = "today";
      renderToday();
      toast(hadPlan ? I18n.t("toast_chance_used_plan") : I18n.t("toast_chance_used_none"));
      return;
    }
    case "start-today": {
      startToday();
      renderToday();
      toast(I18n.t("toast_start_today"));
      return;
    }
    case "add-today": { doAddToday(); return; }
    case "add-inbox": {
      const inp = el("inbox-input");
      if (inp && inp.value.trim()) { addInbox(inp.value); toast(I18n.t("toast_inbox_added")); }
      break;
    }
    case "inbox-promote": addPlanItem((S.inbox.find(i => i.id === id) || {}).text || ""); S.inbox = S.inbox.filter(i => i.id !== id); save(); toast(I18n.t("toast_added_plan")); break;
    case "inbox-del": removeInbox(id); break;
    case "del-plan": removePlanItem(id); break;
    case "add-plan": doAddPlan(); return;
    case "edit-plan": editingPlanId = id; renderPlan(); return;
    case "save-plan-edit": {
      const inp = el("plan-edit-input");
      if (inp) updatePlanItem(id, inp.value);
      editingPlanId = null;
      renderPlan();
      return;
    }
    case "cancel-plan-edit": editingPlanId = null; renderPlan(); return;
    case "limit-up": if (S.settings.itemLimit < 6) { S.settings.itemLimit++; save(); } break;
    case "limit-down": if (S.settings.itemLimit > 3) { S.settings.itemLimit--; save(); } break;
    case "toggle-skip": S.settings.allowSkip = btn.checked; save(); toast(S.settings.allowSkip ? I18n.t("toast_skip_on") : I18n.t("toast_skip_off")); break;
    case "toggle-chance": {
      S.usedTodayChance = !btn.checked; // 打开开关 = 重置为可用(used=false)
      save();
      toast(btn.checked ? I18n.t("toast_chance_on") : I18n.t("toast_chance_off"));
      break;
    }
    case "toggle-notify": S.settings.notify = btn.checked; save(); if (btn.checked) requestNotify(); break;
    case "plan-reminder": S.settings.planReminder = btn.value || "21:00"; save(); break;
    case "morning-reminder": S.settings.morningReminder = btn.value || "09:00"; save(); break;
    case "hist-prev":
    case "hist-next": {
      const delta = Number(btn.dataset.delta || (id === "hist-prev" ? -1 : 1));
      histMonth += delta;
      if (histMonth < 0) { histMonth = 11; histYear--; }
      if (histMonth > 11) { histMonth = 0; histYear++; }
      renderHistory();
      return;
    }
    case "hist-day": {
      histSelected = id; // id = 日期 key
      renderHistory();
      return;
    }
    case "sync-pair": {
      if (typeof Sync === "undefined" || !Sync.enabled) { toast(I18n.t("toast_sync_unconfigured")); break; }
      Sync.syncCreatePairing().then(r => {
      if (r.ok) {
        const area = el("sync-pair-area");
        if (area) {
          area.innerHTML = '<div style="margin-top:10px;padding:14px;border:1.5px dashed var(--accent);border-radius:12px;text-align:center"><div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">' + I18n.t("set_sync_pair_hint") + '</div><div id="sync-qr" style="margin:8px auto;width:160px;height:160px;background:#fff;padding:8px;border-radius:8px"></div><div style="font-size:24px;font-weight:900;letter-spacing:3px;color:var(--accent)">' + r.code + '</div><div style="font-size:12px;color:var(--ink-3);margin-top:6px">' + I18n.t("set_sync_pair_valid") + '</div></div>';
          if (typeof Sync.syncRenderQR === "function") Sync.syncRenderQR(el("sync-qr"), r.code);
        }
        toast(I18n.t("toast_pair_code", { code: r.code }));
      } else { toast(I18n.t("toast_pair_failed", { reason: r.reason || I18n.t("common_unknown") })); }
      });
      break;
    }
    case "sync-scan": {
      if (typeof Sync === "undefined" || !Sync.enabled) { toast(I18n.t("toast_sync_unconfigured")); break; }
      const wrap = el("sync-scanner-wrap");
      const video = el("sync-scanner");
      if (!wrap || !video) { toast(I18n.t("toast_scan_unavailable")); break; }
      if (wrap.style.display === "none") {
        const sc = Sync.syncStartScanner(video, (code) => {
          // 识别到二维码（内容=配对码）
          if (code && /^[0-9A-F]{12}$/i.test(code)) {
            wrap.style.display = "none";
            Sync.syncJoinPairing(code).then(r => {
              if (r.ok) { toast(I18n.t("toast_scan_success")); renderSettings(); }
              else { toast(I18n.t("toast_join_failed", { reason: r.reason || I18n.t("common_unknown") })); }
            });
            return true; // 停止扫描
          }
          return false;
        });
        if (sc && sc.ok) { wrap.style.display = "block"; }
        else { toast(sc && sc.reason ? sc.reason : I18n.t("toast_scan_open_failed")); }
      } else { wrap.style.display = "none"; if (Sync._scanStop) { Sync._scanStop(); Sync._scanStop = null; } }
      break;
    }
    case "sync-join": {
      if (typeof Sync === "undefined" || !Sync.enabled) { toast(I18n.t("toast_sync_unconfigured")); break; }
      const inp = el("sync-code-input");
      const code = inp ? inp.value.trim() : "";
      if (!/^[0-9A-F]{12}$/i.test(code)) { toast(I18n.t("toast_enter_code")); break; }
      Sync.syncJoinPairing(code).then(r => {
        if (r.ok) { toast(I18n.t("toast_join_success")); renderSettings(); }
        else { toast(I18n.t("toast_join_failed", { reason: r.reason || I18n.t("common_unknown") })); }
      });
      break;
    }
    case "sync-disconnect": {
      if (typeof Sync !== "undefined") { Sync.syncDisconnect(); }
      renderSettings();
      toast(I18n.t("toast_disconnected"));
      break;
    }
    case "export-data": {
      try {
        const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sixthings-backup-" + keyToday() + ".json";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
        toast(I18n.t("toast_exported"));
      } catch (e) { toast(I18n.t("toast_export_failed")); }
      break;
    }
    case "import-data": {
      const fi = el("import-file");
      if (fi) fi.click();
      break;
    }
    case "reset":
      if (confirm(I18n.t("confirm_reset"))) {
        S = defaultState();
        S.resetId = crypto.randomUUID();
        save(); // Persist an empty backup and send an explicit shared-state deletion.
        toast(I18n.t("toast_cleared"));
      }
      break;
  }
  render();
}
function doAddPlan() {
  const inp = el("plan-input");
  if (!inp || !inp.value.trim()) return;
  addPlanItem(inp.value);
  inp.value = "";
  render();
  const pi = el("plan-input");
  if (pi) pi.focus();
}

/* ---------------- 拖拽排序 ---------------- */
// 用文档级 pointer 监听：拖出列表也能继续，setPointerCapture 失败也不中断
function setupDrag() {
  const list = el("plan-list");
  if (!list) return;
  let dragging = null, overIdx = -1;
  const items = () => [...list.children];

  function onDown(e) {
    if (!e.target || !e.target.closest) return;
    const h = e.target.closest(".plan-drag");
    if (!h) return;
    const li = h.closest("li");
    if (!li) return;
    dragging = { li, from: Number(li.dataset.idx), startY: e.clientY };
    try { if (li.setPointerCapture) li.setPointerCapture(e.pointerId); } catch (_) {}
    li.classList.add("dragging");
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const y = e.clientY;
    overIdx = items().findIndex(el => {
      const r = el.getBoundingClientRect();
      return y >= r.top && y < r.bottom;
    });
    dragging.li.style.transform = "translateY(" + (y - dragging.startY) + "px)";
  }
  function onUp() {
    if (!dragging) return;
    const from = dragging.from;
    const to = overIdx;
    dragging.li.style.transform = "";
    dragging.li.classList.remove("dragging");
    if (to >= 0 && to !== from) movePlanItem(from, to);
    dragging = null; overIdx = -1;
    render();
  }
  list.addEventListener("pointerdown", onDown);
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

/* ---------------- 小工具 ---------------- */
function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 2200);
}
function burst(emoji) {
  const d = document.createElement("div");
  d.className = "burst";
  d.textContent = emoji;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
function requestNotify() {
  try {
    if ("Notification" in window) {
      if (Notification.permission === "default") Notification.requestPermission();
    } else { toast(I18n.t("toast_notify_unsupported")); S.settings.notify = false; save(); }
  } catch (e) { S.settings.notify = false; save(); }
}

/* ---------------- 启动 ---------------- */
// 多端同步：收到远端数据 → 合并保存
function syncApplyRemote(payload) {
  if (!payload || !payload.data) return;
  const data = SixSync.project(typeof payload.data === "string" ? JSON.parse(payload.data) : payload.data);
  if (SixSync.equal(SixSync.project(S), data)) return;
  S.days = data.days;
  S.plan = data.plan;
  S.inbox = data.inbox;
  S.settings = { ...S.settings, ...data.settings }; // Notification permission remains local.
  S.usedTodayChance = data.usedTodayChance;
  S.resetId = data.resetId;
  save();
  render();
}
// 全局同步指示器：顶部小圆点 + 最后同步时间（所有页面可见）
function syncStatusLabel() {
  if (typeof Sync === "undefined") return I18n.t("sync_off_unconfigured");
  return I18n.t(({off:"sync_state_off", connecting:"sync_state_connecting", syncing:"sync_state_syncing", pending:"sync_state_pending", connected:"sync_state_connected", reconnecting:"sync_state_reconnecting", error:"sync_state_error"})[Sync.connState] || "sync_state_unknown");
}
function updateSyncIndicator() {
  const ind = el("sync-indicator");
  if (!ind || typeof Sync === "undefined") return;
  ind.style.display = Sync.paired ? "flex" : "none";
  const color = Sync.connState === "connected" ? "#22c55e" : Sync.connState === "error" ? "#ef4444" : "#f59e0b";
  const dot = el("sync-ind-dot"); if (dot) dot.style.background = color;
  const text = el("sync-ind-time"); if (text) text.textContent = syncStatusLabel();
  let card = document.querySelector(".sync-status-card");
  if (currentTab === "settings" && card && card.dataset.syncMode !== String(Sync.enabled) + ":" + String(Sync.paired)) {
    renderSettings(); card = document.querySelector(".sync-status-card");
  }
  if (card) {
    card.querySelector(".sync-label").textContent = syncStatusLabel();
    card.querySelector(".sync-error").textContent = Sync.lastError;
    const members = card.querySelector(".sync-members"); if (members) members.textContent = I18n.t("set_sync_members", { n: Sync.members });
  }
}
if (typeof Sync !== "undefined") {
  Sync.onData = (payload) => { if (payload && payload.type === "remote-data") syncApplyRemote(payload); };
  Sync.onGetData = () => S;
  // 状态变化 → 更新全局指示器
  const _prevOC = Sync.onStateChange;
  Sync.onStateChange = (st) => { updateSyncIndicator(); if (_prevOC) _prevOC(st); };
  try { Sync.syncAutoInit(); } catch (e) {}
  // 每秒刷新指示器时间 + 同步状态
  setInterval(updateSyncIndicator, 1000);
}

function boot() {
  I18n.applyStatic();
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => { currentTab = t.dataset.tab; render(); });
  });
  el("sync-indicator").addEventListener("click", () => { currentTab = "settings"; render(); });
  render();
  checkReminders();
  setInterval(() => {
    // 跨天自动刷新（日期文案随语言变化，直接比对当前渲染值）
    const want = I18n.formatTopDate(new Date());
    if (el("top-date").textContent !== "" && el("top-date").textContent !== want) { render(); checkReminders(); }
    checkReminders();
  }, 60000);
}
boot();

// PWA service worker 注册
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
