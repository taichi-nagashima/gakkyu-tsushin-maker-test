/* ==========================================================
   HOME 学級通信メーカー - Main Application (v2)
   ========================================================== */

(() => {
  'use strict';

  // ---------- Constants ----------
  // キャッシュ対策バージョン：index.html の <meta name="asset-version"> と各 ?v= と必ず同じ値にする
  // （更新時は index.html と app.js の現在の値をまとめて置換。ずれているとコンソールに警告が出ます）
  const APP_VERSION = '2026112601';
  const KEYS = {
    state: 'home_newsletter_state_v1',
    base: 'home_newsletter_default_schedule_v1',
    history: 'home_newsletter_history_v1',
    api: 'home_newsletter_gemini_api_key_v1',
    welcome: 'home_newsletter_welcome_dismissed_v1',
    cloud: 'home_newsletter_cloud_session_v1',
    cloudNudgeDismissed: 'home_newsletter_cloud_nudge_dismissed_v1'
  };
  const SUPABASE_URL = 'https://ilwspkhaystykdpwiijq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_3I2MqHL-VQkVgsNeltZ-WQ_AigHp1KV';
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const FLAG_CYCLE = ['〇', '×', '△', '－'];
  const APRON_GROUPS = [1, 2, 3, 4, 5, 6, 7, 8];
  const SHEET_W = 1122;
  const SHEET_H = 794;

  const FONT = {
    article: { base: 13.5, min: 10.5, large: 15, normal: 13.5, small: 12, lh: 1.65 },
    parents: { base: 12.5, min: 10, large: 13.5, normal: 12, small: 11, lh: 1.55 }
  };

  // 原本PDF（3年3組）の時間割
  const BUILTIN_BASE = [
    { periods: ['学活', '保体', '数学', '社会', '国語', '理科'], lunch: '〇', clean: '〇', club: '〇', endTime: '', note: '' },
    { periods: ['理科', '数学', '英語', '理科', '社会', '国語'], lunch: '〇', clean: '×', club: '〇', endTime: '', note: '' },
    { periods: ['国語', '保体', '英語', '数学', '道徳', '×'], lunch: '〇', clean: '〇', club: '〇', endTime: '', note: '' },
    { periods: ['総合', '音楽', '社会', '英語', '保体', '美術'], lunch: '〇', clean: '×', club: '〇', endTime: '', note: '' },
    { periods: ['理科', '数学', '技家', '社会', '英語', '総合'], lunch: '〇', clean: '〇', club: '〇', endTime: '', note: '' }
  ];

  const PARENT_TEMPLATES = {
    thanks: 'いつも学級活動への温かいご理解とご協力をありがとうございます。',
    submit: '【提出のお願い】〇〇を〇月〇日(〇)までにご提出ください。',
    items: '【持ち物】〇月〇日(〇)は〇〇をご用意ください。',
    event: '【行事のお知らせ】〇月〇日(〇)に〇〇を行います。',
    health: '朝晩の寒暖差が大きくなってきました。ご家庭でも体調管理へのご協力をお願いいたします。'
  };

  // ---------- Small utils ----------
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pad2 = (n) => String(n).padStart(2, '0');
  function safeRun(label, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[HOME学級通信] ${label} でエラー:`, err); if (typeof showToast === 'function') showToast(`${label} でエラーが発生しました`, { error: true });
    }
  }
  function onEl(target, event, handler) {
    const el = typeof target === 'string' ? $(target) : target;
    if (el) el.addEventListener(event, handler);
  }
  function checkAppVersion() {
    const meta = document.querySelector('meta[name="asset-version"]');
    const htmlVer = meta ? meta.getAttribute('content') : '';
    if (htmlVer && htmlVer !== APP_VERSION) {
      console.warn(`[HOME学級通信] バージョン不一致を検知しました (HTML: ${htmlVer}, JS: ${APP_VERSION})。スーパーリロードをおすすめします。`);
    }
  }

  // ---------- APIキーの取り方ガイド（独立・最優先で登録） ----------
  // 「📖 APIキーの取り方を見る」ボタン／AIパネルの「APIキーの取り方を見る」リンクは、
  // 状態の読み込み・描画・他のイベント登録などで例外が起きても必ず反応するよう、
  // init() / bindEvents() に依存せず、スクリプト読み込み直後に document への委譲で登録する。
  function toggleApiKeyGuide(forceOpen) {
    const guide = $('apiKeyGuide');
    const btn = $('btnToggleApiGuide');
    if (!guide) return;
    const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : guide.hidden;
    guide.hidden = !nextOpen;
    if (btn) btn.setAttribute('aria-expanded', String(nextOpen));
    if (nextOpen) {
      try { guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) { /* ignore */ }
    }
  }
  function openApiKeyGuide() {
    // 設定欄の初期化に失敗しても、モーダル表示とガイド展開は必ず行う
    safeRun('openSettingsModal', () => openSettingsModal());
    const modal = $('settingsModal');
    if (modal) modal.hidden = false;
    toggleApiKeyGuide(true);
  }
  try {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      const el = t.closest('#btnToggleApiGuide, [data-act="toggle-api-guide"], [data-act="open-api-guide"]');
      if (!el) return;
      safeRun('apiKeyGuide', () => {
        if (el.dataset.act === 'open-api-guide') openApiKeyGuide();
        else toggleApiKeyGuide();
      });
    });
  } catch (err) {
    console.error('[HOME学級通信] APIキーガイドのイベント登録でエラー:', err);
  }

  function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function fromISO(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function fridayOfWeek(base) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const day = d.getDay();
    return addDays(d, day === 6 ? 6 : 5 - day); // 土曜は翌週金曜
  }
  function nextMonday(d) {
    const day = d.getDay();
    return addDays(d, day === 0 ? 1 : 8 - day);
  }
  function shortDate(d) { return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; }
  function eraDate(iso) {
    const d = fromISO(iso);
    if (!d) return '令和〇年〇月〇日(〇) 発行';
    const r = d.getFullYear() - 2018;
    const era = r >= 1 ? `令和${r === 1 ? '元' : r}年` : `${d.getFullYear()}年`;
    return `${era}${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]}) 発行`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function formatPeriodText(text) {
    const t = (text || '').trim();
    if (!t || t.includes('\n')) return t;
    if (t.length === 2) return `${t[0]}\n${t[1]}`;
    if (t.length === 3 || t.length === 4) return `${t.slice(0, 2)}\n${t.slice(2)}`;
    return t;
  }

  // ---------- 日本の祝日（自動計算） ----------
  const holidayCache = {};
  function nthMonday(y, m0, n) {
    const first = new Date(y, m0, 1).getDay();
    return 1 + ((8 - first) % 7) + 7 * (n - 1);
  }
  function getHolidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const map = new Map();
    const key = (m, d) => `${m}-${d}`;
    const add = (m, d, name) => map.set(key(m, d), name);
    const k = y - 1980;
    add(1, 1, '元日');
    add(1, nthMonday(y, 0, 2), '成人の日');
    add(2, 11, '建国記念の日');
    if (y >= 2020) add(2, 23, '天皇誕生日');
    add(3, Math.floor(20.8431 + 0.242194 * k - Math.floor(k / 4)), '春分の日');
    add(4, 29, '昭和の日');
    add(5, 3, '憲法記念日');
    add(5, 4, 'みどりの日');
    add(5, 5, 'こどもの日');
    add(7, nthMonday(y, 6, 3), '海の日');
    add(8, 11, '山の日');
    add(9, nthMonday(y, 8, 3), '敬老の日');
    add(9, Math.floor(23.2488 + 0.242194 * k - Math.floor(k / 4)), '秋分の日');
    add(10, nthMonday(y, 9, 2), 'スポーツの日');
    add(11, 3, '文化の日');
    add(11, 23, '勤労感謝の日');

    const baseKeys = new Set(map.keys());
    // 振替休日
    for (const kk of baseKeys) {
      const [m, d] = kk.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (dt.getDay() === 0) {
        let n = addDays(dt, 1);
        while (map.has(key(n.getMonth() + 1, n.getDate()))) n = addDays(n, 1);
        if (n.getFullYear() === y) add(n.getMonth() + 1, n.getDate(), '振替休日');
      }
    }
    // 国民の休日（祝日に挟まれた平日）
    for (let dt = new Date(y, 0, 2); dt.getFullYear() === y; dt = addDays(dt, 1)) {
      const kk = key(dt.getMonth() + 1, dt.getDate());
      if (map.has(kk) || dt.getDay() === 0) continue;
      const p = addDays(dt, -1);
      const n = addDays(dt, 1);
      if (baseKeys.has(key(p.getMonth() + 1, p.getDate())) && baseKeys.has(key(n.getMonth() + 1, n.getDate()))) {
        add(dt.getMonth() + 1, dt.getDate(), '国民の休日');
      }
    }
    holidayCache[y] = map;
    return map;
  }
  function holidayName(d) {
    return getHolidays(d.getFullYear()).get(`${d.getMonth() + 1}-${d.getDate()}`) || '';
  }

  // ---------- Week helpers ----------
  function weekDates() {
    const start = fromISO(state.scheduleStartDate);
    if (!start) return null;
    return [0, 1, 2, 3, 4].map((i) => addDays(start, i));
  }
  function weekRangeText() {
    const w = weekDates();
    if (!w) return '〇〇月〇〇日～〇〇月〇〇日';
    return `${w[0].getMonth() + 1}月${w[0].getDate()}日～${w[4].getMonth() + 1}月${w[4].getDate()}日`;
  }
  function weekCells() {
    const w = weekDates();
    if (!w) return WD.slice(1, 6).map((wd) => ({ month: '〇〇', dayLabel: `〇〇(${wd})` }));
    return w.map((d) => ({ month: String(d.getMonth() + 1), dayLabel: `${d.getDate()}(${WD[d.getDay()]})`, date: d }));
  }
  function monthSpans(cells) {
    const spans = new Array(cells.length).fill(0);
    let i = 0;
    while (i < cells.length) {
      let j = i + 1;
      while (j < cells.length && cells[j].month === cells[i].month) j++;
      spans[i] = j - i;
      i = j;
    }
    return spans;
  }
  function apronText() {
    return (state.apronGroups || []).slice().sort((a, b) => a - b).join('・');
  }
  function bannerText() {
    const a = apronText();
    return `来週の予定(${weekRangeText()})${a ? `　要エプロン持参${a}班` : ''}`;
  }
  function rowNoteText(row) {
    if (row.type === 'holiday') return row.note || '';
    const t = row.endTime ? `帰学終了予定 ${row.endTime}` : '帰学終了予定';
    return row.note ? `${t}\n${row.note}` : t;
  }

  // ---------- State ----------
  function normalizeBaseRow(r) {
    return {
      periods: Array.from({ length: 6 }, (_, i) => (r.periods && r.periods[i]) || ''),
      lunch: r.lunch ?? '〇',
      clean: r.clean ?? '〇',
      club: r.club ?? '〇',
      endTime: r.endTime || '',
      note: r.note === '帰学終了予定' ? '' : (r.note || '')
    };
  }
  function getBase() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEYS.base) || 'null');
      if (Array.isArray(saved) && saved.length === 5) return saved.map(normalizeBaseRow);
    } catch (err) { console.warn('[HOME学級通信] getBase でエラー:', err); }
    return clone(BUILTIN_BASE);
  }
  function rowFromBase(b) {
    return { type: 'normal', eventText: '', autoHoliday: false, ...normalizeBaseRow(b) };
  }
  function normalizeRow(r) {
    return {
      ...rowFromBase(r),
      type: ['normal', 'event', 'holiday'].includes(r.type) ? r.type : 'normal',
      eventText: r.eventText || '',
      autoHoliday: !!r.autoHoliday
    };
  }

  function initialState() {
    const fri = fridayOfWeek(new Date());
    return {
      logoText: 'HOME',
      schoolName: '○○市立○○中学校',
      className: '○年○組 学級通信',
      publisherName: '担任',
      issueNumber: 1,
      issueDate: toISO(fri),
      articleTitle: '',
      articleBody: '',
      articleFontMode: 'auto',
      photoCornerTitle: 'フォトコーナー',
      photos: [],
      parentsNote: '',
      parentsFontMode: 'auto',
      scheduleStartDate: toISO(nextMonday(fri)),
      apronGroups: [1, 2, 3],
      schedule: getBase().map(rowFromBase),
      ai: { articleMemo: '', parentsMemo: '', tone: 'warm', length: 'medium' }
    };
  }

  function migrate(saved) {
    const s = { ...initialState(), ...saved };
    if (typeof s.apronGroups === 'string') {
      s.apronGroups = s.apronGroups.split(/[・,、\s]+/).map(Number).filter((n) => APRON_GROUPS.includes(n));
    }
    if (!Array.isArray(s.apronGroups)) s.apronGroups = [];
    if (!['auto', 'large', 'normal', 'small'].includes(s.articleFontMode)) s.articleFontMode = 'auto';
    if (!['auto', 'large', 'normal', 'small'].includes(s.parentsFontMode)) s.parentsFontMode = 'auto';
    s.photos = Array.isArray(s.photos) ? s.photos.slice(0, 4) : [];
    s.schedule = Array.isArray(s.schedule) && s.schedule.length === 5 ? s.schedule.map(normalizeRow) : getBase().map(rowFromBase);
    s.ai = { ...initialState().ai, ...(s.ai || {}) };
    s.issueNumber = parseInt(s.issueNumber, 10) || 1;
    delete s.articleFontSize;
    delete s.parentsFontSize;
    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEYS.state);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch (_) {
      return null;
    }
  }

  const loaded = loadState();
  const isFirstRun = !loaded;
  let state = loaded || initialState();

  // ---------- Save (debounced) ----------
  let saveTimer = null;
  function saveNow() {
    try {
      localStorage.setItem(KEYS.state, JSON.stringify(state));
      const now = new Date();
      els.saveStatus.textContent = `✓ 自動保存済み ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      els.saveStatus.classList.remove('saving');
    } catch (err) {
      console.warn(err);
      els.saveStatus.textContent = '⚠ 保存できません（容量不足）';
      showToast('ブラウザの保存容量が不足しています。写真の枚数や保存した号を減らしてください。', { error: true });
    }
  }
  function scheduleSave() {
    els.saveStatus.textContent = '保存中…';
    els.saveStatus.classList.add('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  let renderQueued = false;
  function commit() {
    scheduleSave();
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        render();
      });
    }
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg, { error = false, actionLabel = '', onAction = null, ms = 3200 } = {}) {
    els.toastMsg.textContent = msg;
    els.toast.classList.toggle('error', error);
    els.toastAction.hidden = !actionLabel;
    els.toastAction.textContent = actionLabel;
    els.toastAction.onclick = () => {
      els.toast.hidden = true;
      if (onAction) onAction();
    };
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, actionLabel ? Math.max(ms, 7000) : ms);
  }

  // ---------- DOM refs ----------
  function collectEls() {
    return {
      saveStatus: $('saveStatus'),
      docChipNum: $('docChipNum'),
      docChipDate: $('docChipDate'),
      stepper: $('stepper'),
      editorScroll: $('editorScroll'),
      welcome: $('welcomeBanner'),
      issueDate: $('issueDate'),
      issueDateEra: $('issueDateEra'),
      issueWeekRange: $('issueWeekRange'),
      fitArticle: $('fitArticle'),
      fitParents: $('fitParents'),
      articleCount: $('articleCount'),
      parentsCount: $('parentsCount'),
      aiPanel: $('aiPanel'),
      btnToggleAi: $('btnToggleAi'),
      aiModeApi: $('aiModeApi'),
      aiModeManual: $('aiModeManual'),
      aiStatus: $('aiStatus'),
      aiPasteBox: $('aiPasteBox'),
      photoEditor: $('photoEditor'),
      photoInput: $('photoInput'),
      scheduleStartDate: $('scheduleStartDate'),
      weekRangeBox: $('weekRangeBox'),
      apronChips: $('apronChips'),
      scheduleEditor: $('scheduleEditor'),
      btnChecks: $('btnChecks'),
      btnZoomToggle: $('btnZoomToggle'),
      previewViewport: $('previewViewport'),
      sheetWrapper: $('sheetWrapper'),
      sheet: $('newsletterSheet'),
      pvLogoText: $('pvLogoText'),
      pvSchoolName: $('pvSchoolName'),
      pvClassIssue: $('pvClassIssue'),
      pvPublisher: $('pvPublisher'),
      pvIssueDate: $('pvIssueDate'),
      pvArticleTitle: $('pvArticleTitle'),
      pvArticleBody: $('pvArticleBody'),
      ovArticle: $('ovArticle'),
      pvPhotoBox: $('pvPhotoBox'),
      pvPhotoTitle: $('pvPhotoTitle'),
      pvPhotoGrid: $('pvPhotoGrid'),
      pvParentsBody: $('pvParentsBody'),
      ovParents: $('ovParents'),
      pvScheduleBanner: $('pvScheduleBanner'),
      pvScheduleBody: $('pvScheduleBody'),
      exportModal: $('exportModal'),
      exportIssueLabel: $('exportIssueLabel'),
      checkList: $('checkList'),
      issueModal: $('issueModal'),
      nextIssueDesc: $('nextIssueDesc'),
      historyList: $('historyList'),
      settingsModal: $('settingsModal'),
      cloudNudgeModal: $('cloudNudgeModal'),
      geminiApiKey: $('geminiApiKey'),
      toast: $('toast'),
      toastMsg: $('toastMsg'),
      toastAction: $('toastAction')
    };
  }
  const els = collectEls();

  // ---------- Fit (auto font size) ----------
  const fitResult = { article: { size: FONT.article.base, overflowLines: 0 }, parents: { size: FONT.parents.base, overflowLines: 0 } };

  function fitText(el, cfg, mode) {
    const overflowPx = () => el.scrollHeight - el.clientHeight;
    let size;
    if (mode === 'auto') {
      size = cfg.base;
      el.style.fontSize = `${size}px`;
      if (overflowPx() > 1) { let lo = cfg.min, hi = cfg.base, best = cfg.min; while (lo <= hi) { const mid = Math.floor(((lo + hi) / 2) * 2) / 2; el.style.fontSize = `${mid}px`; if (overflowPx() <= 1) { best = mid; lo = mid + 0.5; } else { hi = mid - 0.5; } } size = best; el.style.fontSize = `${size}px`; }
    } else {
      size = cfg[mode];
      el.style.fontSize = `${size}px`;
    }
    const over = overflowPx();
    return { size, overflowLines: over > 1 ? Math.ceil(over / (size * cfg.lh)) : 0 };
  }

  // ---------- Render ----------
  function render() {
    const s = state;

    // top bar
    const issueD = fromISO(s.issueDate);
    els.docChipNum.textContent = `第${s.issueNumber}号`;
    els.docChipDate.textContent = issueD ? `${shortDate(issueD)} 発行` : '発行日未設定';

    // section 1 derived
    els.issueDateEra.textContent = eraDate(s.issueDate);
    els.issueWeekRange.textContent = weekRangeText();
    els.weekRangeBox.textContent = weekRangeText().replace('～', ' ～ ');

    // header
    els.pvLogoText.textContent = s.logoText || 'HOME';
    els.pvSchoolName.textContent = s.schoolName || '';
    els.pvClassIssue.textContent = `${s.className || ''} 第${s.issueNumber || '〇'}号`;
    els.pvPublisher.textContent = `発行者 ${s.publisherName || ''}`;
    els.pvIssueDate.textContent = eraDate(s.issueDate);

    // article
    els.pvArticleTitle.textContent = s.articleTitle || 'タイトル';
    els.pvArticleTitle.classList.toggle('is-placeholder', !s.articleTitle);
    els.pvArticleBody.textContent = s.articleBody || '';
    els.articleCount.textContent = `${(s.articleBody || '').length}文字`;

    // photos
    els.pvPhotoTitle.textContent = s.photoCornerTitle || 'フォトコーナー';
    renderPreviewPhotos();

    // parents
    els.pvParentsBody.textContent = s.parentsNote || '';
    els.parentsCount.textContent = `${(s.parentsNote || '').length}文字`;

    // schedule
    els.pvScheduleBanner.textContent = bannerText();
    renderPreviewSchedule();

    // fit
    fitResult.article = fitText(els.pvArticleBody, FONT.article, s.articleFontMode);
    fitResult.parents = fitText(els.pvParentsBody, FONT.parents, s.parentsFontMode);
    updateFitUi(els.fitArticle, els.ovArticle, els.pvArticleBody, fitResult.article, s.articleBody);
    updateFitUi(els.fitParents, els.ovParents, els.pvParentsBody, fitResult.parents, s.parentsNote);

    updateStepper();
    updateChecksPill();
  }

  function updateFitUi(chip, badge, bodyEl, res, text) {
    if (!text) {
      chip.textContent = '';
      chip.className = 'fit-chip';
    } else if (res.overflowLines > 0) {
      chip.textContent = `⚠ 約${res.overflowLines}行はみ出し`;
      chip.className = 'fit-chip warn';
    } else {
      chip.textContent = `✓ 枠内に収まっています（${res.size}pt相当）`;
      chip.className = 'fit-chip ok';
    }
    badge.hidden = !(text && res.overflowLines > 0);
    bodyEl.classList.toggle('is-overflow', !!(text && res.overflowLines > 0));
  }

  function renderPreviewPhotos() {
    const grid = els.pvPhotoGrid;
    grid.innerHTML = '';
    const n = state.photos.length;
    grid.className = `photo-grid count-${n}`;
    if (n === 0) {
      const hint = document.createElement('div');
      hint.className = 'photo-empty-hint';
      hint.textContent = 'クリックまたは写真をドロップして追加';
      grid.appendChild(hint);
      return;
    }
    state.photos.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'pv-photo-card';
      const img = document.createElement('img');
      img.src = p.dataUrl;
      img.alt = p.caption || '写真';
      card.appendChild(img);
      if (p.caption && p.caption.trim()) {
        const cap = document.createElement('div');
        cap.className = 'pv-photo-caption';
        cap.textContent = p.caption.trim();
        card.appendChild(cap);
      }
      grid.appendChild(card);
    });
  }

  function renderPreviewSchedule() {
    const tbody = els.pvScheduleBody;
    tbody.innerHTML = '';
    const cells = weekCells();
    const spans = monthSpans(cells);
    const td = (cls, text, attrs = {}) => {
      const el = document.createElement('td');
      el.className = cls;
      el.textContent = text;
      Object.entries(attrs).forEach(([k, v]) => { el[k] = v; });
      return el;
    };
    state.schedule.forEach((row, i) => {
      const tr = document.createElement('tr');
      if (spans[i] > 0) tr.appendChild(td('cell-month', cells[i].month, { rowSpan: spans[i] }));
      tr.appendChild(td('cell-day', cells[i].dayLabel));
      if (row.type === 'holiday') {
        tr.appendChild(td('cell-span holiday', row.eventText || '休み', { colSpan: 9 }));
      } else {
        if (row.type === 'event') {
          tr.appendChild(td('cell-span', row.eventText || '行事', { colSpan: 6 }));
        } else {
          row.periods.forEach((p) => tr.appendChild(td('cell-period', formatPeriodText(p))));
        }
        ['lunch', 'clean', 'club'].forEach((k) => tr.appendChild(td('cell-flag', row[k] || '')));
      }
      tr.appendChild(td('cell-note', rowNoteText(row)));
      tbody.appendChild(tr);
    });
  }

  // ---------- Stepper / checks ----------
  function stepStatus() {
    const s = state;
    return {
      'sec-issue': s.issueNumber && s.issueDate ? 'done' : '',
      'sec-article': fitResult.article.overflowLines > 0 && s.articleBody ? 'warn' : (s.articleTitle && s.articleBody ? 'done' : ''),
      'sec-photos': s.photos.length > 0 ? 'done' : '',
      'sec-parents': fitResult.parents.overflowLines > 0 && s.parentsNote ? 'warn' : (s.parentsNote ? 'done' : ''),
      'sec-schedule': s.scheduleStartDate ? 'done' : ''
    };
  }
  function updateStepper() {
    const st = stepStatus();
    els.stepper.querySelectorAll('.step').forEach((b, idx) => {
      const v = st[b.dataset.target];
      b.classList.toggle('is-done', v === 'done');
      b.classList.toggle('is-warn', v === 'warn');
      b.querySelector('.step-dot').textContent = v === 'done' ? '✓' : v === 'warn' ? '!' : String(idx + 1);
    });
  }

  const PLACEHOLDER_RE = /〇〇|〇月|〇日|\(〇\)/;
  function collectChecks() {
    const s = state;
    const list = [];
    if (!s.articleTitle.trim()) list.push({ level: 'warn', text: 'タイトルが未入力です', target: 'sec-article', focus: 'articleTitle' });
    if (!s.articleBody.trim()) list.push({ level: 'warn', text: '記事の本文が未入力です', target: 'sec-article', focus: 'articleBody' });
    if (s.articleBody && fitResult.article.overflowLines > 0) list.push({ level: 'warn', text: `記事の本文が約${fitResult.article.overflowLines}行はみ出しています`, target: 'sec-article', focus: 'articleBody' });
    if (s.parentsNote && fitResult.parents.overflowLines > 0) list.push({ level: 'warn', text: `「保護者の皆様へ」が約${fitResult.parents.overflowLines}行はみ出しています`, target: 'sec-parents', focus: 'parentsNote' });
    const texts = [s.articleTitle, s.articleBody, s.parentsNote, ...s.schedule.map((r) => `${r.eventText} ${r.note}`)];
    if (texts.some((t) => PLACEHOLDER_RE.test(t || ''))) list.push({ level: 'warn', text: '「〇〇」「〇月〇日」など、埋めていない部分があります', target: 'sec-parents' });
    if (!s.parentsNote.trim()) list.push({ level: 'info', text: '「保護者の皆様へ」が空欄です（空欄のままでも書き出せます）', target: 'sec-parents', focus: 'parentsNote' });
    if (s.photos.length === 0) list.push({ level: 'info', text: '写真がありません（写真なしでも書き出せます）', target: 'sec-photos' });
    return list;
  }
  function updateChecksPill() {
    const warns = collectChecks().filter((c) => c.level === 'warn').length;
    els.btnChecks.textContent = warns ? `⚠ 確認事項 ${warns}件` : '✓ 書き出しOK';
    els.btnChecks.className = `check-pill ${warns ? 'warn' : 'ok'}`;
  }

  function goToSection(id, focusId) {
    const sec = $(id);
    if (!sec) return;
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sec.classList.remove('flash');
    void sec.offsetWidth;
    sec.classList.add('flash');
    setTimeout(() => sec.classList.remove('flash'), 1200);
    if (focusId) setTimeout(() => { const f = $(focusId); if (f) f.focus({ preventScroll: true }); }, 350);
  }

  function updateActiveStep() {
    const top = els.editorScroll.getBoundingClientRect().top;
    let active = 'sec-issue';
    els.stepper.querySelectorAll('.step').forEach((b) => {
      const sec = $(b.dataset.target);
      if (sec && sec.getBoundingClientRect().top - top < 120) active = b.dataset.target;
    });
    const sc = els.editorScroll;
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) active = 'sec-schedule';
    els.stepper.querySelectorAll('.step').forEach((b) => b.classList.toggle('is-active', b.dataset.target === active));
  }

  // ---------- Bindings (data-bind) ----------
  function syncInputs() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const v = state[el.dataset.bind];
      el.value = v ?? '';
    });
    document.querySelectorAll('[data-bind-ai]').forEach((el) => {
      el.value = state.ai[el.dataset.bindAi] || '';
    });
    document.querySelectorAll('.seg').forEach((seg) => {
      const v = state.ai[seg.dataset.seg];
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.val === v));
    });
    els.issueDate.value = state.issueDate;
    els.scheduleStartDate.value = state.scheduleStartDate;
    renderPhotoEditor();
    renderApronChips();
    renderScheduleEditor();
    updateAiMode();
  }

  function bindDataInputs() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const key = el.dataset.bind;
        state[key] = el.type === 'number' ? Math.max(1, parseInt(el.value, 10) || 1) : el.value;
        commit();
      });
    });
    document.querySelectorAll('[data-bind-ai]').forEach((el) => {
      el.addEventListener('input', () => {
        state.ai[el.dataset.bindAi] = el.value;
        scheduleSave();
      });
    });
    document.querySelectorAll('.seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        state.ai[seg.dataset.seg] = b.dataset.val;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
        scheduleSave();
      });
    });
  }

  // ---------- Dates ----------
  function setIssueDate(iso) {
    state.issueDate = iso;
    const d = fromISO(iso);
    if (d) setScheduleStart(toISO(nextMonday(d)), false);
    els.issueDate.value = iso;
    commit();
  }
  function setScheduleStart(iso, doCommit = true) {
    state.scheduleStartDate = iso;
    els.scheduleStartDate.value = iso;
    applyAutoHolidays();
    renderScheduleEditor();
    if (doCommit) commit();
  }
  function applyAutoHolidays() {
    const w = weekDates();
    if (!w) return;
    state.schedule.forEach((row, i) => {
      const name = holidayName(w[i]);
      if (name) {
        if (row.type === 'normal' || row.autoHoliday) {
          row.type = 'holiday';
          row.eventText = name;
          row.autoHoliday = true;
        }
      } else if (row.autoHoliday) {
        row.type = 'normal';
        row.eventText = '';
        row.autoHoliday = false;
      }
    });
  }

  // ---------- Schedule editor ----------
  function renderApronChips() {
    els.apronChips.innerHTML = '';
    APRON_GROUPS.forEach((g) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `apron-chip ${state.apronGroups.includes(g) ? 'is-on' : ''}`;
      b.textContent = `${g}班`;
      b.addEventListener('click', () => {
        const set = new Set(state.apronGroups);
        if (set.has(g)) set.delete(g); else set.add(g);
        state.apronGroups = [...set].sort((a, b2) => a - b2);
        b.classList.toggle('is-on', set.has(g));
        commit();
      });
      els.apronChips.appendChild(b);
    });
  }

  function renderScheduleEditor() {
    const box = els.scheduleEditor;
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'sch-headrow';
    head.innerHTML = '<span>日付</span><span>種類</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>給</span><span>清</span><span>部</span>';
    box.appendChild(head);

    const cells = weekCells();
    state.schedule.forEach((row, i) => {
      const day = document.createElement('div');
      day.className = `sch-day ${row.type === 'holiday' ? 'is-holiday' : ''} ${row.type === 'event' ? 'is-event' : ''}`;

      const l1 = document.createElement('div');
      l1.className = 'sch-line1';

      const date = document.createElement('div');
      date.className = 'sch-date';
      const d = cells[i].date;
      date.innerHTML = d ? `<b>${d.getMonth() + 1}/${d.getDate()}</b><span>${WD[d.getDay()]}</span>` : `<b>--</b><span>${WD[i + 1]}</span>`;
      l1.appendChild(date);

      const sel = document.createElement('select');
      sel.className = 'sch-type';
      sel.setAttribute('aria-label', '日の種類');
      sel.innerHTML = '<option value="normal">通常</option><option value="event">行事</option><option value="holiday">休み</option>';
      sel.value = row.type;
      sel.addEventListener('change', () => {
        row.type = sel.value;
        row.autoHoliday = false;
        if (row.type === 'normal') row.eventText = '';
        renderScheduleEditor();
        commit();
        if (row.type !== 'normal') {
          const inp = box.querySelectorAll('.sch-day')[i].querySelector('.sch-wide, .sch-wide-all');
          if (inp) inp.focus();
        }
      });
      l1.appendChild(sel);

      if (row.type === 'normal') {
        row.periods.forEach((p, pi) => {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = p;
          inp.maxLength = 6;
          inp.setAttribute('aria-label', `${pi + 1}限`);
          inp.addEventListener('input', () => { row.periods[pi] = inp.value; commit(); });
          l1.appendChild(inp);
        });
      } else {
        const wide = document.createElement('input');
        wide.type = 'text';
        wide.className = row.type === 'holiday' ? 'sch-wide-all' : 'sch-wide';
        wide.placeholder = row.type === 'holiday' ? '例）勤労感謝の日・振替休業日' : '例）合唱コンクール・校外学習';
        wide.value = row.eventText;
        wide.addEventListener('input', () => { row.eventText = wide.value; row.autoHoliday = false; commit(); });
        l1.appendChild(wide);
      }

      if (row.type !== 'holiday') {
        ['lunch', 'clean', 'club'].forEach((k) => {
          const fb = document.createElement('button');
          fb.type = 'button';
          fb.className = `flag-btn ${row[k] === '×' ? 'is-x' : ''}`;
          fb.textContent = row[k] || '　';
          fb.title = { lunch: '給食', clean: '清掃', club: '部活動' }[k];
          fb.addEventListener('click', () => {
            row[k] = FLAG_CYCLE[(FLAG_CYCLE.indexOf(row[k]) + 1) % FLAG_CYCLE.length];
            fb.textContent = row[k];
            fb.classList.toggle('is-x', row[k] === '×');
            commit();
          });
          l1.appendChild(fb);
        });
      }
      day.appendChild(l1);

      const l2 = document.createElement('div');
      l2.className = 'sch-line2';
      if (row.type === 'holiday') {
        l2.innerHTML = `<span></span><span class="sch-auto">${row.autoHoliday ? '🎌 祝日を自動で反映' : ''}</span>`;
        const note = document.createElement('input');
        note.type = 'text';
        note.placeholder = '備考（任意）';
        note.value = row.note;
        note.addEventListener('input', () => { row.note = note.value; commit(); });
        l2.appendChild(note);
      } else {
        const lab = document.createElement('label');
        lab.textContent = '帰学';
        const time = document.createElement('input');
        time.type = 'time';
        time.value = row.endTime;
        time.title = '帰学終了予定の時刻';
        time.addEventListener('input', () => { row.endTime = time.value; commit(); });
        const note = document.createElement('input');
        note.type = 'text';
        note.placeholder = '備考（任意）例）6限 学年集会';
        note.value = row.note;
        note.addEventListener('input', () => { row.note = note.value; commit(); });
        l2.append(lab, time, note);
      }
      day.appendChild(l2);
      box.appendChild(day);
    });
  }

  // ---------- Photos ----------
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1000;
          let { width: w, height: h } = img;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addPhotos(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!files.length) return;
    const room = 4 - state.photos.length;
    if (room <= 0) {
      showToast('写真は4枚までです。入れ替える場合は先に削除してください。', { error: true });
      return;
    }
    let added = 0;
    for (const f of files.slice(0, room)) {
      try {
        state.photos.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, dataUrl: await resizeImage(f), caption: '' });
        added++;
      } catch (_) {
        showToast('読み込めない画像がありました', { error: true });
      }
    }
    renderPhotoEditor();
    commit();
    if (added) showToast(`写真を${added}枚追加しました${files.length > room ? '（4枚を超えた分は追加されていません）' : ''}`);
  }

  function renderPhotoEditor() {
    const box = els.photoEditor;
    box.innerHTML = '';
    state.photos.forEach((p, i) => {
      const tile = document.createElement('div');
      tile.className = 'photo-tile';
      const imgWrap = document.createElement('div');
      imgWrap.className = 'photo-tile-img';
      imgWrap.innerHTML = `<img alt="写真${i + 1}" /><span class="photo-tile-num">${i + 1}</span><div class="photo-tile-tools"></div>`;
      imgWrap.querySelector('img').src = p.dataUrl;
      const tools = imgWrap.querySelector('.photo-tile-tools');
      const mkBtn = (label, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', fn);
        tools.appendChild(b);
      };
      if (i > 0) mkBtn('◀', '前へ', () => { [state.photos[i - 1], state.photos[i]] = [state.photos[i], state.photos[i - 1]]; renderPhotoEditor(); commit(); });
      if (i < state.photos.length - 1) mkBtn('▶', '後ろへ', () => { [state.photos[i + 1], state.photos[i]] = [state.photos[i], state.photos[i + 1]]; renderPhotoEditor(); commit(); });
      mkBtn('✕', '削除', () => {
        const removed = state.photos.splice(i, 1)[0];
        renderPhotoEditor();
        commit();
        showToast('写真を削除しました', {
          actionLabel: '元に戻す',
          onAction: () => { state.photos.splice(i, 0, removed); renderPhotoEditor(); commit(); }
        });
      });
      tile.appendChild(imgWrap);
      const cap = document.createElement('input');
      cap.type = 'text';
      cap.placeholder = 'ひとこと（任意）';
      cap.value = p.caption || '';
      cap.addEventListener('input', () => { p.caption = cap.value; commit(); });
      tile.appendChild(cap);
      box.appendChild(tile);
    });

    if (state.photos.length < 4) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'photo-add';
      add.innerHTML = `<span class="big">📷</span><b>写真を追加</b><span>クリック または ドロップ（あと${4 - state.photos.length}枚）</span>`;
      add.addEventListener('click', () => els.photoInput.click());
      add.addEventListener('dragover', (e) => { e.preventDefault(); add.classList.add('dragover'); });
      add.addEventListener('dragleave', () => add.classList.remove('dragover'));
      add.addEventListener('drop', (e) => { e.preventDefault(); add.classList.remove('dragover'); addPhotos(e.dataTransfer.files); });
      box.appendChild(add);
    }
    box.classList.toggle('span-all', state.photos.length % 2 === 0);
  }

  // ---------- AI ----------
  function getApiKey() { return (localStorage.getItem(KEYS.api) || '').trim(); }
  function updateAiMode() {
    const has = !!getApiKey();
    els.aiModeApi.hidden = !has;
    els.aiModeManual.hidden = has;
  }
  function setAiStatus(msg, type = '') {
    els.aiStatus.textContent = msg;
    els.aiStatus.className = `status-msg ${type}`;
  }

  function buildPrompt(forManual) {
    const ai = state.ai;
    const tone = {
      warm: '温かく親しみやすく、生徒の頑張りが保護者にも伝わる文体',
      energetic: '元気で前向き、中学生を温かく励ます文体',
      formal: '落ち着いた丁寧語（です・ます調）で保護者に安心感を与える文体'
    }[ai.tone] || '';
    const len = { short: '250〜350文字程度', medium: '400〜550文字程度', long: '600〜750文字程度' }[ai.length] || '';
    const ctx = `あなたは中学校の担任教師です。学級通信「${state.logoText}」（${state.className}）第${state.issueNumber}号の原稿を、次のメモをもとに作成してください。

【文体】${tone}
【本文の長さ】${len}（2〜3段落。段落の間は空行）
【記事のメモ】
${ai.articleMemo.trim() || '（特になし：最近の学校生活の様子と季節のあいさつ）'}
【保護者へのお知らせのメモ】
${ai.parentsMemo.trim() || '（特になし：日頃の感謝と体調管理のお願いを短く）'}

※生徒の個人名は使わないでください。`;
    if (forManual) {
      return `${ctx}

次の形式で、前置きなしで出力してください。
【タイトル】
（15〜22文字程度）
【記事】
（本文）
【保護者の皆様へ】
（120〜220文字程度）`;
    }
    return `${ctx}

次のJSON形式のみで回答してください。
{"title":"15〜22文字程度のタイトル","article":"本文（段落は\\n\\nで区切る）","parentsNote":"保護者向け本文（120〜220文字程度）"}`;
  }

  async function callGemini(apiKey, prompt) {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastErr = null;
    for (const model of models) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.75, responseMimeType: 'application/json' }
          })
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('AIの応答が空でした');
        return text;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('AIの呼び出しに失敗しました');
  }

  function parseAi(raw) {
    const t = (raw || '').trim();
    if (!t) return null;
    try {
      const m = t.match(/\{[\s\S]*\}/);
      if (m) {
        const o = JSON.parse(m[0]);
        if (o.title || o.article || o.parentsNote) {
          return { title: (o.title || '').trim(), article: (o.article || '').trim(), parentsNote: (o.parentsNote || '').trim() };
        }
      }
    } catch (_) { /* not json */ }
    const clean = t.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    const title = clean.match(/【タイトル】\s*([\s\S]*?)(?=【記事】|【保護者の皆様へ】|$)/);
    const article = clean.match(/【記事】\s*([\s\S]*?)(?=【保護者の皆様へ】|$)/);
    const parents = clean.match(/【保護者の皆様へ】\s*([\s\S]*?)$/);
    if (title || article || parents) {
      return {
        title: title ? title[1].trim().replace(/^[「『]|[」』]$/g, '') : '',
        article: article ? article[1].trim() : '',
        parentsNote: parents ? parents[1].trim() : ''
      };
    }
    return { title: '', article: t, parentsNote: '' };
  }

  function applyAi(parsed) {
    if (!parsed) return false;
    const before = { articleTitle: state.articleTitle, articleBody: state.articleBody, parentsNote: state.parentsNote };
    if (parsed.title) state.articleTitle = parsed.title;
    if (parsed.article) state.articleBody = parsed.article;
    if (parsed.parentsNote) state.parentsNote = parsed.parentsNote;
    syncInputs();
    commit();
    showToast('AIの文章をお便りに入れました', {
      actionLabel: '元に戻す',
      onAction: () => { Object.assign(state, before); syncInputs(); commit(); }
    });
    return true;
  }

  // ---------- Zoom ----------
  let zoomFull = false;
  function updateZoom() {
    const vp = els.previewViewport;
    const fit = Math.max(0.3, Math.min((vp.clientWidth - 40) / SHEET_W, (vp.clientHeight - 40) / SHEET_H, 1.2));
    const scale = zoomFull ? 1 : fit;
    els.sheet.style.transform = `scale(${scale})`;
    els.sheetWrapper.style.width = `${SHEET_W * scale}px`;
    els.sheetWrapper.style.height = `${SHEET_H * scale}px`;
    els.btnZoomToggle.textContent = zoomFull ? '🔍 全体表示' : `🔍 拡大（${Math.round(fit * 100)}%表示中）`;
  }

  // ---------- Modals ----------
  function openModal(m) { if (m) m.hidden = false; }
  function closeModal(m) { if (m) m.hidden = true; }
  function openSettingsModal() {
    const nySchool = $('newYearSchoolName');
    const nyClass = $('newYearClassName');
    const nyPub = $('newYearPublisherName');
    const nyReset = $('newYearResetSchedule');
    if (nySchool) nySchool.value = state.schoolName || '';
    if (nyClass) nyClass.value = state.className || '';
    if (nyPub) nyPub.value = state.publisherName || '';
    if (nyReset) nyReset.checked = false;
    openModal(els.settingsModal);
  }

  // ---------- Cloud login nudge ----------
  function isCloudNudgeDismissed() {
    try {
      return localStorage.getItem(KEYS.cloudNudgeDismissed) === '1';
    } catch (_) {
      return false;
    }
  }
  function dismissCloudNudge() {
    try {
      localStorage.setItem(KEYS.cloudNudgeDismissed, '1');
    } catch (err) { console.warn('[HOME学級通信] dismissCloudNudge でエラー:', err); }
    closeModal(els.cloudNudgeModal);
  }
  function maybeShowCloudNudge() {
    if (cloudSession) return;
    if (isCloudNudgeDismissed()) return;
    if (!els.cloudNudgeModal || !els.cloudNudgeModal.hidden) return;
    openModal(els.cloudNudgeModal);
  }
  function openCloudLoginFromNudge() {
    closeModal(els.cloudNudgeModal);
    openIssueModal();
    renderCloudSection();
    requestAnimationFrame(() => {
      const cloudBox = document.querySelector('#issueModal .cloud-box');
      if (cloudBox) {
        try { cloudBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) { /* ignore */ }
      }
      const emailInput = $('cloudEmail');
      if (emailInput) emailInput.focus();
    });
  }

  function openExport() {
    render();
    els.exportIssueLabel.textContent = `第${state.issueNumber}号`;
    const checks = collectChecks();
    els.checkList.innerHTML = '';
    const warns = checks.filter((c) => c.level === 'warn');
    if (!warns.length) {
      const ok = document.createElement('div');
      ok.className = 'check-item ok';
      ok.innerHTML = '<span>✓ 問題は見つかりませんでした。このまま書き出せます。</span>';
      els.checkList.appendChild(ok);
    }
    checks.forEach((c) => {
      const row = document.createElement('div');
      row.className = `check-item ${c.level}`;
      row.innerHTML = `<span>${c.level === 'warn' ? '⚠' : 'ℹ'} ${escapeHtml(c.text)}</span>`;
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'link';
      fix.textContent = '直す';
      fix.addEventListener('click', () => { closeModal(els.exportModal); goToSection(c.target, c.focus); });
      row.appendChild(fix);
      els.checkList.appendChild(row);
    });
    openModal(els.exportModal);
  }

  function exportPayload() {
    const cells = weekCells();
    return {
      ...clone(state),
      articleFontSize: fitResult.article.size,
      parentsFontSize: fitResult.parents.size,
      issueDateText: eraDate(state.issueDate),
      scheduleBannerText: bannerText(),
      weekDates: cells.map((c) => ({ month: c.month, dayLabel: c.dayLabel })),
      monthSpans: monthSpans(cells),
      scheduleRows: state.schedule.map((r) => ({
        kind: r.type,
        periods: r.periods.slice(),
        spanText: r.eventText || (r.type === 'holiday' ? '休み' : '行事'),
        lunch: r.lunch,
        clean: r.clean,
        club: r.club,
        noteText: rowNoteText(r)
      })),
      houseSvgElement: $('houseSvg')
    };
  }

  function fileBase() { return `学級通信HOME_第${state.issueNumber}号_${state.issueDate || ''}`; }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function doExport(kind, btn) {
    saveToHistory();
    if (kind === 'print') {
      closeModal(els.exportModal);
      // 印刷ダイアログを閉じてからクラウド案内を出す（印刷の邪魔をしない）
      let printNudgeDone = false;
      const onAfterPrint = () => {
        if (printNudgeDone) return;
        printNudgeDone = true;
        window.removeEventListener('afterprint', onAfterPrint);
        setTimeout(() => maybeShowCloudNudge(), 200);
      };
      const hasAfterPrint = 'onafterprint' in window;
      if (hasAfterPrint) window.addEventListener('afterprint', onAfterPrint);
      setTimeout(() => {
        window.print();
        // afterprint 非対応ブラウザ向け：print() から戻った時点で表示
        if (!hasAfterPrint) onAfterPrint();
      }, 150);
      return;
    }
    btn.disabled = true;
    try {
      if (kind === 'docx') {
        const blob = await window.HomeDocxBuilder.buildDocxBlob(exportPayload());
        download(blob, `${fileBase()}.docx`);
        showToast('Wordファイルを保存しました（ダウンロードフォルダ）');
      } else {
        const blob = await window.HomePngExporter.buildPngBlob(exportPayload());
        download(blob, `${fileBase()}.png`);
        showToast('画像を保存しました。LINEのトークに添付して送れます');
      }
      closeModal(els.exportModal);
      setTimeout(() => maybeShowCloudNudge(), 300);
    } catch (err) {
      console.error(err);
      showToast(`書き出しに失敗しました：${err.message}`, { error: true });
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- History ----------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(KEYS.history) || '[]'); } catch (_) { return []; }
  }
  function saveHistoryList(list) {
    try {
      localStorage.setItem(KEYS.history, JSON.stringify(list));
    } catch (_) {
      // 容量不足時は古い号の写真を外して再試行
      list.slice(5).forEach((h) => { if (h.data) h.data.photos = []; });
      try { localStorage.setItem(KEYS.history, JSON.stringify(list)); } catch (e) { showToast('保存容量が不足しています。古い号を削除してください。', { error: true }); }
    }
  }
  function saveToHistory() {
    const list = loadHistory();
    const now = new Date();
    const entry = {
      issueNumber: state.issueNumber,
      issueDate: state.issueDate,
      articleTitle: state.articleTitle,
      savedAt: `${now.getMonth() + 1}/${now.getDate()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
      data: clone(state)
    };
    const idx = list.findIndex((h) => h.issueNumber === state.issueNumber);
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(entry);
    list.sort((a, b) => b.issueNumber - a.issueNumber);
    saveHistoryList(list.slice(0, 40));
    cloudSaveEntry(entry);
  }

  function openIssueModal() {
    const cur = fromISO(state.issueDate) || fridayOfWeek(new Date());
    const nextD = addDays(cur, 7);
    els.nextIssueDesc.textContent = `第${state.issueNumber + 1}号・${shortDate(nextD)}発行で作成します。今の号は自動で保存され、記事・写真・保護者欄は空に、時間割は「いつもの時間割」に戻ります。`;
    renderHistory();
    openModal(els.issueModal);
  }

  function renderHistory() {
    const list = loadHistory();
    els.historyList.textContent = '';
    if (!list.length) {
      const p = document.createElement('p'); p.className = 'muted small'; p.textContent = 'まだ保存した号はありません。書き出すと自動でここに保存されます。'; els.historyList.appendChild(p);
      return;
    }
    list.forEach((h, i) => {
      const row = document.createElement('div');
      row.className = `history-row ${h.issueNumber === state.issueNumber ? 'is-current' : ''}`;
      const info = document.createElement('div'); info.className = 'history-info'; const b = document.createElement('b'); b.textContent = `第${h.issueNumber}号 ${h.articleTitle || '（タイトルなし）'}`; const span = document.createElement('span'); span.textContent = `${eraDate(h.issueDate)}・保存 ${h.savedAt || ''}`; info.appendChild(b); info.appendChild(span); const btnsDiv = document.createElement('div'); btnsDiv.className = 'history-btns'; row.appendChild(info); row.appendChild(btnsDiv);
      const btns = row.querySelector('.history-btns');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn btn-outline btn-sm';
      open.textContent = '開く';
      open.addEventListener('click', () => {
        saveToHistory();
        state = migrate(clone(h.data));
        syncInputs();
        commit();
        closeModal(els.issueModal);
        showToast(`第${h.issueNumber}号を開きました（編集中だった号は保存済み）`);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-ghost btn-sm danger';
      del.textContent = '削除';
      del.addEventListener('click', () => {
        if (!confirm(`第${h.issueNumber}号を一覧から削除しますか？`)) return;
        list.splice(i, 1);
        saveHistoryList(list);
        renderHistory();
      });
      btns.append(open, del);
      els.historyList.appendChild(row);
    });
  }

  function createNextIssue() {
    saveToHistory();
    const cur = fromISO(state.issueDate) || fridayOfWeek(new Date());
    const nextD = addDays(cur, 7);
    const groups = state.apronGroups.join(',');
    state = {
      ...state,
      issueNumber: state.issueNumber + 1,
      issueDate: toISO(nextD),
      articleTitle: '',
      articleBody: '',
      parentsNote: '',
      photos: [],
      schedule: getBase().map(rowFromBase),
      ai: { ...state.ai, articleMemo: '', parentsMemo: '' },
      apronGroups: groups === '1,2,3' ? [4, 5, 6] : groups === '4,5,6' ? [1, 2, 3] : state.apronGroups
    };
    state.scheduleStartDate = toISO(nextMonday(nextD));
    applyAutoHolidays();
    syncInputs();
    commit();
    closeModal(els.issueModal);
    goToSection('sec-article');
    showToast(`第${state.issueNumber}号を作成しました。記事から書き始めましょう`);
  }

  // ---------- Sample ----------
  function loadSample() {
    if ((state.articleBody || state.parentsNote) && !confirm('今の記事・保護者欄を記入例で上書きしますか？')) return;
    state.articleTitle = '合唱コンクールに向けて、心をひとつに！';
    state.articleBody =
      '今週から、いよいよ合唱コンクールに向けたパート練習が本格的にスタートしました。放課後の教室からは、パートリーダーを中心に「もう一回ここを合わせよう！」「強弱をはっきりさせよう」と前向きな声が聞こえてきます。\n\n' +
      '最初は少し恥ずかしそうにしていた生徒たちも、日を追うごとに表情が真剣になり、クラス全体でひとつの曲を作り上げようとする一体感が生まれてきました。3年生として迎える最後の合唱コンクール、自分たちらしい最高のハーモニーを響かせてくれることを楽しみにしています。\n\n' +
      '季節の変わり目で朝晩の寒暖差が大きくなっています。本番に向けて喉のケアや手洗い・うがい、十分な睡眠を心がけて過ごしましょう。';
    state.parentsNote =
      'いつも学級活動への温かいご理解とご協力をありがとうございます。\n\n' +
      '① 進路希望調査（第2回）の提出期限は来週火曜日です。ご家庭でご確認のうえ、お子様を通じてご提出ください。\n' +
      '② 来週から放課後の合唱練習が始まるため、帰学時刻が普段より遅くなる日があります。下の予定表をご確認ください。';
    syncInputs();
    commit();
    dismissWelcome();
    closeModal(els.settingsModal);
    showToast('記入例を読み込みました');
  }

  function dismissWelcome() {
    els.welcome.hidden = true;
    localStorage.setItem(KEYS.welcome, '1');
  }

  // ---------- Events ----------
  function bindEvents() {
    safeRun('bindDataInputs', bindDataInputs);

    // actions via data-act
    // ※ APIキーガイド（toggle-api-guide / open-api-guide）はスクリプト先頭で独立登録済み。
    //   ここでも処理すると二重に開閉されるため扱わない。
    safeRun('bindActions', () => {
      document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        const act = el.dataset.act;
        if (act === 'open-export') openExport();
        else if (act === 'open-settings') openSettingsModal();
        else if (act === 'load-sample') loadSample();
        else if (act === 'dismiss-welcome') dismissWelcome();
        else if (act === 'issue-inc' || act === 'issue-dec') {
          state.issueNumber = Math.max(1, state.issueNumber + (act === 'issue-inc' ? 1 : -1));
          const numInput = document.querySelector('[data-bind="issueNumber"]');
          if (numInput) numInput.value = state.issueNumber;
          commit();
        } else if (act === 'date-this-fri') setIssueDate(toISO(fridayOfWeek(new Date())));
        else if (act === 'date-next-fri') setIssueDate(toISO(addDays(fridayOfWeek(new Date()), 7)));
      });
    });

    // stepper & preview click-to-edit
    safeRun('bindNavigation', () => {
      onEl(els.stepper, 'click', (e) => {
        const b = e.target.closest('.step');
        if (b) goToSection(b.dataset.target);
      });
      onEl(els.editorScroll, 'scroll', () => requestAnimationFrame(updateActiveStep));
      onEl(els.sheet, 'click', (e) => {
        const area = e.target.closest('[data-edit]');
        if (!area) return;
        const target = area.dataset.edit;
        if (target === 'sec-photos' && state.photos.length === 0) {
          if (els.photoInput) els.photoInput.click();
          return;
        }
        const focusMap = { 'sec-article': e.target.closest('#pvArticleTitle') ? 'articleTitle' : 'articleBody', 'sec-parents': 'parentsNote' };
        goToSection(target, focusMap[target]);
      });
    });

    // photo drops & paste
    safeRun('bindPhotos', () => {
      onEl(els.pvPhotoBox, 'dragover', (e) => { e.preventDefault(); els.pvPhotoBox.classList.add('dragover'); });
      onEl(els.pvPhotoBox, 'dragleave', () => els.pvPhotoBox.classList.remove('dragover'));
      onEl(els.pvPhotoBox, 'drop', (e) => { e.preventDefault(); els.pvPhotoBox.classList.remove('dragover'); addPhotos(e.dataTransfer.files); });
      onEl(els.photoInput, 'change', () => { addPhotos(els.photoInput.files); els.photoInput.value = ''; });
      document.addEventListener('paste', (e) => {
        if (e.target === els.aiPasteBox) return;
        const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
        if (files.length) {
          e.preventDefault();
          addPhotos(files);
        }
      });
    });

    // dates & schedule base
    safeRun('bindDatesAndSchedule', () => {
      onEl(els.issueDate, 'change', () => { if (els.issueDate.value) setIssueDate(els.issueDate.value); });
      onEl(els.scheduleStartDate, 'change', () => {
        const d = fromISO(els.scheduleStartDate.value);
        if (!d) return;
        if (d.getDay() !== 1) {
          const mon = addDays(d, -((d.getDay() + 6) % 7));
          showToast(`週の始まりを月曜（${shortDate(mon)}）に合わせました`);
          setScheduleStart(toISO(mon));
        } else {
          setScheduleStart(els.scheduleStartDate.value);
        }
      });
      onEl('btnSaveBase', 'click', () => {
        const base = state.schedule.map((r) => ({ periods: r.periods.slice(), lunch: r.lunch, clean: r.clean, club: r.club, endTime: r.endTime, note: r.note }));
        try { localStorage.setItem(KEYS.base, JSON.stringify(base)); showToast('「いつもの時間割」に登録しました。次の号から自動で使われます'); } catch (err) { console.error('[HOME学級通信] btnSaveBase でエラー:', err); showToast('「いつもの時間割」の保存に失敗しました', { error: true }); }
      });
      onEl('btnResetBase', 'click', () => {
        const before = clone(state.schedule);
        state.schedule = getBase().map(rowFromBase);
        applyAutoHolidays();
        renderScheduleEditor();
        commit();
        showToast('いつもの時間割に戻しました', {
          actionLabel: '元に戻す',
          onAction: () => { state.schedule = before; renderScheduleEditor(); commit(); }
        });
      });
    });

    // parent templates
    safeRun('bindParentTemplates', () => {
      document.querySelectorAll('[data-tpl]').forEach((b) => {
        b.addEventListener('click', () => {
          const ta = $('parentsNote');
          if (!ta) return;
          const tpl = PARENT_TEMPLATES[b.dataset.tpl];
          const cur = ta.value;
          const pos = document.activeElement === ta ? ta.selectionStart : cur.length;
          const before = cur.slice(0, pos);
          const after = cur.slice(pos);
          const sep = before && !before.endsWith('\n') ? '\n' : '';
          ta.value = `${before}${sep}${tpl}${after}`;
          state.parentsNote = ta.value;
          commit();
          ta.focus();
          const caret = (before + sep + tpl).length;
          ta.setSelectionRange(caret, caret);
        });
      });
    });

    // AI
    safeRun('bindAi', () => {
      onEl(els.btnToggleAi, 'click', () => {
        const open = els.aiPanel.hidden;
        els.aiPanel.hidden = !open;
        els.btnToggleAi.setAttribute('aria-expanded', String(open));
        els.btnToggleAi.textContent = open ? '✕ AI作成パネルを閉じる' : '✨ 箇条書きメモからAIで文章を作る';
        if (open) updateAiMode();
      });
      onEl('btnGenerateAi', 'click', async (e) => {
        const key = getApiKey();
        if (!key) { updateAiMode(); return; }
        if (!state.ai.articleMemo.trim() && !confirm('記事のメモが空です。おまかせで作成しますか？')) return;
        const btn = e.currentTarget;
        btn.disabled = true;
        setAiStatus('✨ 作成中です…（10秒ほどかかります）', 'loading');
        try {
          const text = await callGemini(key, buildPrompt(false));
          applyAi(parseAi(text));
          setAiStatus('✓ 作成してお便りに入れました。内容を確認して整えてください。', 'success');
        } catch (err) {
          setAiStatus(`うまく作成できませんでした：${err.message}`, 'error');
        } finally {
          btn.disabled = false;
        }
      });
      onEl('btnCopyPrompt', 'click', async () => {
        const text = buildPrompt(true);
        try {
          await navigator.clipboard.writeText(text);
        } catch (_) {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setAiStatus('📋 コピーしました。AIに貼り付けて送信してください。', 'success');
      });
      onEl(els.aiPasteBox, 'paste', () => {
        setTimeout(() => {
          const parsed = parseAi(els.aiPasteBox.value);
          if (parsed && (parsed.title || parsed.parentsNote || parsed.article)) {
            applyAi(parsed);
            els.aiPasteBox.value = '';
            setAiStatus('✓ お便りに入れました。内容を確認して整えてください。', 'success');
          }
        }, 30);
      });
    });

    // header buttons & history
    safeRun('bindHeaderAndHistory', () => {
      onEl('btnIssueMenu', 'click', openIssueModal);
      onEl('btnSettings', 'click', openSettingsModal);
      onEl(els.btnChecks, 'click', openExport);
      onEl('btnNextIssue', 'click', createNextIssue);
      onEl('btnSaveHistory', 'click', () => {
        saveToHistory();
        renderHistory();
        showToast(`第${state.issueNumber}号を保存しました`);
        maybeShowCloudNudge();
      });
    });

    // export
    safeRun('bindExport', () => {
      document.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export, b)));
    });

    // modals close & keyboard shortcuts
    safeRun('bindModalsAndKeys', () => {
      document.querySelectorAll('.modal').forEach((m) => {
        m.addEventListener('click', (e) => {
          if (e.target === m || e.target.closest('[data-close]')) closeModal(m);
        });
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (els.cloudNudgeModal && !els.cloudNudgeModal.hidden) {
            closeModal(els.cloudNudgeModal);
          } else {
            document.querySelectorAll('.modal').forEach((m) => { if (!m.hidden) closeModal(m); });
          }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveNow();
          saveToHistory();
          showToast(`第${state.issueNumber}号を保存しました`);
          maybeShowCloudNudge();
        }
      });
    });

    // cloud nudge modal buttons
    safeRun('bindCloudNudge', () => {
      onEl('btnCloudNudgeLogin', 'click', openCloudLoginFromNudge);
      onEl('btnCloudNudgeDismiss', 'click', dismissCloudNudge);
    });

    // settings: API key
    safeRun('bindSettingsApiKey', () => {
      if (els.geminiApiKey) {
        els.geminiApiKey.value = getApiKey();
        els.geminiApiKey.addEventListener('input', () => {
          localStorage.setItem(KEYS.api, els.geminiApiKey.value.trim());
          updateAiMode();
        });
      }
      onEl('btnToggleKey', 'click', (e) => {
        if (!els.geminiApiKey) return;
        const show = els.geminiApiKey.type === 'password';
        els.geminiApiKey.type = show ? 'text' : 'password';
        e.currentTarget.textContent = show ? '隠す' : '表示';
      });
    });

    // settings: new school year setup
    safeRun('bindNewYearSetup', () => {
      onEl('btnNewYearSetup', 'click', () => {
        const newSchool = $('newYearSchoolName').value.trim() || state.schoolName;
        const newClass = $('newYearClassName').value.trim() || state.className;
        const newPublisher = $('newYearPublisherName').value.trim() || state.publisherName;
        const resetSchedule = $('newYearResetSchedule').checked;

        const msg = [
          '新年度・新クラスで第1号を開始します。よろしいですか？',
          '',
          '【変わること】',
          `・学校名：${newSchool}`,
          `・クラス・通信名：${newClass}`,
          `・発行者：${newPublisher}`,
          '・現在の号を「第1号」にリセット（記事・保護者欄・写真をクリア）',
          resetSchedule ? '・基本の時間割（デフォルト予定）を初期状態にリセット' : '',
          '',
          '【残ること】',
          '・過去の号の履歴（このPC内とクラウド）',
          '・APIキー・クラウド設定',
          resetSchedule ? '' : '・基本の時間割（デフォルト予定）'
        ].filter(Boolean).join('\n');

        if (!confirm(msg)) return;

        saveToHistory();
        if (resetSchedule) localStorage.removeItem(KEYS.base);

        const friday = fridayOfWeek(new Date());
        state = {
          ...state,
          schoolName: newSchool,
          className: newClass,
          publisherName: newPublisher,
          issueNumber: 1,
          issueDate: toISO(friday),
          articleTitle: '',
          articleBody: '',
          parentsNote: '',
          photos: [],
          schedule: getBase().map(rowFromBase),
          scheduleStartDate: toISO(nextMonday(friday)),
          ai: { ...state.ai, articleMemo: '', parentsMemo: '' }
        };
        applyAutoHolidays();
        syncInputs();
        commit();
        closeModal(els.settingsModal);
        showToast('新年度・新クラスで第1号を開始しました');
      });
    });

    // settings: backup
    safeRun('bindBackup', () => {
      onEl('btnExportJson', 'click', () => {
        const payload = { version: 2, exportedAt: new Date().toISOString(), currentState: state, defaultSchedule: getBase(), history: loadHistory() };
        download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `学級通信HOME_バックアップ_${toISO(new Date())}.json`);
        showToast('バックアップを保存しました');
      });
      onEl('importJsonInput', 'change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const p = JSON.parse(reader.result);
            if (p.defaultSchedule) localStorage.setItem(KEYS.base, JSON.stringify(p.defaultSchedule));
            if (Array.isArray(p.history)) saveHistoryList(p.history);
            if (p.currentState) state = migrate(p.currentState);
            syncInputs();
            commit();
            showToast('バックアップから復元しました');
          } catch (_) {
            showToast('バックアップファイルを読み込めませんでした', { error: true });
          }
        };
        reader.readAsText(f);
        e.target.value = '';
      });
      onEl('btnResetAll', 'click', () => {
        if (!confirm('すべてのデータ（保存した号・いつもの時間割・APIキーを含む）を削除して初期状態に戻しますか？\nこの操作は元に戻せません。')) return;
        Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
        location.reload();
      });
    });

    // zoom
    safeRun('bindZoom', () => {
      onEl(els.btnZoomToggle, 'click', () => { zoomFull = !zoomFull; updateZoom(); });
      window.addEventListener('resize', updateZoom);
    });
  }

  // ---------- Init ----------

  // ---------- Cloud Sync (Supabase) ----------
  function cloudLoadSession() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.cloud) || 'null');
    } catch (_) {
      return null;
    }
  }

  function cloudStoreSession(session) {
    if (session) localStorage.setItem(KEYS.cloud, JSON.stringify(session));
    else localStorage.removeItem(KEYS.cloud);
  }

  let cloudSession = cloudLoadSession();

  function setCloudStatus(msg) {
    const el = document.getElementById('cloudStatus');
    if (el) el.textContent = msg || '';
  }

  async function cloudAuthRequest(path, body) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.msg || '認証に失敗しました');
    return data;
  }

  function cloudSetSession(data, email) {
    cloudSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      email: email || (data.user && data.user.email) || ''
    };
    cloudStoreSession(cloudSession);
  }

  async function cloudEnsureToken() {
    if (!cloudSession) return null;
    if (cloudSession.expires_at && Date.now() < cloudSession.expires_at - 60000) {
      return cloudSession.access_token;
    }
    try {
      const data = await cloudAuthRequest('token?grant_type=refresh_token', {
        refresh_token: cloudSession.refresh_token
      });
      cloudSetSession(data, cloudSession.email);
      return cloudSession.access_token;
    } catch (_) {
      cloudSession = null;
      cloudStoreSession(null);
      renderCloudSection();
      return null;
    }
  }

  async function cloudRest(method, path, body, extraHeaders) {
    const token = await cloudEnsureToken();
    if (!token) throw new Error('not logged in');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(extraHeaders || {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`cloud request failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function cloudSaveEntry(entry) {
    if (!cloudSession) return;
    try {
      await cloudRest(
        'POST',
        'newsletter_issues?on_conflict=user_id,issue_number,issue_date',
        {
          issue_number: entry.issueNumber,
          issue_date: entry.issueDate || null,
          article_title: entry.articleTitle || '',
          saved_at: entry.savedAt || '',
          data: entry.data
        },
        { Prefer: 'resolution=merge-duplicates,return=minimal' }
      );
      setCloudStatus('☁️ クラウドにも保存しました');
      renderCloudHistory();
    } catch (err) {
      console.warn('cloud save failed:', err);
      setCloudStatus('⚠️ クラウド保存に失敗しました（このPCには保存されています）');
    }
  }

  function renderCloudSection() {
    const out = document.getElementById('cloudLoggedOut');
    const inn = document.getElementById('cloudLoggedIn');
    if (!out || !inn) return;
    if (cloudSession) {
      out.hidden = true;
      inn.hidden = false;
      const emailEl = document.getElementById('cloudUserEmail');
      if (emailEl) emailEl.textContent = cloudSession.email || '';
      renderCloudHistory();
    } else {
      out.hidden = false;
      inn.hidden = true;
    }
  }

  async function renderCloudHistory() {
    const listEl = document.getElementById('cloudHistoryList');
    if (!listEl || !cloudSession) return;
    listEl.innerHTML = '<p class="muted small">読み込み中…</p>';
    let rows;
    try {
      rows = await cloudRest(
        'GET',
        'newsletter_issues?select=id,issue_number,issue_date,article_title,saved_at,data&order=created_at.desc&limit=40'
      );
    } catch (err) {
      console.warn('cloud history fetch failed:', err);
      listEl.innerHTML = '<p class="muted small">クラウド履歴を取得できませんでした。</p>';
      return;
    }
    listEl.innerHTML = '';
    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<p class="muted small">クラウドに保存された号はまだありません。</p>';
      return;
    }
    rows.forEach((row) => {
      const item = {
        issueNumber: row.issue_number,
        issueDate: row.issue_date,
        articleTitle: row.article_title,
        savedAt: row.saved_at,
        data: row.data
      };
      const rowEl = document.createElement('div');
      rowEl.className = 'history-row';
      const info = document.createElement('div'); info.className = 'history-info'; const b = document.createElement('b'); b.textContent = `第${item.issueNumber}号 ${item.articleTitle || '（タイトルなし）'}`; const span = document.createElement('span'); span.textContent = `${eraDate(item.issueDate)}・保存 ${item.savedAt || ''}`; info.appendChild(b); info.appendChild(span); const btnsDiv = document.createElement('div'); btnsDiv.className = 'history-btns'; rowEl.appendChild(info); rowEl.appendChild(btnsDiv);
      const btns = rowEl.querySelector('.history-btns');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn btn-outline btn-sm';
      open.textContent = '開く';
      open.addEventListener('click', () => {
        saveToHistory();
        state = migrate(clone(item.data));
        syncInputs();
        commit();
        closeModal(els.issueModal);
        showToast(`第${item.issueNumber}号を開きました（編集中だった号は保存済み）`);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-ghost btn-sm danger';
      del.textContent = '削除';
      del.addEventListener('click', async () => {
        if (!confirm(`第${item.issueNumber}号をクラウドから削除しますか？`)) return;
        try {
          await cloudRest('DELETE', `newsletter_issues?id=eq.${row.id}`);
          renderCloudHistory();
        } catch (err) {
          console.warn('cloud delete failed:', err);
          showToast('クラウドからの削除に失敗しました', { error: true });
        }
      });
      btns.append(open, del);
      listEl.appendChild(rowEl);
    });
  }

  function bindCloudEvents() {
    const loginBtn = document.getElementById('btnCloudLogin');
    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('cloudEmail').value.trim();
        const password = document.getElementById('cloudPassword').value;
        if (!email || !password) {
          setCloudStatus('メールアドレスとパスワードを入力してください');
          return;
        }
        setCloudStatus('ログイン中…');
        try {
          const data = await cloudAuthRequest('token?grant_type=password', { email, password });
          cloudSetSession(data, email);
          // ログインできたら、今開いている号をそのままクラウドにも上げる（案内からログインした流れを完結させる）
          saveToHistory();
          setCloudStatus('ログインしました');
          renderCloudSection();
          showToast('クラウドにログインしました');
        } catch (err) {
          console.warn('cloud login failed:', err);
          setCloudStatus('ログインに失敗しました。メールアドレスとパスワードを確認してください');
        }
      });
    }
    const logoutBtn = document.getElementById('btnCloudLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        cloudSession = null;
        cloudStoreSession(null);
        setCloudStatus('');
        renderCloudSection();
        showToast('クラウドからログアウトしました');
      });
    }
    const refreshBtn = document.getElementById('btnCloudRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => renderCloudHistory());
    }
  }

  function init() {
    Object.assign(els, collectEls());
    safeRun('checkAppVersion', checkAppVersion);
    safeRun('applyAutoHolidays', applyAutoHolidays);
    safeRun('syncInputs', syncInputs);
    safeRun('bindEvents', bindEvents);
    safeRun('bindCloudEvents', bindCloudEvents);
    safeRun('renderCloudSection', renderCloudSection);
    safeRun('render', render);
    safeRun('updateZoom', updateZoom);
    safeRun('updateActiveStep', updateActiveStep);
    safeRun('initWelcome', () => {
      if (els.welcome) {
        els.welcome.hidden = !isFirstRun && !!localStorage.getItem(KEYS.welcome) ? true : !!localStorage.getItem(KEYS.welcome);
      }
    });
    safeRun('saveNow', saveNow);
    // フォント読み込み後に再計測（はみ出し判定のずれ防止）
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => safeRun('renderAfterFonts', render));
    }
  }

  // defer 読み込み時は DOM 解析済み（interactive）なので即 init。万一 loading 中なら DOMContentLoaded を待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
