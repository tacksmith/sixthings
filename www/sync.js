/* ============================================================
 * 六件事 · 多端实时同步模块 (sync.js)
 * 方案：Supabase Realtime（托管，无需自建后端）
 * 配对：电脑端显示二维码/配对码，手机扫码加入
 * 冲突：最后写入者胜（按 updatedAt）
 * 依赖：vendor/supabase.umd.js（本地化，无需 CDN）
 * ============================================================ */
"use strict";

/* ---------------- 配置（用户提供后填写） ---------------- */
const SYNC_CONFIG = {
  url: "https://hndaatgnhprpzakdjump.supabase.co",
  anonKey: "sb_publishable_OK7NIxp_KSV0FlKe6JXchQ_DSRToK45",
};

/* ---------------- 状态 ---------------- */
const Sync = {
  client: null,          // supabase 客户端
  enabled: false,        // 是否已配置并连接
  pairingCode: null,     // 本机配对码（电脑端生成）
  paired: false,         // 是否已配对（有配对房间）
  room: null,            // 当前配对房间名
  deviceId: null,        // 本机设备 id（持久化）
  lastPushed: 0,         // 最近一次上传时间戳
  _channel: null,        // realtime channel
  _listening: false,     // 是否在监听远端
  _members: null,        // 房间成员 uid 缓存 {host_uid, guest_uid}（配对时获取，推送不再查库）
  _pollTimer: null,      // 轮询兜底定时器（realtime 断连时也能同步）
  _pushTimer: null,      // 推送防抖定时器（连续改动合并为一次推送）
  _lastApplied: null,    // 最近一次应用过的远端数据指纹 {device, sig}（去重 + 防回环）
  _lastPushedSig: null,  // 最近一次推送的数据指纹（无本地改动时不重复推，防回环）
  onData: null,          // 收到远端数据回调（由 app.js 设置）
};

/* ---------------- 工具 ---------------- */
function syncUid() { return Math.random().toString(36).slice(2, 10); }
function syncNow() { return Date.now(); }
// 设备 id：持久化在 localStorage
function syncDeviceId() {
  if (Sync.deviceId) return Sync.deviceId;
  try {
    let id = localStorage.getItem("sixthings:devid");
    if (!id) { id = "dev-" + syncUid(); localStorage.setItem("sixthings:devid", id); }
    Sync.deviceId = id;
    return id;
  } catch (e) { return "dev-" + syncUid(); }
}

