/* ui.js — рендер DOM */
(function (root) {
  'use strict';

  var Data = root.RPData;
  var Engine = root.RPEngine;

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function fmtMoney(v) {
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
  }

  function barColor(stat, value) {
    if (value < 20) return '#ff5d5d';
    if (value < 45) return '#ffb020';
    return stat.color;
  }

  /* ---------- HUD ---------- */
  function renderHud(state) {
    $('#hud-name').textContent = state.name;
    $('#hud-age').textContent = state.age + ' лет';
    $('#hud-money').textContent = fmtMoney(state.money);
    $('#hud-day').textContent = 'День ' + state.day;
    var job = state.job ? Engine.getJob(state.job) : null;
    $('#hud-job').textContent = job ? job.name : 'Без работы';
  }

  function renderStats(state) {
    var box = $('#stats');
    box.innerHTML = '';
    Data.STATS.forEach(function (s) {
      var v = state.stats[s.id];
      var wrap = el('div', 'stat');
      var head = el('div', 'stat-head');
      head.appendChild(el('span', '', s.name));
      head.appendChild(el('span', 'stat-val', String(v)));
      var bar = el('div', 'bar');
      var fill = el('div', 'bar-fill');
      fill.style.width = v + '%';
      fill.style.background = barColor(s, v);
      bar.appendChild(fill);
      wrap.appendChild(head);
      wrap.appendChild(bar);
      box.appendChild(wrap);
    });
  }

  /* ---------- Действия ---------- */
  function costChips(a) {
    var row = el('div', 'action-cost');
    var cost = a.cost || {};
    if (cost.money)  row.appendChild(el('span', 'chip minus', '−' + cost.money + ' ₽'));
    if (cost.energy) row.appendChild(el('span', 'chip minus', '−' + cost.energy + ' энергии'));
    if (cost.hunger) row.appendChild(el('span', 'chip minus', '−' + cost.hunger + ' сытости'));
    var eff = a.effect || {};
    var names = { health: 'здоровье', energy: 'энергия', mood: 'настроение', hunger: 'сытость' };
    for (var k in eff) {
      if (Object.prototype.hasOwnProperty.call(eff, k)) {
        var v = eff[k];
        row.appendChild(el('span', 'chip ' + (v >= 0 ? 'plus' : 'minus'),
          (v >= 0 ? '+' : '') + v + ' ' + (names[k] || k)));
      }
    }
    if (a.skill) row.appendChild(el('span', 'chip plus', '+' + a.skill.gain + ' ' + Engine.skillName(a.skill.id)));
    return row;
  }

  function renderActions(state, onAction) {
    var box = $('#actions-list');
    box.innerHTML = '';

    var groups = {};
    var order = [];
    Data.ACTIONS.forEach(function (a) {
      if (a.id === 'work' && !state.job) return;
      if (a.id === 'quit_job' && !state.job) return;
      if (!groups[a.group]) { groups[a.group] = []; order.push(a.group); }
      groups[a.group].push(a);
    });

    order.forEach(function (g) {
      box.appendChild(el('div', 'section-title', g));
      groups[g].forEach(function (a) {
        var check = Engine.canDo(state, a.id);
        var btn = el('button', 'action' + (check.ok ? '' : ' locked'));
        btn.appendChild(el('div', 'action-title', a.title));
        btn.appendChild(el('div', 'action-desc', check.ok ? a.desc : check.reason));
        btn.appendChild(costChips(a));
        if (check.ok) {
          btn.addEventListener('click', function () { onAction(a.id); });
        } else {
          btn.disabled = true;
        }
        box.appendChild(btn);
      });
    });
  }

  /* ---------- Навыки ---------- */
  function renderSkills(state) {
    var box = $('#skills-list');
    box.innerHTML = '';
    Data.SKILLS.forEach(function (s) {
      var raw = state.skills[s.id] || 0;
      var lvl = Math.floor(raw);
      var prog = Math.round((raw - lvl) * 100);
      var card = el('div', 'skill');
      var head = el('div', 'skill-head');
      var left = el('div');
      left.appendChild(el('div', 'skill-name', s.name));
      left.appendChild(el('div', 'action-desc', s.desc));
      head.appendChild(left);
      head.appendChild(el('div', 'skill-lvl', 'ур. ' + lvl));
      var bar = el('div', 'bar');
      var fill = el('div', 'bar-fill');
      fill.style.width = prog + '%';
      fill.style.background = '#4f8cff';
      bar.appendChild(fill);
      card.appendChild(head);
      card.appendChild(bar);
      box.appendChild(card);
    });
  }

  /* ---------- Дневник ---------- */
  function renderLog(state) {
    var box = $('#log-list');
    box.innerHTML = '';
    if (!state.log.length) {
      box.appendChild(el('div', 'empty', 'Пока пусто. Поживи немного.'));
      return;
    }
    state.log.forEach(function (item) {
      var n = el('div', 'log-item ' + (item.tone || 'info'));
      n.appendChild(el('span', 'log-day', 'День ' + item.day));
      n.appendChild(document.createTextNode(item.text));
      box.appendChild(n);
    });
  }

  function renderAll(state, onAction) {
    renderHud(state);
    renderStats(state);
    renderActions(state, onAction);
    renderSkills(state);
    renderLog(state);
  }

  /* ---------- Экраны / модалка / тост ---------- */
  function showScreen(id) {
    var list = document.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('active');
    $('#' + id).classList.add('active');
  }

  function showTab(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === name);
    var panels = document.querySelectorAll('.tab-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('active', panels[j].dataset.panel === name);
  }

  /** buttons: [{label, cls, onClick}] */
  function modal(title, text, buttons) {
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    var box = $('#modal-actions');
    box.innerHTML = '';
    (buttons || [{ label: 'Ок' }]).forEach(function (b) {
      var btn = el('button', 'btn ' + (b.cls || 'ghost') + ' big', b.label);
      btn.addEventListener('click', function () {
        closeModal();
        if (b.onClick) b.onClick();
      });
      box.appendChild(btn);
    });
    $('#modal').classList.remove('hidden');
  }

  function closeModal() { $('#modal').classList.add('hidden'); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2200);
  }

  root.RPUI = {
    $: $, el: el, fmtMoney: fmtMoney,
    renderAll: renderAll, renderHud: renderHud, renderStats: renderStats,
    renderActions: renderActions, renderSkills: renderSkills, renderLog: renderLog,
    showScreen: showScreen, showTab: showTab,
    modal: modal, closeModal: closeModal, toast: toast
  };
})(window);
