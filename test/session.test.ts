import { afterEach, describe, expect, it } from 'vitest';
import { LightMaster, type Reading } from '../src/lib/ble/meter';
import { installFakeBluetooth } from '../src/lib/ble/fake-meter';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Minimal browser globals the session touches.
(globalThis as any).window ??= { isSecureContext: true };

let meter: LightMaster | null = null;
afterEach(() => {
  meter?.disconnect();
  meter = null;
});

describe('LightMaster session (simulated LM4)', () => {
  it('connects, reads calibration and reports a first reading', async () => {
    installFakeBluetooth({ light: { noise: 0 } });
    meter = new LightMaster();
    const readings: Reading[] = [];
    meter.addEventListener('reading', (e) => readings.push((e as CustomEvent<Reading>).detail));
    await meter.connect();
    expect(meter.connected).toBe(true);
    expect(meter.calibration?.kSensor[0]).toBeCloseTo(1.0352, 3);
    expect(readings).toHaveLength(1);
    expect(readings[0].calibrated).toBe(true);
    expect(readings[0].lux).toBeGreaterThan(1000);
    expect(readings[0].aux).toBe(275);
    expect(readings[0].battery.percent).toBe(100);
  });

  it('polls continuously and stops', async () => {
    installFakeBluetooth();
    meter = new LightMaster();
    let n = 0;
    meter.addEventListener('reading', () => n++);
    await meter.connect();
    meter.startPolling(40);
    await sleep(300);
    meter.stopPolling();
    const at = n;
    expect(at).toBeGreaterThan(3);
    await sleep(150);
    expect(n).toBe(at);
  });

  it('runs the app flicker cascade: 26 µs then the 150 µs refinement below 2 kHz', async () => {
    const periods: number[] = [];
    installFakeBluetooth({
      light: { flickerHz: 100, modulation: 0.1, noise: 0 },
      onWrite: (f) => {
        const m = f.slice(3);
        if (((m[9] << 8) | m[10]) === 0x0a0a) periods.push((m[12] << 8) | m[13]);
      },
    });
    meter = new LightMaster();
    await meter.connect();
    const r = await meter.measureFlicker('auto');
    expect(periods).toEqual([25, 146]);
    expect(r.captures).toEqual([25, 146]);
    expect(Math.abs(r.frequency - 100)).toBeLessThan(10);
    expect(r.modulation).toBeGreaterThan(5);
    expect(r.modulation).toBeLessThan(15);
    // Waveform is scaled to the lux of the embedded measurement.
    const mean = r.wave.reduce((a, b) => a + b, 0) / r.wave.length;
    expect(r.lux).not.toBeNull();
    expect(Math.abs(mean - r.lux!) / r.lux!).toBeLessThan(0.05);
  });

  it('uses the 12.285 µs capture for high frequencies', async () => {
    const periods: number[] = [];
    installFakeBluetooth({
      light: { flickerHz: 25000, modulation: 0.3, noise: 0 },
      onWrite: (f) => {
        const m = f.slice(3);
        if (((m[9] << 8) | m[10]) === 0x0a0a) periods.push((m[12] << 8) | m[13]);
      },
    });
    meter = new LightMaster();
    await meter.connect();
    const r = await meter.measureFlicker('auto');
    expect(periods[0]).toBe(25);
    expect(periods[1]).toBe(11);
    expect(r.frequency).toBeGreaterThan(15000);
  });

  it('pauses polling during a flicker capture and resumes afterwards', async () => {
    installFakeBluetooth({ light: { noise: 0 } });
    meter = new LightMaster();
    await meter.connect();
    meter.startPolling(30);
    await sleep(80);
    await meter.measureFlicker(25);
    expect(meter.isPolling).toBe(true);
  });

  it('fails a capture cleanly when a notification is lost', async () => {
    let lose = -1;
    let seen = 0;
    installFakeBluetooth({ loseNotification: () => seen++ === lose });
    meter = new LightMaster({ flickerTimeoutMs: 1500 });
    await meter.connect();
    lose = seen + 30; // a fragment in the middle of the second flicker page
    // Dropped fragments are discarded by the assembler, so the capture times out instead of shifting samples.
    await expect(meter.captureFlicker(25)).rejects.toThrow(/did not answer/);
  });

  it('keeps Stop after an automatic reconnect', async () => {
    const fake = installFakeBluetooth();
    meter = new LightMaster();
    await meter.connect();
    meter.startPolling(60);
    fake.drop();
    await sleep(1300); // reconnects and resumes polling
    expect(meter.isPolling).toBe(true);
    meter.stopPolling();
    fake.drop();
    await sleep(1300);
    expect(meter.connected).toBe(true);
    expect(meter.isPolling).toBe(false);
  });

  it('keeps an idle link alive without emitting readings, like the Android app', async () => {
    const fake = installFakeBluetooth();
    meter = new LightMaster();
    let readings = 0;
    await meter.connect();
    meter.addEventListener('reading', () => readings++);
    const before = fake.writes;
    await sleep(2100); // keep-alive every 900 ms
    expect(fake.writes - before).toBeGreaterThanOrEqual(2);
    expect(readings).toBe(0);
    expect(meter.isPolling).toBe(false);
  });

  it('retries when the meter resends the previous flicker waveform', async () => {
    installFakeBluetooth({ staleCapture: (n) => n === 1 });
    meter = new LightMaster();
    await meter.connect();
    const first = await meter.captureFlicker(25);
    const second = await meter.captureFlicker(25); // meter repeats, we capture again
    expect(second.stale).toBeFalsy();
    expect(second.samples).not.toEqual(first.samples);
  });

  it('flags a waveform that stays stale', async () => {
    installFakeBluetooth({ staleCapture: (n) => n >= 1 });
    meter = new LightMaster();
    await meter.connect();
    await meter.captureFlicker(25);
    const again = await meter.captureFlicker(25);
    expect(again.stale).toBe(true);
  });

  it('a failed connect leaves nothing running on the meter', async () => {
    const fake = installFakeBluetooth({ dropAfter: (n) => (n === 1 ? 5 : null) });
    const first = new LightMaster();
    await expect(first.connect()).rejects.toThrow();
    await sleep(1200);
    expect(fake.links).toBe(1);
    meter = new LightMaster();
    await meter.connect();
    expect(meter.connected).toBe(true);
  });

  it('a live session reconnects after a dropped link and resumes polling', async () => {
    const fake = installFakeBluetooth();
    meter = new LightMaster();
    await meter.connect();
    meter.startPolling(100);
    fake.drop();
    await sleep(1300);
    expect(meter.connected).toBe(true);
    expect(fake.links).toBe(2);
    expect(meter.isPolling).toBe(true);
  });
});
