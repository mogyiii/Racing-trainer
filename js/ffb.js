// Force Feedback controller for Logitech G923/G920/G29 via WebHID
// Falls back to Gamepad API dual-rumble when WebHID is not connected.
//
// WebHID FFB output reports are 7 bytes, Report ID 0x00.
// Spring/damper disable takes over from G HUB default centering spring —
// this is why the wheel feels easier to turn once WebHID is connected.

export class FFBController {
  constructor() {
    this.device = null;    // opened WebHID HIDDevice
    this.gpIndex = 0;      // Gamepad API index (fallback rumble)
    this.strength = 1.0;   // 0–1 master FFB strength
    this.enabled = true;

    this._lastOver = false;
    this._releaseActive = false;
    this._releaseTimer = null;
    this._lastSendTime = 0;  // rate-limit WebHID sends
  }

  // Attach an already-opened WebHID HIDDevice and initialise FFB.
  async attachDevice(hidDevice) {
    this.device = hidDevice;
    this._reportId = 0;

    // Megkeressük az output reportokat – ezek nélkül FFB nem megy
    const allOutputReports = hidDevice.collections.flatMap(c => c.outputReports ?? []);
    console.log('[FFB] Csatlakoztatva:', hidDevice.productName);
    console.log('[FFB] Collections:', hidDevice.collections.map(c =>
      `usagePage=0x${c.usagePage?.toString(16)} usage=0x${c.usage?.toString(16)} outputReports=${c.outputReports?.length ?? 0}`
    ).join(' | '));
    console.log('[FFB] Output report ID-k:', allOutputReports.map(r => '0x' + r.reportId.toString(16)).join(', ') || 'NINCS');

    // G923 Xbox: a fő joystick interface-nek nincs output reportja, csak vendor-specific
    // (0xff43) csatornák vannak, amelyek nem motorvezérlők. WebHID FFB nem támogatott.
    const mainJoystick = hidDevice.collections.find(c => c.usagePage === 0x01 && (c.outputReports?.length ?? 0) > 0);
    if (!mainJoystick) {
      console.warn('[FFB] G923 Xbox: a fő joystick interface-n nincs HID FFB output. WebHID motorvezérlés nem elérhető. Gamepad API rezgés (fallback) aktív marad.');
      this.device = null; // Ne próbáljon küldeni
      return 'no-hid-ffb';
    }

    this._reportId = allOutputReports[0].reportId ?? 0;
    console.log('[FFB] Használt report ID:', '0x' + this._reportId.toString(16));

    const ok1 = await this._send([0xF5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // all off
    await this._send([0xF4, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00]); // master gain 100%
    await this._setSpring(1.0, 0.0);
    await this._setDamper(1.0);
    return ok1;
  }

  // Call every animation frame with current physics state and normalised inputs.
  update(state, norm) {
    if (!this.enabled) return;

    const { over, spinFactor } = state;
    const steerDev = Math.abs(norm.steering - 0.5) * 2; // 0 = straight, 1 = full lock
    const overOnset = over && !this._lastOver;
    this._lastOver = over;

    if (this.device?.opened) {
      this._updateWebHID(over, overOnset, spinFactor, steerDev);
    } else {
      this._updateRumble(over, steerDev);
    }
  }

  _updateWebHID(over, overOnset, spinFactor, steerDev) {
    if (overOnset) {
      // Csúszás kezdete: rugó lekapcs → kormány "elenged"
      this._send([0xF5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      this._releaseActive = true;
      clearTimeout(this._releaseTimer);
      this._releaseTimer = setTimeout(async () => {
        this._releaseActive = false;
        await this._setSpring(spinFactor, steerDev);
        await this._setDamper(spinFactor);
      }, 280);
      return;
    }

    if (this._releaseActive) return;

    // Normál menet: max 20 frissítés/s (WebHID async-hoz elég)
    const now = performance.now();
    if (now - this._lastSendTime < 50) return;
    this._lastSendTime = now;

    this._setSpring(spinFactor, steerDev);
    this._setDamper(spinFactor);
  }

  // Spring (iránycentráló erő).
  // Kanyarban enyhébb (30%-kal csökken full locknál), csúszásnál spinFactor alapján csökken.
  async _setSpring(spinFactor, steerDev) {
    const cornerSoften = 1.0 - steerDev * 0.30;
    const k = Math.max(0, Math.round(spinFactor * cornerSoften * this.strength * 0x7F));
    // [0x04, deadband_lo, deadband_hi, left_coeff, right_coeff, left_sat, right_sat]
    await this._send([0x04, 0x00, 0x00, k, k, 0xFF, 0xFF]);
  }

  // Damper (mozgási ellenállás): csökkenti a "lebegős" érzetet nagy sebességnél.
  async _setDamper(spinFactor) {
    const k = Math.max(0, Math.round(spinFactor * 0.4 * this.strength * 0x07));
    // [0x0C, left_coeff, left_sat, right_coeff, right_sat, 0x00, 0x00]
    await this._send([0x0C, k, 0x01, k, 0x01, 0x00, 0x00]);
  }

  // Gamepad API rezgés fallback (ha WebHID nincs).
  _updateRumble(over, steerDev) {
    const gp = navigator.getGamepads()[this.gpIndex];
    if (!gp?.vibrationActuator) return;

    if (over) {
      gp.vibrationActuator.playEffect('dual-rumble', {
        duration: 250,
        weakMagnitude: 1.0,
        strongMagnitude: 0.8,
      }).catch(() => {});
    } else if (steerDev > 0.25) {
      const t = (steerDev - 0.25) / 0.75;
      gp.vibrationActuator.playEffect('dual-rumble', {
        duration: 60,
        weakMagnitude: t * 0.45,
        strongMagnitude: 0,
      }).catch(() => {});
    }
  }

  async _send(bytes) {
    try {
      await this.device.sendReport(this._reportId ?? 0, new Uint8Array(bytes));
      return true;
    } catch (e) {
      console.warn('[FFB] sendReport hiba:', e.message, '| reportId:', '0x' + (this._reportId ?? 0).toString(16), '| bytes:', bytes.map(b => '0x' + b.toString(16)).join(' '));
      return false;
    }
  }

  // Azonnali erő-alkalmazás (pl. csúszka változásakor, ha a loop nem fut).
  async applyNow(spinFactor = 1.0, steerDev = 0.0) {
    if (!this.device?.opened) return;
    await this._setSpring(spinFactor, steerDev);
    await this._setDamper(spinFactor);
  }

  async disableAll() {
    if (!this.device?.opened) return;
    await this._send([0xF5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  }

  // Alapértelmezett centráló rugó visszaállítása leálláskor.
  async deactivate() {
    clearTimeout(this._releaseTimer);
    if (this.device?.opened) {
      // 0x14 = enable autocenter spring (G HUB alapértelmezett)
      await this._send([0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    }
    this.device = null;
  }
}
