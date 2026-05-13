import { InputManager } from './input.js';
import { GripModel } from './grip-model.js';
import { Renderer } from './canvas.js';
import { Stats } from './stats.js';
import { CurveFollowerMode, ReactionDrillMode } from './modes.js';
import { FFBController } from './ffb.js';

const MODE_DESCS = {
  curve:      'Kövesd a sárga TARGET vonalat a gázpedállal. Maradj a sávon belül. Kormányállásnál szűkül a megengedett tartomány.',
  reaction:   'A szoftver hirtelen változtatja a virtuális kormányállást – azonnal korrigáld a gázt a limit alá.',
  f1:         'Sebességfüggő tapadás. Kis sebességnél szűk sáv, nagy sebességnél tágul. Kipörögve a limit SOKÁIG alacsony marad.',
  rallycross: 'Zöld sávban tartsd a gázt (szándékos slip ~75%). Kis büntetés, gyors visszaépülés – csúszás elfogadott.',
  mx5:        'Progresszív határ. Tartós limit-feletti gáz esetén a gumi felmelegszik és a limit csökken (zöld bar).',
};

class App {
  constructor() {
    this.input = new InputManager();
    this.grip = new GripModel();
    this.stats = new Stats();
    this.curveMode = new CurveFollowerMode();
    this.reactionMode = new ReactionDrillMode();

    this.running = false;
    this.activeMode = 'curve';
    this._animId = null;
    this._lastTime = 0;
    this._audioCtx = null;

    this.ffb = new FFBController();

    this.renderer = new Renderer(document.getElementById('main-canvas'));
    this._initUI();
    this._pollStatus();
  }

