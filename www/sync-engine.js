/* Shared state and durable synchronization, independent of the UI and Supabase. */
(function (root) {
  "use strict";
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const keys = value => Object.keys(value || {}).filter(k => !["__proto__", "constructor", "prototype"].includes(k));
  function equal(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
    if (!object(a) || !object(b)) return false;
    const ak = keys(a), bk = keys(b);
    return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  }
  function project(state = {}) {
    const settings = state.settings || {};
    return copy({
      days: state.days || {}, plan: state.plan || null, inbox: state.inbox || [],
      settings: {
        itemLimit: settings.itemLimit ?? 6, allowSkip: settings.allowSkip ?? false,
        planReminder: settings.planReminder ?? "21:00", morningReminder: settings.morningReminder ?? "09:00",
      },
      usedTodayChance: state.usedTodayChance ?? false,
      resetId: state.resetId ?? null,
    });
  }
  const keyed = value => Array.isArray(value) && value.every(x => object(x) && typeof x.id === "string");
  // Three-way merge: only edits since base are local intent. A deletion wins over
  // a concurrent edit; independent fields/items survive. Same-field edits use
  // the value from the later successful server commit, never device wall clocks.
  function merge(base, local, remote) {
    if (equal(local, base)) return copy(remote);
    if (equal(remote, base) || equal(local, remote)) return copy(local);
    if (object(local) && object(remote) && Object.hasOwn(local, "resetId") && Object.hasOwn(remote, "resetId") && local.resetId !== remote.resetId) {
      if (local.resetId !== base?.resetId) return copy(local);
      return copy(remote);
    }
    if (base !== undefined && (local === undefined || remote === undefined)) return undefined;
    if (object(base) && (local === null || remote === null)) return null;
    if (keyed(local) && keyed(remote) && (base === undefined || keyed(base))) {
      const bm = new Map((base || []).map(x => [x.id, x]));
      const lm = new Map(local.map(x => [x.id, x])), rm = new Map(remote.map(x => [x.id, x]));
      const merged = new Map();
      for (const id of new Set([...bm.keys(), ...lm.keys(), ...rm.keys()])) {
        const value = merge(bm.get(id), lm.get(id), rm.get(id));
        if (value !== undefined) merged.set(id, value);
      }
      const localOld = local.filter(x => bm.has(x.id)).map(x => x.id);
      const baseOld = (base || []).filter(x => lm.has(x.id)).map(x => x.id);
      const primary = equal(localOld, baseOld) ? remote : local;
      const secondary = primary === local ? remote : local;
      const order = primary.map(x => x.id).filter(id => merged.has(id));
      // Insert concurrent additions beside their nearest surviving predecessor.
      let predecessor = null;
      for (const item of secondary) {
        if (!merged.has(item.id)) continue;
        if (!order.includes(item.id)) {
          const at = predecessor === null ? 0 : order.indexOf(predecessor) + 1;
          order.splice(at, 0, item.id);
        }
        predecessor = item.id;
      }
      return order.map(id => merged.get(id));
    }
    if (object(local) && object(remote) && (base === undefined || base === null || object(base))) {
      const result = {};
      for (const key of new Set([...keys(base), ...keys(local), ...keys(remote)])) {
        const value = merge(base?.[key], local[key], remote[key]);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    return copy(local);
  }

  class Engine {
    constructor({room, initial, storage, transport, apply, status = () => {}, uuid = () => root.crypto.randomUUID()}) {
      this.room = room;
      this.key = "sixthings:sync:v3:" + room;
      this.storage = storage;
      this.transport = transport;
      this.apply = apply;
      this.status = status;
      this.uuid = uuid;
      this.closed = false;
      this.running = null;
      const raw = storage.getItem(this.key);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && (saved.version !== 3 || saved.room !== room)) throw new Error("同步缓存格式不正确，请先导出备份");
      this.base = project(saved?.base);
      this.view = project(saved?.view || initial);
      this.revision = saved?.revision ?? -1;
      this.pending = saved?.pending || null;
      this.persist();
    }
    get dirty() { return !!this.pending || !equal(this.base, this.view); }
    persist() {
      this.storage.setItem(this.key, JSON.stringify({version:3, room:this.room,
        base:this.base, view:this.view, revision:this.revision, pending:this.pending}));
    }
    capture(state) {
      if (this.closed) return;
      const next = project(state);
      if (equal(next, this.view)) return;
      const previous = this.view;
      this.view = next;
      try { this.persist(); } catch (error) { this.view = previous; throw error; }
      this.status("pending");
    }
    restore() { this.apply(copy(this.view)); }
    stop() { this.closed = true; }
    flush() {
      if (this.closed) return Promise.resolve(false);
      if (this.running) return this.running;
      this.running = this.run().finally(() => { this.running = null; });
      return this.running;
    }
    accept(record, baseline) {
      if (!record || !Number.isSafeInteger(record.revision) || record.revision < this.revision || !object(record.data)) {
        throw new Error("同步服务器返回了无效版本");
      }
      const incoming = project(record.data);
      const next = merge(baseline, this.view, incoming);
      const changed = !equal(next, this.view);
      this.base = incoming;
      this.view = project(next);
      this.revision = record.revision;
      this.pending = null;
      // Save the acknowledged baseline and remaining edits as one durable record.
      this.persist();
      if (changed) this.apply(copy(this.view));
    }
    async run() {
      this.status("syncing");
      try {
        for (let attempt = 0; attempt < 12 && !this.closed; attempt++) {
          if (this.pending) {
            const sent = copy(this.pending);
            const response = await this.transport.write(this.room, sent.revision, sent.data, sent.id);
            if (this.closed) return false;
            this.accept(response, response.applied ? sent.data : this.base);
          } else {
            const response = await this.transport.read(this.room);
            if (this.closed) return false;
            this.accept(response, this.base);
          }
          if (!this.dirty) { this.status("connected"); return true; }
          this.pending = {id:this.uuid(), revision:this.revision, data:copy(this.view)};
          this.persist(); // Retry the same operation after a lost response or reload.
        }
        if (!this.closed) this.status("pending");
        return false;
      } catch (error) {
        if (!this.closed) this.status("reconnecting", error);
        throw error;
      }
    }
  }
  const api = {project, merge, equal, copy, Engine};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SixSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
