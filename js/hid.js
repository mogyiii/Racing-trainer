export class HIDManager {
  constructor() {
    this.device = null;
    this.calib = {
      throttleMin: 0, throttleMax: 255,
      steeringMin: 0, steeringMax: 255, steeringCenter: 128,
    };
    this.raw = { throttle: 0, steering: 128 };
    this.norm = { throttle: 0.0, steering: 0.5 };
    this.onData = null;

    // Auto-detect axis indices per common devices
    this._throttleIdx = 4;
    this._steeringIdx = 0;
  }

  async connect() {
    if (!navigator.hid) throw new Error('WebHID nem támogatott ebben a böngészőben.');
    const devices = await navigator.hid.requestDevice({ filters: [] });
    if (!devices.length) throw new Error('Nem lett kiválasztva eszköz.');
    this.device = devices[0];
    await this.device.open();
    this.device.oninputreport = (e) => this._handleReport(e);
    return this.device.productName;
  }

  startCalibration() {
    this.calib.throttleMin = Infinity;
    this.calib.throttleMax = -Infinity;
    this.calib.steeringMin = Infinity;
    this.calib.steeringMax = -Infinity;
    this._calibrating = true;
  }

  saveCalibration() {
    this._calibrating = false;
    this.calib.steeringCenter = Math.round((this.calib.steeringMin + this.calib.steeringMax) / 2);
    if (this.calib.throttleMax === this.calib.throttleMin) this.calib.throttleMax = this.calib.throttleMin + 1;
  }

  _handleReport(event) {
    const data = event.data;
    const len = data.byteLength;

    // Try to read steering and throttle; fall back gracefully if index out of range
    const steerRaw = this._steeringIdx + 1 < len ? data.getUint16(this._steeringIdx, true) : data.getUint8(this._steeringIdx);
    const throttleRaw = this._throttleIdx < len ? data.getUint8(this._throttleIdx) : 0;

    this.raw.steering = steerRaw;
    this.raw.throttle = throttleRaw;

    if (this._calibrating) {
      if (throttleRaw < this.calib.throttleMin) this.calib.throttleMin = throttleRaw;
      if (throttleRaw > this.calib.throttleMax) this.calib.throttleMax = throttleRaw;
      if (steerRaw < this.calib.steeringMin) this.calib.steeringMin = steerRaw;
      if (steerRaw > this.calib.steeringMax) this.calib.steeringMax = steerRaw;
    }

    const tRange = this.calib.throttleMax - this.calib.throttleMin || 1;
    this.norm.throttle = Math.max(0, Math.min(1, (throttleRaw - this.calib.throttleMin) / tRange));

    const sRange = this.calib.steeringMax - this.calib.steeringMin || 1;
    this.norm.steering = Math.max(0, Math.min(1, (steerRaw - this.calib.steeringMin) / sRange));

    if (this.onData) this.onData(this.norm, this.raw);
  }

  disconnect() {
    if (this.device) {
      this.device.close();
      this.device = null;
    }
  }
}
