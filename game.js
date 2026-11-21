// 色感對決 Color Duel：遊戲邏輯（手機玩家端＋電視房主端）
(() => {
  const LEVELS = 20, PENALTY = 3, PREFIX = 'colorduel-tw-', MAX_PLAYERS = 80;
  // 由易到難：格數與亮度差（OKLCH 的 L，單位 %）
  const GRID  = [3,3,3,4,4,4,4,5,5,5,5,6,6,6,6,7,7,7,8,8];
  // 第 1–18 關循序漸進（色差都在 5% 以上），只有第 19、20 關明顯變難
  const DELTA = [20,18.5,17,15.5,14,13,12,11,10.2,9.5,8.8,8.2,7.6,7,6.5,6,5.5,5,2.6,1.8];
  const COUNT_MS = 2400; // 倒數 3-2-1，每格 800ms

  const $ = id => document.getElementById(id);
  const screens = ['lobby','wait','countdown','play','result'];
  let screen = 'lobby';
  const show = s => { screen = s; screens.forEach(k => $(k).hidden = k !== s); };

  // ---------- 工具 ----------
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const randCode = () => Array.from({length:4}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
  const fmt = s => s == null ? '—' : s.toFixed(2) + ' s';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ord = n => n + (['th','st','nd','rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }
  function setConn(on, txt) { $('dot').classList.toggle('on', on); $('connTxt').textContent = txt; }
  const cleanCode = s => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // 名字清理：去掉控制字元、零寬字元與左右反轉字元（避免名字被反向顯示或隱藏字騙人）
  const cleanName = s => String(s ?? '').replace(/[\u0000-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁯﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

  // 防作弊與防洗版
  const MIN_LEVEL_SEC = 0.25;   // 每關至少要花的時間（電視端時鐘），擋掉「一秒過 20 關」的假訊息
  const RATE_PER_SEC = 20, RATE_BURST = 40, RATE_KICK = 400; // 每支手機每秒最多 20 則訊息；被擋超過 400 則就斷線

  function buildLevels(seed) {
    const r = rng(seed); const out = [];
    for (let i = 0; i < LEVELS; i++) {
      const n = GRID[i], d = DELTA[i];
      const L = 52 + r() * 22, C = 0.07 + r() * 0.11, H = Math.floor(r() * 360);
      const odd = Math.floor(r() * n * n);
      const dir = (L + d > 92) ? -1 : (r() < .5 ? -1 : 1);
      out.push({ n, d, odd, base: `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${H})`, diff: `oklch(${(L + dir*d).toFixed(1)}% ${C.toFixed(3)} ${H})` });
    }
    return out;
  }

  // 每支手機一個固定 id，斷線重連時房主認得是同一個人
  let cid = store('cd-cid');
  if (!cid) { cid = Math.random().toString(36).slice(2, 12); store('cd-cid', cid); }

  // =====================================================================
  //  玩家端（手機）
  // =====================================================================
  let peer = null, conn = null, roomCode = '', leaving = false, retryTimer = 0;
  let game = null, solo = false, lastProg = null, myRank = null, ready = false;

  function renderReady() {
    $('readyBtn').classList.toggle('on', ready);
    $('readyBtn').innerHTML = ready ? '✓ 已準備<span class="en">Ready · tap to undo</span>' : '我準備好了<span class="en">I’m ready</span>';
  }
  $('readyBtn').onclick = () => { ready = !ready; renderReady(); sendHost({ t: 'ready', v: ready }); };

  $('nick').value = store('cd-nick') || '';
  const qsRoom = cleanCode(new URLSearchParams(location.search).get('room'));
  if (qsRoom) { $('code').value = qsRoom; $('lobbyMsg').innerHTML = '已填好房間代碼，輸入名字後按「加入遊戲」。<span class="en blk">Room code filled in. Enter your name and tap Join.</span>'; }
  if (typeof Peer === 'undefined') $('lobbyMsg').innerHTML = '連線元件載入失敗，請確認網路後重新整理（仍可單人練習）。<span class="en blk">Could not load multiplayer. Check your connection and refresh.</span>';

  function lockLobby(on) { ['joinBtn','soloBtn','hostBtn'].forEach(id => $(id).disabled = on); }

  $('joinBtn').onclick = () => {
    const nick = cleanName($('nick').value);
    if (!nick) { $('lobbyMsg').innerHTML = '請先輸入名字。<span class="en">Please enter your name.</span>'; $('nick').focus(); return; }
    const code = cleanCode($('code').value);
    if (code.length < 4) { $('lobbyMsg').innerHTML = '請輸入電視上的 4 碼房間代碼。<span class="en blk">Enter the 4-character room code on the TV.</span>'; $('code').focus(); return; }
    if (typeof Peer === 'undefined') return;
    store('cd-nick', nick);
    roomCode = code; leaving = false; solo = false;
    lockLobby(true); $('lobbyMsg').innerHTML = '連線中…<span class="en">Connecting…</span>';
    const p = new Peer();
    const timer = setTimeout(() => { if (!conn) { $('lobbyMsg').innerHTML = '連不上這個房間，請確認代碼後再試。<span class="en blk">Could not reach that room. Check the code and try again.</span>'; lockLobby(false); p.destroy(); peer = null; } }, 12000);
    p.on('open', () => { peer = p; connectRoom(nick, () => { clearTimeout(timer); lockLobby(false); }); });
    p.on('error', e => {
      if (e.type === 'peer-unavailable') {
        if (!conn && screen === 'lobby') { clearTimeout(timer); $('lobbyMsg').innerHTML = '找不到這個房間，請確認電視上的代碼。<span class="en blk">No room with that code. Check the TV.</span>'; lockLobby(false); p.destroy(); peer = null; }
        return; // 重連期間找不到房主：等下一次重試
      }
      if (screen === 'lobby') { clearTimeout(timer); $('lobbyMsg').innerHTML = '連線失敗（' + esc(e.type) + '），請再試一次。<span class="en blk">Connection failed. Please try again.</span>'; lockLobby(false); }
    });
    p.on('disconnected', () => { if (!leaving && peer === p && !p.destroyed) { try { p.reconnect(); } catch {} } });
  };

  function connectRoom(nick, onFirstOpen) {
    if (!peer || leaving) return;
    const c = peer.connect(PREFIX + roomCode.toLowerCase(), { reliable: true, metadata: { cid, nick } });
    c.on('open', () => {
      conn = c; setConn(true, '已連線 Connected');
      if (onFirstOpen) { onFirstOpen(); onFirstOpen = null; $('waitCode').textContent = roomCode; if (screen === 'lobby') show('wait'); }
      if (lastProg) c.send(lastProg); // 重連後補送最新進度
    });
    c.on('data', onHostMsg);
    c.on('close', () => {
      if (conn !== c) return;
      conn = null;
      if (leaving) return;
      setConn(false, '重新連線中 Reconnecting…');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => connectRoom(nick), 2500);
    });
    c.on('error', () => {});
  }

  function sendHost(msg) { try { if (conn && conn.open) conn.send(msg); } catch {} }

  function onHostMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'welcome') {
      $('waitTitle').innerHTML = `${esc(m.nick)}，已加入！<span class="en">You’re in!</span>`;
      if (m.phase === 'race' && (!game || game.rid !== m.rid)) $('waitMsg').innerHTML = '這局已經開始了，請等下一局。<span class="en blk">A round is running. You’ll join the next one.</span>';
      if (m.phase === 'lobby' && ready) sendHost({ t: 'ready', v: true }); // 重連後補回準備狀態
    }
    if (m.t === 'kicked') {
      leaving = true; clearTimeout(retryTimer);
      try { conn?.close(); } catch {} try { peer?.destroy(); } catch {}
      conn = null; peer = null; game = null; lastProg = null; ready = false; renderReady();
      setConn(false, '離線 Offline'); show('lobby');
      $('lobbyMsg').innerHTML = '主持人已將你移出房間。<span class="en">The host removed you from the room.</span>';
      return;
    }
    if (m.t === 'full') { leaving = true; $('lobbyMsg').innerHTML = '房間已滿。<span class="en">This room is full.</span>'; show('lobby'); setConn(false, '離線 Offline'); }
    if (m.t === 'count' && screen === 'wait') $('waitMsg').innerHTML = `已準備 ${m.r || 0} / ${m.n} 人。主持人按開始後，所有人會同時開賽。<span class="en blk">${m.r || 0} of ${m.n} ready. Everyone starts together when the host taps Start.</span>`;
    if (m.t === 'start' && m.rid && (!game || game.rid !== m.rid)) startRound(m.rid, +m.seed);
    if (m.t === 'rank') { myRank = m; renderRank(); }
    if (m.t === 'end' && game && game.rid === m.rid) {
      if (!game.done) { game.done = true; cancelAnimationFrame(game.raf); show('result'); $('resTitle').innerHTML = '時間到！<span class="en">Time’s up!</span>'; $('resTime').textContent = `第 ${game.i + 1} 關`; }
      renderRank();
    }
    if (m.t === 'lobby') { game = null; myRank = null; lastProg = null; ready = false; renderReady(); show('wait'); $('waitMsg').innerHTML = '下一局即將開始，請按「我準備好了」。<span class="en blk">Next round coming up. Tap “I’m ready”.</span>'; }
  }

  $('leaveBtn').onclick = () => {
    leaving = true; clearTimeout(retryTimer);
    try { conn?.close(); } catch {} try { peer?.destroy(); } catch {}
    conn = null; peer = null; game = null; lastProg = null; ready = false; renderReady(); setConn(false, '離線 Offline'); show('lobby');
    $('lobbyMsg').innerHTML = '你已離開房間。<span class="en">You left the room.</span>';
  };

  // ---------- 答題 ----------
  function startRound(rid, seed) {
    game = { rid, levels: buildLevels(seed), i: 0, wrong: 0, t0: 0, done: false, time: null, raf: 0, at: 0 };
    myRank = null; $('rankTxt').textContent = '';
    report();
    show('countdown');
    let c = 3; $('countNum').textContent = c;
    const iv = setInterval(() => {
      c--; if (c > 0) { $('countNum').textContent = c; return; }
      clearInterval(iv); beginPlay();
    }, COUNT_MS / 3);
  }

  function beginPlay() {
    if (!game || game.done) return;
    show('play');
    game.t0 = performance.now();
    renderLevel();
    const tick = () => { if (!game || game.done) return; $('timer').textContent = elapsed().toFixed(2); game.raf = requestAnimationFrame(tick); };
    tick();
  }
  const elapsed = () => (performance.now() - game.t0) / 1000 + game.wrong * PENALTY;

  function report() {
    if (solo || !game) return;
    lastProg = { t: 'prog', rid: game.rid, level: game.i, at: Math.round(game.at * 100) / 100, wrong: game.wrong, done: game.done, time: game.time };
    sendHost(lastProg);
  }

  function renderLevel() {
    const lv = game.levels[game.i];
    $('lvTxt').innerHTML = `${game.i + 1}<span> / ${LEVELS}</span>`;
    $('deltaTxt').textContent = `${lv.n}×${lv.n} · ΔL ${lv.d}%`;
    $('wrongTxt').textContent = `點錯 ${game.wrong} · Misses`;
    const b = $('board'); b.style.setProperty('--n', lv.n);
    b.style.gap = lv.n >= 7 ? '4px' : '6px';
    let html = '';
    for (let k = 0; k < lv.n * lv.n; k++) html += `<button class="tile" data-k="${k}" aria-label="色塊 Tile ${k+1}" style="background:${k === lv.odd ? lv.diff : lv.base}"></button>`;
    b.innerHTML = html;
  }

  $('board').addEventListener('pointerdown', e => {
    const t = e.target.closest('.tile'); if (!t || !game || game.done || screen !== 'play') return;
    e.preventDefault(); pick(+t.dataset.k);
  });
  $('board').addEventListener('keydown', e => {
    const t = e.target.closest('.tile'); if (!t || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); pick(+t.dataset.k);
  });

  function pick(k) {
    const lv = game.levels[game.i];
    if (k !== lv.odd) {
      game.wrong++; $('wrongTxt').textContent = `點錯 ${game.wrong} · Misses`;
      const b = $('board'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      const f = $('flash'); f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
      report();
      return;
    }
    game.i++; game.at = elapsed();
    if (game.i >= LEVELS) return finish();
    report(); renderLevel();
  }

  function finish() {
    game.done = true; cancelAnimationFrame(game.raf);
    game.time = Math.round(elapsed() * 100) / 100;
    report();
    show('result');
    $('resTitle').innerHTML = solo ? '練習完成！<span class="en">Practice complete!</span>' : '完成！<span class="en">You finished!</span>';
    $('resTime').textContent = fmt(game.time);
    $('againBtn').hidden = !solo;
    renderRank();
  }

  function renderRank() {
    if (solo) { $('resRank').textContent = '—'; $('resMsg').textContent = `點錯 ${game.wrong} 次（每次 +${PENALTY} 秒）· ${game.wrong} misses (+${PENALTY} s each)`; return; }
    if (!myRank) { $('resRank').textContent = '…'; $('resMsg').innerHTML = '請看電視上的即時排名。<span class="en">Check the TV for the live ranking.</span>'; return; }
    $('rankTxt').innerHTML = `排名 Rank <b>${myRank.rank}</b> / ${myRank.n}`;
    $('resRank').textContent = `#${myRank.rank}`;
    if (typeof myRank.time === 'number') $('resTime').textContent = fmt(myRank.time); // 以電視端的正式成績為準
    const left = myRank.n - myRank.finished;
    $('resMsg').innerHTML = left > 0 ? `共 ${myRank.n} 人，還有 ${left} 人在玩，完整排名請看電視。<span class="en blk">${myRank.n} players · ${left} still playing. See the TV for the full ranking.</span>` : `共 ${myRank.n} 人，全部完成！請看電視頒獎台。<span class="en blk">All ${myRank.n} players done. See the TV for the podium!</span>`;
  }

  // ---------- 單人練習 ----------
  $('soloBtn').onclick = () => { solo = true; startRound('solo' + Date.now(), Math.floor(Math.random() * 1e9)); };
  $('againBtn').onclick = () => $('soloBtn').click();

  // =====================================================================
  //  房主端（電視）
  // =====================================================================
  let host = null;
  // host = { peer, code, players: Map<cid, P>, phase: 'lobby'|'race'|'end', rid, seed, t0, dirty }
  // P = { cid, nick, conn, online, inRound, level, at, wrong, done, time, joinedAt }

  $('hostBtn').onclick = () => {
    if (typeof Peer === 'undefined') return;
    lockLobby(true); $('lobbyMsg').innerHTML = '開房中…<span class="en">Opening the room…</span>';
    const tryOpen = attempt => {
      const code = randCode();
      const p = new Peer(PREFIX + code.toLowerCase());
      p.on('open', () => { lockLobby(false); enterHost(p, code); });
      p.on('connection', onPlayerConn);
      p.on('error', e => {
        if (e.type === 'unavailable-id' && attempt < 4) { p.destroy(); tryOpen(attempt + 1); return; }
        if (!host) { lockLobby(false); $('lobbyMsg').innerHTML = '開房失敗（' + esc(e.type) + '），請再試一次。<span class="en blk">Could not open a room. Please try again.</span>'; p.destroy(); }
      });
      p.on('disconnected', () => { if (host && host.peer === p && !p.destroyed) { try { p.reconnect(); } catch {} } });
    };
    tryOpen(0);
  };

  function enterHost(p, code) {
    host = { peer: p, code, players: new Map(), blocked: new Set(), phase: 'lobby', rid: null, seed: 0, t0: 0, dirty: true };
    document.body.classList.add('tv'); $('tv').hidden = false;
    const base = location.origin + location.pathname.replace(/index\.html$/, '');
    $('tvUrl').textContent = base.replace(/^https?:\/\//, '');
    $('tvCode').textContent = code;
    try {
      const qr = qrcode(0, 'M'); qr.addData(base + '?room=' + code); qr.make();
      $('tvQr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
    } catch { $('tvQr').innerHTML = `<b style="color:#000;font-size:28px">${code}</b>`; }
    try { navigator.wakeLock?.request('screen').catch(() => {}); } catch {}
    setInterval(hostTick, 250);
    setInterval(sendRanks, 1000);
    renderHost();
  }

  function onPlayerConn(c) {
    const md = c.metadata || {};
    const pcid = String(md.cid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
    let nick = cleanName(md.nick) || 'Player';
    const bucket = { tokens: RATE_BURST, last: performance.now(), dropped: 0 };
    c.on('open', () => {
      if (!host || !pcid) { c.close(); return; }
      if (host.blocked.has(pcid)) { try { c.send({ t: 'kicked' }); } catch {} setTimeout(() => c.close(), 500); return; }
      let P = host.players.get(pcid);
      if (!P) {
        if (host.players.size >= MAX_PLAYERS) { try { c.send({ t: 'full' }); } catch {} setTimeout(() => c.close(), 500); return; }
        // 重名就加編號
        const taken = new Set([...host.players.values()].map(x => x.nick.toLowerCase()));
        if (taken.has(nick.toLowerCase())) { let k = 2; while (taken.has((nick + ' ' + k).toLowerCase())) k++; nick = nick + ' ' + k; }
        P = { cid: pcid, nick, conn: null, online: false, ready: false, inRound: false, level: 0, at: 0, wrong: 0, done: false, time: null, joinedAt: Date.now() };
        host.players.set(pcid, P);
      }
      if (P.conn && P.conn !== c) { try { P.conn.close(); } catch {} }
      P.conn = c; P.online = true;
      try { c.send({ t: 'welcome', nick: P.nick, phase: host.phase, rid: host.rid }); } catch {}
      broadcastCount();
      host.dirty = true;
    });
    c.on('data', m => {
      // 洗版保護：token bucket
      const now = performance.now();
      bucket.tokens = Math.min(RATE_BURST, bucket.tokens + (now - bucket.last) / 1000 * RATE_PER_SEC); bucket.last = now;
      if (bucket.tokens < 1) { if (++bucket.dropped > RATE_KICK) { try { c.close(); } catch {} } return; }
      bucket.tokens -= 1;

      const P = host && host.players.get(pcid); if (!P || P.conn !== c || !m || typeof m !== 'object') return;
      if (m.t === 'ready') {
        const v = m.v === true;
        if (host.phase === 'lobby' && P.ready !== v) { P.ready = v; broadcastCount(); host.dirty = true; }
        return;
      }
      if (m.t !== 'prog') return;
      if (host.phase !== 'race' || m.rid !== host.rid || !P.inRound || P.done) return;

      // 計時以電視（房主）的時鐘為準，不相信手機回報的秒數
      const hostSec = (now - host.t0) / 1000;
      if (hostSec < 0) return;                                   // 倒數還沒結束，不可能有進度
      const wrong = Math.max(P.wrong, Math.min(999, Math.floor(+m.wrong) || 0)); // 點錯次數只能增加
      const maxLevel = Math.min(LEVELS, Math.floor(hostSec / MIN_LEVEL_SEC));   // 依經過時間，最多可能到第幾關
      const level = Math.max(P.level, Math.min(maxLevel, Math.floor(+m.level) || 0));
      if (level > P.level) P.at = hostSec + wrong * PENALTY;     // 到達這一關的時間（含罰秒）
      P.level = level; P.wrong = wrong;
      if (m.done === true && level >= LEVELS) { P.done = true; P.time = Math.round((hostSec + wrong * PENALTY) * 100) / 100; }
      host.dirty = true;
      checkAllDone();
    });
    c.on('close', () => {
      const P = host && host.players.get(pcid); if (!P || P.conn !== c) return;
      P.online = false; P.conn = null;
      // 大廳階段離線的人直接移除；比賽中保留成績
      if (host.phase === 'lobby') host.players.delete(pcid);
      broadcastCount(); host.dirty = true;
      checkAllDone();
    });
    c.on('error', () => {});
  }

  const online = () => [...host.players.values()].filter(P => P.online && P.conn);
  function sendTo(P, msg) { try { if (P.conn && P.conn.open) P.conn.send(msg); } catch {} }
  function broadcast(msg) { online().forEach(P => sendTo(P, msg)); }
  function broadcastCount() { if (host.phase === 'lobby') { const ps = online(); broadcast({ t: 'count', n: ps.length, r: ps.filter(P => P.ready).length }); } }

  // 排名規則：完成者依總時間；未完成者依關卡（高到低），同關卡依到達時間（早到前）
  function ranking() {
    const list = [...host.players.values()].filter(P => P.inRound);
    return list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1;
      if (a.done) return a.time - b.time;
      if (a.level !== b.level) return b.level - a.level;
      return a.at - b.at;
    });
  }

  function sendRanks() {
    if (!host || host.phase === 'lobby') return;
    const r = ranking(); const fin = r.filter(P => P.done).length;
    r.forEach((P, i) => { if (P.online) sendTo(P, { t: 'rank', rank: i + 1, n: r.length, finished: fin, time: P.done ? P.time : null }); });
  }

  $('startBtn').onclick = () => {
    if (!host || host.phase !== 'lobby') return;
    const ps = online(); if (!ps.length) return;
    host.rid = 'r' + Date.now().toString(36); host.seed = Math.floor(Math.random() * 1e9);
    host.players.forEach(P => Object.assign(P, { inRound: P.online, ready: false, level: 0, at: 0, wrong: 0, done: false, time: null }));
    host.phase = 'race'; host.t0 = performance.now() + COUNT_MS; host.endAt = 0;
    broadcast({ t: 'start', rid: host.rid, seed: host.seed });
    host.dirty = true; renderHost();
  };

  $('endBtn').onclick = () => endRound();
  function endRound() {
    if (!host || host.phase !== 'race') return;
    host.phase = 'end'; host.endAt = performance.now();
    broadcast({ t: 'end', rid: host.rid });
    sendRanks(); host.dirty = true; renderHost();
  }
  function checkAllDone() {
    if (!host || host.phase !== 'race') return;
    const r = ranking();
    if (r.length && r.every(P => P.done || !P.online)) setTimeout(() => { if (ranking().every(P => P.done || !P.online)) endRound(); }, 400);
  }

  // 主持人移除玩家（例如名字不雅或來亂的人），本場內不能再用同一支手機加入
  $('tvChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b || !host || host.phase !== 'lobby') return;
    const P = host.players.get(b.dataset.cid); if (!P) return;
    if (!window.confirm(`移除「${P.nick}」？\nRemove “${P.nick}” from the room?`)) return;
    host.blocked.add(P.cid);
    if (P.conn) { sendTo(P, { t: 'kicked' }); const c = P.conn; setTimeout(() => { try { c.close(); } catch {} }, 300); }
    host.players.delete(P.cid);
    broadcastCount(); host.dirty = true;
  });

  $('newBtn').onclick = () => {
    if (!host) return;
    // 離線的人移除，其餘回到大廳
    [...host.players.values()].forEach(P => { if (!P.online) host.players.delete(P.cid); P.inRound = false; P.ready = false; });
    host.phase = 'lobby'; host.rid = null;
    broadcast({ t: 'lobby' }); broadcastCount();
    host.dirty = true; renderHost();
  };

  function hostTick() {
    if (!host) return;
    const now = performance.now();
    const counting = host.phase === 'race' && now < host.t0;
    $('tvCount').hidden = !counting;
    if (counting) $('tvCount').textContent = Math.max(1, Math.ceil((host.t0 - now) / (COUNT_MS / 3)));
    if (host.phase !== 'lobby') {
      const t = host.phase === 'end' ? (host.endAt - host.t0) / 1000 : (now - host.t0) / 1000;
      $('tvClock').textContent = Math.max(0, t).toFixed(1);
    }
    if (host.dirty) { host.dirty = false; renderHost(); }
  }

  function renderHost() {
    const ph = host.phase; const ps = online();
    $('tvLobby').hidden = ph !== 'lobby';
    $('tvBoard').hidden = ph === 'lobby';
    $('tvPodium').hidden = ph !== 'end';
    $('tvClock').hidden = ph !== 'race';
    $('startBtn').hidden = ph !== 'lobby'; $('startBtn').disabled = !ps.length;
    $('endBtn').hidden = ph !== 'race';
    $('newBtn').hidden = ph !== 'end';

    if (ph === 'lobby') {
      const nr = ps.filter(P => P.ready).length;
      const allReady = ps.length > 0 && nr === ps.length;
      $('tvStatus').innerHTML = `已準備 ${nr} / ${ps.length}<small>${allReady ? '全員準備好了，請按開始！ Everyone is ready — tap Start!' : '掃 QR code 加入，再按「我準備好了」 · Scan to join, then tap I’m ready'}</small>`;
      $('startBtn').textContent = allReady ? '開始 Start' : `直接開始 Start anyway (${nr}/${ps.length})`;
      const chips = [...host.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      $('tvChips').innerHTML = chips.length ? chips.map(P => `<button type="button" class="chip${P.online ? '' : ' off'}${P.ready ? ' ready' : ''}" data-cid="${esc(P.cid)}" title="點一下可移除此玩家 · Click to remove">${esc(P.nick)}</button>`).join('') : '<span class="tv-empty">還沒有人加入 · No one has joined yet</span>';
      return;
    }

    const r = ranking(); const fin = r.filter(P => P.done).length;
    $('tvStatus').innerHTML = ph === 'race'
      ? `即時排名 Live ranking<small>${fin} / ${r.length} 完成 finished</small>`
      : `最終排名 Final ranking<small>${fin} / ${r.length} 完成 finished</small>`;

    if (ph === 'end') {
      const [a, b, c] = r;
      const pod = (P, cls, place) => P ? `<div class="pod ${cls}"><div class="pl">${place}</div><div class="who">${esc(P.nick)}</div><div class="tm">${P.done ? fmt(P.time) : '第 ' + (P.level + 1) + ' 關'}</div></div>` : '<div></div>';
      $('tvPodium').innerHTML = pod(b, 's', '第 2 名 2nd') + pod(a, 'g', '第 1 名 1st') + pod(c, 'b', '第 3 名 3rd');
    }

    // 人多時自動分欄，讓 40 人都放得進一個畫面
    const list = ph === 'end' ? r.slice(3) : r;
    const cols = list.length <= 10 ? 1 : list.length <= 30 ? 2 : list.length <= 60 ? 3 : 4;
    const rows = Math.max(1, Math.ceil(list.length / cols));
    const avail = window.innerHeight * (ph === 'end' ? 0.6 : 0.72);
    const size = Math.max(13, Math.min(28, avail / rows / 2.55));
    const el = $('tvBoard');
    el.style.gridTemplateRows = `repeat(${rows}, auto)`;
    el.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    el.style.setProperty('--rk-size', size + 'px');
    const offset = ph === 'end' ? 3 : 0;
    el.innerHTML = list.map((P, i) => {
      const n = i + 1 + offset;
      const st = P.done ? fmt(P.time) : `第 ${Math.min(P.level + 1, LEVELS)} 關`;
      const pct = (P.done ? LEVELS : P.level) / LEVELS * 100;
      const cls = ['rk', P.done ? 'done' : '', P.online ? '' : 'off', n <= 3 ? 'p' + n : ''].join(' ');
      return `<div class="${cls}"><span class="bar" style="width:${pct}%"></span><span class="no">${n}</span><span class="nm">${esc(P.nick)}${P.wrong ? `<small>✕${P.wrong}</small>` : ''}</span><span class="st">${st}</span></div>`;
    }).join('');
  }

  window.addEventListener('resize', () => { if (host) host.dirty = true; });
  window.addEventListener('beforeunload', e => { if (host && host.players.size) { e.preventDefault(); e.returnValue = ''; } });
})();
