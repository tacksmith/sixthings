/* ============================================================
 * 六件事 · Six Things — 界面语言模块（简体中文 / English）
 * 小型显式词典，无第三方依赖，不扫描/替换用户输入的内容。
 * 语言偏好保存在独立的 localStorage key（sixthings:lang），
 * 与任务状态（sixthings:v1）和同步设置（sixthings:sync）分离。
 * 默认简体中文：没有保存过的选择时沿用中文，老用户语言不变。
 * ============================================================ */
(function (root) {
  "use strict";

  const STORAGE_KEY = "sixthings:lang";
  const DEFAULT_LANG = "zh";

  /* ---------------- 词典 ---------------- */
  // 每条目为 { zh, en }；值可以是字符串（含 {name} 命名参数）或
  // 函数 (params) => 字符串（用于英文复数等语法敏感的完整句子）。
  const msg = (zh, en) => ({ zh, en });

  const MESSAGES = {
    /* 应用级 */
    app_brand: msg("六件事", "Six Things"),
    app_title: msg("六件事 · Six Things", "Six Things · 六件事"),
    sync_status_title: msg("多端同步状态", "Multi-device sync status"),
    tab_today: msg("今日", "Today"),
    tab_plan: msg("规划", "Plan"),
    tab_history: msg("坚持", "History"),
    tab_settings: msg("设置", "Settings"),

    /* 日期 */
    date_today: msg("今天", "Today"),
    date_tomorrow: msg("明天", "Tomorrow"),
    date_yesterday: msg("昨天", "Yesterday"),

    /* 今日页 */
    today_banner_unfinished: msg(
      p => "今天还有 <b>" + p.n + "</b> 件没做完。做不完就顺延到明天，别内疚。",
      p => "You still have <b>" + p.n + "</b> " + (p.n === 1 ? "item unfinished today. Carry it over" : "items unfinished today. Carry them over") + " to tomorrow — no guilt."
    ),
    today_banner_rollover_btn: msg("顺延到明天的清单", "Carry over to tomorrow's list"),
    today_empty_1: msg("今天还没有清单。", "No list for today yet."),
    today_empty_2: msg("Ivy Lee 法说：睡前写下明天最重要的几件事，", "The Ivy Lee method says: before bed, write the few most important things for tomorrow,"),
    today_empty_3: msg("白天就只按顺序做第一件。", "and during the day only do the first one, in order."),
    today_empty_start_btn: msg("现在就开始写今天的清单", "Start today's list now"),
    today_empty_alt: msg("或去「规划」写下明天的清单", "or write tomorrow's list under \"Plan\"."),
    today_write_title: msg("写下今天要做的事", "Write what you'll do today"),
    today_input_placeholder: msg("写一件今天要做的事…", "Write one thing you'll do today…"),
    today_input_max: msg("最多 {n} 件，最重要放第 1 位。", "Up to {n} items; the most important goes first."),
    today_progress_label: msg("今日进度", "Today's progress"),
    today_all_done_suffix: msg("全搞定 🎉", "all done 🎉"),
    today_now: msg("现在只做这一件 · {idx}/{total}", "Now, do just this one · {idx}/{total}"),
    today_done_btn: msg("搞定这件 ✓", "Done ✓"),
    today_skip_btn: msg("跳过", "Skip"),
    today_all_done_label: msg("🎉 全部搞定", "🎉 All done"),
    today_all_done_desc: msg("今天 {total} 件全做完了。<br/>去写明天的清单吧。", "All {total} items done today.<br/>Go write tomorrow's list."),
    today_state_skipped: msg("跳过", "Skipped"),
    today_state_active: msg("做这个", "Do this"),
    today_skip_note: msg("允许跳过已开启（跳过会顺延到明天）。", "Skipping is on (skipped items carry over to tomorrow)."),
    today_add_more_placeholder: msg("再写一件今天要做的事…（最多 {n} 件）", "Add one more thing for today… (up to {n})"),

    /* 收件箱 */
    inbox_title: msg("收件箱 · 临时插入", "Inbox · capture on the fly"),
    inbox_subtitle: msg("突发事项先丢这里，不打断主清单", "Drop interruptions here without breaking your main list"),
    inbox_placeholder: msg("临时冒出来的事…", "Something that just came up…"),
    inbox_promote_title: msg("加入明天", "Add to tomorrow"),

    /* 规划页 */
    plan_banner_unfinished: msg(
      p => "今天还有 <b>" + p.n + "</b> 件没做完 → 一键顺延到明天。",
      p => "You still have <b>" + p.n + "</b> " + (p.n === 1 ? "unfinished today → carry it over" : "unfinished today → carry them over") + " with one tap."
    ),
    plan_rollover_btn: msg("顺延并继续规划", "Carry over & keep planning"),
    plan_chance_rolled: msg("顺延收尾", "carried over"),
    plan_chance_done: msg("全部做完", "all done"),
    plan_chance_plan: msg("下面的规划", "the plan below"),
    plan_chance_write: msg("你现在要写的", "what you're about to write"),
    plan_chance_banner: msg(
      "今天的清单已经{state}。要不要给一次机会，把{what}作为<b>今天的任务</b>立即执行？",
      "Today's list is {state}. Want one chance to treat {what} as <b>today's task</b> and start it right now?"
    ),
    plan_chance_btn: msg("用这次机会，作为今日任务", "Use this chance — make it today's task"),
    plan_cap_full: msg("只能 {n} 件喔，满了", "Only {n} items allowed — it's full"),
    plan_cap_note: msg("最多 {n} 件，够少才能专注", "Up to {n} items — few enough to focus"),
    plan_first_note: msg("最重要放第 1 位", "most important first"),
    plan_title_for: msg("写下{date}的清单", "Write the list for {date}"),
    plan_input_placeholder_full: msg("清单满了，先删掉一些", "The list is full — remove some first"),
    plan_input_placeholder: msg("写一件事，例如：完成周报", "Write one thing, e.g. finish the weekly report"),
    plan_empty_1: msg("还没写。现在就写下明天最重要的几件事，", "Nothing yet. Write tomorrow's few most important things now,"),
    plan_empty_2: msg("越多反而越做不完。", "the more you add, the less gets done."),
    plan_edit_save_title: msg("保存", "Save"),
    plan_edit_cancel_title: msg("取消", "Cancel"),
    plan_edit_title: msg("编辑", "Edit"),
    plan_drag_title: msg("拖拽排序", "Drag to reorder"),
    plan_over_limit: msg(
      p => "⚠️ 比上限多了 " + p.n + " 件（可能来自顺延），删掉一些或移到后天。",
      p => "⚠️ " + p.n + " above the limit (possibly from carry-over) — remove some or move them to the day after tomorrow."
    ),
    plan_inbox_title: msg("收件箱 → 加入明天", "Inbox → add to tomorrow"),
    plan_inbox_promote_btn: msg("→加入", "→Add"),
    plan_hint_1: msg("💡 一件事 = 一个能完成的动作。写「完成周报」，别写「处理工作」。", "💡 One item = one doable action. Write \"finish the weekly report\", not \"handle work\"."),
    plan_hint_2: msg("✅ 已存本机，关掉也不会丢。", "✅ Saved on this device — safe even if you close the app."),

    /* 坚持页 */
    hist_streak_label: msg("🔥 连续坚持天数", "🔥 Current streak (days)"),
    hist_streak_tip: msg("每天完成重要的事，慢慢积累进展", "Make steady progress on what matters, one day at a time."),
    hist_best: msg("最长连续", "Longest streak"),
    hist_total: msg("累计完成", "Total completed"),
    cal_legend_full: msg("全完成", "Completed"),
    cal_legend_partial: msg("部分", "Partial"),
    cal_legend_some: msg("有未完成", "Unfinished"),
    cal_legend_blank: msg("无记录", "No record"),
    hist_day_no_record: msg("这一天没有记录任务。", "No tasks were recorded on this day."),
    hist_day_sum: msg("{done}/{total} 完成", "{done}/{total} done"),
    hist_day_state_skipped: msg("跳过", "Skipped"),
    hist_day_state_todo: msg("未做", "Not done"),

    /* 设置页 */
    settings_language_title: msg("语言 · Language", "Language · 语言"),
    settings_language_label: msg("界面语言", "Interface language"),
    settings_language_desc: msg("切换后立即生效，仅保存在本机", "Applies immediately; saved on this device only"),
    set_rules_title: msg("清单规则", "List rules"),
    set_item_limit: msg("每天清单上限", "Daily list limit"),
    set_item_limit_desc: msg("每天选 3–6 件重要的事，给自己留出专注空间", "Choose 3–6 important tasks each day and leave room to focus"),
    set_allow_skip: msg("允许跳过", "Allow skipping"),
    set_allow_skip_desc: msg("关闭 = 严格按顺序，第 1 件做完前不能碰别的", "Off = strict order; nothing else before item 1 is done"),
    set_chance: msg("一次机会可再开启", "One-chance option"),
    set_chance_desc: msg("今天清单定型后，把新规划作为今日任务执行的机会。用完可在此重新打开。", "After today's list is finalized, one chance to run a new plan as today's task. Re-enable here after using it."),
    set_reminders_title: msg("提醒", "Reminders"),
    set_plan_reminder: msg("晚间规划提醒", "Evening planning reminder"),
    set_plan_reminder_desc: msg("睡前写下明天的清单", "Write tomorrow's list before bed"),
    set_morning_reminder: msg("早晨开工提醒", "Morning start reminder"),
    set_morning_reminder_desc: msg("推送「今天的第一件事」", "Pushes \"today's first thing\""),
    set_notify: msg("系统通知", "System notifications"),
    set_notify_desc: msg("APP 打开时会按上面时间提醒（安装到主屏体验更好）", "Reminders fire while the app is open (works best installed to your home screen)"),
    set_method_title: msg("这套方法 · Ivy Lee 法", "The method · Ivy Lee"),
    method_1_title: msg("睡前列清单", "Plan before bed"),
    method_1_desc: msg("每天工作结束前，写下明天需要完成的 6 件（或 3 件）最重要的事，只能这么多。", "Before the day ends, write the 6 (or 3) most important things to finish tomorrow — no more than that."),
    method_2_title: msg("按重要排序", "Rank by importance"),
    method_2_desc: msg("按重要程度排序，最重要的放第 1，以此类推。", "Rank by importance: most important first, and so on."),
    method_3_title: msg("只做第一件", "Do only the first one"),
    method_3_desc: msg("隔天严格按顺序做。第 1 件做完之前，不能碰其他任何事。", "The next day, work strictly in order. Before item 1 is done, don't touch anything else."),
    method_4_title: msg("做不完就顺延", "Carry over what's unfinished"),
    method_4_desc: msg("真的做不完，就移到明天的清单里重新排序，别内疚。", "If you really can't finish, move it to tomorrow's list, re-sort, and don't feel guilty."),
    set_method_note: msg("关键在于分辨哪些才是重要的事，把优先级写下来，再逐项行动。", "Decide what matters most, write down your priorities, and work through them one at a time."),

    /* 多端同步 */
    set_sync_title: msg("多端同步", "Multi-device sync"),
    sync_off_unconfigured: msg("仅保存在本机", "Saved on this device only"),
    sync_state_off: msg("未配对", "Not paired"),
    sync_state_connecting: msg("连接中", "Connecting"),
    sync_state_syncing: msg("正在同步", "Syncing"),
    sync_state_pending: msg("有修改待上传", "Changes waiting to upload"),
    sync_state_connected: msg("已同步", "Synced"),
    sync_state_reconnecting: msg("等待联网重试", "Waiting to retry once online"),
    sync_state_error: msg("同步暂不可用", "Sync unavailable right now"),
    sync_state_unknown: msg("未连接", "Not connected"),
    set_sync_members: msg(
      p => p.n + " 台设备共享清单。新设备可继续扫码加入。",
      p => p.n + (p.n === 1 ? " device shares this list." : " devices share this list.") + " New devices can still scan to join."
    ),
    set_sync_disconnect_btn: msg("停止本机同步", "Stop sync on this device"),
    set_sync_unpaired_host: msg("创建配对码，或输入另一台设备的配对码。", "Create a pairing code, or enter one from another device."),
    set_sync_unpaired_local: msg("当前使用本机存储。维护者启用同步后，可以在多台设备间共享清单。", "Using local storage for now. Once the maintainer enables sync, you can share your list across devices."),
    set_sync_add_device_btn: msg("添加设备", "Add device"),
    set_sync_show_code_btn: msg("显示配对码", "Show pairing code"),
    set_sync_code_placeholder: msg("输入12位配对码", "Enter 12-character code"),
    set_sync_join_btn: msg("加入", "Join"),
    set_sync_scan_btn: msg("扫码", "Scan"),
    set_sync_scan_hint: msg("将摄像头对准另一台设备的二维码", "Point the camera at another device's QR code"),
    set_sync_code_note: msg("配对码10分钟有效，仅可加入一次。离线修改会保存在本机，联网后继续同步。", "Codes last 10 minutes and can be used once. Offline changes stay on this device and sync after you reconnect."),
    set_sync_pair_hint: msg("让另一台设备扫码或输入配对码加入", "Have another device scan this code or type it in to join"),
    set_sync_pair_valid: msg("二维码 10 分钟有效，一次性", "QR code valid for 10 minutes, one-time use"),

    /* 数据备份 / 重置 */
    set_backup_title: msg("数据备份", "Data backup"),
    set_export_label: msg("导出备份", "Export backup"),
    set_export_desc: msg("把全部清单与历史下载成文件，永久保存、可换设备", "Download all lists and history as a file to keep forever or move to another device"),
    set_export_btn: msg("导出", "Export"),
    set_import_label: msg("导入恢复", "Import & restore"),
    set_import_desc: msg("从备份文件恢复历史记录（会合并，不覆盖现有）", "Restore history from a backup file (merges; never overwrites)"),
    set_import_btn: msg("导入", "Import"),
    set_reset_label: msg("重置所有数据", "Reset all data"),
    set_reset_desc: msg("清空清单、历史和设置", "Clears lists, history, and settings"),
    set_reset_btn: msg("清空", "Clear"),
    confirm_reset: msg("确定清空清单、历史和设置？已启用同步时，共享设备也会清空。", "Clear all lists, history, and settings? If sync is enabled, shared devices will be cleared too."),
    set_footer_note: msg("六件事 · Six Things — 数据保存在本机；启用同步后也会保存在共享服务中。可随时导出备份。", "Six Things · 六件事 — data stays on this device; with sync enabled it's also kept in the shared service. Export a backup anytime."),
    set_footer_version: msg("版本 {v}", "Version {v}"),

    /* 提醒 */
    notify_morning_title: msg("今天的第一件事", "Your first thing today"),
    notify_morning_body: msg("现在只做这一件：{text}", "Now do just this one: {text}"),
    notify_evening_title: msg("该规划明天了", "Time to plan tomorrow"),
    notify_evening_body: msg(
      p => "先别划走，写下明天最重要的 " + p.n + " 件事",
      p => "Before you go, write tomorrow's " + p.n + (p.n === 1 ? " most important thing" : " most important things")
    ),
    toast_notify_unsupported: msg("此浏览器不支持系统通知", "This browser doesn't support system notifications"),

    /* Toast */
    toast_save_failed: msg("本机保存失败，请立即导出备份", "Couldn't save locally — export a backup now"),
    toast_added_today: msg("已加入今天的清单", "Added to today's list"),
    toast_today_full: msg("清单满了（{n} 件），先删掉或移入收件箱", "The list is full ({n} items) — delete one or move it to the inbox"),
    toast_complete_all: msg("今天全部搞定！去写明天的清单吧", "All done today! Go write tomorrow's list"),
    toast_complete_next: msg("搞定一件 ✓ 下一件：{text}", "Done one ✓ Next: {text}"),
    toast_complete_plain: msg("搞定一件 ✓", "Done one ✓"),
    toast_skipped: msg("跳过了，今晚会顺延到明天", "Skipped — it will carry over to tomorrow"),
    toast_rollover_n: msg(
      p => "已把 " + p.n + " 件顺延到明天",
      p => "Carried " + p.n + (p.n === 1 ? " item" : " items") + " over to tomorrow"
    ),
    toast_rollover_none: msg("今天没有需要顺延的", "Nothing to carry over today"),
    toast_chance_used_plan: msg("已把规划作为今日任务，去执行吧", "The plan is now today's task — go do it"),
    toast_chance_used_none: msg("机会已用，写下的就是今天的任务", "Chance used — what you write becomes today's task"),
    toast_start_today: msg("写下一件今天要做的事吧", "Write down one thing you'll do today"),
    toast_inbox_added: msg("已丢进收件箱，不打断主清单", "Moved to the inbox — your main list stays untouched"),
    toast_added_plan: msg("已加入清单", "Added to the list"),
    toast_skip_on: msg("已开启跳过", "Skipping is on"),
    toast_skip_off: msg("已关闭跳过，严格按顺序", "Skipping is off — strict order"),
    toast_chance_on: msg("已重新开启一次机会", "The one-chance option is on again"),
    toast_chance_off: msg("已关闭一次机会（不再提示）", "The one-chance option is off (no more prompts)"),
    toast_disconnected: msg("已解除配对", "Unpaired this device"),
    toast_exported: msg("已导出备份文件", "Backup file exported"),
    toast_export_failed: msg("导出失败", "Export failed"),
    toast_imported_days: msg(
      p => "已从备份恢复 " + p.n + " 天历史",
      p => "Restored " + p.n + (p.n === 1 ? " day" : " days") + " of history from backup"
    ),
    toast_import_failed: msg("文件格式不对，未导入", "Wrong file format — nothing imported"),
    toast_cleared: msg("已清空", "Cleared"),
    common_unknown: msg("未知", "unknown"),

    /* 同步交互 */
    toast_sync_unconfigured: msg("同步未配置：需先配置 Supabase", "Sync isn't configured: Supabase setup required"),
    toast_pair_code: msg("配对码已生成：{code}", "Pairing code generated: {code}"),
    toast_pair_failed: msg("配对失败：{reason}", "Pairing failed: {reason}"),
    toast_scan_unavailable: msg("扫码功能不可用", "Scanner unavailable"),
    toast_scan_success: msg("扫码配对成功，开始实时同步", "QR pairing successful — realtime sync started"),
    toast_join_failed: msg("加入失败：{reason}", "Join failed: {reason}"),
    toast_enter_code: msg("请输入 12 位配对码", "Enter the 12-character pairing code"),
    toast_join_success: msg("配对成功，开始实时同步", "Paired successfully — realtime sync started"),
    toast_scan_open_failed: msg("无法打开摄像头", "Couldn't open the camera"),

    /* 已知同步错误 */
    sync_error_upgrade: msg("同步服务需要升级，请联系维护者", "Sync service needs an upgrade — contact the maintainer"),
    sync_error_permission: msg("当前设备没有访问权限，请重新配对", "This device has no access — pair again"),
    sync_error_code_invalid: msg("配对码无效、已使用或已过期", "Pairing code is invalid, already used, or expired"),
    sync_error_quota: msg("本机存储空间不足，请立即导出备份", "Not enough local storage — export a backup now"),
    sync_error_network: msg("暂时无法连接，内容已保存在本机，联网后重试", "Can't connect right now — changes are saved locally; retry when online"),
    sync_reason_code_format: msg("请输入完整的12位配对码", "Enter the full 12-character pairing code"),
    sync_client_unavailable: msg("尚未连接同步服务", "Sync service is not connected yet"),
    sync_operation_cancelled: msg("操作已取消", "Operation cancelled"),
    sync_not_configured: msg("同步服务尚未配置", "Sync service isn't configured yet"),
    sync_engine_cache_format: msg("同步缓存格式不正确，请先导出备份", "Sync cache is in an unexpected format — export a backup first"),
    sync_engine_invalid_version: msg("同步服务器返回了无效版本", "Sync server returned an invalid version"),
    sync_engine_room_format: msg("同步空间格式不正确", "Invalid sync space format"),
    sync_engine_identity: msg("无法取得同步身份", "Couldn't get a sync identity"),
    sync_engine_components: msg("同步组件未加载，请刷新页面", "Sync components failed to load — refresh the page"),
    sync_scan_no_camera: msg("设备不支持摄像头或缺少 jsQR", "Camera is unsupported or jsQR is missing"),
  };

  /* ---------------- 语言状态 ---------------- */
  let current = null;

  function lang() {
    if (current) return current;
    let saved = null;
    try {
      if (typeof root.localStorage !== "undefined") saved = root.localStorage.getItem(STORAGE_KEY);
    } catch (e) { /* 隐私模式等场景下读取失败时沿用默认 */ }
    current = saved === "en" ? "en" : DEFAULT_LANG;
    return current;
  }
  function setLang(value) {
    const next = value === "en" ? "en" : DEFAULT_LANG;
    current = next;
    try {
      if (typeof root.localStorage !== "undefined") root.localStorage.setItem(STORAGE_KEY, next);
    } catch (e) { /* 写失败不阻塞界面切换 */ }
    applyDocument();
    applyStatic();
    return next;
  }
  function isEnglish() { return lang() === "en"; }

  /* ---------------- 取词 ---------------- */
  function fill(template, params) {
    if (!params) return template;
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m));
  }
  function t(key, params) {
    const entry = MESSAGES[key];
    if (!entry) return key;
    const value = isEnglish() ? entry.en : entry.zh;
    return typeof value === "function" ? value(params || {}) : fill(value, params);
  }

  /* ---------------- 日期 / 星期 ---------------- */
  const WEEKDAYS = {
    zh: ["日", "一", "二", "三", "四", "五", "六"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  };
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function weekdayShort(i) { return WEEKDAYS[isEnglish() ? "en" : "zh"][((i % 7) + 7) % 7]; }
  function weekdays() { return WEEKDAYS[isEnglish() ? "en" : "zh"]; }
  function monthName(m) { return MONTHS_EN[((m % 12) + 12) % 12]; }

  // 顶栏日期：zh「9月17日 · 周三」/ en「Sep 17 · Wed」
  function formatTopDate(d) {
    if (isEnglish()) return monthName(d.getMonth()) + " " + d.getDate() + " · " + weekdayShort(d.getDay());
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 · 周" + weekdayShort(d.getDay());
  }
  // 日历月份标题：zh「2026 年 9 月」/ en「September 2026」
  function formatMonth(y, m) {
    if (isEnglish()) return monthName(m) + " " + y;
    return y + " 年 " + (m + 1) + " 月";
  }
  // 非相对日期（今天/明天/昨天由调用方处理）：zh「9月17日 周三」/ en「Sep 17, Wed」
  function formatDateKey(key) {
    const d = new Date(key + "T00:00:00");
    if (isNaN(d.getTime())) return key;
    if (isEnglish()) return monthName(d.getMonth()) + " " + d.getDate() + ", " + weekdayShort(d.getDay());
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + weekdayShort(d.getDay());
  }

  /* ---------------- 文档与应用 ---------------- */
  // 设置 <html lang> 与 <title>。
  function applyDocument() {
    try {
      if (!root.document) return;
      const d = root.document;
      if (d.documentElement) d.documentElement.lang = isEnglish() ? "en" : "zh-CN";
      const title = t("app_title");
      if (typeof d.title === "string" && d.title !== title) d.title = title;
    } catch (e) { /* 文档不可用时静默 */ }
  }
  // 一次性填充静态标签（[data-i18n] 文本、[data-i18n-title] 提示）。
  // 仅在加载与切换语言时调用，不做持续 DOM 监听。
  function applyStatic() {
    try {
      if (!root.document || !root.document.querySelectorAll) return;
      root.document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        const value = key ? t(key) : "";
        if (value !== key) el.textContent = value;
      });
      root.document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        if (key) el.setAttribute("title", t(key));
      });
    } catch (e) { /* 静默 */ }
  }

  const api = { lang, setLang, isEnglish, t, weekdayShort, weekdays, formatTopDate, formatMonth, formatDateKey, applyDocument, applyStatic };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.I18n = api;
  applyDocument();
  applyStatic();
})(typeof globalThis !== "undefined" ? globalThis : this);