  _initUI() {
    const axisSteer    = document.getElementById('axis-steer');
    const axisThrottle = document.getElementById('axis-throttle');
    const axisSteerInv = document.getElementById('axis-steer-inv');
    const axisThrInv   = document.getElementById('axis-throttle-inv');

    const applyAxis = () => {
      this.input.config.steeringAxis    = +axisSteer.value;
      this.input.config.throttleAxis    = +axisThrottle.value;
      this.input.config.steeringInverted = axisSteerInv.checked;
      this.input.config.throttleInverted = axisThrInv.checked;
    };
    [axisSteer, axisThrottle, axisSteerInv, axisThrInv].forEach(e => e.addEventListener('change', applyAxis));
    applyAxis();

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeMode = tab.dataset.mode;
        document.getElementById('mode-desc').textContent = MODE_DESCS[this.activeMode];
        this.grip.mode = ['curve', 'reaction'].includes(this.activeMode) ? 'base' : this.activeMode;
      });
    });
    document.getElementById('mode-desc').textContent = MODE_DESCS[this.activeMode];

    const slider = document.getElementById('sensitivity');
    slider.addEventListener('input', () => {
      this.grip.k = +slider.value;
      document.getElementById('sensitivity-val').textContent = slider.value;
    });

    document.getElementById('btn-start').addEventListener('click', () => this._start());
    document.getElementById('btn-stop').addEventListener('click',  () => this._stop());
    document.getElementById('btn-export').addEventListener('click', () => this._export());

    document.getElementById('btn-ffb-connect').addEventListener('click', () => this._connectFFB());

    const ffbSlider = document.getElementById('ffb-strength');
    ffbSlider.addEventListener('input', () => {
      this.ffb.strength = +ffbSlider.value;
      document.getElementById('ffb-strength-val').textContent = Math.round(ffbSlider.value * 100) + '%';
      if (this.ffb.enabled) this.ffb.applyNow();
    });

    const ffbToggle = document.getElementById('ffb-enabled');
    ffbToggle.addEventListener('change', () => {
      this.ffb.enabled = ffbToggle.checked;
      if (!ffbToggle.checked) {
        this.ffb.disableAll();
      } else {
        this.ffb.applyNow();
      }
    });
  }

  _pollStatus() {
    this.input.poll();
    const norm = this.input.norm;
    const axes = this.input.rawAxes;

    const statusEl = document.getElementById('device-status');
    if (this.input.connected) {
      statusEl.textContent = this.input.deviceName.substring(0, 50);
      statusEl.className = 'status connected';
    } else {
      statusEl.textContent = 'Várakozás gamepadre... (nyomj egy gombot a kormányon)';
      statusEl.className = 'status disconnected';
    }

    document.getElementById('disp-throttle').textContent = norm.throttle.toFixed(2);
    document.getElementById('disp-steering').textContent = norm.steering.toFixed(2);

    const barsEl = document.getElementById('axis-bars');
    if (axes.length) {
      barsEl.innerHTML = axes.map((v, i) => {
        const pct = Math.round((v + 1) / 2 * 100);
        const col = i === this.input.config.throttleAxis ? '#e8ff00'
                  : i === this.input.config.steeringAxis ? '#5599ff'
                  : '#333';
        return `<div class="abar">
          <span class="abar-label">A${i}</span>
          <div class="abar-track"><div class="abar-fill" style="width:${pct}%;background:${col}"></div></div>
          <span class="abar-val">${v.toFixed(2)}</span>
        </div>`;
      }).join('');
    }

    requestAnimationFrame(() => this._pollStatus());
  }

  async _connectFFB() {
    const btn = document.getElementById('btn-ffb-connect');
    const status = document.getElementById('ffb-status');
    if (!navigator.hid) {
      status.textContent = 'WebHID nem támogatott (használj Chrome-ot)';
      status.className = 'status disconnected';
      return;
    }
    try {
      // Csak Logitech eszközök (0x046D) – a G923 több HID interface-ként jelenik meg,
      // a felhasználónak a "G923 Racing Wheel" nevűt kell választania (nem keyboard/media).
      const devices = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x046D }] });
      if (!devices.length) return;
      const dev = devices[0];
      if (!dev.opened) await dev.open();
      this.ffb.gpIndex = this.input._gpIndex;
      const ok = await this.ffb.attachDevice(dev);
      if (ok === 'no-hid-ffb') {
        status.textContent = 'G923 Xbox: WebHID motorvezérlés nem elérhető – Gamepad API rezgés (fallback) aktív';
        status.className = 'status disconnected';
        btn.textContent = 'FFB újracsatlakozás';
      } else if (ok) {
        status.textContent = 'FFB: ' + dev.productName;
        status.className = 'status connected';
        btn.textContent = 'FFB újracsatlakozás';
      } else {
        status.textContent = 'FFB csatlakozva, de a parancsküldés sikertelen – nézd a konzolt (F12)';
        status.className = 'status disconnected';
      }
    } catch (e) {
      status.textContent = 'FFB hiba: ' + e.message;
      status.className = 'status disconnected';
    }
  }

  _start() {
    this.running = true;
    this.stats.reset();
    this.grip.reset();
    this.renderer.reset();
    this.curveMode.reset();
    this.reactionMode.reset();

    document.getElementById('canvas-area').classList.remove('hidden');
    document.getElementById('stats-panel').classList.remove('hidden');
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled  = false;

    requestAnimationFrame(() => {
      this.renderer.resize();
      this._lastTime = performance.now();
      this._animId = requestAnimationFrame(t => this._loop(t));
    });
  }

  _stop() {
    this.running = false;
    cancelAnimationFrame(this._animId);
    this.ffb.deactivate();
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled  = true;
    this._updateStatsUI();
  }

  _loop(timestamp) {
    if (!this.running) return;
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    const norm = this.input.norm;
    const { upperLimit, lowerLimit, target, over, inZone } = this.grip.update(norm.throttle, norm.steering, dt);

    // Mode-specific reaction target
    if (this.activeMode === 'reaction') {
      const { targetSteering, waiting } = this.reactionMode.update(norm, this.stats);
      this.renderer.reactionTarget = waiting ? { steering: targetSteering } : null;
    } else {
      this.renderer.reactionTarget = null;
    }

    // Curve mode overrides the target line with a moving curve value
    let displayTarget = target;
    if (this.activeMode === 'curve') {
      const { targetThrottle } = this.curveMode.update(norm);
      displayTarget = Math.min(targetThrottle, upperLimit);
    }

    this.stats.update(over);
    this.renderer.push(norm.throttle, upperLimit, lowerLimit, displayTarget);
    this.renderer.draw(norm, over, inZone, this.activeMode, {
      spinFactor:      this.grip.spinFactor,
      virtualSpeed:    this.grip.virtualSpeed,
      tireTempPenalty: this.grip.tireTempPenalty,
    });

    this.ffb.gpIndex = this.input._gpIndex;
    this.ffb.update({ over, spinFactor: this.grip.spinFactor }, norm);

    if (over) this._alertSpin();
    this._updateStatsUI();

    this._animId = requestAnimationFrame(t => this._loop(t));
  }

  _alertSpin() {
    const el = document.getElementById('overlay-msg');
    el.textContent = 'KIPÖRGÉS!';
    el.className = 'overlay-msg danger';
    el.classList.remove('hidden');
    clearTimeout(this._flashTO);
    this._flashTO = setTimeout(() => el.classList.add('hidden'), 200);
    this._beep(440, 0.09);
  }

  _beep(freq, dur) {
    try {
      if (!this._audioCtx) this._audioCtx = new AudioContext();
      const osc = this._audioCtx.createOscillator();
      const gain = this._audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this._audioCtx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, this._audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._audioCtx.currentTime + dur);
      osc.start();
      osc.stop(this._audioCtx.currentTime + dur);
    } catch {}
  }

  _updateStatsUI() {
    document.getElementById('stat-accuracy').textContent = this.stats.accuracy + '%';
    document.getElementById('stat-spins').textContent    = this.stats.spins;
    document.getElementById('stat-streak').textContent   = this.stats.streak;
    const rt = this.stats.avgReaction;
    document.getElementById('stat-reaction').textContent = rt ? rt + ' ms' : '-';
  }

  _export() {
    const blob = new Blob([JSON.stringify(this.stats.toJSON(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `racing-trainer-${Date.now()}.json`;
    a.click();
  }
}

new App();
