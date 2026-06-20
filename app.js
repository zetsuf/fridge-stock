// ===== 在庫管理（複数ページ対応） =====
const STORE_KEY = 'stock.v2';
const LEGACY_KEY = 'fridge-stock.items.v1';

// 残量レベル: 0=なし 〜 4=未使用
const LEVELS = ['なし', '後わずか', '半分', 'ほぼ新品', '未使用'];
function levelLabel(v) { return LEVELS[v] ?? '未使用'; }
function levelColor(v) { return ['#cbd5e1', '#f97316', '#f59e0b', '#34d399', '#22c55e'][v] ?? '#22c55e'; }

// タグの初期値（以降はユーザーが「タグ管理」で自由に編集）
// 緊急度の高い 肉・卵 を先頭に
const DEFAULT_TAGS = ['肉', '卵', '野菜', '調味料', '酒', '冷凍', 'その他'];
// 先頭に固定したいタグ（無ければ追加）
const PRIORITY_TAGS = ['肉', '卵'];
function tagList() {
  if (!Array.isArray(state.tags) || !state.tags.length) state.tags = DEFAULT_TAGS.slice();
  return state.tags;
}

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
      ensureShape(raw);
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
      tags: (o.tags || []).filter((t) => DEFAULT_TAGS.includes(t)),
      lastUsed: o.lastUsed || null,
      createdAt: o.createdAt || Date.now(),
    }));
  } catch {}
  const pid = uid();
  const st = { version: 2, tags: DEFAULT_TAGS.slice(), pages: [{ id: pid, name: 'れいぞうこ', items }], activePageId: pid };
  return st;
}

// データ形を整える（タグ一覧の初期化 + 旧タグ「氷」→「冷凍」 + 肉・卵の優先並び）
function ensureShape(st) {
  const RENAME = { '氷': '冷凍' };
  if (!Array.isArray(st.tags) || !st.tags.length) st.tags = DEFAULT_TAGS.slice();
  st.tags = [...new Set(st.tags.map((t) => RENAME[t] || t))];
  // 一度だけ：緊急度の高い 肉・卵 を先頭へ（卵が無ければ追加）
  if (!st.tagPriorityApplied) {
    for (const t of [...PRIORITY_TAGS].reverse()) {
      const idx = st.tags.indexOf(t);
      if (idx !== -1) st.tags.splice(idx, 1);
      st.tags.unshift(t);
    }
    st.tagPriorityApplied = true;
  }
  for (const p of st.pages) {
    for (const it of p.items) {
      it.tags = [...new Set((it.tags || []).map((t) => RENAME[t] || t))];
    }
  }
}

function saveLocal() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function save() {
  saveLocal();
  if (window.Sync && window.Sync.isConnected()) window.Sync.push(state);
}

