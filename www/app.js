/* ============================================================
 * 六件事 · Six Things  — 适配 Ivy Lee 法（六件事法）
 * 睡前列清单(上限N) → 按重要排序 → 白天只做第一件(顺序锁定) → 做不完顺延到明天
 * 纯前端 + localStorage，可安装为 PWA。
 * ============================================================ */
"use strict";

const KEY = "sixthings:v1";
// 应用版本号（与 index.html 的 ?v= 保持同步）
const APP_VERSION = "20260825b";

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
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function keyToday(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return fmtDate(d); }
function keyTomorrow() { return keyToday(1); }
function prettyDate(key) {
  if (key === keyToday()) return "今天";
  if (key === keyToday(1)) return "明天";
  if (key === keyToday(-1)) return "昨天";
  const d = new Date(key + "T00:00:00");
  const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + wd;
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
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
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
      S.days[k] = { items: S.plan.items.map(i => ({ id: uid(), text: i.text, done: false, skipped: false })), closed: false };
    }
    S.plan = null;
    save();
  } else if (!S.days[k] && S.plan.date <= k) {
    S.days[k] = { items: S.plan.items.map(i => ({ id: uid(), text: i.text, done: false, skipped: false })), closed: false };
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
  return p ? (p.date === keyTomorrow() ? "明天" : prettyDate(p.date)) : "明天";
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
    carry.forEach(i => { if (!has.has(i.text)) { p.items.push({ id: uid(), text: i.text, done: false, skipped: false }); has.add(i.text); } });
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
    day.items = planItems.map(i => ({ id: uid(), text: i.text, done: false, skipped: false }));
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
  if (ok) { toast("已加入今天的清单"); } else { toast("清单满了（" + S.settings.itemLimit + " 件），先删掉或移入收件箱"); }
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
    const msg = "现在只做这一件：" + cur.text;
    notify("今天的第一件事", msg);
  }
  // 晚间：该规划明天了
  const planReady = S.plan && S.plan.date === keyTomorrow() && S.plan.items.length > 0;
  if ((day && day.items.length > 0) && !planReady && timeToMin(now) >= timeToMin(s.planReminder) && n.evening !== today) {
    n.evening = today; save();
    notify("该规划明天了", "先别划走，写下明天最重要的 " + s.itemLimit + " 件事");
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
  const d = new Date();
  const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  el("top-date").textContent = (d.getMonth() + 1) + "月" + d.getDate() + "日 · 周" + wd;
}

function render() {
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
      html += '<div class="banner">今天还有 <b>' + carry.length + '</b> 件没做完。做不完就顺延到明天，别内疚。<div class="banner-actions"><button class="btn" data-act="rollover">顺延到明天的清单</button></div></div>';
    }
  }

  if (!day) {
    html += '<div class="empty"><div class="big">✍️</div><p>今天还没有清单。<br/>Ivy Lee 法说：睡前写下明天最重要的几件事，<br/>白天就只按顺序做第一件。</p><button class="btn btn-primary" data-act="start-today">现在就开始写今天的清单</button><p class="muted" style="margin-top:14px">或去「规划」写下明天的清单</p></div>';
    html += renderInboxHTML();
    screen.innerHTML = html;
    bind(screen);
    return;
  }

  if (day.items.length === 0) {
    // 刚创建今天的清单，还没写事项
    html += '<div class="card" style="margin-top:12px"><b style="font-size:15px">写下今天要做的事</b><div class="add-row" style="margin-top:10px"><input id="today-input" placeholder="写一件今天要做的事…" maxlength="80" /><button data-act="add-today">+</button></div><p class="muted" style="margin-top:10px">最多 ' + s.itemLimit + ' 件，最重要放第 1 位。</p></div>';
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

  html += '<div class="progress-wrap"><div class="progress-meta"><span>今日进度</span><span>' + doneN + '/' + total + (pct === 100 ? ' 全搞定 🎉' : '') + '</span></div><div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';

  if (cur) {
    html += '<div class="now-card"><div class="now-label">▶ 现在只做这一件 · ' + (idx + 1) + '/' + total + '</div><p class="now-text">' + esc(cur.text) + '</p><div class="now-actions">';
    html += '<button class="btn btn-done" data-act="complete">搞定这件 ✓</button>';
    if (s.allowSkip) html += '<button class="btn btn-skip" data-act="skip">跳过</button>';
    html += '</div></div>';
  } else {
    html += '<div class="now-card"><div class="now-label">🎉 全部搞定</div><p class="now-text">今天 ' + total + ' 件全做完了。<br/>去写明天的清单吧。</p></div>';
  }

  // 清单
  html += '<ul class="todo-list">';
  day.items.forEach((it, i) => {
    const cls = it.done ? "done" : (i > idx ? "locked" : "");
    const state = it.done ? "✓" : (it.skipped ? "跳过" : (i === idx ? "做这个" : "🔒"));
    html += '<li class="' + cls + '"><span class="todo-num">' + (i + 1) + '</span><span class="todo-text">' + esc(it.text) + '</span><span class="todo-state">' + state + '</span></li>';
  });
  html += "</ul>";

  if (idx >= 0 && s.allowSkip) {
    html += '<p class="muted" style="margin-top:10px">允许跳过已开启（跳过会顺延到明天）。</p>';
  }

  // 还没完成任何一件时，保留「再写一件」输入行（清单还没定稿）
  if (doneN === 0 && day.items.length < s.itemLimit) {
    html += '<div class="add-row" style="margin-top:14px"><input id="today-input" placeholder="再写一件今天要做的事…（最多 ' + s.itemLimit + ' 件）" maxlength="80" /><button data-act="add-today">+</button></div>';
  }

  html += renderInboxHTML();
  screen.innerHTML = html;
  bind(screen);
  const ti = el("today-input");
  if (ti) ti.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) doAddToday(); });
}

