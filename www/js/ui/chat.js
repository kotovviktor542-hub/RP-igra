/* chat.js — ролевой чат: обычные реплики, /me, /do, /pay, системные сообщения,
   отправка в сеть если подключён сервер. */

const $ = id => document.getElementById(id);

export class Chat {
  constructor(game) {
    this.game = game;
    this.log = $('chat-log');
    this.row = $('chat-row');
    this.input = $('chat-input');
    this.lines = [];
    this.open = false;

    $('chat-send').addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', e => {
      if (e.code === 'Enter') { e.preventDefault(); this.submit(); }
      if (e.code === 'Escape') this.toggleInput(false);
    });

    this.add('Добро пожаловать в город. Нажми 💬 чтобы написать, /help — список команд.', 'sys');
  }

  toggleInput(force) {
    this.open = force !== undefined ? force : !this.open;
    this.row.classList.toggle('hidden', !this.open);
    if (this.open) setTimeout(() => this.input.focus(), 50);
    else this.input.blur();
  }

  add(text, kind = '', nick = null) {
    const el = document.createElement('div');
    el.className = 'chat-line ' + kind;
    el.innerHTML = nick
      ? `<span class="nick">${this._esc(nick)}:</span> ${this._esc(text)}`
      : this._esc(text);
    this.log.appendChild(el);
    this.lines.push(el);
    while (this.lines.length > 9) this.lines.shift().remove();

    // автоскрытие старых строк
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.transition = 'opacity .8s';
      el.style.opacity = '0.35';
    }, 14000);
  }

  _esc(s) {
    return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  }

  submit() {
    const raw = this.input.value.trim();
    this.input.value = '';
    if (!raw) { this.toggleInput(false); return; }
    this.handle(raw);
    this.toggleInput(false);
  }

  handle(raw) {
    const g = this.game;
    const me = g.player.name;

    if (raw.startsWith('/')) {
      const [cmd, ...rest] = raw.slice(1).split(' ');
      const arg = rest.join(' ');

      switch (cmd.toLowerCase()) {
        case 'help':
          this.add('Команды: /me действие · /do описание · /pay сумма · /time · /where · /stats', 'sys');
          return;
        case 'me':
          if (!arg) return this.add('Использование: /me поправляет куртку', 'sys');
          this.broadcast(`* ${me} ${arg}`, 'me');
          return;
        case 'do':
          if (!arg) return this.add('Использование: /do на улице идёт дождь', 'sys');
          this.broadcast(`* ${arg} (( ${me} ))`, 'me');
          return;
        case 'pay': {
          const amt = parseInt(arg, 10);
          if (!amt || amt <= 0) return this.add('Использование: /pay 500', 'sys');
          const target = g.peds.nearest(g.player3d.pos.x, g.player3d.pos.z, 4);
          if (!target) return this.add('Рядом никого нет.', 'sys');
          if (g.player.money < amt) return this.add('Недостаточно денег.', 'sys');
          g.player.money -= amt;
          this.broadcast(`${me} передаёт ${target.name} ${amt} $`, 'money');
          setTimeout(() => this.add(`${target.name}: спасибо!`, '', target.name), 900);
          return;
        }
        case 'time':
          this.add(`Сейчас ${g.engine.clockString}`, 'sys');
          return;
        case 'where':
          this.add(`Ты здесь: ${g.hud.streetName(g.player3d.pos.x, g.player3d.pos.z)}`, 'sys');
          return;
        case 'stats':
          this.add(`Ур.${g.player.level} · ${g.player.money} $ · реп ${g.player.rep} · ${g.player.vehicles.length} авто`, 'sys');
          return;
        default:
          this.add(`Неизвестная команда: /${cmd}`, 'sys');
          return;
      }
    }

    this.broadcast(raw, '', me);
  }

  /** Отправляет в сеть (если есть) и показывает локально. */
  broadcast(text, kind = '', nick = null) {
    this.add(text, kind, nick);
    if (this.game.net && this.game.net.connected) {
      this.game.net.send({ t: 'chat', text, kind, nick });
    }
  }

  /** Фоновая болтовня NPC рядом. */
  ambient(dt) {
    this._t = (this._t || 0) + dt;
    if (this._t < 14) return;
    this._t = 0;
    const g = this.game;
    const n = g.peds.nearest(g.player3d.pos.x, g.player3d.pos.z, 14);
    if (n && Math.random() < 0.6) this.add(n.line, '', n.name);
  }
}
