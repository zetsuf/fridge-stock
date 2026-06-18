// ===== 在庫管理（複数ページ対応） =====
const STORE_KEY = 'stock.v2';
const LEGACY_KEY = 'fridge-stock.items.v1';

// 残量レベル: 0=なし 〜 4=未使用
const LEVELS = ['なし', '後わずか', '半分', 'ほぼ新品', '未使用'];
function levelLabel(v) { return LEVELS[v] ?? '未使用'; }
function levelColor(v) { return ['#cbd5e1', '#f97316', '#f59e0b', '#34d399', '#22c55e'][v] ?? '#22c55e'; }

// 選べるタグは固定6種
const TAGS = ['野菜', '肉', '調味料', '酒', '氷', 'その他'];

/** @typedef {{id:string,name:string,level:number,tags:string[],lastUsed:number|null,createdAt:number}} Item */
/** @typedef {{id:string,name:string,items:Item[]}} Page */

let state = loadState();
let activeTag = null;
let query = '';
let formTags = [];      // 編集中アイテムの選択タグ
let editingUsed = false; // 「使った」経由で開いたか

// ---------- 永続化 / 移行 ----------
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && Array.isArray(raw.pages) && raw.pages.length) {
      if (!raw.pages.find((p) => p.id === raw.activePageId)) raw.activePageId = raw.pages[0].id;
      return raw;
    }
  } catch {}
  return migrate();
}

function migrate() {
  let items = [];
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY)) || [];
    items = old.map((o) => ({
      id: o.id || uid(),
      name: o.name,
      level: 4,
      tags: (o.tags || []).filter((t) => TAGS.includes(t)),
      lastUsed: o.lastUsed || null,
      createdAt: o.createdAt || Date.now(),
    }));
  } catch {}
  const pid = uid();
  const st = { version: 2, pages: [{ id: pid, name: 'れいぞうこ', items }], activePageId: pid };
  return st;
}

function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function activePage() { return state.pages.find((p) => p.id === state.activePageId) || state.pages[0]; }
function items() { return activePage().items; }

// ---------- 相対日付 ----------
function relativeDate(ts) {
  if (!ts) return '未使用';
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (days <= 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 7) return `${days}日前`;
  if (days < 30) return `${Math.floor(days / 7)}週間前`;
  return `${Math.floor(days / 30)}ヶ月前`;
}
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

// ---------- 要素 ----------
const el = {
  list: document.getElementById('itemList'),
  empty: document.getElementById('emptyState'),
  tagFilter: document.getElementById('tagFilter'),
  pageName: document.getElementById('pageName'),
};

function usedTags() {
  const set = new Set();
  items().forEach((it) => it.tags.forEach((t) => set.add(t)));
  return TAGS.filter((t) => set.has(t));
}

