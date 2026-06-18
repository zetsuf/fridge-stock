// ===== sync.js — 共有コードによる端末間同期（Firebase Firestore / compat） =====
(function () {
  const SYNC_KEY = 'stock.sync'; // { code, clientId }
  let db = null;
  let unsub = null;
  let current = null;   // 現在の同期コード
  let clientId = null;  // この端末の識別子
  let onRemote = null;  // リモート更新時のコールバック

  function isConfigured() {
    return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
  }

  function init(applyRemote) {
    onRemote = applyRemote;
    const saved = readSaved();
    clientId = saved.clientId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    if (!isConfigured()) { persist(); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.firestore();
    } catch (e) {
      console.warn('Firebase 初期化に失敗:', e);
      return;
    }
    if (saved.code) { current = saved.code; subscribe(); }
    persist();
  }

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; }
  }
  function persist() {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ code: current, clientId }));
  }

  function subscribe() {
    if (unsub) { unsub(); unsub = null; }
    if (!db || !current) return;
    unsub = db.collection('households').doc(current).onSnapshot(
      (snap) => {
        if (snap.metadata.hasPendingWrites) return; // 自分の書き込みエコーは無視
        const data = snap.data();
        if (data && data.state && onRemote) onRemote(data.state);
      },
      (err) => console.warn('同期エラー:', err)
    );
  }

  // 新しいコードを発行し、現在のローカルstateをアップロード
  async function createCode(state) {
    if (!db) throw new Error('Firebase が設定されていません');
    const code = randomCode();
    current = code;
    persist();
    await db.collection('households').doc(code).set({
      state, updatedAt: Date.now(), updatedBy: clientId,
    });
    subscribe();
    return code;
  }

  // 既存コードに参加し、リモートのstateを取得（ローカルは置き換え）
  async function joinCode(code) {
    if (!db) throw new Error('Firebase が設定されていません');
    code = (code || '').trim().toUpperCase();
    if (!code) throw new Error('コードを入力してください');
    const doc = await db.collection('households').doc(code).get();
    if (!doc.exists || !doc.data().state) throw new Error('このコードのデータが見つかりません');
    current = code;
    persist();
    subscribe();
    return doc.data().state;
  }

  // ローカルの変更をリモートへ反映
  function push(state) {
    if (!db || !current) return;
    db.collection('households').doc(current)
      .set({ state, updatedAt: Date.now(), updatedBy: clientId })
      .catch((e) => console.warn('アップロード失敗:', e));
  }

  function disconnect() {
    if (unsub) { unsub(); unsub = null; }
    current = null;
    persist();
  }

  function randomCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
    let s = '';
    for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
    return s.slice(0, 5) + '-' + s.slice(5);
  }

  window.Sync = {
    init, createCode, joinCode, push, disconnect,
    isConfigured,
    isConnected: () => !!current,
    getCode: () => current,
  };
})();
