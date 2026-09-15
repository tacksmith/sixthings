"use strict";
const SYNC_CONFIG = window.SIXTHINGS_CONFIG || {url:"", anonKey:""};
const Sync = {
  client:null, enabled:false, uid:null, paired:false, room:null, pairingCode:null,
  connState:"off", lastSyncAt:0, lastError:"", members:0,
  onData:null, onGetData:null, onStateChange:null,
  _engine:null, _channel:null, _pollTimer:null, _pushTimer:null, _retryTimer:null,
  _initializing:null, _operation:null, _generation:0, _controlVersion:0,
};
function syncSettings() { return JSON.parse(localStorage.getItem("sixthings:sync") || "{}"); }
function syncRemember(patch) {
  localStorage.setItem("sixthings:sync", JSON.stringify({...syncSettings(), ...patch}));
}
function syncSetState(state, error) {
  Sync.connState = state;
  Sync.lastError = error ? syncError(error) : "";
  if (state === "connected") Sync.lastSyncAt = Date.now();
  if (Sync.onStateChange) Sync.onStateChange(state);
}
function syncError(error) {
  if (error.code === "PGRST202" || error.code === "42883") return "同步服务需要升级，请联系维护者";
  if (error.code === "42501") return "当前设备没有访问权限，请重新配对";
  if (error.code === "22023") return "配对码无效、已使用或已过期";
  if (error.name === "QuotaExceededError") return "本机存储空间不足，请立即导出备份";
  return error.message || "暂时无法连接，内容已保存在本机，联网后重试";
}
async function syncRpc(name, parameters) {
  if (!Sync.client) throw new Error("尚未连接同步服务");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 12000);
  try {
    let request = Sync.client.rpc(name, parameters);
    if (request.abortSignal) request = request.abortSignal(abort.signal);
    const {data, error} = await request;
    if (error) throw error;
    if (data?.members !== undefined) Sync.members = data.members;
    return data;
  } finally { clearTimeout(timer); }
}
async function syncEnsureAuth() {
  const {data:session, error:sessionError} = await Sync.client.auth.getSession();
  if (sessionError) throw sessionError;
  if (session?.session?.user?.id) { Sync.uid = session.session.user.id; return Sync.uid; }
  const {data, error} = await Sync.client.auth.signInAnonymously();
  if (error) throw error;
  if (!data?.user?.id) throw new Error("无法取得同步身份");
  Sync.uid = data.user.id;
  return Sync.uid;
}
function syncInit() {
  if (Sync._initializing) return Sync._initializing;
  Sync._initializing = (async () => {
    try {
      if (!SYNC_CONFIG.url || !SYNC_CONFIG.anonKey) { Sync.enabled = false; return false; }
      if (!window.supabase) throw new Error("同步组件未加载，请刷新页面");
      if (!Sync.client) Sync.client = window.supabase.createClient(SYNC_CONFIG.url, SYNC_CONFIG.anonKey);
      await syncEnsureAuth();
      Sync.enabled = true;
      return true;
    } catch (error) { Sync.enabled = false; syncSetState("error", error); return false; }
  })().finally(() => { Sync._initializing = null; });
  return Sync._initializing;
}
function syncStop() {
  Sync._generation++;
  Sync._engine?.stop(); Sync._engine = null;
  for (const key of ["_pollTimer", "_pushTimer", "_retryTimer"]) {
    clearTimeout(Sync[key]); clearInterval(Sync[key]); Sync[key] = null;
  }
  if (Sync._channel) Sync.client?.removeChannel(Sync._channel);
  Sync._channel = null;
}
function syncMakeEngine(room, resume) {
  const current = SixSync.project(Sync.onGetData());
  const engine = new SixSync.Engine({room, initial:current, storage:localStorage,
    transport:{
      read:room => syncRpc("six_get_room", {p_room:room}),
      write:(room, revision, data, id) => syncRpc("six_write_room", {p_room:room,p_revision:revision,p_data:data,p_write_id:id}),
    },
    apply:data => Sync.onData?.({type:"remote-data", data}),
    status:(state, error) => syncSetState(state, error),
  });
  if (!resume) engine.capture(current);
  Sync._engine = engine;
  engine.restore();
  return engine;
}
function syncWatch(room) {
  if (!Sync.client.channel) return;
  const generation = Sync._generation;
  const channel = Sync.client.channel("six-room-" + room);
  Sync._channel = channel;
  channel.on("postgres_changes", {event:"UPDATE",schema:"public",table:"six_rooms",filter:"id=eq." + room}, () => syncPush(0))
    .subscribe(state => {
      if (generation !== Sync._generation || Sync._channel !== channel) return;
      if (state === "SUBSCRIBED") syncPush(0);
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(state) && !Sync._retryTimer) {
        Sync._retryTimer = setTimeout(() => {
          Sync._retryTimer = null;
          if (generation !== Sync._generation) return;
          const old = Sync._channel;
          Sync._channel = null;
          if (old) Sync.client.removeChannel(old);
          syncWatch(room);
        }, 3000);
      }
    });
}
async function syncStartRoom(room, resume = true) {
  if (!/^[0-9a-f-]{36}$/i.test(room)) throw new Error("同步空间格式不正确");
  syncStop(); Sync.room = room; Sync.paired = true;
  const generation = Sync._generation;
  syncRemember({protocol:3,room,pairCode:null,pendingCreate:null});
  syncMakeEngine(room, resume);
  if (!Sync.enabled && !(await syncInit())) return false;
  if (generation !== Sync._generation) return false;
  syncWatch(room);
  Sync._pollTimer = setInterval(() => syncFlush(), 5000);
  return syncFlush();
}
async function syncFlush() {
  const engine = Sync._engine;
  if (!engine || !Sync.enabled) return false;
  try { return await engine.flush(); }
  catch (error) {
    if (engine === Sync._engine) syncSetState("reconnecting", error);
    return false;
  }
}
function syncCapture(data) {
  try { Sync._engine?.capture(data); }
  catch (error) { syncSetState("error", error); throw error; }
}
function syncPush(delay = 200) {
  if (!Sync._engine) return false;
  clearTimeout(Sync._pushTimer);
  Sync._pushTimer = setTimeout(() => { Sync._pushTimer = null; syncFlush(); }, delay);
  return true;
}
function syncExclusive(operation) {
  if (Sync._operation) return Sync._operation;
  const version = ++Sync._controlVersion;
  const guard = () => { if (version !== Sync._controlVersion) throw new Error("操作已取消"); };
  Sync._operation = operation(guard).catch(error => {
    if (version !== Sync._controlVersion) return {ok:false,reason:"操作已取消"};
    syncSetState("error", error); return {ok:false,reason:syncError(error)};
  }).finally(() => { Sync._operation = null; });
  return Sync._operation;
}
function syncCreatePairing() {
  return syncExclusive(async guard => {
    if (!Sync.enabled && !(await syncInit())) throw new Error(Sync.lastError || "同步服务尚未配置");
    guard();
    if (!Sync.room) {
      const room = syncSettings().pendingCreate || crypto.randomUUID();
      syncRemember({pendingCreate:room});
      await syncRpc("six_create_room", {p_room:room,p_data:SixSync.project(Sync.onGetData())});
      guard();
      await syncStartRoom(room, false);
      guard();
    }
    const invitation = await syncRpc("six_create_invite", {p_room:Sync.room});
    guard();
    Sync.pairingCode = invitation.code;
    return {ok:true,code:invitation.code};
  });
}
function syncJoinPairing(code) {
  return syncExclusive(async guard => {
    if (!/^[0-9a-f]{12}$/i.test(code.trim())) return {ok:false,reason:"请输入完整的12位配对码"};
    if (!Sync.enabled && !(await syncInit())) throw new Error(Sync.lastError || "同步服务尚未配置");
    guard();
    const result = await syncRpc("six_join_room", {p_code:code.trim().toUpperCase()});
    guard();
    await syncStartRoom(result.room, false);
    guard();
    return {ok:true};
  });
}
async function syncDisconnect() {
  Sync._controlVersion++;
  syncStop(); Sync.room = null; Sync.paired = false; Sync.pairingCode = null; Sync.members = 0;
  syncRemember({room:null,pairCode:null,pendingCreate:null});
  syncSetState("off");
}
async function syncAutoInit() {
  const version = Sync._controlVersion;
  try {
    const saved = syncSettings();
    // Restore pending edits before boot/render, including after an offline reload.
    if (saved.protocol === 3 && saved.room) {
      Sync.room = saved.room; Sync.paired = true;
      syncMakeEngine(saved.room, true);
    }
    if (!(await syncInit())) return false;
    if (version !== Sync._controlVersion) return false;
    if (saved.protocol === 3 && saved.room) return syncStartRoom(saved.room);
    if (saved.room || saved.pairCode) {
      const result = await syncRpc("six_migrate_legacy", {p_legacy_room:saved.room || "room-" + saved.pairCode});
      if (version !== Sync._controlVersion) return false;
      return syncStartRoom(result.room, false);
    }
    syncSetState("off"); return true;
  } catch (error) { syncSetState("error", error); return false; }
}
Object.assign(Sync, {syncInit,syncCreatePairing,syncJoinPairing,syncDisconnect,syncAutoInit,
  syncPush,syncPull:syncFlush,syncStartRoom,syncCapture});
window.addEventListener("online", async () => {
  try {
    if (!Sync.enabled && !(await syncInit())) return;
    if (!Sync.room) { syncSetState("off"); return; }
    if (!Sync._pollTimer) await syncStartRoom(Sync.room);
    else syncPush(0);
  } catch (error) { syncSetState("error", error); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncPush(0); });

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


Object.assign(Sync, {syncRenderQR, syncStartScanner});
