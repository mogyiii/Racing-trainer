const HISTORY = 300;
const empty = () => new Array(HISTORY).fill(0);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._thr = empty();
    this._upper = empty().fill(1);
    this._lower = empty().fill(0);
    this._target = empty().fill(0.8);
    this.reactionTarget = null;
    this.W = 800;
    this.H = 320;
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.offsetWidth || 800;
    const h = Math.max(320, Math.round(w * 0.42));
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
  }

  push(throttle, upper, lower, target) {
    const push = (arr, v) => { arr.push(v); if (arr.length > HISTORY) arr.shift(); };
    push(this._thr, throttle);
    push(this._upper, upper);
    push(this._lower, lower);
    push(this._target, target);
  }

  draw(norm, over, inZone, mode, extra) {
    const { ctx, W, H } = this;
    if (!W || !H) return;
    const gW = W - 88;  // graph width (leave room for gauge)
    const gT = 8;       // graph top padding
    const gB = H - 22;  // graph bottom (leave room for steer bar)
    const gH = gB - gT;
    const toY = v => gB - v * gH;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    // Horizontal grid
    ctx.strokeStyle = '#1a1a28';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = toY(i / 5);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(gW, y); ctx.stroke();
      ctx.fillStyle = '#2a2a44';
      ctx.font = '9px monospace';
      ctx.fillText((i * 20) + '%', gW + 2, y + 3);
    }

    // Mode-specific top overlays
    if (mode === 'f1') this._drawSpeedBar(gW, extra.virtualSpeed);
    if (mode === 'mx5' && extra.tireTempPenalty > 0) this._drawTireTemp(extra.tireTempPenalty);
    if (mode === 'rallycross') this._drawSlipZone(gW, gT, gH, gB);

    // --- Band fill (lower to upper) ---
    const bandColor = over ? 'rgba(255,45,45,0.14)' : inZone ? 'rgba(232,255,0,0.09)' : 'rgba(232,255,0,0.04)';
    ctx.beginPath();
    for (let i = 0; i < this._upper.length; i++) {
      const x = (i / (HISTORY - 1)) * gW;
      i === 0 ? ctx.moveTo(x, toY(this._upper[i])) : ctx.lineTo(x, toY(this._upper[i]));
    }
    for (let i = this._lower.length - 1; i >= 0; i--) {
      ctx.lineTo((i / (HISTORY - 1)) * gW, toY(this._lower[i]));
    }
    ctx.closePath();
    ctx.fillStyle = bandColor;
    ctx.fill();

    // Target line (dashed, inside band)
    this._drawLine(this._target, inZone ? '#00e676' : '#e8ff0055', 1.5, gW, toY, [5, 4]);

    // Lower limit line (dashed)
    this._drawLine(this._lower, over ? '#ff2d2d55' : '#4a5a00', 1, gW, toY, [3, 5]);

    // Upper limit line
    this._drawLine(this._upper, over ? '#ff2d2d' : '#e8ff0099', 2, gW, toY);

    // Throttle history (on top)
    this._drawLine(this._thr, over ? '#ff6060' : '#e8ff00', 2.5, gW, toY);

    // Reaction drill target
    if (mode === 'reaction' && this.reactionTarget !== null) {
      const rx = this.reactionTarget.steering * gW;
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(rx, gT); ctx.lineTo(rx, gB);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#00e676';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('KORM.CÉL', rx + 4, gT + 12);
    }

    // SpinFactor bar (shows recovery progress)
    this._drawSpinBar(gW, H, extra.spinFactor);

    // Right gauge
    this._drawGauge(W - 80, gT, gH, norm.throttle, this._upper[this._upper.length - 1], this._lower[this._lower.length - 1], over);

    // Steering bar (bottom)
    this._drawSteeringBar(norm.steering, gW, H);
  }

  _drawLine(arr, color, lw, gW, toY, dash) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = (i / (HISTORY - 1)) * gW;
      i === 0 ? ctx.moveTo(x, toY(arr[i])) : ctx.lineTo(x, toY(arr[i]));
    }
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  _drawGauge(x, gT, gH, throttle, upper, lower, over) {
    const { ctx } = this;
    const w = 18;
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(x, gT, w, gH);

    // Band fill in gauge
    const uy = gT + gH * (1 - upper);
    const ly = gT + gH * (1 - lower);
    ctx.fillStyle = over ? 'rgba(255,45,45,0.2)' : 'rgba(232,255,0,0.12)';
    ctx.fillRect(x, uy, w, ly - uy);

    // Throttle fill
    const ty = gT + gH * (1 - throttle);
    ctx.fillStyle = over ? '#ff4444' : '#e8ff00';
    ctx.fillRect(x, ty, w, gT + gH - ty);

    // Upper limit line
    ctx.strokeStyle = over ? '#ff2d2d' : '#e8ff00';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, uy); ctx.lineTo(x + w, uy); ctx.stroke();

    // Lower limit line
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke();
  }

  _drawSpinBar(gW, H, spinFactor) {
    const { ctx } = this;
    const bh = 4, y = H - 22 - bh - 2;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, y, gW, bh);
    const color = spinFactor > 0.7 ? '#00e676' : spinFactor > 0.4 ? '#e8ff00' : '#ff2d2d';
    ctx.fillStyle = color;
    ctx.fillRect(0, y, spinFactor * gW, bh);
  }

  _drawSteeringBar(steering, gW, H) {
    const { ctx } = this;
    const bh = 14, y = H - bh;
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, y, gW, bh);
    const cx = steering * gW - 6;
    ctx.fillStyle = '#e8ff00';
    ctx.fillRect(Math.max(0, Math.min(cx, gW - 12)), y + 1, 12, bh - 2);
    ctx.strokeStyle = '#2a2a40';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gW / 2, y); ctx.lineTo(gW / 2, y + bh); ctx.stroke();
  }

  _drawSpeedBar(gW, speed) {
    const { ctx } = this;
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 8, gW, 5);
    ctx.fillStyle = '#3a7bd5';
    ctx.fillRect(0, 8, speed * gW, 5);
    ctx.fillStyle = '#5599ff';
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.round(speed * 300)} km/h`, 4, 22);
  }

  _drawTireTemp(penalty) {
    const { ctx } = this;
    ctx.fillStyle = '#2a0a00';
    ctx.fillRect(0, 28, 180, 10);
    ctx.fillStyle = `hsl(${Math.round(20 - penalty * 20)}, 100%, 55%)`;
    ctx.fillRect(0, 28, penalty * 450, 10);
    ctx.fillStyle = '#ff8800';
    ctx.font = '9px monospace';
    ctx.fillText(`GUMI TEMP -${Math.round(penalty * 100)}%`, 4, 36);
  }

  _drawSlipZone(gW, gT, gH, gB) {
    const { ctx } = this;
    const toY = v => gB - v * gH;
    const y1 = toY(0.82);
    const y2 = toY(0.68);
    ctx.fillStyle = 'rgba(0,230,118,0.07)';
    ctx.fillRect(0, y1, gW, y2 - y1);
    ctx.strokeStyle = 'rgba(0,230,118,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(gW, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(gW, y2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,230,118,0.55)';
    ctx.font = '9px monospace';
    ctx.fillText('OPTIMÁLIS SLIP (68–82%)', 4, y1 - 3);
  }

  reset() {
    this._thr = empty();
    this._upper = empty().fill(1);
    this._lower = empty().fill(0);
    this._target = empty().fill(0.8);
  }
}
