# Omissions and differences from the official app

Parity target: the Light Master screens of the **OPPLE Smart** app (iOS 3.16.0, Android 3.3.1), which support the Light Master 4 through two tabs (Photometry, Flicker), a report list, and an "Add / Switch device" guide.

Every value the app computes is reproduced from its own algorithms and its active coefficient set (`LightmasterⅣCoeff_20231115`). This covers XYZ, CCT, Duv, Ra, R1–R14, EML, CS, battery, and the flicker metrics, risk class and capture sequence. Three independent reviews checked this against the decompiled app, and real LM4 captures back the tests. Display rules (validity windows, decimals, `---`/`0.0` placeholders) follow the app's `dealResData` and Flicker tab.

This file lists what is left out or behaves differently, and why.

## Left out

| App feature | Why it is omitted |
|---|---|
| **Cloud reports**: upload to `/toolserviceapi/LightMaster/*`, server-rendered report pages, share-by-cloud-link and per-account history | There is no Opple account or server. Reports are stored locally in the browser (IndexedDB). They can be exported (CSV/JSON), imported (JSON) and printed to PDF, and shared as a self-contained link that carries the raw measurement in the URL. |
| **Firmware upgrade** ("Firmware upgrade" menu item, LM4 only) | The route is never registered in iOS 3.16.0. On Android it runs through a native module (`OPRNOTA2NativeModule`) with firmware from Opple's cloud. Neither is available to a web page, and flashing a meter from an unofficial client is risky. |
| **Light Master 2 / 3 and "Light Spirit"** | This UI targets the Light Master 4 only. The other models use different payloads and coefficient sets, and Light Spirit's firmware-dependent coefficients can't be validated without hardware. |
| **"LightCheck" light-environment inspection**: areas, room-type standards, server-side inspection reports (Chinese only) | A separate cloud workflow built on the Opple backend. |
| **Languages other than English** | The app ships English and Chinese Light Master strings. This UI is English only. |
| **Region / business-unit selection, feedback form, privacy consent** | Tied to Opple's cloud services. |
| **Automatic scan-and-connect to the strongest meter / remembered MAC** | Browsers require the user to pick the device in the Web Bluetooth chooser. Where the browser supports it, the page reconnects to a previously allowed meter without showing the chooser. |
| **Advertisement parsing** (SKU, firmware version, MAC) | Web Bluetooth only exposes advertisement data through `watchAdvertisements()`, which not every browser supports. The meter is identified by its name and GATT service instead. The firmware version is therefore unknown, so the battery table is chosen by the raw value's range rather than by firmware. The two ranges don't overlap. |
| **"Measurement Guide" content from the cloud** (Light Spirit) | Cloud content, and for a device family that isn't supported. |

## Behaves differently

| Area | App | Web UI |
|---|---|---|
| Report list | Shows one day at a time (today by default) | Shows all days, grouped by day, with an optional day filter |
| Failed frequency-refining flicker capture | Shows an error with no result | Keeps the first (26 µs) capture's result and says that the frequency wasn't refined |
| Unusable flicker captures | No check. When the meter keeps its flicker sensor in the most sensitive range (range 0), the sensor overloads above ~4,000 lx and its output falls back towards the dark level. The app turns that into large, meaningless modulation. It has an "increase the test distance" message but never raises it for the LM4. | Flags overloaded, too-dark and weak captures with a warning. For overloaded or too-dark captures it skips the second (refining) capture, because meters locked up after repeated overloaded captures during testing. The displayed numbers are still the app's. |
| Missed measurement replies | Ignored silently | Logged. Three in a row drop and reopen the link automatically. |
| Idle link | iOS stops polling when stopped; Android keeps polling every 900 ms | Keeps the link alive with a quiet poll every 900 ms, as Android does. On hardware the meter dropped a link left idle for ~46 s. |
| Stale flicker waveform | Shows it | On hardware the meter sometimes resends the previous capture's waveform (sample-for-sample identical), seen on the capture right after a 12.285 µs capture. The web UI detects this, captures again once, and flags it if it's still stale. |
| CIE 1931 chromaticity chart | Shown on Android; the iOS LM4 layout doesn't include it | Shown |
| Lux gauge | Decorative arc; its coloured layer means "connected" | The arc fills with lux on a log scale (10 lx to 50,000 lx) |
| Flicker frequency unit | Number only | Number with "Hz" |
| Risk-chart dot | Only a modulation of exactly 0 is moved onto the 0.1 % floor | Anything below 0.1 % sits on the floor, so the dot stays on the chart |
| Risk-chart boundaries | Bitmap background (0.0333·f and 0.08·f lines) | Drawn from the same lines. The verdict uses the app's classifier exactly (0.035·f / 0.08·f; 0.35 % / 0.8 % below 10 Hz; no risk from 2850 Hz). |
| Waveform time axis | Plots 25 µs per sample | Uses the capture's nominal period (26 µs for the default capture) |
| R9 help text | Repeats the Ra text | Explains R9 (saturated red) |
| Photometry display between runs | — | Same as the app: Start clears the display to `---` until the first reading arrives |

## Added (not in the app)

- **More readings:** the eight sensor channels as a chart, u′v′ (CIE 1976), DNG tint, battery, and raw counts. The raw counts include an extra word from the measurement frame that the app ignores. It tracks light level, so it is probably the sensor's near-infrared channel. Earlier third-party code labelled it temperature.
- **Flicker frequency spectrum (FFT)** with capture details, and the signal-quality warnings described above.
- **Reports:** CSV/JSON export and import, print/PDF, self-contained share links, and a light/dark theme.
- **Diagnostics:** a connection log with optional raw BLE frames. For each dropped link it records how long it was up, the last command and reply, and the flicker captures before the drop, then checks whether the meter is still advertising. There is also a "Force disconnect" helper.