// 同期相手（他端末）からの更新を反映
function applyRemote(remote) {
  if (!remote || !Array.isArray(remote.pages) || !remote.pages.length) return;
  state = remote;
  if (!state.pages.find((p) => p.id === state.activePageId)) state.activePageId = state.pages[0].id;
  ensureShape(state);
  saveLocal(); // ローカル保存のみ（push し返さない）
  render();
  if (typeof renderPageList === 'function' && !pageSheet.hidden) renderPageList();
}
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
  return tagList().filter((t) => set.has(t));
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
  for (const t of tagList()) {
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
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'choice-chip choice-edit';
  edit.textContent = '🏷 タグを編集';
  edit.onclick = openTagSheet;
  tagChoices.appendChild(edit);
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

// ---------- タグ管理 ----------
const tagSheet = document.getElementById('tagSheet');
const tagManageList = document.getElementById('tagManageList');
const newTagInput = document.getElementById('newTagInput');
const addTagBtn = document.getElementById('addTagBtn');

function openTagSheet() { renderTagManageList(); tagSheet.hidden = false; }
function refreshAfterTagChange() {
  save();
  render();
  renderTagManageList();
  if (!sheet.hidden) renderTagChoices();
}

function renderTagManageList() {
  tagManageList.innerHTML = '';
  const counts = tagUsageCounts();
  for (const t of tagList()) {
    const li = document.createElement('li');
    li.className = 'tag-row';
    li.innerHTML = `
      <span class="tag-row-name">${escapeHtml(t)}</span>
      <span class="tag-row-count">${counts[t] || 0}件</span>
      <button class="tag-icon" data-act="rename" type="button" aria-label="名前変更">✏️</button>
      <button class="tag-icon" data-act="delete" type="button" aria-label="削除">🗑️</button>
    `;
    li.querySelector('[data-act="rename"]').onclick = () => renameTag(t);
    li.querySelector('[data-act="delete"]').onclick = () => deleteTag(t);
    tagManageList.appendChild(li);
  }
}

function tagUsageCounts() {
  const c = {};
  for (const p of state.pages) for (const it of p.items) for (const t of it.tags) c[t] = (c[t] || 0) + 1;
  return c;
}

function addTag(name) {
  name = (name || '').trim();
  if (!name) return;
  if (tagList().includes(name)) { alert('同じ名前のタグが既にあります'); return; }
  tagList().push(name);
  newTagInput.value = '';
  refreshAfterTagChange();
}

function renameTag(oldName) {
  const input = prompt('タグ名を変更', oldName);
  if (input == null) return;
  const newName = input.trim();
  if (!newName || newName === oldName) return;
  // 全アイテムのタグを置換
  for (const p of state.pages) {
    for (const it of p.items) {
      it.tags = [...new Set(it.tags.map((t) => (t === oldName ? newName : t)))];
    }
  }
  // タグ一覧を更新（既存名へのリネームなら統合）
  const idx = tagList().indexOf(oldName);
  if (tagList().includes(newName)) tagList().splice(idx, 1);
  else tagList()[idx] = newName;
  if (activeTag === oldName) activeTag = tagList().includes(newName) ? newName : null;
  formTags = [...new Set(formTags.map((t) => (t === oldName ? newName : t)))];
  refreshAfterTagChange();
}

function deleteTag(name) {
  const used = tagUsageCounts()[name] || 0;
  const msg = used > 0
    ? `タグ「${name}」を削除しますか？（${used}件のアイテムからも外れます）`
    : `タグ「${name}」を削除しますか？`;
  if (!confirm(msg)) return;
  state.tags = tagList().filter((t) => t !== name);
  for (const p of state.pages) for (const it of p.items) it.tags = it.tags.filter((t) => t !== name);
  if (activeTag === name) activeTag = null;
  formTags = formTags.filter((t) => t !== name);
  refreshAfterTagChange();
}

addTagBtn.addEventListener('click', () => addTag(newTagInput.value));
newTagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(newTagInput.value); } });

// ---------- レシピ提案 ----------
const recipeSheet = document.getElementById('recipeSheet');
const recipeBtn = document.getElementById('recipeBtn');
const recipeBody = document.getElementById('recipeBody');
const recipeIntro = document.getElementById('recipeIntro');

// 残量のあるアイテム（level>0）= 使える食材
function availableItems() { return items().filter((it) => it.level > 0); }

// 材料（キーワードk）を満たすアイテムを返す（部分一致・双方向）
function findItemForKeywords(kw, avail, exclude) {
  return avail.find((it) =>
    !exclude.includes(it) &&
    kw.some((w) => it.name.includes(w) || w.includes(it.name))
  );
}

// レシピを在庫と照合。主材料(k付き)ごとに在庫の有無を判定
function matchRecipe(recipe, avail) {
  const used = [];
  const mains = []; // { ing, have, item }
  const missing = []; // 不足している主材料(ing)
  for (const ing of recipe.ing) {
    if (!ing.k) continue; // 調味料はスキップ
    const m = findItemForKeywords(ing.k, avail, used);
    if (m) { used.push(m); mains.push({ ing, have: true, item: m }); }
    else { mains.push({ ing, have: false }); missing.push(ing); }
  }
  return { ok: missing.length === 0, used, mains, missing };
}