function renderInboxHTML() {
  let html = '<div class="card" style="margin-top:16px"><div style="display:flex;align-items:center;justify-content:space-between"><b style="font-size:15px">收件箱 · 临时插入</b><span class="muted">突发事项先丢这里，不打断主清单</span></div>';
  html += '<div class="add-row" style="margin-top:10px"><input id="inbox-input" placeholder="临时冒出来的事…" maxlength="80" /><button data-act="add-inbox">+</button></div>';
  if (S.inbox.length > 0) {
    html += '<ul class="plan-list">';
    S.inbox.forEach(it => {
      html += '<li><span class="plan-rank" style="background:#eee">✎</span><span class="plan-text">' + esc(it.text) + '</span><button class="plan-del" data-act="inbox-promote" data-id="' + it.id + '" title="加入明天">→</button><button class="plan-del" data-act="inbox-del" data-id="' + it.id + '">✕</button></li>';
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
    if (carry.length > 0) banner = '<div class="banner">今天还有 <b>' + carry.length + '</b> 件没做完 → 一键顺延到明天。<div class="banner-actions"><button class="btn" data-act="rollover">顺延并继续规划</button></div></div>';
  }

  // 一次机会：今天清单已定型（全做完/顺延），且机会未用 → 允许把新规划当今日任务执行
  if (todayIsDone() && !S.usedTodayChance) {
    const hasPlan = S.plan && S.plan.items && S.plan.items.length > 0;
    banner += '<div class="banner chance-banner">今天的清单已经' + (day.closed ? '顺延收尾' : '全部做完') + '。要不要给一次机会，把' + (hasPlan ? '下面的规划' : '你现在要写的') + '作为<b>今天的任务</b>立即执行？<div class="banner-actions"><button class="btn" data-act="use-chance">用这次机会，作为今日任务</button></div></div>';
  }

  const capNote = p.items.length >= s.itemLimit ? "只能 " + s.itemLimit + " 件喔，满了" : "最多 " + s.itemLimit + " 件，够少才能专注";

  let html = banner;
  html += '<div class="plan-header"><h2 class="plan-title">写下' + (p.date === keyTomorrow() ? '明天' : prettyDate(p.date)) + '的清单</h2><div class="plan-cap">' + capNote + ' · 最重要放第 1 位</div></div>';

  html += '<div class="add-row"><input id="plan-input" placeholder="' + (p.items.length >= s.itemLimit ? '清单满了，先删掉一些' : '写一件事，例如：完成周报') + '" maxlength="80" ' + (p.items.length >= s.itemLimit ? "disabled" : "") + ' /><button data-act="add-plan" ' + (p.items.length >= s.itemLimit ? "disabled" : "") + '>+</button></div>';

  if (p.items.length === 0) {
    html += '<div class="empty" style="padding:24px 12px"><div class="big">🌙</div><p>还没写。现在就写下明天最重要的几件事，<br/>越多反而越做不完。</p></div>';
  } else {
    html += '<ul class="plan-list" id="plan-list">';
    p.items.forEach((it, i) => {
      if (editingPlanId === it.id) {
        // 编辑模式：显示输入框 + 保存/取消
        html += '<li data-id="' + it.id + '" data-idx="' + i + '" class="editing"><span class="plan-rank">' + (i + 1) + '</span><input id="plan-edit-input" class="plan-edit-input" value="' + esc(it.text) + '" maxlength="80" data-id="' + it.id + '" /><button class="plan-del" data-act="save-plan-edit" data-id="' + it.id + '" title="保存">✓</button><button class="plan-del" data-act="cancel-plan-edit" title="取消">✕</button></li>';
      } else {
        html += '<li data-id="' + it.id + '" data-idx="' + i + '"><span class="plan-rank">' + (i + 1) + '</span><span class="plan-text">' + esc(it.text) + '</span><button class="plan-del" data-act="edit-plan" data-id="' + it.id + '" title="编辑">✎</button><span class="plan-drag" title="拖拽排序">⠿</span><button class="plan-del" data-act="del-plan" data-id="' + it.id + '">✕</button></li>';
      }
    });
    html += '</ul>';
    if (p.items.length > s.itemLimit) {
      html += '<p class="muted" style="margin-top:8px">⚠️ 比上限多了 ' + (p.items.length - s.itemLimit) + ' 件（可能来自顺延），删掉一些或移到后天。</p>';
    }
  }

  if (S.inbox.length > 0) {
    html += '<div class="card" style="margin-top:16px"><b style="font-size:15px">收件箱 → 加入明天</b><ul class="plan-list">';
    S.inbox.forEach(it => {
      html += '<li><span class="plan-rank" style="background:#eee">✎</span><span class="plan-text">' + esc(it.text) + '</span><button class="plan-del" data-act="inbox-promote" data-id="' + it.id + '">→加入</button></li>';
    });
    html += '</ul></div>';
  }

  html += '<div class="hint-note">💡 一件事 = 一个能完成的动作。写「完成周报」，别写「处理工作」。<br/>✅ 已存本机，关掉也不会丢。</div>';

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

  let html = '<div class="card"><div class="streak-hero"><div class="streak-num">' + streak + '</div><div class="streak-label">🔥 连续坚持天数</div><div class="streak-tip">坚持两三个月，推动程度会远超过你的想象</div></div><div style="display:flex;justify-content:space-around;padding:8px 0 2px"><div style="text-align:center"><div style="font-size:22px;font-weight:800;color:var(--ink-2)">' + best + '</div><div class="muted">最长连续</div></div><div style="text-align:center"><div style="font-size:22px;font-weight:800;color:var(--ink-2)">' + total + '</div><div class="muted">累计完成</div></div></div></div>';

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
  const monthLabel = y + " 年 " + (m + 1) + " 月";

  let html = '<div class="card"><div class="cal-header"><button class="cal-nav" data-act="hist-prev" data-delta="-1">‹</button><div class="cal-title">' + monthLabel + '</div><button class="cal-nav" data-act="hist-next" data-delta="1">›</button></div><div class="cal-grid">';
  const wd = ["日", "一", "二", "三", "四", "五", "六"];
  wd.forEach(w => { html += '<div class="cal-wd">' + w + '</div>'; });
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
  html += '</div><div class="cal-legend"><span class="lg lg-full"></span>全完成 <span class="lg lg-partial"></span>部分 <span class="lg lg-some"></span>有未完成 <span class="lg lg-blank"></span>无记录</div></div>';
  return html;
}

// 生成选中日的任务明细
function renderDayDetail(key) {
  const day = S.days[key];
  if (!day || day.items.length === 0) {
    return '<div class="card"><h2 class="sec-title" style="font-size:16px">' + prettyDate(key) + '</h2><p class="muted" style="padding:8px 2px">这一天没有记录任务。</p></div>';
  }
  const st = dayStats(key);
  let html = '<div class="card"><div class="day-detail-head"><h2 class="sec-title" style="font-size:16px">' + prettyDate(key) + '</h2><span class="day-detail-sum">' + st.done + '/' + st.total + ' 完成</span></div><ul class="day-detail-list">';
  day.items.forEach((it, idx) => {
    const stCls = it.done ? "done" : (it.skipped ? "skipped" : "todo");
    const stTxt = it.done ? "✓" : (it.skipped ? "跳过" : "未做");
    html += '<li class="dd-' + stCls + '"><span class="dd-rank">' + (idx + 1) + '</span><span class="dd-text">' + esc(it.text) + '</span><span class="dd-state">' + stTxt + '</span></li>';
  });
  html += '</ul></div>';
  return html;
}

function renderSettings() {
  const s = S.settings;
  const screen = el("screen");
  let html = '';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">清单规则</h2>';
  html += '<div class="set-row"><div><div class="set-label">每天清单上限</div><div class="set-desc">方法原版 6 件，作者说一般人 3 件就够</div></div><div class="limit-stepper"><button data-act="limit-down" ' + (s.itemLimit <= 3 ? "disabled" : "") + '>−</button><span class="set-value">' + s.itemLimit + '</span><button data-act="limit-up" ' + (s.itemLimit >= 6 ? "disabled" : "") + '>+</button></div></div>';
  html += '<div class="set-row"><div><div class="set-label">允许跳过</div><div class="set-desc">关闭 = 严格按顺序，第 1 件做完前不能碰别的</div></div><label class="switch"><input type="checkbox" data-act="toggle-skip" ' + (s.allowSkip ? "checked" : "") + '/><span class="track"></span></label></div>';
  html += '<div class="set-row"><div><div class="set-label">一次机会可再开启</div><div class="set-desc">今天清单定型后，把新规划作为今日任务执行的机会。用完可在此重新打开。</div></div><label class="switch"><input type="checkbox" data-act="toggle-chance" ' + (!S.usedTodayChance ? "checked" : "") + '/><span class="track"></span></label></div>';
  html += '</div>';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">提醒</h2>';
  html += '<div class="set-row"><div><div class="set-label">晚间规划提醒</div><div class="set-desc">睡前写下明天的清单</div></div><input type="time" data-act="plan-reminder" value="' + s.planReminder + '" style="border:1.5px solid var(--line);border-radius:10px;padding:6px;font-size:15px" /></div>';
  html += '<div class="set-row"><div><div class="set-label">早晨开工提醒</div><div class="set-desc">推送「今天的第一件事」</div></div><input type="time" data-act="morning-reminder" value="' + s.morningReminder + '" style="border:1.5px solid var(--line);border-radius:10px;padding:6px;font-size:15px" /></div>';
  html += '<div class="set-row"><div><div class="set-label">系统通知</div><div class="set-desc">APP 打开时会按上面时间提醒（安装到主屏体验更好）</div></div><label class="switch"><input type="checkbox" data-act="toggle-notify" ' + (s.notify ? "checked" : "") + '/><span class="track"></span></label></div>';
  html += '</div>';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">这套方法 · Ivy Lee 法</h2>';
  const steps = [
    ["睡前列清单", "每天工作结束前，写下明天需要完成的 6 件（或 3 件）最重要的事，只能这么多。"],
    ["按重要排序", "按重要程度排序，最重要的放第 1，以此类推。"],
    ["只做第一件", "隔天严格按顺序做。第 1 件做完之前，不能碰其他任何事。"],
    ["做不完就顺延", "真的做不完，就移到明天的清单里重新排序，别内疚。"],
  ];
  steps.forEach(([t, d], i) => {
    html += '<div class="method-step"><span class="n">' + (i + 1) + '</span><p><b>' + t + '</b> — ' + d + '</p></div>';
  });
  html += '<p class="muted" style="margin-top:10px">1918 年 Ivy Lee 靠这套方法，让美国钢铁公司老板 Charles Schwab 付了 25,000 美金。真正的难点不是方法，是分辨哪些才是重要的事。</p>';
  html += '</div>';

  // 多端同步状态
  const syncOk = typeof Sync !== "undefined" && Sync.enabled;
  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">多端同步</h2>';
  if (!syncOk) {
    html += '<p class="muted" style="font-size:13px;line-height:1.7">尚未配置同步。多端实时同步让电脑/手机随时一致，无需导出导入。<br/>需先配置 Supabase 项目（见文档）。</p>';
    html += '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="sync-pair" style="font-size:13px">开始配对</button></div>';
  } else if (Sync.paired) {
    html += '<p class="muted" style="font-size:13px;line-height:1.7">✅ 已配对房间 <b>' + (Sync.room || "") + '</b>，正在实时同步。<br/>任何设备改动都会自动同步到所有已配对设备。</p>';
    html += '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn ghost-btn" data-act="sync-disconnect" style="font-size:13px">解除配对</button></div>';
  } else {
    html += '<p class="muted" style="font-size:13px;line-height:1.7">已连接，尚未配对。点「显示配对码」让另一台设备扫码加入。</p>';
    html += '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="sync-pair" style="font-size:13px">显示配对码</button></div>';
  }
  html += '<div id="sync-pair-area"></div>';
  // 加入配对（手机端/其他设备输入码或扫码加入）
  html += '<div style="display:flex;gap:8px;margin-top:10px;align-items:center"><input id="sync-code-input" placeholder="输入8位配对码加入" maxlength="8" style="flex:1;border:1.5px solid var(--line);border-radius:10px;padding:8px 10px;font-size:15px;background:#fff;color:var(--ink)" /><button class="btn" data-act="sync-join" style="font-size:13px;padding:8px 14px">加入</button><button class="btn ghost-btn" data-act="sync-scan" style="font-size:13px;padding:8px 14px">扫码</button></div>';
  html += '<div id="sync-scanner-wrap" style="display:none;margin-top:10px"><video id="sync-scanner" playsinline muted style="width:100%;max-width:280px;border-radius:12px;background:#000"></video><p class="muted" style="font-size:12px;margin-top:4px">将摄像头对准电脑屏幕上的二维码，识别后自动加入</p></div>';
  html += '<p class="muted" style="font-size:12px;margin-top:6px">电脑端点「显示配对码」，另一台设备扫码或输入码即可实时同步。</p>';
  html += '</div>';

  html += '<div class="card"><h2 class="sec-title" style="font-size:16px">数据备份</h2>';
  html += '<div class="set-row"><div><div class="set-label">导出备份</div><div class="set-desc">把全部清单与历史下载成文件，永久保存、可换设备</div></div><button class="btn" style="padding:8px 14px;font-size:13px" data-act="export-data">导出</button></div>';
  html += '<div class="set-row"><div><div class="set-label">导入恢复</div><div class="set-desc">从备份文件恢复历史记录（会合并，不覆盖现有）</div></div><button class="btn ghost-btn" style="padding:8px 14px;font-size:13px" data-act="import-data">导入</button></div>';
  html += '<input type="file" id="import-file" accept="application/json,.json" style="display:none" />';
  html += '</div>';
  html += '<div class="card" style="margin-top:16px"><div class="set-row"><div><div class="set-label">重置所有数据</div><div class="set-desc">清空清单、历史和设置</div></div><button class="btn ghost-btn" style="padding:8px 14px;font-size:13px" data-act="reset">清空</button></div></div>';
  html += '<p class="muted" style="text-align:center;margin-top:18px">六件事 · Six Things — 数据只存在你的设备本地，自动备份 + 可导出文件。</p>';
  html += '<p class="muted" style="text-align:center;margin-top:6px;font-size:11px;opacity:.7">版本 ' + APP_VERSION + '</p>';

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
          toast("已从备份恢复 " + Object.keys(p.days).length + " 天历史");
          render();
        } catch (err) { toast("文件格式不对，未导入"); }
      };
      rd.readAsText(f);
    });
  }
}

