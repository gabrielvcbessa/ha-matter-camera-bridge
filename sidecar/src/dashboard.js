export function dashboardHtml(status) {
  const state = JSON.stringify(status).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stream to Matter Camera Bridge</title>
  <style>
    :root { color-scheme: dark; --bg: #0f1418; --panel: #171d22; --panel2: #20272d; --text: #edf3f7; --muted: #9eabb5; --line: #2e3942; --good: #5bd68a; --warn: #ffd166; --bad: #ff6b6b; --accent: #5cc8ff; }
    * { box-sizing: border-box; min-width: 0; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 22px 28px; border-bottom: 1px solid var(--line); background: #11171c; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; }
    h2 { margin: 0 0 14px; font-size: 16px; }
    main { padding: 24px 28px 40px; display: grid; gap: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .camera-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
    .panel, .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
    .card { min-height: 98px; }
    .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    .value { margin-top: 5px; font-size: 20px; font-weight: 650; overflow-wrap: anywhere; }
    .ok { color: var(--good); } .warn { color: var(--warn); } .bad { color: var(--bad); }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    button { border: 1px solid #3a4a55; background: #22313a; color: var(--text); border-radius: 7px; min-height: 36px; padding: 0 12px; font-weight: 650; cursor: pointer; }
    button.primary { background: #126782; border-color: #2097bd; }
    button.danger { background: #47252a; border-color: #8f3b45; }
    button:disabled { opacity: .55; cursor: default; }
    input { width: 100%; background: #11171c; color: var(--text); border: 1px solid #34414a; border-radius: 7px; min-height: 38px; padding: 8px 10px; }
    fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 0; }
    legend { color: var(--muted); padding: 0 6px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .camera { display: grid; gap: 12px; background: var(--panel2); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 12px; }
    .pill { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; color: var(--muted); font-size: 13px; }
    code { background: #0b1014; border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; overflow-wrap: anywhere; word-break: break-word; }
    pre { white-space: pre-wrap; overflow: auto; max-height: 260px; background: #0b1014; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .notice { border-left: 3px solid var(--warn); padding-left: 12px; color: #d7cda8; }
    .preview { display: grid; gap: 8px; }
    .preview img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #0b1014; border: 1px solid var(--line); border-radius: 8px; }
    .preview img[hidden] { display: none; }
    .preview-status { min-height: 18px; color: var(--muted); font-size: 13px; }
    .ptz-grid { display: grid; grid-template-columns: repeat(3, 44px); gap: 6px; align-items: center; justify-content: start; }
    .ptz-grid button { width: 44px; min-height: 38px; padding: 0; }
    .ptz-actions { display: grid; gap: 8px; grid-template-columns: auto 1fr; align-items: start; }
    .toggle { display: flex; gap: 8px; align-items: center; min-height: 38px; }
    .toggle input { width: auto; min-height: auto; }
    .event-list { display: grid; gap: 8px; }
    .event { display: grid; gap: 4px; background: #11171c; border: 1px solid var(--line); border-radius: 7px; padding: 10px; }
    .event-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12px; }
    .danger-zone { border-color: #8f3b45; background: #1d1719; }
    .danger-zone .notice { border-left-color: var(--bad); color: #f0c4c8; }
    .two { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(260px, 1fr); gap: 18px; }
    details.camera { padding: 0; overflow: hidden; }
    details.camera > summary { cursor: pointer; list-style: none; padding: 14px; }
    details.camera > summary::-webkit-details-marker { display: none; }
    details.camera > .camera-body { display: grid; gap: 12px; padding: 0 14px 14px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--bad); display: inline-block; }
    .status-dot.ok { background: var(--good); }
    .status-dot.warn { background: var(--warn); }
    @media (max-width: 820px) { header, main { padding-left: 16px; padding-right: 16px; } .two { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Stream to Matter Camera Bridge</h1>
      <div class="label">Matter camera bridge and RTSP/WHEP diagnostics</div>
    </div>
    <button class="primary" id="refresh">Refresh</button>
  </header>
  <main>
    <section class="grid" id="summary"></section>
    <section class="two">
      <div class="panel">
        <h2>Matter Pairing</h2>
        <div id="pairing"></div>
      </div>
      <div class="panel">
        <h2>Video Path</h2>
        <div id="video"></div>
      </div>
    </section>
    <section class="panel">
      <div class="row" style="justify-content:space-between">
        <h2>Cameras</h2>
        <div class="row">
          <button id="add">Add Camera</button>
          <button class="primary" id="save">Save Cameras</button>
        </div>
      </div>
      <p class="notice">Saving cameras updates the persisted add-on registry. Restart the add-on for new or removed cameras to become Matter endpoints.</p>
      <div id="cameras"></div>
      <div id="save-result" class="label"></div>
    </section>
    <section class="panel">
      <h2>Matter Activity</h2>
      <div id="matter-activity"></div>
    </section>
    <section class="panel">
      <h2>Raw Diagnostics</h2>
      <pre id="raw"></pre>
    </section>
    <section class="panel danger-zone">
      <h2>Danger Zone</h2>
      <div id="danger"></div>
    </section>
    <section class="panel">
      <h2>Recent Events</h2>
      <div id="events"></div>
    </section>
  </main>
  <script>
    let state = ${state};
    const el = id => document.getElementById(id);
    const clone = value => JSON.parse(JSON.stringify(value ?? null));
    let cameras = [];
    let cameraConfigLoaded = false;
    let openCameraIndex = 0;
    const text = value => value === null || value === undefined || value === "" ? "Not ready" : String(value);
    const cls = value => value ? "ok" : "bad";

    function render() {
      const c = state.commissioning ?? {};
      const cameraStatuses = state.cameras ?? [];
      const attachedCount = Object.values(c.cameraEndpoints ?? {}).filter(v => v.attached).length;
      const videoCount = cameraStatuses.filter(camera => camera.probe?.has_video).length;
      el("summary").innerHTML = [
        card("Bridge", state.bridgeHealth?.ok ? "Online" : "Offline", cls(state.bridgeHealth?.ok)),
        card("Matter Node", matterNodeLabel(c), matterNodeClass(c)),
        card("Camera Endpoints", attachedCount + " / " + cameraStatuses.length + " attached", attachedCount === cameraStatuses.length ? "ok" : "warn"),
        card("Video Sources", videoCount + " / " + cameraStatuses.length + " detected", videoCount === cameraStatuses.length ? "ok" : "warn"),
        card("WHEP Relay", state.mediaHealth?.ok ? "Online" : "Offline", cls(state.mediaHealth?.ok))
      ].join("");
      el("pairing").innerHTML = \`
        <p><span class="pill \${matterNodeClass(c)}">\${matterNodeLabel(c)}</span></p>
        <p>Manual code: <code>\${text(c.manualPairingCode)}</code></p>
        <p>QR payload: <code>\${text(c.qrPairingCode)}</code></p>
        \${c.qrCodeUrl ? '<p><a href="' + c.qrCodeUrl + '">Open QR Code</a></p>' : ""}
        <p class="label">Credential source: \${text(c.credentialSource)}</p>
        \${attestationNotice(c)}
        \${matterError(c.error ?? state.startupError)}\`;
      el("video").innerHTML = cameraStatuses.length ? '<div class="camera-grid">' + cameraStatuses.map(camera => \`
        <div class="camera">
          <div class="row" style="justify-content:space-between">
            <strong>\${camera.name}</strong>
            <span class="pill \${camera.probe?.ok ? "ok" : "bad"}">\${camera.probe?.ok ? "Video detected" : "No video yet"}</span>
          </div>
          <div class="label">\${camera.id}</div>
          <div class="row">
            <span class="pill">video: \${Boolean(camera.probe?.has_video)}</span>
            <span class="pill">audio: \${Boolean(camera.probe?.has_audio)}</span>
            <span class="pill">endpoint: \${camera.endpoint?.attached ? "attached" : "not attached"}</span>
          </div>
          <div class="preview">
            <div class="row">
              <button onclick='loadSnapshot(\${jsString(camera.id)})'>Load Snapshot</button>
              <span class="label">Fetches one frame and closes the stream.</span>
            </div>
            <div id="snapshot-status-\${safeId(camera.id)}" class="preview-status"></div>
            <img id="snapshot-\${safeId(camera.id)}" alt="\${escapeHtml(camera.name)} preview" hidden>
          </div>
          \${ptzSupportPanel(camera.id)}
          \${probeDetails(camera.probe)}
        </div>\`).join("") + '</div>' : "<p>No cameras configured.</p>";
      renderCameras();
      renderMatterActivity();
      el("raw").textContent = JSON.stringify(state, null, 2);
      renderDangerZone();
      el("events").innerHTML = renderEvents(state.events ?? []);
    }

    function card(label, value, klass) {
      return \`<div class="card"><div class="label">\${label}</div><div class="value \${klass}">\${value}</div></div>\`;
    }

    function matterNodeLabel(commissioning) {
      if (!commissioning?.started) return "Not started";
      if (commissioning.commissioned || Number(commissioning.commissionedFabrics ?? 0) > 0) return "Commissioned";
      if (commissioning.pairable) return "Commissionable";
      return "Started";
    }

    function matterNodeClass(commissioning) {
      if (!commissioning?.started) return "bad";
      if (commissioning.commissioned || Number(commissioning.commissionedFabrics ?? 0) > 0) return "ok";
      if (commissioning.pairable) return "warn";
      return "ok";
    }

    function renderEvents(events) {
      if (!events.length) return '<p class="label">No events captured yet.</p>';
      return '<div class="event-list">' + events.slice().reverse().map(event => {
        const detail = { ...event };
        delete detail.ts;
        delete detail.level;
        delete detail.scope;
        delete detail.event;
        return \`
          <div class="event">
            <div class="event-meta">
              <span class="pill \${event.level === "error" ? "bad" : event.level === "warn" ? "warn" : ""}">\${escapeHtml(event.level)}</span>
              <strong>\${escapeHtml(event.scope)}.\${escapeHtml(event.event)}</strong>
              <span>\${escapeHtml(event.ts)}</span>
            </div>
            <code>\${escapeHtml(JSON.stringify(detail))}</code>
          </div>\`;
      }).join("") + '</div>';
    }

    function renderMatterActivity() {
      const activity = state.matterActivity ?? {};
      const activityCameras = activity.cameras ?? [];
      if (!activityCameras.length) {
        el("matter-activity").innerHTML = '<p class="label">No Matter camera endpoints available yet.</p>';
        return;
      }
      el("matter-activity").innerHTML = \`
        <p class="label">Active WebRTC sessions: \${activity.activeWebRtcSessionCount ?? 0}</p>
        <div class="camera-grid">
          \${activityCameras.map(camera => \`
            <div class="camera">
              <div class="row" style="justify-content:space-between">
                <strong>\${escapeHtml(camera.id)}</strong>
                <span class="pill \${camera.totalCommands ? "ok" : ""}">\${camera.totalCommands} Matter commands</span>
              </div>
              <p class="label">Last Matter command: \${escapeHtml(camera.lastSeen ?? "never")}</p>
              \${renderMatterCommands(camera.commands ?? [])}
            </div>\`).join("")}
        </div>\`;
    }

    function renderMatterCommands(commands) {
      if (!commands.length) return '<p class="label">No camera cluster commands observed.</p>';
      return '<div class="event-list">' + commands.map(command => \`
        <div class="event">
          <div class="event-meta">
            <strong>\${escapeHtml(command.cluster)}.\${escapeHtml(command.command)}</strong>
            <span class="pill">\${command.count}x</span>
            <span>\${escapeHtml(command.lastSeen ?? "")}</span>
          </div>
          <code>\${escapeHtml(JSON.stringify(command.lastFields ?? {}))}</code>
        </div>\`).join("") + '</div>';
    }

    function matterError(error) {
      if (!error) return "";
      return '<div class="bad">' + escapeHtml(deepErrorMessage(error)) + '</div>';
    }

    function attestationNotice(commissioning) {
      const source = String(commissioning?.credentialSource ?? "").toLowerCase();
      const isDevelopment = source !== "" && source !== "production";
      if (!isDevelopment) return "";
      return '<div class="notice">Home Assistant Matter Server must enable <code>enable_test_net_dcl</code> because this bridge uses matter.js development attestation. Without it, pairing reaches the device and then fails during attestation.</div>';
    }

    function deepErrorMessage(error) {
      const messages = [];
      let cursor = error;
      while (cursor) {
        if (cursor.message) messages.push(cursor.message);
        cursor = cursor.cause;
      }
      for (const item of error.errors ?? []) {
        const nested = deepErrorMessage(item);
        if (nested) messages.push(nested);
      }
      return [...new Set(messages)].join(" / ") || JSON.stringify(error);
    }

    function renderDangerZone() {
      const reset = state.matterReset;
      el("danger").innerHTML = \`
        \${reset?.pending ? '<p class="notice"><strong>Matter identity reset is pending.</strong> Restart the add-on to clear Matter storage and generate new pairing credentials.</p>' : ""}
        <p class="notice">Reset Matter Identity clears the local Matter fabric/state on next restart and rotates the generated pairing credentials. Existing Matter controllers will lose this device and you will need to pair it again.</p>
        <div class="form-grid">
          <label><span class="label">Type RESET MATTER to enable</span><input id="reset-confirmation" placeholder="RESET MATTER"></label>
        </div>
        <div class="row">
          <button class="danger" id="reset-matter">Reset Matter Identity</button>
          <span id="reset-result" class="label"></span>
        </div>\`;
      el("reset-matter").onclick = resetMatterIdentity;
    }

    function renderCameras() {
      const statusById = new Map((state.cameras ?? []).map(camera => [camera.id, camera]));
      el("cameras").innerHTML = cameras.map((camera, index) => {
        const status = statusById.get(camera.id);
        const dotClass = status?.endpoint?.attached ? (status?.probe?.ok ? "ok" : "warn") : "";
        const summary = status
          ? [status.probe?.ok ? "video detected" : "no video", status.endpoint?.attached ? "Matter attached" : "Matter pending restart"].join(" · ")
          : "saved after restart";
        return \`
        <details class="camera" \${index === openCameraIndex ? "open" : ""}>
          <summary class="row" style="justify-content:space-between">
            <span class="row"><span class="status-dot \${dotClass}"></span><strong>\${escapeHtml(camera.name || "Camera " + (index + 1))}</strong><span class="label">\${escapeHtml(camera.id || "new_camera")}</span></span>
            <span class="row"><span class="pill">\${escapeHtml(summary)}</span><button class="danger" onclick="event.preventDefault(); removeCamera(\${index});">Remove</button></span>
          </summary>
          <div class="camera-body">
          <div class="form-grid">
            \${input(index, "id", "Camera ID", camera.id)}
            \${input(index, "name", "Display Name", camera.name)}
            \${input(index, "rtsp_url", "RTSP URL used for video probe and snapshots", camera.rtsp_url, "rtsp://user:password@camera-ip:554/av_stream/ch0")}
            \${input(index, "media_source", "Advanced: WHEP media source override", "", camera.media_source_set ? "Leave blank to keep " + camera.media_source_redacted : "Leave blank to use RTSP URL")}
          </div>
          \${rtspGuidance(camera)}
          <fieldset>
            <legend>ONVIF</legend>
            <div class="form-grid">
              \${input(index, "onvif.host", "Host", camera.onvif?.host)}
              \${input(index, "onvif.port", "Port", camera.onvif?.port ?? 80)}
              \${input(index, "onvif.user", "User", camera.onvif?.user)}
              \${input(index, "onvif.password", "Password", "", camera.onvif?.password_set ? "Leave blank to keep existing password" : "")}
            </div>
          </fieldset>
          <fieldset>
            <legend>Matter Capabilities</legend>
            <div class="form-grid">
              \${checkbox(index, "matter.advertise_ptz", "Advertise mechanical PTZ to Matter controllers", camera.matter?.advertise_ptz !== false)}
              \${checkbox(index, "matter.advertise_audio", "Advertise audio stream support", camera.matter?.advertise_audio !== false)}
            </div>
          </fieldset>
          \${ptzTestPanel(camera, status)}
          </div>
        </details>\`;
      }).join("");
    }

    function input(index, path, label, value = "", placeholder = "") {
      return \`<label><span class="label">\${label}</span><input data-index="\${index}" data-path="\${path}" value="\${escapeHtml(value)}" placeholder="\${escapeHtml(placeholder)}"></label>\`;
    }

    function checkbox(index, path, label, checked = false) {
      return \`<label class="toggle"><input type="checkbox" data-index="\${index}" data-path="\${path}" data-type="boolean" \${checked ? "checked" : ""}><span>\${escapeHtml(label)}</span></label>\`;
    }

    function ptzSupportPanel(cameraId) {
      const config = cameras.find(camera => camera.id === cameraId);
      const endpoint = state.commissioning?.cameraEndpoints?.[cameraId];
      const ptzAdvertised = config?.matter?.advertise_ptz !== false;
      const observed = matterPtzObserved(cameraId);
      return \`
        <div class="notice">
          <strong>PTZ path:</strong>
          ONVIF moves the camera; Matter advertises mechanical PTZ \${ptzAdvertised ? "for this camera" : "only when enabled below"}; each controller decides whether to show those controls.
          \${ptzAdvertised && endpoint?.attached && !observed ? "No Matter PTZ command has been observed from a controller yet." : ""}
          \${observed ? "Matter PTZ commands have been observed for this camera." : ""}
        </div>\`;
    }

    function ptzTestPanel(camera, status) {
      const cameraId = camera.id;
      const enabled = Boolean(cameraId);
      const matterPtz = camera.matter?.advertise_ptz !== false;
      const observed = matterPtzObserved(cameraId);
      return \`
        <fieldset>
          <legend>PTZ Test</legend>
          <div class="ptz-actions">
            <div class="ptz-grid">
              \${ptzButton(cameraId, "up-left", "UL", enabled)}\${ptzButton(cameraId, "up", "U", enabled)}\${ptzButton(cameraId, "up-right", "UR", enabled)}
              \${ptzButton(cameraId, "left", "L", enabled)}<button type="button" onclick='checkPtz(\${jsString(cameraId)})' \${enabled ? "" : "disabled"}>OK</button>\${ptzButton(cameraId, "right", "R", enabled)}
              \${ptzButton(cameraId, "down-left", "DL", enabled)}\${ptzButton(cameraId, "down", "D", enabled)}\${ptzButton(cameraId, "down-right", "DR", enabled)}
            </div>
            <div>
              <div class="row">
                \${ptzButton(cameraId, "zoom-in", "Zoom +", enabled)}
                \${ptzButton(cameraId, "zoom-out", "Zoom -", enabled)}
              </div>
              <p class="label">Center dot checks ONVIF PTZ status. Arrows send a short move and stop.</p>
              <p class="label">Matter PTZ advertised: \${matterPtz ? "yes" : "no"} · Matter PTZ command observed: \${observed ? "yes" : "no"} · Matter endpoint: \${status?.endpoint?.attached ? "attached" : "pending restart"}</p>
              <div id="ptz-status-\${safeId(cameraId)}" class="preview-status"></div>
            </div>
          </div>
          <p class="notice">Some Matter controllers may show the camera but not expose Matter camera PTZ controls yet. Use this test to separate ONVIF movement failures from controller UI support.</p>
        </fieldset>\`;
    }

    function ptzButton(cameraId, direction, label, enabled) {
      return \`<button type="button" onclick='movePtz(\${jsString(cameraId)}, \${jsString(direction)})' \${enabled ? "" : "disabled"}>\${escapeHtml(label)}</button>\`;
    }

    function rtspGuidance(camera) {
      if (!camera.rtsp_url) return "";
      const urlProblem = rtspUrlProblem(camera.rtsp_url);
      if (urlProblem) return '<p class="notice">' + escapeHtml(urlProblem) + '</p>';
      if (hasRtspCredentials(camera.rtsp_url)) return "";
      if (!camera.onvif?.password_set) return "";
      return '<p class="notice">This RTSP URL has no username/password. If the probe is offline, use the credentialed camera stream URL here, for example <code>rtsp://user:password@camera-ip:554/av_stream/ch0</code>.</p>';
    }

    function rtspUrlProblem(value) {
      if (String(value ?? "").includes("#")) {
        return "Use the plain camera RTSP URL here. Remove Frigate/go2rtc suffixes like #tcp#video=copy#audio=copy.";
      }
      try {
        const url = new URL(value);
        if (url.protocol !== "rtsp:") return "RTSP URL must start with rtsp://.";
        return "";
      } catch {
        return "RTSP URL must start with rtsp://, for example rtsp://user:password@camera-ip:554/av_stream/ch0.";
      }
    }

    function hasRtspCredentials(value) {
      try {
        const url = new URL(value);
        return url.protocol === "rtsp:" && Boolean(url.username || url.password);
      } catch {
        return false;
      }
    }

    function matterPtzObserved(cameraId) {
      const camera = (state.matterActivity?.cameras ?? []).find(item => item.id === cameraId);
      return Boolean((camera?.commands ?? []).some(command =>
        command.cluster === "CameraAvSettingsUserLevelManagement" &&
        String(command.command ?? "").startsWith("mptz")
      ));
    }

    function probeDetails(probe) {
      if (!probe) return "";
      const errors = [];
      const notes = [];
      if (probe.error) errors.push("Probe: " + probe.error);
      if (probe.primary?.error) {
        const message = probe.ok
          ? "Configured RTSP failed, but ONVIF fallback found a working stream: " + probe.primary.error
          : "Configured RTSP failed: " + probe.primary.error;
        (probe.ok ? notes : errors).push(message);
      }
      if (probe.fallback?.error && !probe.ok) errors.push("ONVIF fallback failed: " + probe.fallback.error);
      if (probe.effective_uri) notes.push("Using effective stream: " + probe.effective_uri);
      const html = [];
      if (errors.length) html.push('<div class="bad">' + errors.map(escapeHtml).join("<br>") + '</div>');
      if (notes.length) html.push('<div class="notice">' + notes.map(escapeHtml).join("<br>") + '</div>');
      return html.join("");
    }

    function collect() {
      const next = clone(cameras);
      document.querySelectorAll("input[data-index]").forEach(input => {
        const target = next[Number(input.dataset.index)];
        const parts = input.dataset.path.split(".");
        let cursor = target;
        while (parts.length > 1) {
          const key = parts.shift();
          cursor[key] = cursor[key] ?? {};
          cursor = cursor[key];
        }
        cursor[parts[0]] = input.dataset.type === "boolean" ? input.checked : input.value;
      });
      return next;
    }

    window.removeCamera = index => {
      cameras.splice(index, 1);
      openCameraIndex = Math.max(0, Math.min(openCameraIndex, cameras.length - 1));
      renderCameras();
    };
    window.loadSnapshot = async cameraId => {
      const image = el("snapshot-" + safeId(cameraId));
      const status = el("snapshot-status-" + safeId(cameraId));
      status.textContent = "Loading a fresh camera frame...";
      image.hidden = true;
      try {
        const response = await fetch("/api/cameras/" + encodeURIComponent(cameraId) + "/snapshot.jpg?t=" + Date.now());
        if (!response.ok) {
          const payload = await response.json().catch(async () => ({ error: await response.text() }));
          throw new Error(snapshotError(payload));
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("image/")) throw new Error("Snapshot response was not an image.");
        const blob = await response.blob();
        const previous = image.dataset.objectUrl;
        if (previous) URL.revokeObjectURL(previous);
        const objectUrl = URL.createObjectURL(blob);
        await loadImage(image, objectUrl);
        image.dataset.objectUrl = objectUrl;
        status.textContent = "Snapshot loaded.";
      } catch (error) {
        const previous = image.dataset.objectUrl;
        if (previous) URL.revokeObjectURL(previous);
        delete image.dataset.objectUrl;
        image.removeAttribute("src");
        image.hidden = true;
        status.textContent = "Snapshot failed: " + error.message;
      }
    };
    window.checkPtz = async cameraId => {
      const status = el("ptz-status-" + safeId(cameraId));
      status.textContent = "Checking ONVIF PTZ status...";
      try {
        const response = await fetch("/api/cameras/" + encodeURIComponent(cameraId) + "/ptz/status?t=" + Date.now());
        const payload = await response.json();
        if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "PTZ status failed");
        status.textContent = "ONVIF PTZ status reachable.";
      } catch (error) {
        status.textContent = "ONVIF PTZ status failed: " + error.message;
      }
    };
    window.movePtz = async (cameraId, direction) => {
      const status = el("ptz-status-" + safeId(cameraId));
      status.textContent = "Moving " + direction + "...";
      try {
        const response = await fetch("/camera/" + encodeURIComponent(cameraId) + "/ptz/" + encodeURIComponent(direction) + "?speed=0.25&stopAfterMs=200", { method: "POST" });
        const payload = await response.json();
        if (!response.ok || payload.ok === false) throw new Error(payload.error ?? deepErrorMessage(payload.payload ?? payload));
        status.textContent = "PTZ " + direction + " succeeded.";
        await refreshStatus();
      } catch (error) {
        status.textContent = "PTZ " + direction + " failed: " + error.message;
      }
    };
    el("add").onclick = () => {
      openCameraIndex = cameras.length;
      cameras.push({ id: "camera_" + (cameras.length + 1), name: "Camera " + (cameras.length + 1), rtsp_url: "", media_source: "", onvif: { host: "", port: 80, user: "", password_set: false }, matter: { advertise_ptz: true, advertise_audio: true } });
      renderCameras();
    };
    el("save").onclick = async () => {
      if (!cameraConfigLoaded) {
        el("save-result").textContent = "Camera config is still loading. Try again in a moment.";
        return;
      }
      el("save-result").textContent = "Saving...";
      const response = await fetch("/api/cameras", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cameras: collect() }) });
      const payload = await response.json();
      if (!response.ok) {
        el("save-result").textContent = payload.error ?? "Save failed";
        return;
      }
      cameras = clone(payload.cameras ?? []);
      el("save-result").textContent = "Saved. Reloading bridge diagnostics...";
      await refreshStatus();
      el("save-result").textContent = payload.bridgeReload?.ok
        ? "Saved. Diagnostics refreshed. Restart the add-on only after adding or removing cameras."
        : "Saved, but bridge reload failed. Restart the add-on to apply the camera settings.";
      renderCameras();
    };
    async function resetMatterIdentity() {
      el("reset-result").textContent = "Scheduling reset...";
      const confirmation = el("reset-confirmation").value;
      const response = await fetch("/matter/reset-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation })
      });
      const payload = await response.json();
      if (!response.ok) {
        el("reset-result").textContent = payload.error ?? "Reset was not scheduled.";
        return;
      }
      el("reset-result").textContent = "Scheduled. Restart the add-on now.";
      await refreshStatus();
    }
    async function refreshCameraConfig() {
      const response = await fetch("/api/cameras");
      if (!response.ok) throw new Error("Camera config request failed.");
      const payload = await response.json();
      cameras = clone(payload.cameras ?? cameras);
      state.cameraConfig = payload;
      cameraConfigLoaded = true;
      if (el("save-result")) el("save-result").textContent = "";
    }
    async function refreshStatus() {
      const response = await fetch("/api/status");
      state = await response.json();
      await refreshCameraConfig();
      render();
    }
    el("refresh").onclick = refreshStatus;
    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
    }
    function jsString(value) {
      return JSON.stringify(String(value ?? ""));
    }
    function safeId(value) {
      return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
    }
    function loadImage(image, objectUrl) {
      return new Promise((resolve, reject) => {
        image.onload = () => {
          image.hidden = false;
          resolve();
        };
        image.onerror = () => reject(new Error("Browser could not decode the snapshot image."));
        image.src = objectUrl;
      });
    }
    function snapshotError(payload) {
      const inner = payload?.payload;
      if (inner?.error) return inner.error;
      if (inner?.raw) {
        try {
          const parsed = JSON.parse(inner.raw);
          if (parsed.error) return parsed.error;
        } catch {}
        return inner.raw;
      }
      return payload?.error ?? "Snapshot request failed";
    }
    try {
      render();
      refreshCameraConfig().then(render).catch(error => {
        el("save-result").textContent = "Camera config load failed: " + error.message;
      });
    } catch (error) {
      el("summary").innerHTML = card("Dashboard", "Render failed", "bad");
      el("pairing").innerHTML = '<div class="bad">' + escapeHtml(error.message) + '</div>';
      el("raw").textContent = JSON.stringify(state, null, 2);
    }
  </script>
</body>
</html>`;
}