function openRecipeSheet() {
  renderRecipes();
  recipeSheet.hidden = false;
}

function renderRecipes() {
  const avail = availableItems();
  recipeIntro.textContent = `「${activePage().name}」の使える食材${avail.length}品から、作れる料理を探しました。`;
  recipeBody.innerHTML = '';

  if (avail.length === 0) {
    recipeBody.innerHTML = '<p class="recipe-empty">残量のある食材がありません。アイテムを追加するか、残量を増やしてください。</p>';
    return;
  }

  const makeable = [];
  const almost = [];
  for (const r of (window.RECIPES || [])) {
    const m = matchRecipe(r, avail);
    if (m.ok) makeable.push({ r, m });
    else if (m.missing.length <= 2 && m.mains.some((x) => x.have)) almost.push({ r, m });
  }
  almost.sort((a, b) => a.m.missing.length - b.m.missing.length);

  if (makeable.length === 0 && almost.length === 0) {
    recipeBody.innerHTML = '<p class="recipe-empty">今ある食材で作れるレシピが見つかりませんでした。食材を増やすと候補が出ます。</p>';
    return;
  }

  const shown = almost.slice(0, 8);

  if (makeable.length) {
    recipeBody.appendChild(sectionTitle(`✅ いま作れる（${makeable.length}品）`));
    makeable.forEach(({ r, m }) => recipeBody.appendChild(recipeCard(r, m, true)));
  }
  if (shown.length) {
    recipeBody.appendChild(sectionTitle('🍳 あと少しで作れる'));
    recipeBody.appendChild(shoppingList(shown));
    shown.forEach(({ r, m }) => recipeBody.appendChild(recipeCard(r, m, false)));
  }
}

// 不足食材を集約した買い物リスト
function shoppingList(almost) {
  const counts = {};
  for (const { m } of almost) {
    for (const ing of m.missing) counts[ing.n] = (counts[ing.n] || 0) + 1;
  }
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const box = document.createElement('div');
  box.className = 'shopping-box';
  box.innerHTML = `
    <div class="shopping-title">🛒 買い物リスト（これがあると作れる料理が増えます）</div>
    <div class="shopping-tags">
      ${sorted.map((n) => `<span class="shopping-tag">${escapeHtml(n)}${counts[n] > 1 ? `<b>×${counts[n]}</b>` : ''}</span>`).join('')}
    </div>
  `;
  return box;
}

function sectionTitle(text) {
  const h = document.createElement('h3');
  h.className = 'recipe-section';
  h.textContent = text;
  return h;
}

function recipeCard(r, m, makeable) {
  const div = document.createElement('div');
  div.className = 'recipe-card' + (makeable ? '' : ' dim');
  const missing = m.missing.map((x) => escapeHtml(x.n)).join('、');
  const stepsHtml = r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');

  // 材料リスト（主材料は在庫の有無を ✓/✗ で、調味料は ・ で表示）
  const ingHtml = r.ing.map((ing) => {
    if (!ing.k) {
      return `<li class="ing-season"><span class="ing-mark">・</span>${escapeHtml(ing.n)}<span class="ing-amount">${escapeHtml(ing.a)}</span></li>`;
    }
    const mi = m.mains.find((x) => x.ing === ing);
    const have = mi && mi.have;
    const cls = have ? 'ing-have' : 'ing-miss';
    const mark = have ? '✓' : '✗';
    const note = have ? `<span class="ing-from">(${escapeHtml(mi.item.name)})</span>` : '';
    return `<li class="${cls}"><span class="ing-mark">${mark}</span>${escapeHtml(ing.n)}<span class="ing-amount">${escapeHtml(ing.a)}</span>${note}</li>`;
  }).join('');

  div.innerHTML = `
    <div class="recipe-head">
      <span class="recipe-emoji">${r.emoji}</span>
      <span class="recipe-name">${escapeHtml(r.name)}</span>
      <span class="recipe-time">${escapeHtml(r.time)}</span>
    </div>
    ${makeable
      ? '<div class="recipe-uses">✅ 今ある食材で作れます</div>'
      : `<div class="recipe-missing">あと: <strong>${missing}</strong></div>`}
    <details class="recipe-detail">
      <summary>材料・作り方を見る</summary>
      <div class="recipe-sub">材料（${escapeHtml(r.servings)}）</div>
      <ul class="ing-list">${ingHtml}</ul>
      <div class="recipe-sub">作り方</div>
      <ol class="recipe-steps">${stepsHtml}</ol>
    </details>
  `;

  return div;
}

