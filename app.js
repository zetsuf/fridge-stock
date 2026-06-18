// ===== 冷蔵庫の在庫 — データ層 & UI =====
const STORE_KEY = 'fridge-stock.items.v1';

/** @typedef {{id:string,name:string,qty:number,unit:string,tags:string[],lastUsed:number|null,createdAt:number}} Item */

/** @type {Item[]} */
let items = load();
let activeTag = null;     // タグフィルタ
let query = '';           // 検索文字列

// ---------- 永続化 ----------
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(items));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

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
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------- 描画 ----------
const el = {
  list: document.getElementById('itemList'),
  empty: document.getElementById('emptyState'),
  tagFilter: document.getElementById('tagFilter'),
};

function allTags() {
  const set = new Set();
  items.forEach((it) => it.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}

function visibleItems() {
  const q = query.trim().toLowerCase();
  return items
    .filter((it) => !activeTag || it.tags.includes(activeTag))
    .filter((it) => {
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.tags.some((t) => t.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function render() {
  renderTagFilter();
  const list = visibleItems();
  el.list.innerHTML = '';

  if (items.length === 0) {
    el.empty.hidden = false;
    el.empty.querySelector('.empty-title').textContent = 'まだアイテムがありません';
    el.empty.querySelector('.empty-sub').innerHTML = '右下の <strong>＋</strong> から追加しましょう';
    return;
  }
  if (list.length === 0) {
    el.empty.hidden = false;
    el.empty.querySelector('.empty-title').textContent = '該当するアイテムがありません';
    el.empty.querySelector('.empty-sub').textContent = '検索・タグを変えてみてください';
    return;
  }
  el.empty.hidden = true;

  for (const it of list) el.list.appendChild(card(it));
}

function card(it) {
  const li = document.createElement('li');
  li.className = 'item-card';

  const stale = it.lastUsed && Date.now() - it.lastUsed > 7 * 86400000;
  const tagsHtml = it.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('');

  li.innerHTML = `
    <div class="item-qty">
      <span class="qty-num">${formatQty(it.qty)}</span>
      <span class="qty-unit">${escapeHtml(it.unit || '')}</span>
    </div>
    <div class="item-main">
      <p class="item-name">${escapeHtml(it.name)}</p>
      <div class="item-tags">${tagsHtml}</div>
      <div class="item-meta">
        <span class="${stale ? 'meta-stale' : ''}">最終使用: ${relativeDate(it.lastUsed)}</span>
      </div>
    </div>
    <div class="item-actions">
      <button class="round-btn use-btn" data-act="use">使った</button>
    </div>
  `;

  // タップで編集（ボタン以外）
  li.addEventListener('click', (e) => {
    if (e.target.closest('[data-act]')) return;
    openSheet(it);
  });
  li.querySelector('[data-act="use"]').addEventListener('click', () => useItem(it.id));
  return li;
}

function renderTagFilter() {
  const tags = allTags();
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

function formatQty(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- アクション ----------
function useItem(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  it.lastUsed = Date.now();
  if (it.qty > 0) it.qty = Math.max(0, +(it.qty - 1).toFixed(2));
  save();
  render();
}

// ---------- モーダル ----------
const sheet = document.getElementById('sheet');
const form = document.getElementById('itemForm');
const f = {
  id: document.getElementById('fId'),
  name: document.getElementById('fName'),
  qty: document.getElementById('fQty'),
  unit: document.getElementById('fUnit'),
  tags: document.getElementById('fTags'),
};
const sheetTitle = document.getElementById('sheetTitle');
const deleteBtn = document.getElementById('deleteBtn');
const tagSuggest = document.getElementById('tagSuggest');

function openSheet(item) {
  if (item) {
    sheetTitle.textContent = 'アイテムを編集';
    f.id.value = item.id;
    f.name.value = item.name;
    f.qty.value = item.qty;
    f.unit.value = item.unit;
    f.tags.value = item.tags.join(', ');
    deleteBtn.hidden = false;
  } else {
    sheetTitle.textContent = 'アイテムを追加';
    form.reset();
    f.id.value = '';
    f.qty.value = 1;
    deleteBtn.hidden = true;
  }
  renderTagSuggest();
  sheet.hidden = false;
  setTimeout(() => f.name.focus(), 80);
}
function closeSheet() {
  sheet.hidden = true;
}

function renderTagSuggest() {
  const current = parseTags(f.tags.value);
  const tags = allTags().filter((t) => !current.includes(t));
  tagSuggest.innerHTML = '';
  for (const t of tags.slice(0, 12)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suggest-chip';
    b.textContent = '+ ' + t;
    b.onclick = () => {
      const list = parseTags(f.tags.value);
      list.push(t);
      f.tags.value = list.join(', ');
      renderTagSuggest();
    };
    tagSuggest.appendChild(b);
  }
}

function parseTags(str) {
  return [...new Set(
    String(str)
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = f.name.value.trim();
  if (!name) return;
  const data = {
    name,
    qty: Math.max(0, parseFloat(f.qty.value) || 0),
    unit: f.unit.value.trim(),
    tags: parseTags(f.tags.value),
  };

  const id = f.id.value;
  if (id) {
    const it = items.find((x) => x.id === id);
    Object.assign(it, data);
  } else {
    items.push({ id: uid(), ...data, lastUsed: null, createdAt: Date.now() });
  }
  save();
  render();
  closeSheet();
});

deleteBtn.addEventListener('click', () => {
  const id = f.id.value;
  if (!id) return;
  if (!confirm('このアイテムを削除しますか？')) return;
  items = items.filter((x) => x.id !== id);
  save();
  render();
  closeSheet();
});

// 数量ステッパー
document.querySelectorAll('.qty-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const step = parseInt(btn.dataset.step, 10);
    const next = Math.max(0, (parseFloat(f.qty.value) || 0) + step);
    f.qty.value = next;
  });
});

f.tags.addEventListener('input', renderTagSuggest);

// 背景 / ハンドルで閉じる
sheet.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) closeSheet();
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
fab.addEventListener('click', () => openSheet(null));

// スクロール中は隠れ、停止で再出現
let scrollTimer = null;
window.addEventListener('scroll', () => {
  fab.classList.add('hidden');
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => fab.classList.remove('hidden'), 220);
}, { passive: true });

// ---------- 初期描画 ----------
render();

// 初回のみサンプルデータを投入（任意・空のとき）
if (items.length === 0 && !localStorage.getItem('fridge-stock.seeded')) {
  localStorage.setItem('fridge-stock.seeded', '1');
}
