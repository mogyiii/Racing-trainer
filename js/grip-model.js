// Per-mode physics configuration
export const MODE_CONFIG = {
  base: {
    label: 'Alap',
    targetRatio: 0.82,       // target = upperLimit * targetRatio
    bandRatio: 0.58,         // lowerLimit = upperLimit * bandRatio
    spinDropRate: 1.5,       // spinFactor drop per second while over limit
    spinRecoveryRate: 0.8,   // spinFactor recovery per second when under limit
    minSpinFactor: 0.20,
  },
  f1: {
    label: 'Forma 1',
    targetRatio: 0.88,
    bandRatio: 0.68,         // narrow band – F1 needs precision
    spinDropRate: 2.8,       // drops hard and fast
    spinRecoveryRate: 0.18,  // recovers very slowly
    minSpinFactor: 0.10,
  },
  rallycross: {
    label: 'Rallycross',
    targetRatio: 0.75,       // intentional slip target – aim lower
    bandRatio: 0.42,         // wide band – slides are acceptable
    spinDropRate: 0.35,      // minor drop
    spinRecoveryRate: 2.8,   // very fast recovery
    minSpinFactor: 0.50,     // never drops below 50%
  },
  mx5: {
    label: 'MX-5 / GT',
    targetRatio: 0.86,
    bandRatio: 0.62,
    spinDropRate: 1.0,
    spinRecoveryRate: 0.55,
    minSpinFactor: 0.15,
  },
};

export class GripModel {
  constructor() {
    this.k = 1.2;
    this.mode = 'base';
    this.spinFactor = 1.0;   // 1.0 = full grip, drops on spin, recovers slowly
    this.virtualSpeed = 0;   // F1 only
    this.tireTempPenalty = 0; // MX-5 only
    this._overLimitTime = 0;
  }

  get cfg() { return MODE_CONFIG[this.mode] || MODE_CONFIG.base; }

  // Base upper limit from steering (before spinFactor)
  _baseUpperLimit(steering) {
    const dev = Math.abs(steering - 0.5) * 2; // 0 = straight, 1 = full lock

    switch (this.mode) {
      case 'f1': {
        const spd = 0.20 + this.virtualSpeed * 0.80;
        return Math.max(0.05, spd - dev * this.k * (1 - this.virtualSpeed * 0.4));
      }
      case 'rallycross':
        return Math.max(0.10, 0.88 - dev * this.k * 0.65);
      case 'mx5':
        return Math.max(0.05, 1.0 - dev * this.k - this.tireTempPenalty);
      default:
        return Math.max(0.05, 1.0 - dev * this.k);
    }
  }

  // Returns the full state for this frame
  update(throttle, steering, dt) {
    const cfg = this.cfg;
    const baseUpper = this._baseUpperLimit(steering);

    // Apply spin factor to produce effective limits
    const upperLimit = baseUpper * this.spinFactor;
    const lowerLimit = upperLimit * cfg.bandRatio;
    const target = upperLimit * cfg.targetRatio;

    const over = throttle > upperLimit;
    const inZone = !over && throttle >= lowerLimit;

    // --- Spin factor dynamics ---
    if (over) {
      this.spinFactor = Math.max(cfg.minSpinFactor, this.spinFactor - cfg.spinDropRate * dt);
    } else {
      this.spinFactor = Math.min(1.0, this.spinFactor + cfg.spinRecoveryRate * dt);
    }

    // --- F1: virtual speed ---
    if (this.mode === 'f1') {
      if (!over) this.virtualSpeed = Math.min(1, this.virtualSpeed + dt * 0.06);
      else       this.virtualSpeed = Math.max(0, this.virtualSpeed - dt * 0.22);
    }

    // --- MX-5: tire temperature penalty ---
    if (this.mode === 'mx5') {
      if (over) {
        this._overLimitTime += dt;
        if (this._overLimitTime > 1.0)
          this.tireTempPenalty = Math.min(0.40, this.tireTempPenalty + dt * 0.08);
      } else {
        this._overLimitTime = 0;
        this.tireTempPenalty = Math.max(0, this.tireTempPenalty - dt * 0.015);
      }
    }

    return { upperLimit, lowerLimit, target, over, inZone };
  }

  reset() {
    this.spinFactor = 1.0;
    this.virtualSpeed = 0;
    this.tireTempPenalty = 0;
    this._overLimitTime = 0;
  }
}
