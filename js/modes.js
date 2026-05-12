// Curve Follower: generates a target ease-in-out curve and scores accuracy
export class CurveFollowerMode {
  constructor() {
    this.curve = [];
    this.progress = 0;
    this.speed = 0.003; // how fast the target moves
    this._generateCurve();
  }

  _generateCurve() {
    const pts = [];
    const N = 300;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // S-curve: smooth step
      const v = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      pts.push({ t, v });
    }
    this.curve = pts;
  }

  // Returns { targetThrottle, error } for current frame
  update(norm) {
    this.progress = (this.progress + this.speed) % 1;
    const idx = Math.round(this.progress * (this.curve.length - 1));
    const target = this.curve[idx].v;
    const error = Math.abs(norm.throttle - target);
    return { targetThrottle: target, error, curveForRenderer: this.curve };
  }

  reset() { this.progress = 0; }
}

// Reaction Drill: sets a random virtual steering angle, waits for user to correct throttle
export class ReactionDrillMode {
  constructor() {
    this.targetSteering = 0.5;
    this.waitingForReaction = false;
    this._timer = 0;
    this._interval = 3000; // ms between triggers
    this._lastTrigger = performance.now();
  }

  update(norm, stats) {
    const now = performance.now();
    if (now - this._lastTrigger > this._interval) {
      this.targetSteering = 0.2 + Math.random() * 0.6;
      this._lastTrigger = now;
      this.waitingForReaction = true;
      stats.startReactionTimer();
    }

    if (this.waitingForReaction) {
      // User must bring throttle below the limit for this steering angle
      const steerDev = Math.abs(this.targetSteering - 0.5) * 2;
      const requiredLimit = Math.max(0, 1 - steerDev * 1.2);
      if (norm.throttle <= requiredLimit) {
        this.waitingForReaction = false;
        stats.recordReaction();
      }
    }

    return { targetSteering: this.targetSteering, waiting: this.waitingForReaction };
  }

  reset() {
    this.targetSteering = 0.5;
    this.waitingForReaction = false;
    this._lastTrigger = performance.now();
  }
}
