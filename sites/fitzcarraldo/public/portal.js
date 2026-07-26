/* fitzcarraldo — "the rest of the portal": the period-Yahoo! chrome around
 * the game itself. Wires up the dead-end nav links and directory listings
 * the first two build passes left as href="#" gags, plus a real (if
 * device-local) guestbook and webring. No server — this is a static site,
 * so the guestbook lives in localStorage: an honest, in-universe joke about
 * a 2001 portal that can't actually talk to anyone else.
 */
(function () {
  'use strict';

  var overlay = document.getElementById('modalOverlay');
  var titleEl = document.getElementById('modalTitle');
  var bodyEl = document.getElementById('modalBody');

  function openModal(title, html) {
    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function closeModal() {
    overlay.classList.add('hidden');
  }
  document.getElementById('modalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
  });

  function bind(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) { e.preventDefault(); fn(); });
  }

  // ---- Y! Mail / Y! Jungle Chat / Y! Rubber Auctions / More… — small gags ----
  bind('navMail', function () {
    openModal('Y! Mail', '<p>You have <b>0</b> new messages.</p>' +
      '<p style="color:#888;font-size:11px">1 message was marked read before you opened it. ' +
      'Kinski says he did you a favor.</p>');
  });

  bind('navChat', function () {
    openModal('Y! Jungle Chat — #fitzcarraldo-set', '' +
      chatline('herzog', 'the ship will not move itself. that is the whole point.') +
      chatline('kinski', 'I DID NOT SIGN A CONTRACT TO PUSH A BOAT') +
      chatline('wenders', '[camera still rolling]') +
      chatline('herzog', 'good. keep it rolling.') +
      '<p style="color:#888;font-size:11px;margin-top:8px">14 users in channel. 13 are watching. 1 is upriver, threatening to leave.</p>');
  });

  bind('navAuctions', openRubberAuctions);
  bind('dirAuctions', openRubberAuctions);
  function openRubberAuctions() {
    openModal('Y! Rubber Auctions', '' +
      lot('Lot 12 — 40 Fine Hard Pará, Iquitos grade', '¤2,150', '6 bids') +
      lot('Lot 13 — Steamship, 320-ton, "lightly mountaineered"', '¤ no reserve', '0 bids, 1 rumor') +
      lot('Lot 14 — Gramophone + full Caruso cylinder set', '¤410', '3 bids') +
      lot('Lot 15 — Completion bond, New German Cinema Co.', '¤ withdrawn', 'seller no longer answering telegrams') +
      '<p style="color:#888;font-size:11px;margin-top:4px">Auction closes when the ship crosses. Whichever comes first.</p>');
  }

  bind('dirKinski', function () {
    openModal('Klaus Kinski, On-Set Anecdotes', '' +
      anecdote('On the rope', '"I am not an extra. I am the ONLY thing worth filming here," ' +
        'said before hauling anyway, harder than anyone.') +
      anecdote('On the mountain', 'Reportedly offered to shoot the sound recordist. ' +
        'The sound recordist reportedly kept recording.') +
      anecdote('On Herzog', 'Herzog considered, and rejected, hiring an assassin. ' +
        'He needed Kinski\'s face for the close-ups.') +
      anecdote('On the crew', 'The indigenous extras, by several accounts, offered to kill Kinski ' +
        'on Herzog\'s behalf. Herzog also declined this — same reason.'));
  });

  function chatline(who, text) {
    var label = who.charAt(0).toUpperCase() + who.slice(1);
    return '<div class="chatline"><span class="who ' + who + '">' + label + ':</span> ' + escapeHtml(text) + '</div>';
  }
  function lot(title, price, bids) {
    return '<div class="lot"><b>' + escapeHtml(title) + '</b>' +
      '<div class="bid">current bid ' + price + ' — ' + bids + '</div></div>';
  }
  function anecdote(title, text) {
    return '<div class="anecdote"><b>' + escapeHtml(title) + '</b>' + escapeHtml(text) + '</div>';
  }
  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  bind('navMore', function () {
    openModal('More…', '<p>The portal ends here. The jungle does not.</p>');
  });

  // ---- Auteur webring — real sibling sites on bisks.net ----
  var WEBRING = ['fitzcarraldo', 'moonbuggy', 'lavalamp', 'didscope', 'trigrams', 'catsofatproto', 'pixel-fishing'];
  var HERE = 'fitzcarraldo';
  function ringUrl(name) { return 'https://' + name + '.bisks.net/'; }
  function ringStep(dir) {
    var i = WEBRING.indexOf(HERE);
    var j = (i + dir + WEBRING.length) % WEBRING.length;
    return WEBRING[j];
  }
  (function wireWebring() {
    var prev = document.getElementById('webringPrev');
    var next = document.getElementById('webringNext');
    var rand = document.getElementById('webringRandom');
    if (prev) prev.href = ringUrl(ringStep(-1));
    if (next) next.href = ringUrl(ringStep(1));
    if (rand) {
      rand.addEventListener('click', function (e) {
        e.preventDefault();
        var pool = WEBRING.filter(function (n) { return n !== HERE; });
        var pick = pool[Math.floor(Math.random() * pool.length)];
        window.location.href = ringUrl(pick);
      });
    }
  })();

  // ---- Guestbook — device-local (no server behind this portal) ----
  var GB_KEY = 'fitzcarraldo.guestbook';
  var GB_SEED = [
    { name: 'a fellow webmaster', when: '2001-04-02', msg: 'Nice site! Sign mine back? geocities.com/~rainforest_webring' },
    { name: 'anonymous', when: '2001-04-03', msg: 'the capstan sound effect is the best part of the whole internet' },
    { name: 'W.H.', when: '2001-04-04', msg: 'accurate.' }
  ];
  function loadGuestbook() {
    try {
      var raw = localStorage.getItem(GB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return GB_SEED.slice();
  }
  function saveGuestbook(list) {
    try { localStorage.setItem(GB_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function renderGuestbook() {
    var list = loadGuestbook();
    var rows = list.slice().reverse().map(function (e) {
      return '<li><span class="gbname">' + escapeHtml(e.name) + '</span> ' +
        '<span class="gbwhen">' + escapeHtml(e.when) + '</span><br>' + escapeHtml(e.msg) + '</li>';
    }).join('');
    return '<ul id="gbEntries">' + rows + '</ul>';
  }
  function guestbookForm() {
    return '' +
      '<form id="gbForm">' +
      '<input type="text" id="gbName" maxlength="40" placeholder="your name" required>' +
      '<textarea id="gbMsg" maxlength="200" placeholder="sign the guestbook…" required></textarea>' +
      '<button type="submit">Sign</button>' +
      '</form>' +
      '<p id="gbNote">stored on this device only — this portal has no server behind it, ' +
      'same as the real thing had no idea how the ending would go.</p>';
  }
  function openGuestbook(focusForm) {
    openModal('Guestbook', guestbookForm() + renderGuestbook());
    var form = document.getElementById('gbForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('gbName').value.trim();
      var msg = document.getElementById('gbMsg').value.trim();
      if (!name || !msg) return;
      var list = loadGuestbook();
      var today = new Date().toISOString().slice(0, 10);
      list.push({ name: name, when: today, msg: msg });
      saveGuestbook(list);
      openGuestbook(false);
    });
    if (focusForm) document.getElementById('gbName').focus();
  }
  bind('guestbookSignLink', function () { openGuestbook(true); });
  bind('guestbookViewLink', function () { openGuestbook(false); });
})();