/* ---------------- 连接 Supabase ---------------- */
async function syncInit() {
  if (!SYNC_CONFIG.url || !SYNC_CONFIG.anonKey) { Sync.enabled = false; return false; }
  try {
    if (!window.supabase) throw new Error("supabase SDK 未加载");
    Sync.client = window.supabase.createClient(SYNC_CONFIG.url, SYNC_CONFIG.anonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    // 匿名登录：每个设备获得稳定身份（RLS 基于 auth.uid() 隔离）
    await syncEnsureAuth();
    Sync.enabled = true;
    return true;
  } catch (e) { console.warn("[sync] init failed:", e.message); Sync.enabled = false; return false; }
}

// 确保已匿名登录，返回 auth.uid()（失败返回 null）
async function syncEnsureAuth() {
  try {
    // 先看本地是否已有会话
    let sess = Sync.client.auth.getSession();
    if (sess && sess.data && sess.data.session) {
      Sync.uid = sess.data.session.user.id;
      return Sync.uid;
    }
    // 无会话 → 匿名登录
    const { data, error } = await Sync.client.auth.signInAnonymously();
    if (error) { console.warn("[sync] anon signin err:", error.message); return null; }
    Sync.uid = data.user.id;
    // 持久化会话（supabase-js 自动存 localStorage，刷新后自动恢复）
    return Sync.uid;
  } catch (e) { console.warn("[sync] auth err:", e.message); return null; }
}

/* ---------------- 配对 ---------------- */
// 电脑端：生成新配对码并显示
async function syncCreatePairing() {
  if (!Sync.enabled) return { ok: false, reason: "not-configured" };
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混的 I/O/0/1
  let code = "";
  for (let i = 0; i < 8; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  // 8 位配对码（带创建时间，配对后一次性）
  const devId = syncDeviceId();
  Sync.pairingCode = code;
  Sync.paired = false;
  Sync.room = "room-" + code;
  try {
    // 写入 pairing 表（等待手机加入）
    const expAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分钟有效
    if (!Sync.uid) return { ok: false, reason: "not-authenticated" };
    await Sync.client.from("pairings").upsert({
      code, host: devId, host_uid: Sync.uid, status: "waiting", created_at: new Date().toISOString(), expires_at: expAt,
    });
    // 开始监听 room 的配对状态
    await syncListenPairing(code);
    return { ok: true, code };
  } catch (e) {
    console.warn("[sync] create pairing err:", e.message);
    return { ok: false, reason: e.message };
  }
}
// 监听配对结果（电脑端）：手机加入后 status -> paired
async function syncListenPairing(code) {
  if (!Sync.enabled) return;
  Sync.client.channel("pairing-" + code)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pairings", filter: "code=eq." + code }, (payload) => {
      if (payload.new && payload.new.status === "paired" && payload.new.guest) {
        Sync.paired = true;
        if (Sync.onData) Sync.onData({ type: "paired", code, guest: payload.new.guest });
        syncStartRoom(code);
      }
    })
    .subscribe();
}
// 手机端：用配对码加入
async function syncJoinPairing(code) {
  if (!Sync.enabled) return { ok: false, reason: "not-configured" };
  const devId = syncDeviceId();
  try {
    if (!Sync.uid) return { ok: false, reason: "not-authenticated" };
    const { data, error } = await Sync.client.from("pairings")
      .update({ guest: devId, guest_uid: Sync.uid, status: "paired" })
      .eq("code", code.toUpperCase())
      .select();
    // 配对成功后一次性销毁该码
    if (!error && data && data.length > 0) {
      await Sync.client.from("pairings").delete().eq("code", code.toUpperCase());
    }
    if (error || !data || data.length === 0) return { ok: false, reason: "配对码不存在或已被使用" };
    Sync.pairingCode = code;
    Sync.paired = true;
    Sync.room = "room-" + code;
    await syncStartRoom(code);
    return { ok: true };
  } catch (e) { return { ok: false, reason: e.message }; }
}

/* ---------------- 实时数据通道 ---------------- */
// 进入同步房间：双方订阅共享数据，上传本机数据
async function syncStartRoom(code) {
  if (!Sync.enabled || Sync._listening) return;
  Sync._listening = true;
  Sync.room = "room-" + code;
  // 0) 缓存房间成员 uid（只查一次，推送时不再查库）
  await syncLoadMembers(code);
  // 1) 监听云端数据变化（Postgres changes on sync_data）
  Sync._channel = Sync.client
    .channel("sync-data-" + code)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "sync_data", filter: "room=eq." + Sync.room,
    }, (payload) => {
      if (payload.new && payload.new.device !== syncDeviceId()) {
        // 远端设备写入：应用数据
        if (Sync.onData) Sync.onData({ type: "remote-data", data: payload.new.data, updatedAt: payload.new.updated_at, from: payload.new.device });
      }
    })
    .subscribe();
  // 2) 拉取云端已有数据（新加入方拿到对方的）
  await syncPull();
  // 3) 上传本机数据（通知对方）
  await syncPush();
  // 4) 轮询兜底：realtime 断连时也能同步（每 8s 拉一次远端）
  Sync._pollTimer = setInterval(() => { syncPull(); }, 8000);
  // 5) 持久化配对状态（刷新后自动重连）
  Sync.paired = true;
  try {
    const saved = localStorage.getItem("sixthings:sync");
    const c = saved ? JSON.parse(saved) : {};
    c.pairCode = String(code).replace(/^room-/, "");
    c.room = Sync.room;
    localStorage.setItem("sixthings:sync", JSON.stringify(c));
  } catch (e) {}
}

