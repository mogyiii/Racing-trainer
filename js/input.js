export class InputManager {
  constructor() {
    this.norm = { throttle: 0.0, steering: 0.5 };
    this.config = {
      steeringAxis: 0,
      throttleAxis: 1,
      throttleInverted: true,  // G923: -1 = full, 1 = released
      steeringInverted: false,
    };
    this.connected = false;
    this.deviceName = '';
    this.rawAxes = [];
    this.onData = null;
    this._gpIndex = 0;

    window.addEventListener('gamepadconnected', (e) => {
      this._gpIndex = e.gamepad.index;
      this.deviceName = e.gamepad.id;
      this.connected = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.connected = false;
      this.deviceName = '';
    });
  }

  // Call every animation frame
  poll() {
    const gamepads = navigator.getGamepads();
    let gp = null;
    for (const g of gamepads) {
      if (g?.connected) { gp = g; break; }
    }
    if (!gp) return;

    this.connected = true;
    this.deviceName = gp.id;
    this.rawAxes = Array.from(gp.axes);

    const sa = this.config.steeringAxis;
    const ta = this.config.throttleAxis;
    const rawS = gp.axes[sa] ?? 0;
    const rawT = gp.axes[ta] ?? (this.config.throttleInverted ? 1 : -1);

    this.norm.steering = Math.max(0, Math.min(1, this.config.steeringInverted
      ? (1 - rawS) / 2
      : (rawS + 1) / 2));

    this.norm.throttle = Math.max(0, Math.min(1, this.config.throttleInverted
      ? (1 - rawT) / 2
      : (rawT + 1) / 2));

    if (this.onData) this.onData(this.norm, this.rawAxes);
  }
}