function visibleItems() {
  const q = query.trim().toLowerCase();
  return items()
    .filter((it) => !activeTag || it.tags.includes(activeTag))
    .filter((it) => {
      if (!q) return true;
      return it.name.toLowerCase().includes(q) || it.tags.some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- 描画 ----------
function render() {
  el.pageName.textContent = activePage().name;
  renderTagFilter();

  const list = visibleItems();
  el.list.innerHTML = '';

  if (items().length === 0) {
    showEmpty('まだアイテムがありません', '右下の <strong>＋</strong> から追加しましょう');
    return;
  }
  if (list.length === 0) {
    showEmpty('該当するアイテムがありません', '検索・タグを変えてみてください');
    return;
  }
  el.empty.hidden = true;
  for (const it of list) el.list.appendChild(card(it));
}

function showEmpty(title, sub) {
  el.empty.hidden = false;
  el.empty.querySelector('.empty-title').textContent = title;
  el.empty.querySelector('.empty-sub').innerHTML = sub;
}

function card(it) {
  const li = document.createElement('li');
  li.className = 'item-card';

  const stale = it.lastUsed && Date.now() - it.lastUsed > 7 * 86400000;
  const color = levelColor(it.level);
  const tagsHtml = it.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('');
  const bars = [4, 3, 2, 1]
    .map((lvl) => `<span class="bar" style="background:${it.level >= lvl ? color : 'var(--border)'}"></span>`)
    .join('');

  li.innerHTML = `
    <div class="item-gauge">
      <div class="gauge-bars">${bars}</div>
      <span class="gauge-label" style="color:${color}">${levelLabel(it.level)}</span>
    </div>
    <div class="item-main">
      <p class="item-name">${escapeHtml(it.name)}</p>
      <div class="item-tags">${tagsHtml}</div>
      <div class="item-meta">
        <span class="${stale ? 'meta-stale' : ''}">最終使用: ${relativeDate(it.lastUsed)}</span>
      </div>
    </div>
    <div class="item-actions">
      <button class="use-btn" data-act="use">使った</button>
    </div>
  `;

  li.addEventListener('click', (e) => {
    if (e.target.closest('[data-act]')) return;
    openSheet(it, false);
  });
  li.querySelector('[data-act="use"]').addEventListener('click', () => openSheet(it, true));
  return li;
}

function renderTagFilter() {
  const tags = usedTags();
  el.tagFilter.innerHTML = '';
  if (tags.length === 0) return;

  const all = document.createElement('button');
  all.className = 'filter-chip' + (activeTag ? '' : ' active');
  all.textContent = 'すべて';
  all.onclick = () => { activeTag = null; render(); };
  el.tagFilter.appendChild(all);

  for (const t of tags) {
    const b = document.createElement('button');
    b.className = 'filter-chip' + (activeTag === t ? ' active' : '');
    b.textContent = t;
    b.onclick = () => { activeTag = activeTag === t ? null : t; render(); };
    el.tagFilter.appendChild(b);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- アイテム編集シート ----------
const sheet = document.getElementById('sheet');
const form = document.getElementById('itemForm');
const f = {
  id: document.getElementById('fId'),
  name: document.getElementById('fName'),
  level: document.getElementById('fLevel'),
};
const sheetTitle = document.getElementById('sheetTitle');
const deleteBtn = document.getElementById('deleteBtn');
const levelLabelEl = document.getElementById('levelLabel');
const tagChoices = document.getElementById('tagChoices');

function openSheet(item, used) {
  editingUsed = !!used;
  if (item) {
    sheetTitle.textContent = used ? '使った（残量を更新）' : 'アイテムを編集';
    f.id.value = item.id;
    f.name.value = item.name;
    f.level.value = item.level;
    formTags = item.tags.slice();
    deleteBtn.hidden = false;
  } else {
    sheetTitle.textContent = 'アイテムを追加';
    f.id.value = '';
    f.name.value = '';
    f.level.value = 4;
    formTags = [];
    deleteBtn.hidden = true;
  }
  updateLevelLabel();
  renderTagChoices();
  sheet.hidden = false;
  // 名称欄への自動フォーカスはしない。「使った」時はスライダーへ。
  if (used) setTimeout(() => f.level.focus(), 80);
}
function closeSheet() { sheet.hidden = true; }

function updateLevelLabel() {
  const v = parseInt(f.level.value, 10);
  levelLabelEl.textContent = levelLabel(v);
  levelLabelEl.style.color = levelColor(v);
}

function renderTagChoices() {
  tagChoices.innerHTML = '';
  for (const t of TAGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice-chip' + (formTags.includes(t) ? ' selected' : '');
    b.textContent = t;
    b.onclick = () => {
      if (formTags.includes(t)) formTags = formTags.filter((x) => x !== t);
      else formTags.push(t);
      renderTagChoices();
    };
    tagChoices.appendChild(b);
  }
}

f.level.addEventListener('input', updateLevelLabel);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = f.name.value.trim();
  if (!name) return;
  const data = { name, level: parseInt(f.level.value, 10), tags: formTags.slice() };

  const id = f.id.value;
  if (id) {
    const it = items().find((x) => x.id === id);
    Object.assign(it, data);
    if (editingUsed) it.lastUsed = Date.now();
  } else {
    items().push({ id: uid(), ...data, lastUsed: null, createdAt: Date.now() });
  }
  save();
  render();
  closeSheet();
});

deleteBtn.addEventListener('click', () => {
  const id = f.id.value;
  if (!id) return;
  if (!confirm('このアイテムを削除しますか？')) return;
  activePage().items = items().filter((x) => x.id !== id);
  save();
  render();
  closeSheet();
});

// ---------- ページ管理 ----------
const pageSheet = document.getElementById('pageSheet');
const pageMenuBtn = document.getElementById('pageMenuBtn');
const pageList = document.getElementById('pageList');
const addPageBtn = document.getElementById('addPageBtn');

pageMenuBtn.addEventListener('click', openPageSheet);
function openPageSheet() { renderPageList(); pageSheet.hidden = false; }
function closePageSheet() { pageSheet.hidden = true; }

function renderPageList() {
  pageList.innerHTML = '';
  for (const p of state.pages) {
    const li = document.createElement('li');
    li.className = 'page-row' + (p.id === state.activePageId ? ' active' : '');
    li.innerHTML = `
      <button class="page-switch" type="button">
        <span class="page-row-name">${escapeHtml(p.name)}</span>
        <span class="page-row-count">${p.items.length}件</span>
      </button>
      <button class="page-icon" data-act="rename" type="button" aria-label="名前変更">✏️</button>
      ${state.pages.length > 1 ? '<button class="page-icon" data-act="delete" type="button" aria-label="削除">🗑️</button>' : ''}
    `;
    li.querySelector('.page-switch').onclick = () => switchPage(p.id);
    li.querySelector('[data-act="rename"]').onclick = () => renamePage(p.id);
    const del = li.querySelector('[data-act="delete"]');
    if (del) del.onclick = () => deletePage(p.id);
    pageList.appendChild(li);
  }
}

function switchPage(id) {
  state.activePageId = id;
  activeTag = null;
  query = '';
  searchBar.hidden = true;
  searchInput.value = '';
  save();
  render();
  closePageSheet();
}

function renamePage(id) {
  const p = state.pages.find((x) => x.id === id);
  const name = prompt('ページの名前', p.name);
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  p.name = trimmed;
  save();
  render();
  renderPageList();
}

function deletePage(id) {
  const p = state.pages.find((x) => x.id === id);
  if (state.pages.length <= 1) return;
  if (!confirm(`ページ「${p.name}」を中のアイテムごと削除しますか？`)) return;
  state.pages = state.pages.filter((x) => x.id !== id);
  if (state.activePageId === id) state.activePageId = state.pages[0].id;
  save();
  render();
  renderPageList();
}

addPageBtn.addEventListener('click', () => {
  const name = prompt('新しいページの名前（例：冷凍庫、パントリー、薬箱）');
  if (name == null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const pid = uid();
  state.pages.push({ id: pid, name: trimmed, items: [] });
  switchPage(pid);
});

// ---------- 検索 ----------
const searchToggle = document.getElementById('searchToggle');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
searchToggle.addEventListener('click', () => {
  searchBar.hidden = !searchBar.hidden;
  if (!searchBar.hidden) searchInput.focus();
  else { query = ''; searchInput.value = ''; render(); }
});
searchInput.addEventListener('input', () => { query = searchInput.value; render(); });

// ---------- FAB ----------
const fab = document.getElementById('fab');
fab.addEventListener('click', () => openSheet(null, false));

let scrollTimer = null;
window.addEventListener('scroll', () => {
  fab.classList.add('hidden');
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => fab.classList.remove('hidden'), 220);
}, { passive: true });

// 背景 / ハンドルで閉じる
[sheet, pageSheet].forEach((s) =>
  s.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) s.hidden = true; })
);

// ---------- 初期化 ----------
save();
render();