// 获取房间成员 uid 并缓存（配对后一次，push 直接复用，避免每次查库）
async function syncLoadMembers(code) {
  try {
    const { data, error } = await Sync.client.from("pairings")
      .select("host_uid, guest_uid")
      .eq("code", String(code).replace(/^room-/, ""))
      .single();
    if (!error && data) {
      Sync._members = { host_uid: data.host_uid, guest_uid: data.guest_uid };
    } else if (error && error.code !== "PGRST116") {
      console.warn("[sync] load members err:", error.message);
    }
  } catch (e) { console.warn("[sync] load members:", e.message); }
}

// 上传本机全量数据到云端（最后写入者胜）
// 推送（防抖）：连续改动在 800ms 内合并为一次推送，避免大量并发 upsert
function syncPush() {
  if (!Sync.enabled || !Sync.room) return false;
  if (Sync._pushTimer) clearTimeout(Sync._pushTimer);
  Sync._pushTimer = setTimeout(() => {
    Sync._pushTimer = null;
    _doPush();
  }, 800);
  return true;
}

async function _doPush() {
  if (!Sync.enabled || !Sync.room || !Sync.onGetData) return false;
  try {
    const data = Sync.onGetData(); // app.js 提供当前状态
    if (!data) return false;
    // 业务指纹（与 syncApplyRemote 一致，防回环）：不含元数据
    const curSig = JSON.stringify({ days: data.days, plan: data.plan, inbox: data.inbox, settings: data.settings });
    if (Sync._lastPushedSig === curSig) return true; // 没变化，跳过推送（避免回声）
    Sync._lastPushedSig = curSig;
    // 用缓存的成员 uid（配对时已获取），避免每次推送都查库
    let host = Sync._members ? Sync._members.host_uid : Sync.uid;
    let guest = Sync._members ? Sync._members.guest_uid : Sync.uid;
    if (!Sync._members) {
      // 缓存缺失时尽力补一次（如配对早期）
      try {
        const code = (Sync.room || "").replace(/^room-/, "");
        const { data: pair } = await Sync.client.from("pairings").select("host_uid, guest_uid").eq("code", code).single();
        if (pair) { host = pair.host_uid || Sync.uid; guest = pair.guest_uid || Sync.uid; Sync._members = { host_uid: host, guest_uid: guest }; }
      } catch (e) {}
    }
    const payload = {
      room: Sync.room,
      data: JSON.stringify(data),
      updated_at: new Date().toISOString(),
      device: syncDeviceId(),
      host_uid: host,
      guest_uid: guest,
    };
    Sync.lastPushed = Date.now();
    const { error } = await Sync.client.from("sync_data").upsert(payload, { onConflict: "room" });
    if (error) { console.warn("[sync] push upsert err:", error.message); return false; }
    return true;
  } catch (e) { console.warn("[sync] push err:", e.message); return false; }
}

// 拉取云端数据
async function syncPull() {
  if (!Sync.enabled || !Sync.room) return null;
  try {
    const { data } = await Sync.client.from("sync_data").select("*").eq("room", Sync.room).single();
    if (data && data.data && data.device !== syncDeviceId()) {
      if (Sync.onData) Sync.onData({ type: "remote-data", data: data.data, updatedAt: data.updated_at, from: data.device });
      return data;
    }
  } catch (e) { console.warn("[sync] pull err:", e.message); }
  return null;
}