recipeBtn.addEventListener('click', openRecipeSheet);
recipeSheet.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) recipeSheet.hidden = true; });

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
[sheet, pageSheet, tagSheet].forEach((s) =>
  s.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) s.hidden = true; })
);

// ---------- 同期UI ----------
const syncSheet = document.getElementById('syncSheet');
const syncBtn = document.getElementById('syncBtn');
const syncEls = {
  noConfig: document.getElementById('syncNoConfig'),
  disconnected: document.getElementById('syncDisconnected'),
  connected: document.getElementById('syncConnected'),
  codeText: document.getElementById('syncCodeText'),
  createBtn: document.getElementById('createCodeBtn'),
  joinInput: document.getElementById('joinInput'),
  joinBtn: document.getElementById('joinBtn'),
  copyBtn: document.getElementById('copyCodeBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  error: document.getElementById('syncError'),
};

function openSyncSheet() { renderSyncSheet(); syncSheet.hidden = false; }
function renderSyncSheet() {
  const configured = window.Sync && window.Sync.isConfigured();
  const connected = window.Sync && window.Sync.isConnected();
  syncEls.error.hidden = true;
  syncEls.noConfig.hidden = configured;
  syncEls.disconnected.hidden = !configured || connected;
  syncEls.connected.hidden = !configured || !connected;
  syncBtn.classList.toggle('syncing', !!connected);
  if (connected) syncEls.codeText.textContent = window.Sync.getCode();
}
function syncError(msg) { syncEls.error.textContent = msg; syncEls.error.hidden = false; }

syncBtn.addEventListener('click', openSyncSheet);

syncEls.createBtn.addEventListener('click', async () => {
  try {
    syncEls.createBtn.disabled = true;
    await window.Sync.createCode(state);
    renderSyncSheet();
  } catch (e) { syncError(e.message || '作成に失敗しました'); }
  finally { syncEls.createBtn.disabled = false; }
});

syncEls.joinBtn.addEventListener('click', async () => {
  const code = syncEls.joinInput.value;
  if (!code.trim()) { syncError('コードを入力してください'); return; }
  if (!confirm('この端末の現在のデータは、同期先の内容に置き換わります。続けますか？')) return;
  try {
    syncEls.joinBtn.disabled = true;
    const remote = await window.Sync.joinCode(code);
    applyRemote(remote);
    syncEls.joinInput.value = '';
    renderSyncSheet();
  } catch (e) { syncError(e.message || '参加に失敗しました'); }
  finally { syncEls.joinBtn.disabled = false; }
});

syncEls.copyBtn.addEventListener('click', async () => {
  const code = window.Sync.getCode();
  try { await navigator.clipboard.writeText(code); syncEls.copyBtn.textContent = 'コピーしました ✓'; }
  catch { syncEls.copyBtn.textContent = code; }
  setTimeout(() => { syncEls.copyBtn.textContent = 'コードをコピー'; }, 1500);
});

syncEls.disconnectBtn.addEventListener('click', () => {
  if (!confirm('この端末の同期を解除しますか？（データは端末に残ります）')) return;
  window.Sync.disconnect();
  renderSyncSheet();
});

[syncSheet].forEach((s) =>
  s.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) s.hidden = true; })
);

// ---------- 初期化 ----------
saveLocal();
render();
if (window.Sync) window.Sync.init(applyRemote);
