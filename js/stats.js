export class Stats {
  constructor() { this.reset(); }

  reset() {
    this.frames = 0;
    this.overLimitFrames = 0;
    this.spins = 0;
    this._wasOver = false;
    this.streak = 0;
    this._currentStreak = 0;
    this.reactionTimes = [];
    this._reactionStart = null;
  }

  startReactionTimer() { this._reactionStart = performance.now(); }

  recordReaction() {
    if (this._reactionStart !== null) {
      this.reactionTimes.push(performance.now() - this._reactionStart);
      this._reactionStart = null;
    }
  }

  update(over) {
    this.frames++;
    if (over) {
      this.overLimitFrames++;
      if (!this._wasOver) this.spins++;
      this._currentStreak = 0;
    } else {
      this._currentStreak++;
      if (this._currentStreak > this.streak) this.streak = this._currentStreak;
    }
    this._wasOver = over;
  }

  get accuracy() {
    if (!this.frames) return 100;
    return +(((this.frames - this.overLimitFrames) / this.frames) * 100).toFixed(1);
  }

  get avgReaction() {
    if (!this.reactionTimes.length) return null;
    return +(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length).toFixed(0);
  }

  toJSON() {
    return {
      timestamp: new Date().toISOString(),
      accuracy: this.accuracy,
      spins: this.spins,
      bestStreak: this.streak,
      avgReactionMs: this.avgReaction,
    };
  }
}
