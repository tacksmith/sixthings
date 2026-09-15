const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto').webcrypto;

// 独立语言环境：每个 vm context 都是一次全新加载（模拟一次页面刷新）。
function langEnv(saved) {
  const map = new Map();
  if (saved !== undefined) map.set('sixthings:lang', saved);
  const box = vm.createContext({
    localStorage: {getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v)},
    document: {documentElement: {lang: ''}, title: 'initial', querySelectorAll: () => []},
  });
  vm.runInContext(fs.readFileSync('www/i18n.js', 'utf8'), box);
  return {run: code => vm.runInContext(code, box), map};
}

// 应用环境：加载 i18n + sync-engine + app.js 核心（与 sync-client 测试相同的切片方式）。
function appEnv(savedLang) {
  const memory = new Map();
  if (savedLang !== undefined) memory.set('sixthings:lang', savedLang);
  memory.set('sixthings:v1', JSON.stringify({inbox: [{id: 'local-a', text: '本机任务内容'}]}));
  const box = vm.createContext({
    crypto, AbortController, console,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: {getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v)},
    document: {addEventListener() {}, documentElement: {lang: ''}, title: 'x', querySelectorAll: () => []},
  });
  vm.runInContext(fs.readFileSync('www/i18n.js', 'utf8'), box);
  vm.runInContext(fs.readFileSync('www/sync-engine.js', 'utf8'), box);
  const source = fs.readFileSync('www/app.js', 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('// 全局同步指示器')), box);
  vm.runInContext('idbBackup=()=>{};render=()=>{};toast=()=>{};', box);
  return {run: code => vm.runInContext(code, box), memory};
}

test('no saved language falls back to Simplified Chinese for existing users', () => {
  const env = langEnv(undefined);
  assert.equal(env.run('I18n.lang()'), 'zh');
  assert.equal(env.run('I18n.t("tab_today")'), '今日');
  assert.equal(env.run('I18n.t("settings_language_label")'), '界面语言');
});

test('language preference persists in its own key across reloads', () => {
  const first = langEnv(undefined);
  assert.equal(first.run('I18n.setLang("en")'), 'en');
  assert.equal(first.map.get('sixthings:lang'), 'en');
  const second = langEnv('en');
  assert.equal(second.run('I18n.lang()'), 'en');
  assert.equal(second.run('I18n.t("tab_today")'), 'Today');
});

test('invalid or unknown saved values fall back to Chinese', () => {
  for (const saved of ['fr', 'en-US', '', 'junk', null]) {
    const env = langEnv(saved);
    assert.equal(env.run('I18n.lang()'), 'zh', 'saved=' + JSON.stringify(saved));
  }
});

test('document lang and title follow the active language', () => {
  const zh = langEnv(undefined);
  assert.equal(zh.run('document.documentElement.lang'), 'zh-CN');
  assert.equal(zh.run('document.title'), '六件事 · Six Things');
  const en = langEnv('en');
  assert.equal(en.run('document.documentElement.lang'), 'en');
  assert.equal(en.run('document.title'), 'Six Things · 六件事');
});

test('missing dictionary keys return the key instead of leaking a translation', () => {
  const env = langEnv('en');
  assert.equal(env.run('I18n.t("no_such_message")'), 'no_such_message');
});

test('English pluralized messages are complete sentences, not word fragments', () => {
  const env = langEnv('en');
  assert.equal(env.run('I18n.t("today_banner_unfinished",{n:1})'), 'You still have <b>1</b> item unfinished today. Carry it over to tomorrow — no guilt.');
  assert.equal(env.run('I18n.t("today_banner_unfinished",{n:3})'), 'You still have <b>3</b> items unfinished today. Carry them over to tomorrow — no guilt.');
  assert.equal(env.run('I18n.t("toast_rollover_n",{n:1})'), 'Carried 1 item over to tomorrow');
  assert.equal(env.run('I18n.t("toast_rollover_n",{n:2})'), 'Carried 2 items over to tomorrow');
  assert.equal(env.run('I18n.t("set_sync_members",{n:1})'), '1 device shares this list. New devices can still scan to join.');
  assert.equal(env.run('I18n.t("set_sync_members",{n:2})'), '2 devices share this list. New devices can still scan to join.');
});

test('named parameters fill dynamic messages with user text', () => {
  const zh = langEnv(undefined);
  const en = langEnv('en');
  assert.equal(zh.run('I18n.t("today_now",{idx:1,total:6})'), '现在只做这一件 · 1/6');
  assert.equal(en.run('I18n.t("today_now",{idx:1,total:6})'), 'Now, do just this one · 1/6');
  assert.equal(en.run('I18n.t("notify_morning_body",{text:"call mom"})'), 'Now do just this one: call mom');
  assert.equal(zh.run('I18n.t("toast_today_full",{n:6})'), '清单满了（6 件），先删掉或移入收件箱');
});

test('calendar weekday and month labels follow the language', () => {
  const zh = langEnv(undefined);
  const en = langEnv('en');
  assert.equal(zh.run('I18n.weekdayShort(3)'), '三');
  assert.equal(en.run('I18n.weekdayShort(3)'), 'Wed');
  assert.equal(zh.run('I18n.formatMonth(2026, 8)'), '2026 年 9 月');
  assert.equal(en.run('I18n.formatMonth(2026, 8)'), 'September 2026');
});

test('switching language never modifies task data or shared sync settings', () => {
  const env = appEnv(undefined);
  const rawBefore = env.memory.get('sixthings:v1');
  const stateBefore = env.run('JSON.stringify(S)');
  env.run('I18n.setLang("en")');
  assert.equal(env.run('I18n.lang()'), 'en');
  assert.equal(env.memory.get('sixthings:lang'), 'en');
  assert.equal(env.memory.get('sixthings:v1'), rawBefore);
  assert.equal(env.run('JSON.stringify(S)'), stateBefore);
  assert.equal(env.memory.get('sixthings:sync'), undefined);
});

test('remote data preserves the local language and user task content', () => {
  const env = appEnv('en');
  assert.equal(env.run('I18n.lang()'), 'en');
  env.run('syncApplyRemote({data:SixSync.project({inbox:[{id:"remote-b",text:"remote task text"}],settings:{allowSkip:true,itemLimit:4},usedTodayChance:true})});');
  assert.equal(env.run('I18n.lang()'), 'en', 'language must not change when remote data arrives');
  assert.equal(env.memory.get('sixthings:lang'), 'en');
  assert.equal(env.run('S.inbox.length'), 1);
  assert.equal(env.run('S.inbox[0].text'), 'remote task text');
  assert.equal(env.run('S.settings.allowSkip'), true);
  assert.equal(env.run('S.settings.itemLimit'), 4);
  assert.equal(env.run('S.usedTodayChance'), true);
});