// 解除配对/断开
async function syncDisconnect() {
  if (Sync._pollTimer) { clearInterval(Sync._pollTimer); Sync._pollTimer = null; }
  try { if (Sync._channel) Sync.client.removeChannel(Sync._channel); } catch (e) {}
  Sync._channel = null;
  Sync._listening = false;
  Sync.paired = false;
  Sync.room = null;
  Sync._members = null;
  // 清除持久化的配对状态（刷新后不再自动重连）
  try {
    const saved = localStorage.getItem("sixthings:sync");
    if (saved) {
      const c = JSON.parse(saved);
      delete c.pairCode;
      delete c.room;
      localStorage.setItem("sixthings:sync", JSON.stringify(c));
    }
  } catch (e) {}
}

/* ---------------- 配置设置（用户填 URL/key 后调用） ---------------- */
function syncConfigure(url, anonKey) {
  SYNC_CONFIG.url = url;
  SYNC_CONFIG.anonKey = anonKey;
  // 持久化配置（下次自动连）
  try { localStorage.setItem("sixthings:sync", JSON.stringify({ url, anonKey })); } catch (e) {}
  return syncInit();
}

// 启动时尝试从持久化配置自动连接
async function syncAutoInit() {
  let savedCode = null;
  try {
    const saved = localStorage.getItem("sixthings:sync");
    if (saved) {
      const c = JSON.parse(saved);
      if (c.url && c.anonKey) { SYNC_CONFIG.url = c.url; SYNC_CONFIG.anonKey = c.anonKey; }
      if (c.pairCode) savedCode = c.pairCode; // 恢复上次配对
    }
  } catch (e) {}
  const ok = await syncInit();
  if (ok && savedCode && !Sync.paired) {
    // 刷新后：自动重新加入上次的房间
    await syncStartRoom(savedCode);
  }
  return ok;
}

/* ---------------- 二维码辅助 ---------------- */
// 电脑端：在指定容器渲染二维码（内容=配对码）
function syncRenderQR(containerEl, code) {
  try {
    if (!window.QRCode || !containerEl) return false;
    containerEl.innerHTML = "";
    new QRCode(containerEl, { text: code, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
    return true;
  } catch (e) { console.warn("[sync] qr render err:", e.message); return false; }
}
// 手机端：启动摄像头扫描二维码（识别后回调）
// onFound(code) 返回 true 表示已处理，可停止扫描
function syncStartScanner(videoEl, onFound) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.jsQR) {
      return { ok: false, reason: "设备不支持摄像头或缺少 jsQR" };
    }
    let stopped = false;
    let stream = null;
    const stop = () => { stopped = true; try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {} };
    const scan = () => {
      if (stopped) return;
      try {
        const v = videoEl;
        if (v.readyState >= 2 && v.videoWidth > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const res = jsQR(img.data, img.width, img.height);
          if (res && res.data) {
            const done = onFound(String(res.data).trim());
            if (done === true) { stop(); return; }
          }
        }
        requestAnimationFrame(scan);
      } catch (e) { console.warn("[sync] scan err:", e.message); stop(); }
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(s => { stream = s; videoEl.srcObject = s; videoEl.play().then(scan).catch(() => {}); })
      .catch(err => { console.warn("[sync] camera err:", err.message); });
    Sync._scanStop = stop;
    return { ok: true, stop };
  } catch (e) { return { ok: false, reason: e.message }; }
}

/* ---------------- 暴露到 Sync 对象（供 app.js 调用） ---------------- */
Sync.syncInit = syncInit;
Sync.syncCreatePairing = syncCreatePairing;
Sync.syncJoinPairing = syncJoinPairing;
Sync.syncDisconnect = syncDisconnect;
Sync.syncAutoInit = syncAutoInit;
Sync.syncPush = syncPush;
Sync.syncPull = syncPull;
Sync.syncRenderQR = syncRenderQR;
Sync.syncStartScanner = syncStartScanner;
Sync.syncStartRoom = syncStartRoom;
Sync.syncListenPairing = syncListenPairing;
Sync.syncDeviceId = syncDeviceId;