/* ---------------- 事件绑定 ---------------- */
function bind(root) {
  root.querySelectorAll("[data-act]").forEach(b => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const act = b.dataset.act;
      const id = b.dataset.id;
      handle(act, id, b);
    });
  });
}

function handle(act, id, btn) {
  switch (act) {
    case "complete": {
      completeActive();
      const done = getToday().items.filter(i => i.done).length;
      const total = getToday().items.length;
      if (done === total) {
        burst("🎉");
        toast("今天全部搞定！去写明天的清单吧");
      } else {
        burst("✓");
        const nxt = activeItem(getToday());
        toast(nxt ? "搞定一件 ✓ 下一件：" + nxt.text : "搞定一件 ✓");
      }
      break;
    }
    case "skip":
      skipActive();
      toast("跳过了，今晚会顺延到明天");
      break;
    case "rollover": {
      const n = rolloverToday();
      toast(n > 0 ? "已把 " + n + " 件顺延到明天" : "今天没有需要顺延的");
      if (currentTab === "plan") renderPlan(); else renderToday();
      return;
    }
    case "use-chance": {
      const hadPlan = !!(S.plan && S.plan.items && S.plan.items.length > 0);
      useTodayChance();
      currentTab = "today";
      renderToday();
      toast(hadPlan ? "已把规划作为今日任务，去执行吧" : "机会已用，写下的就是今天的任务");
      return;
    }
    case "start-today": {
      startToday();
      renderToday();
      toast("写下一件今天要做的事吧");
      return;
    }
    case "add-today": { doAddToday(); return; }
    case "add-inbox": {
      const inp = el("inbox-input");
      if (inp && inp.value.trim()) { addInbox(inp.value); toast("已丢进收件箱，不打断主清单"); }
      break;
    }
    case "inbox-promote": addPlanItem((S.inbox.find(i => i.id === id) || {}).text || ""); S.inbox = S.inbox.filter(i => i.id !== id); save(); toast("已加入清单"); break;
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
    case "toggle-skip": S.settings.allowSkip = btn.checked; save(); toast(S.settings.allowSkip ? "已开启跳过" : "已关闭跳过，严格按顺序"); break;
    case "toggle-chance": {
      S.usedTodayChance = !btn.checked; // 打开开关 = 重置为可用(used=false)
      save();
      toast(btn.checked ? "已重新开启一次机会" : "已关闭一次机会（不再提示）");
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
      if (typeof Sync === "undefined" || !Sync.enabled) { toast("同步未配置：需先配置 Supabase"); break; }
      Sync.syncCreatePairing().then(r => {
      if (r.ok) {
        const area = el("sync-pair-area");
        if (area) {
          area.innerHTML = '<div style="margin-top:10px;padding:14px;border:1.5px dashed var(--accent);border-radius:12px;text-align:center"><div style="font-size:12px;color:var(--ink-3);margin-bottom:6px">让另一台设备扫码或输入配对码加入</div><div id="sync-qr" style="margin:8px auto;width:160px;height:160px;background:#fff;padding:8px;border-radius:8px"></div><div style="font-size:30px;font-weight:900;letter-spacing:8px;color:var(--accent)">' + r.code + '</div><div style="font-size:12px;color:var(--ink-3);margin-top:6px">二维码 10 分钟有效，一次性</div></div>';
          if (typeof Sync.syncRenderQR === "function") Sync.syncRenderQR(el("sync-qr"), r.code);
        }
        toast("配对码已生成：" + r.code);
      } else { toast("配对失败：" + (r.reason || "未知")); }
      });
      break;
    }
    case "sync-scan": {
      if (typeof Sync === "undefined" || !Sync.enabled) { toast("同步未配置：需先配置 Supabase"); break; }
      const wrap = el("sync-scanner-wrap");
      const video = el("sync-scanner");
      if (!wrap || !video) { toast("扫码功能不可用"); break; }
      if (wrap.style.display === "none") {
        const sc = Sync.syncStartScanner(video, (code) => {
          // 识别到二维码（内容=配对码）
          if (code && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code)) {
            wrap.style.display = "none";
            Sync.syncJoinPairing(code).then(r => {
              if (r.ok) { toast("扫码配对成功，开始实时同步"); renderSettings(); }
              else { toast("加入失败：" + (r.reason || "未知")); }
            });
            return true; // 停止扫描
          }
          return false;
        });
        if (sc && sc.ok) { wrap.style.display = "block"; }
        else { toast(sc && sc.reason ? sc.reason : "无法打开摄像头"); }
      } else { wrap.style.display = "none"; if (Sync._scanStop) { Sync._scanStop(); Sync._scanStop = null; } }
      break;
    }
    case "sync-join": {
      if (typeof Sync === "undefined" || !Sync.enabled) { toast("同步未配置：需先配置 Supabase"); break; }
      const inp = el("sync-code-input");
      const code = inp ? inp.value.trim() : "";
      if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code)) { toast("请输入 8 位配对码"); break; }
      Sync.syncJoinPairing(code).then(r => {
        if (r.ok) { toast("配对成功，开始实时同步"); renderSettings(); }
        else { toast("加入失败：" + (r.reason || "未知")); }
      });
      break;
    }
    case "sync-disconnect": {
      if (typeof Sync !== "undefined") { Sync.syncDisconnect(); }
      renderSettings();
      toast("已解除配对");
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
        toast("已导出备份文件");
      } catch (e) { toast("导出失败"); }
      break;
    }
    case "import-data": {
      const fi = el("import-file");
      if (fi) fi.click();
      break;
    }
    case "reset":
      if (confirm("确定清空所有数据？")) {
        localStorage.removeItem(KEY);
        S = defaultState();
        // 同步清掉 IndexedDB 备份，避免刷新后 autoRestore 把旧数据复活
        try {
          const dbReq = indexedDB.deleteDatabase(IDB_NAME);
          dbReq.onsuccess = () => {}; dbReq.onerror = () => {}; dbReq.onblocked = () => {};
        } catch (e) {}
        _idbReady = false;
        toast("已清空");
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
    } else { toast("此浏览器不支持系统通知"); S.settings.notify = false; save(); }
  } catch (e) { S.settings.notify = false; save(); }
}

