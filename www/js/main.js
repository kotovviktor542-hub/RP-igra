/* main.js — связка UI и движка */
(function () {
  'use strict';

  var State = window.RPState;
  var Data = window.RPData;
  var Engine = window.RPEngine;
  var UI = window.RPUI;

  var APP_VERSION = '0.1.0';
  var state = null;

  /* ---------- сохранение ---------- */
  function persist() { if (state) State.save(state); }

  function refresh() {
    UI.renderAll(state, handleAction);
    persist();
  }

  /* ---------- действия ---------- */
  function handleAction(actionId) {
    if (actionId === 'find_job') {
      openJobList();
      return;
    }
    if (actionId === 'quit_job') {
      UI.modal('Уволиться?', 'Стабильного дохода больше не будет.', [
        { label: 'Да, увольняюсь', cls: 'danger', onClick: function () { runAction(actionId); } },
        { label: 'Передумал', cls: 'ghost' }
      ]);
      return;
    }
    runAction(actionId);
  }

  function runAction(actionId) {
    var res = Engine.doAction(state, actionId);
    if (!res.ok) {
      UI.toast(res.reason);
      return;
    }
    refresh();

    if (res.dayEnded) {
      var head = 'День ' + state.day;
      var body = res.messages.join('\n');
      if (res.event) {
        body = res.event.text + '\n\n' + res.event.result + (body ? '\n\n' + body : '');
        head = res.event.title;
      }
      if (!body) body = 'Ночь прошла спокойно.';
      UI.modal(head, body, [{ label: 'Дальше', cls: 'primary', onClick: afterModal }]);
    } else if (res.messages.length) {
      UI.toast(res.messages[0]);
    }
  }

  function afterModal() {
    refresh();
    if (!state.alive) gameOver();
  }

  function gameOver() {
    UI.modal('Игра окончена',
      state.name + ' не дожил до лучших времён.\n\nПрожито дней: ' + state.day +
      '\nИтоговый счёт: ' + Engine.score(state),
      [{ label: 'Начать заново', cls: 'primary', onClick: function () {
        State.wipe();
        state = null;
        UI.showScreen('screen-start');
        refreshContinueButton();
      } }]);
  }

  /* ---------- работа ---------- */
  function openJobList() {
    var r = Engine.doAction(state, 'find_job');
    if (!r.ok) { UI.toast(r.reason); return; }
    refresh();

    var buttons = Data.JOBS.map(function (job) {
      var ok = Engine.jobAvailable(state, job);
      var isCurrent = state.job === job.id;
      var label = job.name + ' — ' + job.pay + ' ₽/смена' +
        (isCurrent ? ' (текущая)' : (ok ? '' : ' 🔒'));
      return {
        label: label,
        cls: ok && !isCurrent ? 'primary' : 'ghost',
        onClick: function () {
          if (isCurrent) { UI.toast('Ты уже тут работаешь'); return; }
          if (!ok) { UI.toast('Не хватает навыков: ' + reqText(job)); return; }
          var res = Engine.takeJob(state, job.id);
          UI.toast(res.ok ? 'Устроился: ' + job.name : res.reason);
          refresh();
        }
      };
    });
    buttons.push({ label: 'Закрыть', cls: 'ghost' });

    UI.modal('Вакансии', Data.JOBS.map(function (j) {
      return '• ' + j.name + ': ' + j.desc;
    }).join('\n'), buttons);
  }

  function reqText(job) {
    var out = [];
    for (var k in job.req) {
      if (Object.prototype.hasOwnProperty.call(job.req, k)) {
        out.push(Engine.skillName(k) + ' ' + job.req[k]);
      }
    }
    return out.join(', ') || '—';
  }

  /* ---------- меню ---------- */
  function openMenu() {
    UI.modal('Меню', 'RP-igra v' + APP_VERSION + '\n\nДень ' + state.day + ', счёт ' + Engine.score(state), [
      { label: 'Сохранить сейчас', cls: 'ghost', onClick: function () { persist(); UI.toast('Сохранено'); } },
      { label: 'Начать заново', cls: 'danger', onClick: confirmRestart },
      { label: 'Закрыть', cls: 'ghost' }
    ]);
  }

  function confirmRestart() {
    UI.modal('Начать заново?', 'Текущий прогресс будет удалён навсегда.', [
      { label: 'Да, удалить', cls: 'danger', onClick: function () {
        State.wipe();
        state = null;
        UI.showScreen('screen-start');
        refreshContinueButton();
      } },
      { label: 'Отмена', cls: 'ghost' }
    ]);
  }

  /* ---------- стартовый экран ---------- */
  function segValue(id) {
    var active = document.querySelector('#' + id + ' .seg-btn.active');
    return active ? active.dataset.value : null;
  }

  function bindSeg(id) {
    var box = document.getElementById(id);
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.seg-btn') : null;
      if (!btn || !box.contains(btn)) return;
      var list = box.querySelectorAll('.seg-btn');
      for (var i = 0; i < list.length; i++) list[i].classList.remove('active');
      btn.classList.add('active');
    });
  }

  function refreshContinueButton() {
    var saved = State.load();
    document.getElementById('btn-continue').classList.toggle('hidden', !saved);
  }

  function startGame() {
    var name = (document.getElementById('input-name').value || '').trim();
    if (!name) name = segValue('seg-gender') === 'f' ? 'Аня' : 'Виктор';
    state = State.createState({
      name: name,
      gender: segValue('seg-gender'),
      origin: segValue('seg-origin')
    });
    Engine.pushLog(state, 'Новая жизнь началась. ' + State.ORIGINS[state.origin].label + '.', 'info');
    UI.showScreen('screen-game');
    UI.showTab('actions');
    refresh();
  }

  function continueGame() {
    var saved = State.load();
    if (!saved) { UI.toast('Сохранение не найдено'); return; }
    state = saved;
    UI.showScreen('screen-game');
    UI.showTab('actions');
    refresh();
  }

  /* ---------- инициализация ---------- */
  function init() {
    document.getElementById('version-label').textContent = 'v' + APP_VERSION;
    bindSeg('seg-gender');
    bindSeg('seg-origin');
    refreshContinueButton();

    document.getElementById('btn-new-game').addEventListener('click', function () {
      if (State.load()) {
        UI.modal('Есть сохранение', 'Начать новую жизнь? Старая будет стёрта.', [
          { label: 'Начать новую', cls: 'primary', onClick: startGame },
          { label: 'Отмена', cls: 'ghost' }
        ]);
      } else {
        startGame();
      }
    });
    document.getElementById('btn-continue').addEventListener('click', continueGame);

    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var name = this.dataset.tab;
        if (name === 'menu') { openMenu(); return; }
        UI.showTab(name);
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) persist();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