/* ---------------- 启动 ---------------- */
// 多端同步：收到远端数据 → 合并保存
function syncApplyRemote(payload) {
  try {
    if (!payload || !payload.data) return;
    const remote = JSON.parse(payload.data);
    if (!remote || typeof remote !== "object") return;
    // 业务数据指纹（不含 lastSyncAt 等元数据）
    // settings 只取远端拥有的键（Object.assign 会扩展本地 settings，全字段比较永远不等）
    const bizSig = (o, subsetKeys) => {
      const pick = {};
      for (const k of subsetKeys || ["days", "plan", "inbox", "settings"]) pick[k] = o[k];
      return JSON.stringify(pick);
    };
    const remoteKeys = ["days", "plan", "inbox", "settings"].filter(k => remote[k] !== undefined);
    // 远端视角的本地指纹：days/plan/inbox 取 S 当前值，settings 只取远端拥有的键
    const localView = {};
    for (const k of remoteKeys) {
      if (k === "settings") {
        const sub = {};
        for (const sk in remote.settings) if (remote.settings[sk] !== undefined) sub[sk] = (S.settings||{})[sk];
        localView.settings = sub;
      } else {
        localView[k] = S[k];
      }
    }
    const remoteSig = bizSig(remote, remoteKeys);
    const localSig = bizSig(localView, remoteKeys);
    // 去重：内容无实际变化 → 不处理（不 toast、不 save、不 render）
    if (remoteSig === localSig) {
      // 但若时间戳更新（对方 echo），仅轻量更新 lastSyncAt，不打扰
      const incomingAt = new Date(payload.updatedAt || 0).getTime();
      if (incomingAt > (S.lastSyncAt || 0)) S.lastSyncAt = incomingAt;
      return;
    }
    // 冲突处理：最后写入者胜（用 updatedAt 比较）
    const incomingAt = new Date(payload.updatedAt || 0).getTime();
    const localAt = S.lastSyncAt || 0;
    if (incomingAt < localAt) return; // 更旧的数据，忽略
    // 合并：days 按天合并（远端优先），plan/inbox/settings 直接取远端
    for (const k in (remote.days || {})) {
      if (!S.days[k] || (remote.days[k].items || []).length > (S.days[k].items || []).length) {
        S.days[k] = remote.days[k];
      }
    }
    if (remote.plan) S.plan = remote.plan;
    if (Array.isArray(remote.inbox) && remote.inbox.length > 0) S.inbox = remote.inbox;
    if (remote.settings) S.settings = Object.assign(S.settings, remote.settings);
    S.lastSyncAt = incomingAt;
    // 应用了远端数据：把推送指纹同步为当前数据，避免 save() 触发的回声推送
    if (typeof Sync !== "undefined") Sync._lastPushedSig = bizSig(S);
    save();
    render();
    toast("已同步其他设备的数据");
  } catch (e) { console.warn("[sync] apply err:", e.message); }
}
// 注册同步回调（若 sync.js 已加载）
if (typeof Sync !== "undefined") {
  Sync.onData = (payload) => { if (payload && payload.type === "remote-data") syncApplyRemote(payload); };
  Sync.onGetData = () => S;
  try { Sync.syncAutoInit(); } catch (e) {}
}

function boot() {
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => { currentTab = t.dataset.tab; render(); });
  });
  render();
  checkReminders();
  setInterval(() => {
    // 跨天自动刷新
    if (el("top-date").textContent.indexOf("今天") < 0 && el("top-date").textContent !== "") {
      const d = new Date();
      const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      const want = (d.getMonth() + 1) + "月" + d.getDate() + "日 · 周" + wd;
      if (el("top-date").textContent !== want) { render(); checkReminders(); }
    }
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
