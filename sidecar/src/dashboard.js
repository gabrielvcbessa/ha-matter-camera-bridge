export function dashboardHtml(status) {
  const state = JSON.stringify(status).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stream to Matter Camera Bridge</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232563eb'/%3E%3Cpath d='M17 24h23a8 8 0 0 1 8 8v8a8 8 0 0 1-8 8H17a8 8 0 0 1-8-8v-8a8 8 0 0 1 8-8Zm31 5 8-5v24l-8-5Z' fill='white'/%3E%3Ccircle cx='25' cy='36' r='7' fill='%23e8f1ff'/%3E%3Ccircle cx='25' cy='36' r='3' fill='%232563eb'/%3E%3C/svg%3E">
  <style>
    :root { color-scheme: light; --bg: #f4f7fb; --panel: #ffffff; --panel2: #f8fafc; --text: #17212b; --muted: #667085; --line: #d8e0ea; --good: #16a34a; --warn: #d97706; --bad: #dc2626; --accent: #2563eb; --accent-soft: #e8f1ff; }
    * { box-sizing: border-box; min-width: 0; }
    html, body { width: 100%; max-width: 100%; overflow-x: hidden; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 20px 28px; border-bottom: 1px solid var(--line); background: var(--panel); box-shadow: 0 1px 8px rgba(16, 24, 40, .05); }
    .header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .runtime-badge { border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; background: var(--panel2); color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; }
    .runtime-details { position: relative; }
    .runtime-details summary { cursor: pointer; list-style: none; border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; background: var(--panel2); color: var(--muted); font-size: 12px; font-weight: 700; }
    .runtime-details summary::-webkit-details-marker { display: none; }
    .runtime-details[open] .runtime-popover { position: absolute; right: 0; top: calc(100% + 8px); z-index: 5; min-width: 260px; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; background: var(--panel); box-shadow: 0 12px 32px rgba(15, 23, 42, .12); }
    h1 { margin: 0; font-size: 22px; font-weight: 700; }
    h2 { margin: 0; font-size: 16px; }
    main { padding: 24px 28px 40px; display: grid; gap: 18px; }
    .workspace { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 18px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .status-strip { display: grid; grid-template-columns: repeat(4, minmax(112px, 1fr)); gap: 10px; align-items: stretch; }
    .status-item { min-height: 82px; }
    .status-item .value { overflow-wrap: normal; word-break: normal; }
    .status-context { margin-top: 10px; }
    .camera-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
    .camera-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
    .camera-tab { display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--line); background: var(--panel2); color: var(--muted); border-radius: 999px; min-height: 36px; padding: 0 13px; }
    .camera-tab.active { background: var(--accent-soft); border-color: #bfdbfe; color: var(--accent); box-shadow: inset 0 0 0 1px #bfdbfe; }
    .camera-tab-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .camera-tab .status-dot { width: 8px; height: 8px; }
    .panel, .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; box-shadow: 0 1px 2px rgba(16, 24, 40, .04); }
    .card { min-height: 98px; }
    .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    .value { margin-top: 5px; font-size: 20px; font-weight: 650; overflow-wrap: anywhere; }
    .ok { color: var(--good); } .warn { color: var(--warn); } .bad { color: var(--bad); }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
    .stack { display: grid; gap: 12px; }
    .hint { color: var(--muted); font-size: 13px; line-height: 1.45; }
    .field-help { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; text-transform: none; letter-spacing: 0; }
    .section-title { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 12px; }
    .button-group { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .sr-only { position: absolute; left: 0; top: 0; width: 1px; max-width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    .repair-actions { margin-top: 10px; }
    button { border: 1px solid #cbd5e1; background: #ffffff; color: var(--text); border-radius: 7px; min-height: 36px; padding: 0 12px; font-weight: 650; cursor: pointer; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
    button.danger { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
    button:disabled { opacity: .55; cursor: default; }
    button.primary:disabled { background: #e2e8f0; border-color: #cbd5e1; color: var(--muted); opacity: 1; }
    button:focus-visible, summary:focus-visible, input:focus-visible, .camera-tab:focus-visible { outline: 3px solid rgba(37, 99, 235, .3); outline-offset: 2px; }
    .icon-button { display: inline-flex; align-items: center; gap: 8px; }
    .icon { display: inline-block; width: 0; height: 0; flex: 0 0 auto; }
    .icon.play { border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid currentColor; }
    .icon.stop { width: 10px; height: 10px; background: currentColor; border-radius: 2px; }
    input { width: 100%; background: #ffffff; color: var(--text); border: 1px solid #cbd5e1; border-radius: 7px; min-height: 38px; padding: 8px 10px; }
    input[readonly] { background: #ffffff; }
    input.invalid { border-color: var(--bad); background: #fff7f7; box-shadow: 0 0 0 2px rgba(220, 38, 38, .08); }
    input.autofill-ghost { color: transparent; -webkit-text-fill-color: transparent; }
    input.autofill-ghost:focus { color: var(--text); -webkit-text-fill-color: var(--text); }
    input.invalid:-webkit-autofill { -webkit-text-fill-color: transparent !important; caret-color: var(--text); box-shadow: 0 0 0 1000px #fff7f7 inset, 0 0 0 2px rgba(220, 38, 38, .08); }
    .field-error { margin: 6px 0 0; color: var(--bad); font-size: 12px; line-height: 1.35; }
    fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 0; }
    legend { color: var(--muted); padding: 0 6px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .camera { display: grid; gap: 12px; background: var(--panel2); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 12px; }
    .camera-live { align-content: start; padding: 0; overflow: hidden; }
    .live-header { display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; padding: 14px; border-bottom: 1px solid var(--line); background: #ffffff; }
    .live-workspace { display: grid; grid-template-columns: minmax(420px, 1fr) minmax(248px, 320px); gap: 14px; padding: 14px; align-items: stretch; }
    .live-preview-column, .live-control-column { display: grid; gap: 12px; align-content: start; }
    .live-control-column .ptz-actions { grid-template-columns: 1fr; }
    .live-control-column .ptz-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .live-control-column .row button { flex: 1 1 0; }
    .camera-header { display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
    .camera-title { display: grid; gap: 4px; }
    .pill { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; color: var(--muted); font-size: 13px; }
    .pill.ok { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
    .pill.warn { border-color: #fed7aa; background: #fff7ed; color: #c2410c; }
    .pill.bad { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
    code { background: #f8fafc; border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; overflow-wrap: anywhere; word-break: break-word; }
    pre { white-space: pre-wrap; overflow: auto; max-height: 260px; background: #f8fafc; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .notice { border-left: 3px solid var(--warn); padding-left: 12px; color: #71440d; overflow-wrap: anywhere; }
    .message { border-radius: 8px; padding: 10px 12px; line-height: 1.4; overflow-wrap: anywhere; }
    .message.bad { border: 1px solid #fecaca; background: #fff7f7; color: #991b1b; }
    .message.notice { border: 1px solid #fed7aa; border-left: 3px solid var(--warn); background: #fffbeb; }
    .message p { margin: 0; }
    .message p + p { margin-top: 6px; }
    .delete-confirmation { display: grid; gap: 10px; }
    .staged-removals { display: grid; gap: 10px; margin-bottom: 12px; }
    .removal-list { display: grid; gap: 8px; }
    .removal-item { display: flex; gap: 10px; justify-content: space-between; align-items: center; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: #ffffff; }
    .removal-item strong { overflow-wrap: anywhere; }
    .preview { display: grid; gap: 8px; }
    .preview-frame { display: grid; position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--panel2); }
    .preview-frame > img, .preview-frame > video { grid-area: 1 / 1; }
    .preview-mode { grid-area: 1 / 1; z-index: 2; align-self: start; justify-self: start; margin: 10px; border: 1px solid rgba(226,232,240,.24); border-radius: 999px; padding: 4px 9px; background: rgba(15,23,42,.76); color: #e2e8f0; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .preview-mode.live { border-color: #bbf7d0; color: #15803d; }
    .preview-mode.refresh { border-color: #fed7aa; color: #c2410c; }
    .preview-mode.error { border-color: #fecaca; color: #b91c1c; }
    .preview-placeholder { grid-area: 1 / 1; display: grid; place-items: center; width: 100%; min-height: 280px; aspect-ratio: 16 / 9; background: #f8fafc; color: var(--muted); text-align: center; padding: 18px; line-height: 1.4; overflow-wrap: anywhere; }
    .preview-placeholder[hidden] { display: none; }
    .preview img { display: block; width: 100%; min-height: 280px; aspect-ratio: 16 / 9; object-fit: cover; background: #020617; }
    .preview img[hidden] { display: none; }
    .preview video { display: block; width: 100%; min-height: 280px; aspect-ratio: 16 / 9; object-fit: cover; background: #020617; }
    .preview video[hidden] { display: none; }
    .preview-status { min-height: 18px; color: var(--muted); font-size: 13px; }
    .preview-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: space-between; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; background: #ffffff; }
    .preview-actions .button-group { flex: 0 1 auto; }
    .diagnostic-tools { border: 1px solid var(--line); border-radius: 8px; background: #ffffff; padding: 10px 12px; }
    .diagnostic-tools summary { cursor: pointer; font-weight: 650; }
    .diagnostic-tools .button-group { margin-top: 10px; }
    .ptz-grid { display: grid; grid-template-columns: repeat(3, minmax(64px, 82px)); gap: 6px; align-items: center; justify-content: start; }
    .ptz-grid button { width: 100%; min-height: 40px; padding: 0 8px; font-size: 18px; line-height: 1; }
    .ptz-grid .ptz-check { font-size: 13px; }
    .ptz-zoom button { flex: 1 1 0; }
    .ptz-actions { display: grid; gap: 8px; grid-template-columns: auto 1fr; align-items: start; }
    .toggle { display: flex; gap: 8px; align-items: center; min-height: 38px; }
    .toggle input { width: auto; min-height: auto; }
    .event-list { display: grid; gap: 8px; }
    .event { display: grid; gap: 4px; background: #ffffff; border: 1px solid var(--line); border-radius: 7px; padding: 10px; }
    .event-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12px; }
    .event-meta strong { overflow-wrap: anywhere; word-break: break-word; }
    .danger-zone { border-color: #fecdd3; background: #fff7f8; }
    .danger-zone .notice { border-left-color: var(--bad); color: #9f1239; }
    .two { display: grid; grid-template-columns: 1fr; gap: 18px; align-items: start; }
    .live-panel { min-width: 0; }
    .toast { position: fixed; z-index: 20; right: 18px; bottom: 18px; max-width: min(420px, calc(100vw - 36px)); border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--text); box-shadow: 0 14px 38px rgba(15, 23, 42, .18); padding: 12px 14px; line-height: 1.4; }
    .toast[hidden] { display: none; }
    .toast.ok { border-color: #bbf7d0; background: #f0fdf4; }
    .toast.warn { border-color: #fed7aa; background: #fffbeb; }
    .toast.bad { border-color: #fecaca; background: #fff7f7; }
    .camera-dialog { width: min(980px, calc(100vw - 28px)); max-height: min(860px, calc(100vh - 28px)); border: 1px solid var(--line); border-radius: 10px; padding: 0; background: var(--panel); color: var(--text); box-shadow: 0 24px 64px rgba(15, 23, 42, .28); overflow: hidden; }
    .camera-dialog[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
    .camera-dialog::backdrop { background: rgba(15, 23, 42, .45); }
    .dialog-header, .dialog-footer { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 14px 16px; border-bottom: 1px solid var(--line); }
    .dialog-header { background: var(--panel); }
    .dialog-footer { border-top: 1px solid var(--line); border-bottom: 0; background: var(--panel); }
    .dialog-footer .button-group:last-child { margin-left: auto; }
    .dialog-body { padding: 16px; overflow: auto; }
    .dialog-body .camera { margin-bottom: 0; }
    .dialog-body .camera > summary { display: none; }
    .empty-state { border: 1px dashed var(--line); border-radius: 8px; padding: 18px; background: var(--panel2); color: var(--muted); }
    .change-bar { display: none; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border: 1px solid #fed7aa; border-left: 3px solid var(--warn); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; background: #fffbeb; color: #71440d; }
    .change-bar.active { display: flex; }
    .change-bar .button-group { margin-left: auto; }
    .save-state { min-height: 18px; color: var(--muted); font-size: 13px; }
    .save-state.warn, .save-state.bad { border-radius: 8px; padding: 10px 12px; margin-top: 10px; line-height: 1.4; }
    .save-state.warn { border: 1px solid #fed7aa; border-left: 3px solid var(--warn); background: #fffbeb; color: #71440d; }
    .save-state.bad { border: 1px solid #fecaca; border-left: 3px solid var(--bad); background: #fff7f7; color: #991b1b; }
    .health-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .camera-action-strip { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; background: #ffffff; }
    .camera-action-strip .hint { flex: 1 1 260px; }
    .required-dot { color: var(--bad); }
    .pairing-layout { display: grid; gap: 14px; align-items: start; }
    .pairing-primary { display: grid; gap: 12px; justify-items: center; text-align: center; padding: 4px 0; width: 100%; margin: 0 auto; }
    .pairing-compact { display: grid; gap: 10px; }
    .pairing-compact .message { padding: 8px 10px; }
    .pairing-copy { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 0; width: min(440px, 100%); }
    .copy-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; text-align: left; }
    .copy-row code { min-height: 36px; display: flex; align-items: center; justify-content: center; text-align: center; }
    .copy-status { min-height: 18px; color: var(--muted); font-size: 13px; }
    .qr-card { display: grid; gap: 8px; justify-items: center; min-width: 0; width: 100%; }
    .qr-card img { box-sizing: border-box; width: min(260px, 100%); height: auto; aspect-ratio: 1 / 1; border: 1px solid var(--line); border-radius: 8px; background: white; padding: 10px; }
    .qr-card .label { text-align: center; max-width: 280px; }
    .pair-code { font-size: 20px; font-weight: 700; letter-spacing: .02em; }
    .setup-focus { display: none; }
    .setup-focus.active { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    .setup-focus .hint { flex: 1 1 320px; }
    .advanced-block { border: 1px dashed var(--line); border-radius: 8px; padding: 12px; background: #ffffff; }
    .advanced-block > summary { cursor: pointer; font-weight: 650; color: var(--muted); }
    details.panel > summary { cursor: pointer; list-style: none; font-weight: 700; }
    details.panel > summary::-webkit-details-marker { display: none; }
    .diagnostics-grid { display: grid; gap: 12px; margin-top: 14px; }
    .diagnostics-grid details { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--panel2); }
    .diagnostics-grid details > summary { cursor: pointer; font-weight: 700; }
    details.camera { padding: 0; overflow: hidden; }
    details.camera > summary { cursor: pointer; list-style: none; padding: 14px; }
    details.camera > summary::-webkit-details-marker { display: none; }
    details.camera > .camera-body { display: grid; gap: 12px; padding: 0 14px 14px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--bad); display: inline-block; }
    .status-dot.ok { background: var(--good); }
    .status-dot.warn { background: var(--warn); }
    @media (max-width: 820px) {
      header, main { padding-left: 16px; padding-right: 16px; }
      .workspace { grid-template-columns: 1fr; }
      .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .live-workspace { grid-template-columns: 1fr; }
      .pairing-layout { grid-template-columns: 1fr; }
      .pairing-copy { grid-template-columns: 1fr; }
      .qr-card img { width: min(260px, 100%); height: auto; aspect-ratio: 1 / 1; }
    }
    @media (max-width: 700px) {
      #summary.grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      #summary .card { min-height: 54px; padding: 8px 10px; }
      #summary .label { font-size: 10px; line-height: 1.1; }
      #summary .value { margin-top: 3px; font-size: 16px; line-height: 1.15; }
      .pairing-primary { padding: 12px; }
      .qr-card img { width: min(240px, 100%); }
    }
    @media (max-width: 520px) {
      header { align-items: flex-start; flex-direction: column; padding: 14px 16px; gap: 12px; }
      h1 { font-size: 20px; line-height: 1.2; }
      .header-actions { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
      .runtime-badge { flex: 1 1 auto; text-align: center; white-space: normal; overflow-wrap: anywhere; }
      .runtime-details { width: auto; min-width: 0; }
      .runtime-details[open] { grid-column: 1 / -1; }
      .runtime-details summary { text-align: center; }
      .runtime-details[open] .runtime-popover { position: static; width: 100%; min-width: 0; margin-top: 8px; overflow-wrap: anywhere; }
      header .primary { width: auto; min-width: 104px; }
      main { padding: 12px 12px calc(24px + env(safe-area-inset-bottom)); gap: 12px; }
      .panel, .card { padding: 12px; }
      main, .panel, .card, .camera, .workspace, .two, .live-workspace, .pairing-layout { min-width: 0; max-width: 100%; }
      button { min-height: 42px; }
      input { min-height: 44px; font-size: 16px; }
      .preview-actions button, .camera-action-strip .button-group button { width: 100%; }
      .message, .hint, .notice { overflow-wrap: anywhere; word-break: normal; }
      .preview-actions, .preview-actions .button-group, .camera-action-strip .button-group { width: 100%; }
      .preview-actions { align-items: stretch; }
      .preview-actions .button-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .preview-actions .hint { width: 100%; }
      .copy-row { grid-template-columns: minmax(0, 1fr); }
      .form-grid { grid-template-columns: 1fr; }
      .status-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .status-item { min-height: 64px; }
      .status-item .value { font-size: 16px; line-height: 1.15; }
      .setup-focus.active { align-items: stretch; }
      .setup-focus .button-group, .setup-focus .button-group button { width: 100%; }
      .camera-dialog { width: 100vw; height: 100dvh; max-width: 100vw; max-height: 100dvh; margin: 0; border: 0; border-radius: 0; }
      .dialog-header, .dialog-footer { padding: 12px; }
      .dialog-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; }
      .dialog-header .hint { display: none; }
      .dialog-body { padding: 12px; }
      .dialog-footer { display: grid; grid-template-columns: 1fr; gap: 8px; padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
      .dialog-footer .button-group { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .dialog-footer .button-group:first-child { grid-template-columns: 1fr; order: 2; }
      .dialog-footer .button-group:last-child { order: 1; margin-left: 0; }
      #cancel-camera-edit { grid-column: 1; grid-row: 1; }
      #test-camera { grid-column: 2; grid-row: 1; }
      #save { grid-column: 1 / -1; grid-row: 2; }
      #dialog-footer-status { grid-column: 1 / -1; grid-row: 3; }
      #dialog-footer-status:empty { display: none; }
      #cancel-camera-edit:has(~ #test-camera[hidden]) { grid-column: 1 / -1; }
      .camera-grid { grid-template-columns: 1fr; }
      .camera-tabs { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: thin; padding-bottom: 8px; }
      .camera-tab { flex: 0 0 auto; max-width: min(78vw, 320px); justify-content: flex-start; }
      .camera-tab-name { max-width: min(48vw, 210px); }
      .button-group button { flex: 1 1 auto; }
      .live-header { padding: 12px; }
      .live-workspace { padding: 10px; gap: 10px; }
      .preview-placeholder, .preview img, .preview video { min-height: 0; }
      .ptz-actions { grid-template-columns: 1fr; }
      .ptz-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .ptz-grid button { min-height: 48px; }
      .pairing-primary { padding: 4px 0; }
      .qr-card img { width: min(220px, 72vw); }
      .toast { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); max-width: none; }
    }
    @media (max-width: 360px) {
      header, main { padding-left: 10px; padding-right: 10px; }
      .panel, .card { padding: 10px; }
      .status-strip { gap: 6px; }
      .status-item { min-height: 60px; }
      .status-item .label { font-size: 9px; }
      .status-item .value { font-size: 15px; }
      .pair-code { font-size: 17px; }
      .camera-tab { max-width: 84vw; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Stream to Matter Camera Bridge</h1>
      <div class="label">Matter camera bridge, live view, and setup status</div>
    </div>
    <div class="header-actions">
      <details class="runtime-details">
        <summary>Runtime</summary>
        <div class="runtime-popover">
          <span id="runtime-badge" class="runtime-badge">Version loading</span>
        </div>
      </details>
      <button class="primary" id="refresh">Refresh</button>
    </div>
  </header>
  <main>
    <section class="status-strip" id="summary"></section>
    <div id="runtime-restart-bar" class="change-bar"></div>
    <section id="setup-focus" class="panel setup-focus"></section>
    <section class="workspace">
      <div class="panel live-panel">
        <div class="toolbar">
          <h2>Live Feeds</h2>
          <button id="add-feed">Add Camera</button>
        </div>
        <div id="video"></div>
      </div>
      <div class="panel pairing-panel">
        <h2>Matter Pairing</h2>
        <div id="pairing"></div>
      </div>
    </section>
    <div id="toast" class="toast" hidden role="status" aria-live="polite"></div>
    <dialog id="camera-dialog" class="camera-dialog" aria-labelledby="camera-dialog-title">
      <div class="dialog-header">
        <div>
          <h2 id="camera-dialog-title">Camera Feed</h2>
          <div class="hint">Configure the saved feed used by snapshots, live preview, ONVIF PTZ, and Matter camera media.</div>
        </div>
        <button type="button" onclick="closeCameraDialog()">Close</button>
      </div>
      <div class="dialog-body">
        <div id="camera-change-bar" class="change-bar" tabindex="-1"></div>
        <div id="cameras"></div>
        <div id="save-result" class="save-state" role="status" aria-live="polite"></div>
      </div>
      <div class="dialog-footer">
        <span class="button-group">
          <button id="delete-camera" class="danger" type="button">Delete Camera</button>
        </span>
        <span class="button-group">
          <button id="cancel-camera-edit" type="button" onclick="discardCameraDraft()">Cancel</button>
          <span id="dialog-footer-status" class="label" role="status" aria-live="polite"></span>
          <button id="test-camera" type="button">Test Camera</button>
          <button class="primary" id="save">Save Camera</button>
        </span>
      </div>
    </dialog>
    <details class="panel" id="diagnostics">
      <summary>Diagnostics</summary>
      <div class="diagnostics-grid">
        <details>
          <summary>Matter Activity</summary>
          <div id="matter-activity"></div>
        </details>
        <details>
          <summary>Recent Events</summary>
          <div id="events"></div>
        </details>
        <details>
          <summary>Raw Status</summary>
          <pre id="raw"></pre>
        </details>
        <details class="danger-zone">
          <summary>Danger Zone</summary>
          <div id="danger"></div>
        </details>
      </div>
    </details>
  </main>
  <script>
    let state = ${state};
    const el = id => document.getElementById(id);
    const clone = value => JSON.parse(JSON.stringify(value ?? null));
    let cameras = [];
    let cameraConfigLoaded = false;
    let openCameraIndex = 0;
    let cameraConfigDirty = false;
    let endpointTopologyDirty = false;
    let editedCameraFieldsDirty = false;
    let cameraChangeNotice = "";
    const removedCameras = [];
    const livePreviews = new Map();
    const frameFeeds = new Map();
    const snapshotLoads = new Map();
    const activePtzMoves = new Map();
    const lastPointerPtzAt = new Map();
    const fieldErrors = new Map();
    let activeLiveCameraId = "";
    let runtimeRestartMessage = "";
    let pendingRemoveIndex = null;
    let cameraSaveInFlight = false;
    let cameraConfigLoadError = "";
    const text = value => value === null || value === undefined || value === "" ? "Not ready" : String(value);
    const cls = value => value ? "ok" : "bad";

    function render() {
      const c = state.commissioning ?? {};
      const cameraStatuses = state.cameras ?? [];
      const attachedCount = Object.values(c.cameraEndpoints ?? {}).filter(v => v.attached).length;
      const personCount = Object.values(c.personEndpoints ?? {}).filter(v => v.attached).length;
      const configuredPersonCount = personSensorConfiguredCount(c);
      const videoCount = cameraStatuses.filter(camera => camera.probe?.has_video).length;
      const cameraCount = configuredCameraCount(cameraStatuses);
      const runtimeBadge = el("runtime-badge");
      if (runtimeBadge) {
        const refreshed = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        runtimeBadge.textContent = "v" + text(state.appVersion ?? "unknown") + " · port " + text(state.sidecarPort ?? window.location.port ?? "unknown") + " · refreshed " + refreshed;
        runtimeBadge.title = "Dashboard version, sidecar port, and the time this browser last loaded status.";
      }
      el("summary").innerHTML = renderSummaryStrip(c, cameraStatuses, cameraCount, attachedCount, videoCount, configuredPersonCount, personCount);
      renderRuntimeRestartBar();
      el("setup-focus").outerHTML = renderSetupFocus(c, cameraStatuses, cameraCount, attachedCount, videoCount);
      el("pairing").innerHTML = renderPairing(c, cameraCount, attachedCount, videoCount);
      el("video").innerHTML = renderLiveFeeds(cameraStatuses, cameraCount);
      syncPreviewControls();
      syncCameraEditorControls();
      renderCameras();
      renderMatterActivity();
      el("raw").textContent = JSON.stringify(state, null, 2);
      renderDangerZone();
      el("events").innerHTML = renderEvents(state.events ?? []);
    }

    function renderGuidance() {
      renderCameraChangeBar();
    }

    function configuredCameraCount(cameraStatuses = state.cameras ?? []) {
      return Math.max(
        cameraStatuses.length,
        cameras.length,
        Array.isArray(state.cameraConfig?.cameras) ? state.cameraConfig.cameras.length : 0
      );
    }

    function renderSetupFocus(commissioning, cameraStatuses, cameraCount, attachedCount, videoCount) {
      const offline = cameraStatuses.find(camera => !camera?.probe?.ok || !camera?.probe?.has_video);
      const pending = cameraStatuses.find(camera => camera?.probe?.ok && camera?.probe?.has_video && !camera?.endpoint?.attached);
      if (!cameraCount) {
        return '<section id="setup-focus" class="panel setup-focus"></section>';
      }
      if (offline) {
        return '<section id="setup-focus" class="panel setup-focus active"><div><h2>Camera Setup</h2><p class="hint">A saved camera is offline. Open it from Live Feeds to fix RTSP or ONVIF credentials before pairing or testing Matter video.</p></div><span class="button-group"><button type="button" class="primary" onclick="openProblemLiveCamera()">Fix Camera</button><button type="button" onclick="refreshStatus()">Refresh</button></span></section>';
      }
      if (!commissioning?.started) {
        return '<section id="setup-focus" class="panel setup-focus active"><div><h2>Matter Not Started</h2><p class="hint">Camera setup is present, but the Matter node is not running yet. Restart this add-on from Home Assistant, then refresh this page.</p></div><span class="button-group"><button type="button" onclick="openFirstCameraConfig()">Edit Camera</button><button type="button" class="primary" onclick="refreshStatus()">Refresh after Restart</button></span></section>';
      }
      if (pending || attachedCount < cameraCount) {
        return '<section id="setup-focus" class="panel setup-focus active"><div><h2>Restart Needed</h2><p class="hint">Video is detected, but Matter has not attached every camera endpoint yet. Restart this add-on from Home Assistant, then refresh this page.</p></div><span class="button-group"><button type="button" onclick="openFirstCameraConfig()">Edit Camera</button><button type="button" class="primary" onclick="refreshStatus()">Refresh after Restart</button></span></section>';
      }
      if (!isCommissioned(commissioning) && commissioning?.pairable) {
        return '<section id="setup-focus" class="panel setup-focus"></section>';
      }
      return '<section id="setup-focus" class="panel setup-focus"></section>';
    }

    function renderLiveFeeds(cameraStatuses, cameraCount = configuredCameraCount(cameraStatuses)) {
      if (!cameraStatuses.length && cameraCount > 0) {
        return '<div class="empty-state"><strong>Camera saved, runtime pending.</strong><p>The saved camera list has changed, but the running Matter camera endpoints are not available yet. Restart this add-on from the Home Assistant add-on page, then refresh this dashboard.</p><span class="button-group"><button type="button" onclick="openFirstCameraConfig()">Edit Camera</button><button type="button" onclick="refreshStatus()">Refresh after Home Assistant restart</button></span></div>';
      }
      if (!cameraStatuses.length) return '<div class="empty-state"><strong>No cameras configured.</strong><p>Add a camera from Live Feeds, save it, then restart this add-on from the Home Assistant add-on page so Matter can expose it as an endpoint.</p><button type="button" class="primary" onclick="addCamera()">Add Camera</button></div>';
      if (!activeLiveCameraId || !cameraStatuses.some(camera => camera.id === activeLiveCameraId)) {
        activeLiveCameraId = cameraStatuses[0]?.id ?? "";
      }
      const active = cameraStatuses.find(camera => camera.id === activeLiveCameraId) ?? cameraStatuses[0];
      const activeRemovalStaged = isRemovalStaged(active.id);
      const videoReady = Boolean(active.probe?.ok && active.probe?.has_video && !activeRemovalStaged);
      const matterReady = Boolean(active.endpoint?.attached && !activeRemovalStaged);
      return \`
        <div class="camera-tabs" role="tablist" aria-label="Camera live feed selector">
          \${cameraStatuses.map(camera => {
            const activeClass = camera.id === active.id ? " active" : "";
            const status = cameraRuntimeStatus(camera);
            const tabId = "camera-tab-" + safeId(camera.id);
            const panelId = "camera-panel-" + safeId(camera.id);
            return \`<button id="\${tabId}" type="button" class="camera-tab\${activeClass}" role="tab" aria-selected="\${camera.id === active.id ? "true" : "false"}" aria-controls="\${panelId}" tabindex="\${camera.id === active.id ? "0" : "-1"}" onclick='selectLiveCamera(\${jsString(camera.id)})' onkeydown='handleCameraTabKey(event, \${jsString(camera.id)})'><span class="status-dot \${status.klass}"></span><span class="camera-tab-name">\${escapeHtml(cameraDisplayName(camera))}</span><span class="label">\${escapeHtml(status.label)}</span></button>\`;
          }).join("")}
        </div>
        <div id="camera-panel-\${safeId(active.id)}" class="camera camera-live" role="tabpanel" aria-labelledby="camera-tab-\${safeId(active.id)}">
          <div class="live-header">
            <div class="camera-title">
              <strong>\${escapeHtml(cameraDisplayName(active))}</strong>
              <div class="label">\${escapeHtml(active.id)}</div>
            </div>
            <div class="button-group">
              <button type="button" onclick='openCameraConfig(\${jsString(active.id)})'>Edit Camera</button>
              \${cameraRuntimePill(active)}
            </div>
          </div>
          <div class="live-workspace">
            <div class="live-preview-column">
              <div class="row">
                \${statusPill("video", Boolean(active.probe?.has_video))}
                \${statusPill("audio", Boolean(active.probe?.has_audio))}
                \${statusPill("Matter endpoint", Boolean(active.endpoint?.attached), active.endpoint?.attached ? "attached" : "pending restart")}
              </div>
              \${liveDraftNotice(active)}
              \${livePreviewPanel(active, videoReady, matterReady)}
              \${cameraDiagnostics(active, videoReady)}
            </div>
            <div class="live-control-column">
              \${videoReady ? ptzQuickPanel(active.id, !activeRemovalStaged && !cameraConfigDirty && !runtimeRestartMessage && !removedCameras.length) : '<div class="message notice"><p>PTZ controls appear after this camera has video. Matter controllers see the camera after the endpoint is attached.</p><div class="button-group repair-actions"><button type="button" onclick="refreshStatus()">Refresh</button></div></div>'}
            </div>
          </div>
        </div>\`;
    }

    function livePreviewPanel(active, videoReady, matterReady) {
      if (!videoReady) {
        return \`
          <div class="preview">
            \${liveRepairPanel(active)}
            <div id="snapshot-status-\${safeId(active.id)}" class="preview-status" role="status" aria-live="polite"></div>
          </div>\`;
      }
      return \`
        <div class="preview">
          \${liveRuntimeNotice(active)}
          \${matterReady ? "" : '<div class="message notice"><p><strong>Matter endpoint pending restart.</strong> Restart the add-on before testing this camera from an external Matter controller.</p></div>'}
          <div class="preview-actions">
            <div class="button-group">
              <button data-action="start-webrtc-preview" data-camera-id="\${escapeHtml(active.id)}" class="primary icon-button" onclick='startLivePreview(\${jsString(active.id)})' title="Start the real WebRTC live stream. This opens one live camera connection."><span class="icon play"></span><span>Play Live</span><span class="sr-only">Start the real WebRTC live stream. This opens one live camera connection.</span></button>
              <button data-action="stop-webrtc-preview" data-camera-id="\${escapeHtml(active.id)}" class="icon-button" onclick='stopLivePreview(\${jsString(active.id)})' disabled><span class="icon stop"></span><span>Stop</span></button>
            </div>
            <span class="hint">Uses the Matter media path and keeps the camera relay warm.</span>
          </div>
          <details class="diagnostic-tools">
            <summary>Diagnostics</summary>
            <div class="button-group">
              <button data-action="load-snapshot" data-camera-id="\${escapeHtml(active.id)}" onclick='loadSnapshot(\${jsString(active.id)})'>Snapshot</button>
              <button data-action="start-frame-feed" data-camera-id="\${escapeHtml(active.id)}" onclick='startFrameFeed(\${jsString(active.id)})' title="Refreshes still frames only when WebRTC cannot be used.">Debug Frames<span class="sr-only">Refreshes still frames only when WebRTC cannot be used.</span></button>
              <button data-action="stop-frame-feed" data-camera-id="\${escapeHtml(active.id)}" onclick='stopFrameFeed(\${jsString(active.id)})' disabled>Stop Refresh</button>
            </div>
          </details>
          <div id="snapshot-status-\${safeId(active.id)}" class="preview-status" role="status" aria-live="polite"></div>
          <div class="preview-frame">
            <div id="preview-placeholder-\${safeId(active.id)}" class="preview-placeholder">Ready for live view. Press Play Live, then use the movement pad beside the image.</div>
            <div id="preview-mode-\${safeId(active.id)}" class="preview-mode">Idle</div>
            <img id="snapshot-\${safeId(active.id)}" alt="\${escapeHtml(cameraDisplayName(active))} preview" hidden>
            <video id="live-\${safeId(active.id)}" autoplay playsinline muted hidden></video>
          </div>
        </div>\`;
    }

    function liveRuntimeNotice(camera) {
      if (isRemovalStaged(camera?.id)) {
        return '<div class="message notice"><p><strong>Removal is staged.</strong> This card is still showing the running add-on state. Save the removal and restart the add-on before testing this camera again.</p></div>';
      }
      if (cameraConfigDirty) {
        return '<div class="message notice"><p><strong>Unsaved camera changes.</strong> Live preview, snapshot, and PTZ are paused here so you do not test the previous saved settings by mistake. Save or cancel the camera edit first.</p></div>';
      }
      if (runtimeRestartMessage) {
        return '<div class="message notice"><p><strong>Restart needed.</strong> This card may still reflect the previous running camera set. Restart the add-on from Home Assistant, then refresh this dashboard before testing live video or Matter.</p></div>';
      }
      return "";
    }

    function cameraDiagnostics(camera, videoReady) {
      const details = [
        videoReady ? ptzSupportPanel(camera) : "",
        probeDetails(camera?.probe, camera?.id, false)
      ].filter(Boolean).join("");
      if (!details) return "";
      return \`<details class="diagnostic-tools"><summary>Camera diagnostics</summary><div class="stack" style="margin-top:10px">\${details}</div></details>\`;
    }

    function cameraRuntimeStatus(camera) {
      if (isRemovalStaged(camera?.id)) return { label: "removing", klass: "warn" };
      if (!camera?.probe?.ok || !camera?.probe?.has_video) return { label: "offline", klass: "bad" };
      if (!camera?.endpoint?.attached) return { label: "pending", klass: "warn" };
      return { label: "ready", klass: "ok" };
    }

    function cameraRuntimePill(camera) {
      const status = cameraRuntimeStatus(camera);
      const label = status.label === "ready" ? "Ready" : status.label === "pending" ? "Endpoint pending restart" : status.label === "removing" ? "Removal pending" : "Video offline";
      return \`<span class="pill \${status.klass}">\${escapeHtml(label)}</span>\`;
    }

    function personSensorConfiguredCount(commissioning = {}) {
      const configured = cameraConfigLoaded ? cameras : (state.cameraConfig?.cameras ?? []);
      const requested = configured.filter(camera => camera?.matter?.advertise_person_detection === true).length;
      const attachedOrPending = Object.keys(commissioning.personEndpoints ?? {}).length;
      return Math.max(requested, attachedOrPending);
    }

    function card(label, value, klass) {
      return \`<div class="card"><div class="label">\${label}</div><div class="value \${klass}">\${value}</div></div>\`;
    }

    function renderSummaryStrip(commissioning, cameraStatuses, cameraCount, attachedCount, videoCount, configuredPersonCount, personCount) {
      const camera = cameraOverallStatus(cameraStatuses, cameraCount, attachedCount, videoCount);
      const extras = [];
      if (cameraCount && attachedCount !== cameraCount) extras.push(\`\${attachedCount} / \${cameraCount} camera endpoints attached\`);
      if (cameraCount && videoCount !== cameraCount) extras.push(\`\${videoCount} / \${cameraCount} video sources detected\`);
      if (configuredPersonCount) extras.push(\`\${personCount} / \${configuredPersonCount} person sensors attached\`);
      return \`
        \${summaryItem("Bridge", state.bridgeHealth?.ok ? "Online" : "Offline", cls(state.bridgeHealth?.ok))}
        \${summaryItem("Camera", camera.label, camera.klass)}
        \${summaryItem("Matter", matterNodeLabel(commissioning, cameraCount, attachedCount, videoCount), matterNodeClass(commissioning, cameraCount, attachedCount, videoCount))}
        \${summaryItem("Live Relay", state.mediaHealth?.ok ? "Online" : "Offline", cls(state.mediaHealth?.ok))}
        \${extras.length ? '<div class="status-context hint" style="grid-column:1 / -1">' + extras.map(escapeHtml).join(" · ") + '</div>' : ""}
      \`;
    }

    function summaryItem(label, value, klass) {
      return \`<div class="card status-item"><div class="label">\${escapeHtml(label)}</div><div class="value \${klass}">\${escapeHtml(value)}</div></div>\`;
    }

    function cameraOverallStatus(cameraStatuses, cameraCount, attachedCount, videoCount) {
      if (!cameraCount) return { label: "No cameras", klass: "warn" };
      if (cameraStatuses.some(camera => isRemovalStaged(camera?.id))) return { label: "Removing", klass: "warn" };
      if (videoCount < cameraCount) return { label: "Offline", klass: "bad" };
      if (attachedCount < cameraCount) return { label: "Pending restart", klass: "warn" };
      return { label: "Ready", klass: "ok" };
    }

    function incompleteCameraDraft(camera) {
        const cameraId = String(camera.id ?? "").trim();
        const cameraName = String(camera.name ?? "").trim();
        const rtspUrl = String(camera.rtsp_url ?? "").trim();
        const ptzNeedsHost = camera.matter?.advertise_ptz !== false;
        if (!cameraName) return { cameraId, path: "name", detail: "Enter a display name so Matter controllers show a useful camera name." };
        if (!cameraId) return { cameraId, path: "id", detail: "Generate or enter a stable camera ID before saving. This becomes the Matter endpoint identity." };
        const rtspProblem = rtspUrl ? rtspUrlProblem(rtspUrl) : "RTSP URL is required.";
        if (rtspProblem) return { cameraId, path: "rtsp_url", detail: "Paste the plain camera RTSP URL before saving. " + rtspProblem };
        if (ptzNeedsHost && !String(camera.onvif?.host ?? "").trim()) return { cameraId, path: "onvif.host", detail: "Add the ONVIF camera host, or turn off Matter PTZ for this camera before saving." };
        return null;
    }

    function firstIncompleteCameraDraft() {
      const draft = collect();
      for (let index = 0; index < draft.length; index += 1) {
        const result = incompleteCameraDraft(draft[index]);
        if (result) return result;
      }
      return null;
    }

    function statusPill(label, ok, value = "") {
      const text = value || (ok ? "yes" : "no");
      return \`<span class="pill \${ok ? "ok" : "warn"}">\${escapeHtml(label)}: \${escapeHtml(text)}</span>\`;
    }

    function liveRepairPanel(camera) {
      if (camera?.probe?.ok && !camera?.endpoint?.attached) {
        return \`
          <div class="message notice">
            <p><strong>Matter endpoint is not attached yet.</strong> Video is detected, but this camera is not available through the Matter camera path. Save camera changes, restart the add-on if prompted, then refresh this page.</p>
            <div class="button-group repair-actions"><button type="button" onclick='openCameraConfig(\${jsString(camera?.id)})'>Edit Camera</button><button type="button" onclick="refreshStatus()">Refresh</button></div>
          </div>\`;
      }
      if (camera?.probe?.ok) return "";
      const detail = camera?.probe?.error
        ? friendlyProbeError(camera.probe.error)
        : "The bridge has not detected video for this camera yet.";
      return \`
        <div class="message bad">
          <p><strong>Video is not ready.</strong> \${escapeHtml(detail)}</p>
          <p>Open the camera settings to fix the RTSP URL or ONVIF credentials, then save and refresh status.</p>
          \${probeRepairActions(camera?.id, "RTSP ONVIF video offline")}
        </div>\`;
    }

    function liveDraftNotice(camera) {
      if (!isRemovalStaged(camera?.id)) return "";
      return '<div class="message notice"><p><strong>Removal pending.</strong> This live feed is still from the running add-on. Save Changes, then restart this add-on from the Home Assistant add-on page to remove this Matter endpoint.</p></div>';
    }

    function isRemovalStaged(cameraId) {
      return Boolean(cameraId && removedCameras.some(item => item.camera?.id === cameraId));
    }

    function pairingSummary(commissioning, cameraCount, attachedCount, videoCount = cameraCount) {
      if (!commissioning?.started) return "Matter is not started yet. Start or restart this add-on from the Home Assistant add-on page, then refresh this page.";
      if (!cameraCount) return "Matter is ready, but no cameras are configured yet. Add a camera, save it, then restart this add-on from the Home Assistant add-on page so Matter can create the endpoint.";
      if (isCommissioned(commissioning)) {
        const fabrics = Math.max(1, Number(commissioning.commissionedFabrics ?? 1));
        const endpointNote = attachedCount < cameraCount
          ? \`Only \${attachedCount} of \${cameraCount} camera endpoints are attached. After saving camera changes, restart this add-on from the Home Assistant add-on page, then refresh this page.\`
          : \`\${attachedCount} of \${cameraCount} camera endpoints are attached.\`;
        return \`Paired to \${fabrics} Matter controller/fabric\${fabrics === 1 ? "" : "s"}. \${endpointNote}\`;
      }
      if (attachedCount < cameraCount) return \`Matter is ready, but only \${attachedCount} of \${cameraCount} camera endpoints are attached. After saving camera changes, restart this add-on from the Home Assistant add-on page, then refresh this page.\`;
      if (videoCount < cameraCount) return "Matter is running, but video is offline. Fix the stream before pairing, resetting identity, or testing from a Matter controller.";
      if (commissioning.pairable) return "Ready to pair. Scan the QR code or copy the manual code into your Matter controller.";
      return "Matter is running, but the pairing window is closed. Reset Matter identity only if you intentionally need to pair as a new device.";
    }

    function renderPairing(commissioning, cameraCount, attachedCount, videoCount = cameraCount) {
      if (isCommissioned(commissioning)) {
        return \`
          <div class="pairing-compact">
            <div class="row">
              <span class="pill \${matterNodeClass(commissioning, cameraCount, attachedCount, videoCount)}">\${matterNodeLabel(commissioning, cameraCount, attachedCount, videoCount)}</span>
              <span class="label">Credential source: \${text(commissioning?.credentialSource)}</span>
            </div>
            <p class="hint">\${pairingSummary(commissioning, cameraCount, attachedCount, videoCount)}</p>
            \${fabricSummary(commissioning)}
            \${matterError(commissioning?.error ?? state.startupError)}
          </div>\`;
      }
      return \`
        <div class="pairing-layout">
          <div class="pairing-primary \${commissioning?.pairable && cameraCount && attachedCount >= cameraCount && videoCount >= cameraCount ? "ready" : ""}">
            \${pairingQr(commissioning, cameraCount, attachedCount, videoCount)}
            \${pairingCopy(commissioning, cameraCount, attachedCount, videoCount)}
          </div>
          <div class="pairing-compact">
            <p><span class="pill \${matterNodeClass(commissioning, cameraCount, attachedCount, videoCount)}">\${matterNodeLabel(commissioning, cameraCount, attachedCount, videoCount)}</span></p>
            <p class="hint">\${pairingSummary(commissioning, cameraCount, attachedCount, videoCount)}</p>
            \${pairingVideoNotice(cameraCount, videoCount)}
          </div>
          \${fabricSummary(commissioning)}
        </div>
        <p class="label">Credential source: \${text(commissioning?.credentialSource)}</p>
        \${attestationNotice(commissioning, cameraCount, attachedCount)}
        \${matterError(commissioning?.error ?? state.startupError)}\`;
    }

    function pairingVideoNotice(cameraCount, videoCount) {
      if (!cameraCount || videoCount >= cameraCount) return "";
      return '<div class="message notice"><p><strong>Video check comes first.</strong> Fix every camera stream before pairing or rotating Matter identity, so the controller can request snapshot or live view immediately after setup.</p><div class="button-group repair-actions"><button type="button" onclick="openProblemLiveCamera()">Fix Video</button></div></div>';
    }

    function pairingCopy(commissioning, cameraCount = 0, attachedCount = 0, videoCount = cameraCount) {
      if (!cameraCount) {
        return '<div class="message notice"><p>Pairing codes will appear after you add a camera and Matter has an endpoint to expose.</p><div class="button-group repair-actions"><button type="button" onclick="addCamera()">Add Camera</button></div></div>';
      }
      if (!commissioning?.started) {
        return '<div class="message notice"><p>Pairing codes will appear after the Matter node starts. Restart this add-on from Home Assistant, then refresh this page.</p><div class="button-group repair-actions"><button type="button" onclick="refreshStatus()">Refresh after Restart</button></div></div>';
      }
      if (isCommissioned(commissioning)) {
        return "";
      }
      if (attachedCount < cameraCount) {
        return '<div class="message notice"><p>Pairing codes will appear after Matter attaches the configured camera endpoints. Save camera changes, restart this add-on from the Home Assistant add-on page, then refresh this page.</p><div class="button-group repair-actions"><button type="button" onclick="openFirstCameraConfig()">Edit Camera</button><button type="button" onclick="refreshStatus()">Refresh after Home Assistant restart</button></div></div>';
      }
      if (videoCount < cameraCount) {
        return '<div class="message notice"><p>Pairing codes will appear after every configured camera produces video.</p><div class="button-group repair-actions"><button type="button" onclick="openProblemLiveCamera()">Open Live Feeds</button></div></div>';
      }
      return \`
        <div class="pairing-copy">
          \${copyRow("Manual pairing code", commissioning?.manualPairingCode, "manual-pairing-code")}
          <details class="advanced-block">
            <summary>Advanced QR payload</summary>
            <div style="margin-top:10px">\${copyRow("QR setup payload", commissioning?.qrPairingCode, "qr-pairing-code")}</div>
          </details>
          <div id="pairing-copy-status" class="copy-status" role="status" aria-live="polite"></div>
        </div>\`;
    }

    function fabricSummary(commissioning) {
      const count = Number(commissioning?.commissionedFabrics ?? 0);
      if (!count) return "";
      return \`<p class="label">Paired Matter fabrics: \${count}</p>\`;
    }

    function copyRow(label, value, id) {
      const ready = value !== null && value !== undefined && value !== "";
      const displayValue = id === "manual-pairing-code" ? formatManualPairingCode(value) : text(value);
      return \`
        <div>
          <div class="label">\${escapeHtml(label)}</div>
          <div class="copy-row">
            <code class="\${id === "manual-pairing-code" ? "pair-code" : ""}" id="\${escapeHtml(id)}" data-copy-value="\${escapeHtml(text(value))}">\${escapeHtml(displayValue)}</code>
            <button type="button" onclick='copyMatterText(\${jsString(id)}, \${jsString(label)})' \${ready ? "" : "disabled"}>Copy</button>
          </div>
        </div>\`;
    }

    function formatManualPairingCode(value) {
      const raw = text(value);
      if (raw === "Not ready") return raw;
      const digits = raw.replace(/\\D/g, "");
      if (!digits) return raw;
      return digits.replace(/(\\d{4})(?=\\d)/g, "$1 ").trim();
    }

    function pairingQr(commissioning, cameraCount = 0, attachedCount = 0, videoCount = cameraCount) {
      if (!cameraCount || attachedCount < cameraCount || videoCount < cameraCount) return "";
      if (!commissioning?.pairable || !commissioning.qrPairingCode) {
        return '<div class="qr-card"><strong>Matter QR Code</strong><span class="pill">QR not ready</span></div>';
      }
      return \`
        <div class="qr-card">
          <strong>Matter QR Code</strong>
          <img src="/matter/onboarding.svg?payload=\${encodeURIComponent(commissioning.qrPairingCode)}" alt="Matter QR Code">
          <span class="label">Scan this from your Matter controller. The manual code is below if your controller cannot scan QR.</span>
        </div>\`;
    }

    function matterNodeLabel(commissioning, cameraCount = 1, attachedCount = 1, videoCount = cameraCount) {
      if (!commissioning?.started) return "Not started";
      if (isCommissioned(commissioning)) return "Paired";
      if (!cameraCount) return "Needs camera";
      if (attachedCount < cameraCount) return "Needs restart";
      if (videoCount < cameraCount) return "Video first";
      if (commissioning.pairable) return "Ready to pair";
      return "Running";
    }

    function matterNodeClass(commissioning, cameraCount = 1, attachedCount = 1, videoCount = cameraCount) {
      if (!commissioning?.started) return "bad";
      if (isCommissioned(commissioning)) return "ok";
      if (!cameraCount || attachedCount < cameraCount) return "warn";
      if (videoCount < cameraCount) return "warn";
      if (commissioning.pairable) return "warn";
      return "ok";
    }

    function isCommissioned(commissioning) {
      return Boolean(
        commissioning?.commissioned ||
        Number(commissioning?.commissionedFabrics ?? 0) > 0 ||
        /already commissioned|commissioned to at least one fabric/i.test(commissioning?.reason ?? "")
      );
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
      const activityById = new Map(normalizeMatterActivityCameras(activity.cameras).map(camera => [camera.id, camera]));
      const runtimeById = new Map((state.cameras ?? []).map(camera => [camera.id, camera]));
      const configById = new Map(cameras.map(camera => [camera.id, camera]));
      const knownIds = [...new Set([
        ...configById.keys(),
        ...runtimeById.keys(),
        ...activityById.keys()
      ].filter(Boolean))];
      if (!knownIds.length) {
        el("matter-activity").innerHTML = '<p class="label">No Matter camera endpoints available yet.</p>';
        return;
      }
      const activityCameras = knownIds.map(id => {
        const observed = activityById.get(id) ?? {};
        const runtime = runtimeById.get(id) ?? {};
        const config = configById.get(id) ?? {};
        return {
          id,
          name: observed.name ?? runtime.name ?? config.name ?? id,
          endpointAttached: runtime.endpoint?.attached ?? state.commissioning?.cameraEndpoints?.[id]?.attached ?? false,
          totalCommands: observed.totalCommands ?? 0,
          lastSeen: observed.lastSeen ?? null,
          commands: normalizeMatterCommands(observed.commands)
        };
      });
      el("matter-activity").innerHTML = \`
        <p class="label">Active WebRTC sessions: \${activity.activeWebRtcSessionCount ?? 0}</p>
        <p class="hint">This section counts requests coming from Matter controllers. If a camera is listed with no commands, the endpoint exists but no Matter controller has asked it for snapshot, live view, or PTZ yet.</p>
        <div class="camera-grid">
          \${activityCameras.map(camera => \`
            <div class="camera">
              <div class="row" style="justify-content:space-between">
                <div>
                  <strong>\${escapeHtml(cameraDisplayName(camera))}</strong>
                  <p class="label">\${escapeHtml(camera.id)}</p>
                </div>
                <span class="pill \${camera.endpointAttached ? "ok" : "warn"}">\${camera.endpointAttached ? "Endpoint attached" : "Endpoint pending restart"}</span>
                <span class="pill \${camera.totalCommands ? "ok" : ""}">\${camera.totalCommands} Matter commands</span>
              </div>
              <p class="label">Last Matter command: \${escapeHtml(camera.lastSeen ?? "never")}</p>
              \${renderMatterCommands(camera.commands ?? [])}
            </div>\`).join("")}
        </div>\`;
    }

    function normalizeMatterActivityCameras(value) {
      if (Array.isArray(value)) return value;
      if (!value || typeof value !== "object") return [];
      return Object.entries(value).map(([id, camera]) => ({
        id: camera?.id ?? id,
        ...(camera ?? {})
      }));
    }

    function normalizeMatterCommands(value) {
      if (Array.isArray(value)) return value;
      if (!value || typeof value !== "object") return [];
      return Object.entries(value).map(([key, command]) => {
        const [cluster = key, name = ""] = key.split(".");
        return {
          cluster: command?.cluster ?? cluster,
          command: command?.command ?? name,
          ...(command ?? {})
        };
      });
    }

    function renderMatterCommands(commands) {
      if (!commands.length) return '<p class="hint">No Matter camera cluster commands observed yet. Open live view or snapshot from a Matter controller to populate this list.</p>';
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

    function attestationNotice(commissioning, cameraCount = 0, attachedCount = 0) {
      if (isCommissioned(commissioning)) return "";
      if (!commissioning?.matterNodeStarted) return "";
      if (!cameraCount || attachedCount < cameraCount) return "";
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
        \${reset?.pending ? '<p class="notice"><strong>Matter identity reset is pending.</strong> Restart this add-on from the Home Assistant add-on page to clear Matter storage and generate new pairing credentials.</p>' : ""}
        <p class="notice"><strong>Only use this when pairing is broken or you intentionally want a new Matter device.</strong> Reset Matter Identity clears the local Matter fabric/state on next restart and rotates the generated pairing credentials. Existing Matter controllers will lose this device and you will need to pair it again.</p>
        <div class="form-grid">
          <label><span class="label">Type RESET MATTER to enable</span><input id="reset-confirmation" placeholder="RESET MATTER" autocomplete="off" spellcheck="false"></label>
        </div>
        <div class="row">
          <button class="danger" id="reset-matter" disabled>Reset Matter Identity</button>
      <span id="reset-result" class="label" role="status" aria-live="polite"></span>
        </div>\`;
      const resetConfirmation = el("reset-confirmation");
      const resetButton = el("reset-matter");
      resetConfirmation.value = "";
      const updateResetButton = () => {
        resetButton.disabled = resetConfirmation.value !== "RESET MATTER";
      };
      resetConfirmation.oninput = updateResetButton;
      updateResetButton();
      el("reset-matter").onclick = resetMatterIdentity;
    }

    function renderCameras() {
      const statusById = new Map((state.cameras ?? []).map(camera => [camera.id, camera]));
      renderCameraChangeBar();
      if (!cameraConfigLoaded && !cameraConfigLoadError) {
        el("cameras").innerHTML = \`
          <div class="empty-state">
            <strong>Loading camera settings...</strong>
            <p>The dashboard is waiting for the saved camera list before enabling Add or Save.</p>
          </div>\`;
        return;
      }
      if (cameraConfigLoadError) {
        el("cameras").innerHTML = \`
          <div class="empty-state bad">
            <strong>Camera settings storage is not available.</strong>
            <p>\${escapeHtml(cameraConfigLoadDetail())}</p>
            <p class="hint">\${escapeHtml(cameraConfigLoadError)}</p>
            <button type="button" onclick="retryCameraConfig()">Retry Camera Settings</button>
          </div>\`;
        return;
      }
      if (!cameras.length) {
        const removalDraft = removedCameras.length > 0;
        el("cameras").innerHTML = \`
          <div class="empty-state">
            <strong>\${removalDraft ? "All cameras are pending removal." : "No cameras yet."}</strong>
            <p>\${removalDraft ? "Save Changes to apply an empty camera list, or undo the removal before saving." : "Add a camera to configure its RTSP stream, ONVIF PTZ, and Matter endpoint capabilities."}</p>
            <p class="hint">\${removalDraft ? "After saving an empty list, restart this add-on from the Home Assistant add-on page so Matter removes the old camera endpoints." : "Start with the plain camera RTSP URL and ONVIF host. You can test video and PTZ before pairing Matter."}</p>
            \${stagedRemovalsPanel()}
            <span class="button-group">
              \${removalDraft ? '<button type="button" class="primary" onclick="document.getElementById(\\'save\\')?.click()">Save Changes</button>' : ""}
              <button type="button" onclick="addCamera()">Add Camera</button>
            </span>
          </div>\`;
        return;
      }
      const visibleCameras = cameras
        .map((camera, index) => ({ camera, index }))
        .filter(item => item.index === openCameraIndex);
      el("cameras").innerHTML = visibleCameras.map(({ camera, index }) => {
        const status = statusById.get(camera.id);
        const dotClass = status?.endpoint?.attached ? (status?.probe?.ok ? "ok" : "warn") : "";
        const summary = status
          ? [status.probe?.ok ? "video detected" : "no video", status.endpoint?.attached ? "Matter attached" : "Matter pending restart"].join(" · ")
          : "pending save/restart";
        const confirmingRemove = index === pendingRemoveIndex;
        return \`
        <details class="camera" \${index === openCameraIndex ? "open" : ""}>
          <summary class="row" style="justify-content:space-between">
            <span class="row"><span class="status-dot \${dotClass}"></span><strong>\${escapeHtml(cameraDisplayName(camera, "Camera " + (index + 1)))}</strong><span class="label">\${escapeHtml(camera.id || "new_camera")}</span></span>
            <span class="row"><span class="pill">\${escapeHtml(summary)}</span></span>
          </summary>
          <div class="camera-body stack">
          \${confirmingRemove ? removeConfirmationPanel(camera, index) : ""}
            \${cameraEditorHealth(camera, status)}
            \${cameraSetupActions(camera, status, index)}
          <fieldset>
            <legend>Camera</legend>
            <div class="form-grid">
              \${input(index, "name", "Display Name", camera.name, "Front Door", "text", "Name shown by Matter controllers.", true)}
              \${input(index, "rtsp_url", "RTSP URL", camera.rtsp_url, "rtsp://user:password@camera-ip:554/av_stream/ch0", "text", "Plain camera RTSP URL used for snapshots, preview, and Matter camera media.", true)}
            </div>
            \${rtspGuidance(camera)}
          </fieldset>
          <fieldset>
            <legend>ONVIF Movement</legend>
            <div class="form-grid">
              \${input(index, "onvif.host", "Camera IP / Host", camera.onvif?.host, "192.168.1.50", "text", camera.matter?.advertise_ptz === false ? "Optional while mechanical PTZ is disabled." : "Required for dashboard PTZ tests and Matter PTZ commands.", camera.matter?.advertise_ptz !== false)}
              \${input(index, "onvif.port", "ONVIF Port", camera.onvif?.port ?? 80)}
              \${input(index, "onvif.user", "ONVIF User", camera.onvif?.user)}
              \${input(index, "onvif.password", "ONVIF Password", "", camera.onvif?.password_set ? "Leave blank to keep existing password" : "", "password", "Also used when ONVIF returns a stream URI without fresh RTSP credentials.")}
            </div>
            <p class="field-help">If ONVIF uses the same address or login as RTSP, copy it from the stream URL: <button type="button" onclick="useRtspHostForOnvif(\${index})">Copy RTSP host</button> <button type="button" onclick="useRtspLoginForOnvif(\${index})">Copy RTSP login</button></p>
          </fieldset>
          <details class="advanced-block">
            <summary>Advanced Matter settings</summary>
            <div class="form-grid" style="margin-top:12px">
              \${input(index, "id", "Camera ID", camera.id, "front_door", "text", "Stable Matter endpoint id. Use letters, numbers, underscores, or hyphens.", true)}
            </div>
            <p class="field-help">Changing this ID after pairing can create a new endpoint. <button type="button" onclick="generateCameraIdFromName(\${index})">Generate ID from name</button></p>
            <div class="form-grid">
              \${checkbox(index, "matter.advertise_ptz", "Expose PTZ controls to Matter controllers", camera.matter?.advertise_ptz !== false)}
              \${checkbox(index, "matter.advertise_audio", "Expose audio stream support", camera.matter?.advertise_audio !== false)}
              \${checkbox(index, "matter.advertise_person_detection", "Create Matter person presence sensor", camera.matter?.advertise_person_detection === true)}
            </div>
            <p class="label">Changing Matter-facing controls or sensors requires restarting this add-on from the Home Assistant add-on page.</p>
            <div class="form-grid" style="margin-top:12px">
              \${input(index, "media_source", "WHEP Media Source Override", "", camera.media_source_set ? "Leave blank to keep " + camera.media_source_redacted : "Leave blank to use RTSP URL")}
            </div>
            <p class="field-help">Only use this when the WHEP relay needs a different source than the RTSP URL above.</p>
          </details>
          </div>
        </details>\`;
      }).join("");
      el("cameras").innerHTML = stagedRemovalsPanel() + el("cameras").innerHTML;
      bindCameraInputs();
      hideInvalidEmptyAutofill();
    }

    function stagedRemovalsPanel() {
      if (!removedCameras.length) return "";
      return \`<div class="message notice staged-removals">
        <p><strong>\${removedCameras.length} camera\${removedCameras.length === 1 ? "" : "s"} pending removal.</strong> Nothing is deleted until you click Save Changes; after saving, restart this add-on from the Home Assistant add-on page so Matter removes the endpoint\${removedCameras.length === 1 ? "" : "s"}.</p>
        <div class="removal-list">
          \${removedCameras.map((item, removalIndex) => {
            const camera = item.camera ?? {};
            const label = cameraDisplayName(camera, camera.id || "Camera " + (removalIndex + 1));
            const id = camera.id && camera.id !== label ? \` <span class="label">\${escapeHtml(camera.id)}</span>\` : "";
            return \`<div class="removal-item"><span><strong>\${escapeHtml(label)}</strong>\${id}</span><button type="button" onclick="undoRemoveCamera(\${removalIndex})">Undo Removal</button></div>\`;
          }).join("")}
        </div>
      </div>\`;
    }

    function removeConfirmationPanel(camera, index) {
      const label = cameraDisplayName(camera, "Camera " + (index + 1));
      const id = String(camera?.id ?? "").trim();
      return \`<div id="remove-warning-\${index}" class="message bad delete-confirmation" tabindex="-1">
        <p><strong>Delete \${escapeHtml(label)}?</strong></p>
        <p>This stages removal only. Confirm here, then save the removal and restart the add-on so Matter removes the endpoint.</p>
        \${id ? \`<p class="label">\${escapeHtml(id)}</p>\` : ""}
        <span class="button-group repair-actions">
          <button type="button" onclick="cancelRemoveCamera()">Cancel</button>
          <button type="button" class="danger" onclick="confirmRemoveCamera(\${index})">Confirm Delete</button>
        </span>
      </div>\`;
    }

    function bindCameraInputs() {
      document.querySelectorAll("input[data-index]").forEach(input => {
        const eventName = input.dataset.type === "boolean" ? "change" : "input";
        input.addEventListener(eventName, () => {
          updateCameraDraftFromInput(input);
          const cameraIdAutoGenerated = maybeAutoGenerateNewCameraId(input);
          const topologyPath = ["id", "matter.advertise_ptz", "matter.advertise_audio", "matter.advertise_person_detection"];
          editedCameraFieldsDirty = true;
          markCameraDirty(
            cameraIdAutoGenerated || topologyPath.includes(input.dataset.path)
              ? "Unsaved camera changes. Save, then restart this add-on from the Home Assistant add-on page if endpoints or Matter capabilities changed."
              : "Unsaved camera changes. Save Changes to apply them."
          );
          clearFieldError(input.dataset.index, input.dataset.path, input);
          if (cameraIdAutoGenerated || topologyPath.includes(input.dataset.path)) endpointTopologyDirty = true;
          renderCameraChangeBar();
          renderGuidance();
          syncCameraEditorControls();
        });
        if (input.dataset.type !== "boolean") {
          input.addEventListener("change", () => {
            updateCameraDraftFromInput(input);
            renderCameras();
            renderGuidance();
            syncCameraEditorControls();
          });
        }
      });
    }

    function updateCameraDraftFromInput(input) {
      const target = cameras[Number(input.dataset.index)];
      if (!target) return;
      const parts = input.dataset.path.split(".");
      let cursor = target;
      while (parts.length > 1) {
        const key = parts.shift();
        cursor[key] = cursor[key] ?? {};
        cursor = cursor[key];
      }
      cursor[parts[0]] = input.dataset.type === "boolean" ? input.checked : input.value;
    }

    function maybeAutoGenerateNewCameraId(input) {
      if (input.dataset.path !== "name") return false;
      const index = Number(input.dataset.index);
      const camera = cameras[index];
      if (!camera) return false;
      const currentId = String(camera.id ?? "");
      const savedWithSameId = (state.cameras ?? []).some(item => item.id === currentId);
      if (savedWithSameId || (currentId && !/^camera_\\d+$/.test(currentId))) return false;
      const base = slugCameraId(input.value);
      if (!base) return false;
      const nextId = uniqueCameraId(base, index);
      if (!nextId || nextId === currentId) return false;
      camera.id = nextId;
      const idInput = document.querySelector('input[data-index="' + index + '"][data-path="id"]');
      if (idInput) {
        idInput.removeAttribute("readonly");
        idInput.value = nextId;
        clearFieldError(index, "id", idInput);
      }
      return true;
    }

    window.useRtspHostForOnvif = index => {
      const rtspInput = document.querySelector('input[data-index="' + index + '"][data-path="rtsp_url"]');
      const hostInput = document.querySelector('input[data-index="' + index + '"][data-path="onvif.host"]');
      const status = el("save-result");
      try {
        const host = new URL(rtspInput?.value ?? "").hostname;
        if (!host) throw new Error("No host in RTSP URL.");
        hostInput?.removeAttribute("readonly");
        hostInput.value = host;
        hostInput?.dispatchEvent(new Event("input", { bubbles: true }));
        hostInput?.focus();
        if (status) {
          status.className = "save-state";
          status.textContent = "ONVIF host copied from RTSP URL. Save Changes to apply it.";
        }
      } catch {
        if (status) {
          status.className = "save-state bad";
          status.textContent = "Paste a valid RTSP URL first, then use RTSP Host.";
        }
        focusCameraField(index, "rtsp_url");
      }
    };

    window.useRtspLoginForOnvif = index => {
      const rtspInput = document.querySelector('input[data-index="' + index + '"][data-path="rtsp_url"]');
      const userInput = document.querySelector('input[data-index="' + index + '"][data-path="onvif.user"]');
      const passwordInput = document.querySelector('input[data-index="' + index + '"][data-path="onvif.password"]');
      const status = el("save-result");
      try {
        const url = new URL(rtspInput?.value ?? "");
        const username = decodeURIComponent(url.username ?? "");
        const password = decodeURIComponent(url.password ?? "");
        if (!username && !password) throw new Error("No RTSP login in URL.");
        if (userInput && username) {
          userInput.removeAttribute("readonly");
          userInput.value = username;
          userInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (passwordInput && password) {
          passwordInput.removeAttribute("readonly");
          passwordInput.value = password;
          passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        userInput?.focus();
        if (status) {
          status.className = "save-state";
          status.textContent = "ONVIF login copied from RTSP URL. Save Changes to apply it.";
        }
      } catch {
        if (status) {
          status.className = "save-state bad";
          status.textContent = "Add RTSP username/password to the RTSP URL first, then use RTSP Login.";
        }
        focusCameraField(index, "rtsp_url");
      }
    };

    window.generateCameraIdFromName = index => {
      const nameInput = document.querySelector('input[data-index="' + index + '"][data-path="name"]');
      const idInput = document.querySelector('input[data-index="' + index + '"][data-path="id"]');
      const status = el("save-result");
      const base = slugCameraId(nameInput?.value ?? "");
      if (!base) {
        if (status) {
          status.className = "save-state bad";
          status.textContent = "Enter a display name first, then generate the camera ID.";
        }
        focusCameraField(index, "name");
        return;
      }
      const nextId = uniqueCameraId(base, index);
      if (idInput) {
        idInput.removeAttribute("readonly");
        idInput.value = nextId;
        idInput.dispatchEvent(new Event("input", { bubbles: true }));
        idInput.focus();
      }
      if (status) {
        status.className = "save-state";
        status.textContent = "Camera ID generated from the display name. Save Changes to apply it.";
      }
    };

    function slugCameraId(value) {
      return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48);
    }

    function uniqueCameraId(base, index) {
      const existing = new Set(cameras
        .map((camera, cameraIndex) => cameraIndex === Number(index) ? "" : String(camera.id ?? ""))
        .filter(Boolean));
      let candidate = base || "camera";
      let suffix = 2;
      while (existing.has(candidate)) {
        const ending = "_" + suffix++;
        candidate = (base || "camera").slice(0, Math.max(1, 48 - ending.length)) + ending;
      }
      return candidate;
    }

    function markCameraDirty(message) {
      cameraConfigDirty = true;
      cameraChangeNotice = "";
      if (el("save-result")) {
        el("save-result").className = "save-state";
        el("save-result").textContent = message;
      }
      renderCameraChangeBar();
    }

    function renderCameraChangeBar() {
      const target = el("camera-change-bar");
      if (!target) return;
      if (!cameraConfigDirty && !removedCameras.length) {
        target.className = "change-bar";
        target.innerHTML = "";
        return;
      }
      target.className = "change-bar active";
      const restart = endpointTopologyDirty || removedCameras.length > 0;
      const removal = removedCameras.length
        ? \` \${removedCameras.length} removal\${removedCameras.length === 1 ? "" : "s"} pending.\`
        : "";
      const message = cameraChangeNotice
        ? escapeHtml(cameraChangeNotice)
        : \`<strong>Unsaved camera changes.</strong>\${removal} \${restart ? "Save, then restart this add-on from the Home Assistant add-on page for Matter endpoint changes." : "Save to apply without restarting."}\`;
      target.innerHTML = \`
        <span>\${message}</span>
        <span class="button-group">
          \${removedCameras.length ? '<button type="button" onclick="undoRemoveCamera()">Undo Removal</button>' : ""}
          <button type="button" onclick="discardCameraDraft()">Discard Changes</button>
        </span>\`;
    }

    function warnUnsavedRefreshBlocked() {
      cameraChangeNotice = "Unsaved camera changes. Save or discard them before refreshing status.";
      if (el("save-result")) {
        el("save-result").className = "save-state";
        el("save-result").textContent = cameraChangeNotice;
      }
      renderCameraChangeBar();
      const target = el("camera-change-bar");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus?.();
    }

    function renderRuntimeRestartBar() {
      const target = el("runtime-restart-bar");
      if (!target) return;
      if (!runtimeRestartMessage) {
        target.className = "change-bar";
        target.innerHTML = "";
        return;
      }
      target.className = "change-bar active";
      target.innerHTML = \`
        <span><strong>Restart required.</strong> \${escapeHtml(runtimeRestartMessage)} Restart this add-on from the Home Assistant add-on page, then come back here and refresh. Until then, Matter endpoints and live-feed runtime status may still reflect the previous camera set.</span>
        <span class="button-group"><button type="button" onclick="refreshStatus()">Refresh after Home Assistant restart</button></span>\`;
    }

    function input(index, path, label, value = "", placeholder = "", type = "text", help = "", required = false) {
      const error = fieldErrors.get(fieldKey(index, path));
      const inputName = "stm_field_" + safeId(index + "_" + path).split("").reverse().join("");
      const autocomplete = "off";
      const editUnlock = type === "password" || type === "text" ? 'readonly onfocus="this.removeAttribute(\\'readonly\\')" onpointerdown="this.removeAttribute(\\'readonly\\')" data-lpignore="true" data-1p-ignore="true"' : "";
      return \`<label><span class="label">\${label}\${required ? ' <span class="required-dot">*</span>' : ""}</span><input type="\${escapeHtml(type)}" name="\${escapeHtml(inputName)}" data-index="\${index}" data-path="\${path}" value="\${escapeHtml(value)}" placeholder="\${escapeHtml(placeholder)}" autocomplete="\${autocomplete}" autocapitalize="none" spellcheck="false" \${editUnlock} \${required ? "required" : ""} \${error ? 'class="invalid" aria-invalid="true"' : ""}>\${error ? '<p class="field-error">' + escapeHtml(error) + '</p>' : ""}\${help ? '<p class="field-help">' + escapeHtml(help) + '</p>' : ""}</label>\`;
    }

    function checkbox(index, path, label, checked = false) {
      return \`<label class="toggle"><input type="checkbox" data-index="\${index}" data-path="\${path}" data-type="boolean" \${checked ? "checked" : ""}><span>\${escapeHtml(label)}</span></label>\`;
    }

    function ptzSupportPanel(camera) {
      const cameraId = camera?.id ?? "";
      const config = cameras.find(item => item.id === cameraId) ?? camera;
      const endpoint = state.commissioning?.cameraEndpoints?.[cameraId];
      const ptzExposed = config?.matter?.advertise_ptz !== false;
      const observed = matterPtzObserved(cameraId);
      const pathText = ptzExposed
        ? "Dashboard buttons test this camera's ONVIF movement through the bridge command handler. A real Matter round trip is recorded only when a paired controller sends a PTZ command; controller apps decide whether to show those controls."
        : "PTZ is disabled for this camera. Live video and snapshots still work; enable mechanical PTZ and set ONVIF details if this camera can move.";
      return \`
        <div class="notice">
          <strong>PTZ path:</strong>
          \${pathText}
          \${ptzExposed && endpoint?.attached && !observed ? "No Matter PTZ command has been observed from a controller yet." : ""}
          \${observed ? "Matter PTZ commands have been observed for this camera." : ""}
        </div>\`;
    }

    function cameraEditorHealth(camera, status) {
      const identityOk = Boolean(camera.id && camera.name);
      const streamOk = Boolean(camera.rtsp_url && !rtspUrlProblem(camera.rtsp_url));
      const streamProbeKnown = Boolean(status?.probe);
      const streamProbeOk = Boolean(status?.probe?.ok);
      const ptzEnabled = camera.matter?.advertise_ptz !== false;
      const onvifOk = !ptzEnabled || Boolean(camera.onvif?.host);
      const savedOk = Boolean(status);
      const endpointOk = Boolean(status?.endpoint?.attached);
      const streamStepOk = streamOk && (!savedOk || !streamProbeKnown || streamProbeOk);
      return \`
        <div class="health-row" aria-label="Camera health">
          \${statusPill("Identity", identityOk, identityOk ? "ready" : "missing")}
          \${statusPill("Stream", streamStepOk, streamProbeOk ? "video detected" : streamOk ? "configured" : "missing")}
          \${statusPill("PTZ", onvifOk, !ptzEnabled ? "disabled" : onvifOk ? "configured" : "needs ONVIF")}
          \${statusPill("Saved", savedOk, savedOk ? "yes" : "not yet")}
          \${statusPill("Matter", endpointOk, endpointOk ? "attached" : "pending restart")}
        </div>\`;
    }

    function cameraSetupActions(camera, status, index) {
      const saved = Boolean(status);
      const testable = saved && !cameraConfigDirty;
      const saveReady = !incompleteCameraDraft(camera);
      const videoReady = Boolean(status?.probe?.ok);
      const endpointReady = Boolean(status?.endpoint?.attached);
      const ptzReady = cameraPtzConfigured(camera);
      if (!saved) {
        return \`
          <div class="camera-action-strip">
            <span class="hint">\${escapeHtml(firstSaveGuidance(camera))}</span>
            <span class="pill \${saveReady ? "ok" : "warn"}">\${saveReady ? "Ready to save" : "Needs required fields"}</span>
          </div>\`;
      }
      const message = !saved
        ? firstSaveGuidance(camera)
        : cameraConfigDirty
          ? "Save camera changes before testing. Live feed and movement controls use the last saved add-on settings."
        : !videoReady
          ? "Open Live Feeds to inspect the stream error and repair RTSP/ONVIF settings."
          : !ptzReady
            ? "Video is ready. PTZ is disabled or missing an ONVIF host for this camera."
          : endpointReady
            ? "Video is ready and the Matter endpoint is attached."
            : "Video is ready. Restart this add-on from the Home Assistant add-on page after saving endpoint changes.";
      return \`
        <div class="camera-action-strip">
          <span class="hint">\${escapeHtml(message)}</span>
          <span class="button-group">
            \${testable ? \`<button type="button" onclick='openLiveCamera(\${jsString(camera.id)})'>Open Live Feed</button>\` : ""}
            \${endpointReady ? '<button type="button" onclick="scrollToPairing()">Matter Pairing</button>' : ""}
          </span>
        </div>\`;
    }

    function firstSaveGuidance(camera) {
      const needsRtsp = !camera.rtsp_url || Boolean(rtspUrlProblem(camera.rtsp_url));
      const needsOnvif = camera.matter?.advertise_ptz !== false && !camera.onvif?.host;
      if (needsRtsp && needsOnvif) return "Paste the plain RTSP URL and ONVIF host, then save this camera.";
      if (needsRtsp) return "Paste the plain RTSP URL, then save this camera.";
      if (needsOnvif) return "Add the ONVIF host or disable mechanical PTZ, then save this camera.";
      return "Save this camera before testing video or exposing it through Matter.";
    }

    function cameraDisplayName(camera, fallback = "Camera") {
      const raw = String(camera?.name ?? "").trim();
      if (!raw) return fallback;
      const envDefault = raw.match(/^\\$\\{[^}:]+:-([^}]+)\\}$/);
      if (envDefault?.[1]) return envDefault[1].trim() || fallback;
      if (/^\\$\\{[^}]+\\}$/.test(raw)) return String(camera?.id ?? "").trim() || fallback;
      return raw;
    }

    function ptzQuickPanel(cameraId, canOperate = true) {
      const config = cameras.find(camera => camera.id === cameraId) ?? (state.cameras ?? []).find(camera => camera.id === cameraId);
      const enabled = Boolean(canOperate && cameraId && cameraPtzConfigured(config));
      const target = "ptz-live-status-" + safeId(cameraId);
      return \`
        <fieldset>
          <legend>Move Camera</legend>
          <div class="ptz-actions">
            <div class="ptz-grid">
              \${ptzButton(cameraId, "up-left", enabled, target)}\${ptzButton(cameraId, "up", enabled, target)}\${ptzButton(cameraId, "up-right", enabled, target)}
              \${ptzButton(cameraId, "left", enabled, target)}\${ptzCheckButton(cameraId, enabled, target)}\${ptzButton(cameraId, "right", enabled, target)}
              \${ptzButton(cameraId, "down-left", enabled, target)}\${ptzButton(cameraId, "down", enabled, target)}\${ptzButton(cameraId, "down-right", enabled, target)}
            </div>
            <div>
              <div class="row ptz-zoom">
                \${ptzButton(cameraId, "zoom-in", enabled, target)}
                \${ptzButton(cameraId, "zoom-out", enabled, target)}
              </div>
              <p class="label">Tap or press while Play Live is running to validate the same motion path a Matter controller reaches.</p>
              <div id="\${target}" class="preview-status" role="status" aria-live="polite"></div>
            </div>
          </div>
        </fieldset>\`;
    }

    function cameraPtzConfigured(camera) {
      return Boolean(camera && camera.matter?.advertise_ptz !== false && camera.onvif?.host);
    }

    function ptzButton(cameraId, direction, enabled, statusId = "") {
      const label = ptzButtonLabel(direction);
      return \`<button type="button" data-action="ptz-\${escapeHtml(direction)}" data-camera-id="\${escapeHtml(cameraId)}" aria-label="\${escapeHtml(label.name)}" title="\${escapeHtml(label.name)}" onpointerdown='beginPtz(event, \${jsString(cameraId)}, \${jsString(direction)}, \${jsString(statusId)})' onpointerup='endPtz(event, \${jsString(cameraId)}, \${jsString(statusId)})' onpointercancel='endPtz(event, \${jsString(cameraId)}, \${jsString(statusId)})' onpointerleave='endPtz(event, \${jsString(cameraId)}, \${jsString(statusId)})' onclick='tapPtz(event, \${jsString(cameraId)}, \${jsString(direction)}, \${jsString(statusId)})' \${enabled ? "" : "disabled"}>\${escapeHtml(label.symbol)}</button>\`;
    }

    function ptzCheckButton(cameraId, enabled, statusId = "") {
      return \`<button type="button" class="ptz-check" data-action="ptz-status" data-camera-id="\${escapeHtml(cameraId)}" aria-label="Check ONVIF PTZ" title="Check ONVIF PTZ" onclick='checkPtz(\${jsString(cameraId)}, \${jsString(statusId)})' \${enabled ? "" : "disabled"}>Test</button>\`;
    }

    function ptzButtonLabel(direction) {
      const labels = {
        "up-left": { symbol: "↖", name: "Move up left" },
        up: { symbol: "↑", name: "Move up" },
        "up-right": { symbol: "↗", name: "Move up right" },
        left: { symbol: "←", name: "Move left" },
        right: { symbol: "→", name: "Move right" },
        "down-left": { symbol: "↙", name: "Move down left" },
        down: { symbol: "↓", name: "Move down" },
        "down-right": { symbol: "↘", name: "Move down right" },
        "zoom-in": { symbol: "Zoom +", name: "Zoom in" },
        "zoom-out": { symbol: "Zoom -", name: "Zoom out" }
      };
      return labels[direction] ?? { symbol: direction, name: direction };
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
      const camera = normalizeMatterActivityCameras(state.matterActivity?.cameras).find(item => item.id === cameraId);
      return Boolean(normalizeMatterCommands(camera?.commands).some(command =>
        command.cluster === "CameraAvSettingsUserLevelManagement" &&
        String(command.command ?? "").startsWith("mptz")
      ));
    }

    function probeDetails(probe, cameraId = "", includeActions = true) {
      if (!probe) return "";
      const errors = [];
      const notes = [];
      if (probe.error) errors.push("Probe: " + friendlyProbeError(probe.error));
      if (probe.primary?.error) {
        const message = probe.ok
          ? "Configured RTSP failed, but ONVIF fallback found a working stream: " + friendlyProbeError(probe.primary.error)
          : "Configured RTSP failed: " + friendlyProbeError(probe.primary.error);
        (probe.ok ? notes : errors).push(message);
      }
      if (probe.fallback?.error && !probe.ok) errors.push("ONVIF fallback failed: " + friendlyProbeError(probe.fallback.error));
      if (probe.effective_uri) notes.push("Using effective stream: " + probe.effective_uri);
      const html = [];
      if (errors.length) html.push('<div class="message bad">' + errors.map(error => '<p>' + escapeHtml(error) + '</p>').join("") + (includeActions ? probeRepairActions(cameraId, errors.join(" ")) : "") + '</div>');
      if (notes.length) html.push('<div class="message notice">' + notes.map(note => '<p>' + escapeHtml(note) + '</p>').join("") + (includeActions ? probeRepairActions(cameraId, notes.join(" ")) : "") + '</div>');
      return html.join("");
    }

    function probeRepairActions(cameraId, message) {
      if (!cameraId) return "";
      const text = String(message ?? "");
      const actions = [];
      if (/RTSP|DESCRIBE|SETUP|401|404|454|stream|path|credential|Unauthorized/i.test(text)) {
        actions.push(\`<button type="button" onclick='openCameraConfig(\${jsString(cameraId)}, "rtsp_url")'>Edit RTSP URL</button>\`);
      }
      if (/ONVIF|PTZ|host|fallback|credential|Unauthorized/i.test(text)) {
        actions.push(\`<button type="button" onclick='openCameraConfig(\${jsString(cameraId)}, "onvif.host")'>Edit ONVIF/PTZ</button>\`);
      }
      if (!actions.length) actions.push(\`<button type="button" onclick='openCameraConfig(\${jsString(cameraId)})'>Edit Camera</button>\`);
      return '<div class="button-group repair-actions">' + actions.join("") + '</div>';
    }

    function friendlyProbeError(message) {
      const text = String(message ?? "").replace(/\\s+/g, " ").trim();
      if (/401\\s*Unauthorized|authorization failed/i.test(text)) {
        return "Camera rejected the RTSP username or password. Update the RTSP URL credentials and the ONVIF password, then save and retry.";
      }
      if (/404|454\\s*Session Not Found|DESCRIBE failed/i.test(text)) {
        return "Camera rejected that RTSP path. Use the plain camera RTSP path, not a Frigate/go2rtc URL with suffixes.";
      }
      if (/timed out/i.test(text)) return "Camera stream timed out.";
      if (/connection refused/i.test(text)) return "Camera connection was refused.";
      return text.length > 220 ? text.slice(0, 220) + "..." : text;
    }

    function collect() {
      return clone(cameras);
    }

    window.requestRemoveCamera = index => {
      pendingRemoveIndex = index;
      openCameraIndex = index;
      renderCameras();
      syncCameraEditorControls();
      const warning = el("remove-warning-" + index);
      warning?.scrollIntoView({ behavior: "smooth", block: "center" });
      warning?.focus();
    };
    window.cancelRemoveCamera = () => {
      pendingRemoveIndex = null;
      renderCameras();
      syncCameraEditorControls();
    };
    window.confirmRemoveCamera = async index => {
      pendingRemoveIndex = null;
      await window.removeCamera(index);
    };
    window.removeDraftCamera = index => {
      pendingRemoveIndex = null;
      const removed = cameras.splice(index, 1)[0];
      if (!removed) return;
      openCameraIndex = Math.max(0, Math.min(index, cameras.length - 1));
      endpointTopologyDirty = true;
      markCameraDirty("Unsaved camera draft removed. Save the remaining changes or cancel to restore the saved camera list.");
      render();
      openCameraDialog();
    };
    window.removeCamera = async index => {
      pendingRemoveIndex = null;
      const removed = cameras.splice(index, 1)[0];
      const stoppedMedia = removed?.id ? await stopCameraMedia(removed.id) : false;
      if (removed) removedCameras.push({ camera: removed, index });
      if (removed?.id && activeLiveCameraId === removed.id) activeLiveCameraId = cameras[0]?.id ?? "";
      openCameraIndex = Math.max(0, Math.min(openCameraIndex, cameras.length - 1));
      endpointTopologyDirty = true;
      markCameraDirty("Camera pending removal. " + (stoppedMedia ? "Preview stopped. " : "") + "Save Changes to apply it, or undo the removal.");
      render();
      openCameraDialog();
    };
    window.undoRemoveCamera = removalIndex => {
      pendingRemoveIndex = null;
      const fallbackIndex = removedCameras.length - 1;
      const requestedIndex = Number.isInteger(Number(removalIndex)) ? Number(removalIndex) : fallbackIndex;
      const boundedIndex = Math.max(0, Math.min(requestedIndex, fallbackIndex));
      const removed = removedCameras.splice(boundedIndex, 1)[0];
      if (!removed) return;
      const index = Math.max(0, Math.min(removed.index, cameras.length));
      cameras.splice(index, 0, removed.camera);
      openCameraIndex = index;
      if (!removedCameras.length && !editedCameraFieldsDirty) {
        cameraConfigDirty = false;
        endpointTopologyDirty = false;
        if (el("save-result")) {
          el("save-result").className = "save-state";
          el("save-result").textContent = "Removal undone. No unsaved camera changes.";
        }
      } else {
        endpointTopologyDirty = true;
        markCameraDirty("Removal undone. Save Changes if you changed anything else.");
      }
      render();
      openCameraDialog();
    };
    window.discardCameraDraft = async () => {
      if (!cameraConfigDirty && !removedCameras.length) {
        el("camera-dialog")?.close?.();
        return;
      }
      await refreshCameraConfig({ force: true });
      removedCameras.length = 0;
      pendingRemoveIndex = null;
      cameraConfigDirty = false;
      endpointTopologyDirty = false;
      editedCameraFieldsDirty = false;
      fieldErrors.clear();
      if (el("save-result")) {
        el("save-result").className = "save-state";
        el("save-result").textContent = "Unsaved camera changes discarded. Saved camera settings restored.";
      }
      render();
      el("camera-dialog")?.close?.();
      showToast("Camera changes discarded.", "warn");
    };
    window.copyMatterText = async (elementId, label) => {
      const status = el("pairing-copy-status");
      const codeElement = el(elementId);
      const value = codeElement?.dataset?.copyValue?.trim() || codeElement?.textContent?.trim() || "";
      if (!value || value === "Not ready") {
        if (status) status.textContent = label + " is not ready yet.";
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        if (status) status.textContent = label + " copied.";
      } catch {
        if (codeElement) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(codeElement);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        const copied = document.execCommand("copy");
        if (status) status.textContent = copied ? label + " copied." : label + " selected. Press Ctrl+C or Command+C to copy.";
      }
    };
    window.selectLiveCamera = async cameraId => {
      if (cameraId === activeLiveCameraId) return;
      await stopAllLivePreviews();
      activeLiveCameraId = cameraId;
      render();
    };
    window.handleCameraTabKey = async (event, cameraId) => {
      const tabs = [...document.querySelectorAll('.camera-tabs [role="tab"]')];
      const currentIndex = tabs.findIndex(tab => tab.id === "camera-tab-" + safeId(cameraId));
      if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      const nextId = tabs[nextIndex]?.id?.replace(/^camera-tab-/, "");
      const camera = (state.cameras ?? []).find(item => safeId(item.id) === nextId);
      if (!camera) return;
      await window.selectLiveCamera(camera.id);
      el("camera-tab-" + safeId(camera.id))?.focus();
    };
    window.openLiveCamera = async cameraId => {
      if (cameraId !== activeLiveCameraId) {
        await stopAllLivePreviews();
        activeLiveCameraId = cameraId;
        render();
      }
      window.scrollToLive();
    };
    window.openProblemLiveCamera = async () => {
      const problem = (state.cameras ?? []).find(camera => cameraRuntimeStatus(camera).label === "offline" || cameraRuntimeStatus(camera).label === "removing")
        ?? (state.cameras ?? []).find(camera => cameraRuntimeStatus(camera).label === "pending")
        ?? (state.cameras ?? [])[0];
      if (problem?.id) {
        await window.openLiveCamera(problem.id);
        return;
      }
      window.scrollToLive();
    };
    window.scrollToCameras = () => {
      openCameraDialog();
    };
    window.scrollToLive = () => {
      el("video")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.scrollToPairing = () => {
      el("pairing")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.openCameraConfig = (cameraId, focusPath = "") => {
      const index = cameras.findIndex(camera => camera.id === cameraId);
      if (index >= 0) openCameraIndex = index;
      renderCameras();
      openCameraDialog();
      focusCameraField(index, focusPath);
    };
    window.openFirstCameraConfig = () => {
      openCameraIndex = Math.max(0, Math.min(openCameraIndex, cameras.length - 1));
      renderCameras();
      openCameraDialog();
    };
    function openCameraDialog() {
      const dialog = el("camera-dialog");
      if (!dialog) return;
      const camera = cameras[openCameraIndex];
      const title = el("camera-dialog-title");
      if (title) title.textContent = camera?.name ? "Edit " + cameraDisplayName(camera) : "Add Camera Feed";
      if (!dialog.open) dialog.showModal();
      syncCameraEditorControls();
    }
    window.closeCameraDialog = () => {
      const dialog = el("camera-dialog");
      if (!dialog) return;
      if (cameraConfigDirty || removedCameras.length) {
        showToast("Save or cancel the camera changes before closing.", "warn");
        return;
      }
      dialog.close();
    };
    function focusCameraField(index, path) {
      if (index < 0 || !path) return;
      setTimeout(() => {
        const input = document.querySelector('input[data-index="' + index + '"][data-path="' + path + '"]');
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.removeAttribute("readonly");
        input?.focus();
      }, 120);
    }
    window.startLivePreview = async cameraId => {
      await window.stopLivePreview(cameraId);
      window.stopFrameFeed(cameraId);
      const video = el("live-" + safeId(cameraId));
      const status = el("snapshot-status-" + safeId(cameraId));
      status.textContent = "Warming camera relay...";
      setPreviewMode(cameraId, "live", "Starting live");
      const peer = new RTCPeerConnection();
      const queuedCandidates = [];
      livePreviews.set(cameraId, { peer, location: null, webRtcSessionId: null, routeBase: matterCameraRoute(cameraId), gotFrame: false, frameTimer: null, queuedCandidates });
      syncPreviewControls(cameraId);
      try {
        peer.addTransceiver("video", { direction: "recvonly" });
        peer.addTransceiver("audio", { direction: "recvonly" });
        const showVideo = () => {
          const preview = livePreviews.get(cameraId);
          if (preview?.frameTimer) clearTimeout(preview.frameTimer);
          if (preview) preview.gotFrame = true;
          const image = el("snapshot-" + safeId(cameraId));
          setPreviewPlaceholder(cameraId, false);
          video.hidden = false;
          if (image) image.hidden = true;
          status.textContent = "Live preview is receiving video frames.";
          setPreviewMode(cameraId, "live", "Live");
        };
        video.onloadeddata = showVideo;
        video.onplaying = showVideo;
        const updateConnectionStatus = () => {
          const preview = livePreviews.get(cameraId);
          if (!preview || preview.gotFrame) return;
          const connection = peer.connectionState || "new";
          const ice = peer.iceConnectionState || "new";
          if (connection === "failed" || ice === "failed") {
            status.textContent = "Live preview failed before video frames. WebRTC: " + connection + ", ICE: " + ice + ".";
            setPreviewMode(cameraId, "error", "Live error");
          } else if (connection === "connected" || ice === "connected" || ice === "completed") {
            status.textContent = "Matter WebRTC connected. Waiting for video frames...";
            setPreviewMode(cameraId, "live", "Waiting");
          }
        };
        peer.onconnectionstatechange = updateConnectionStatus;
        peer.oniceconnectionstatechange = updateConnectionStatus;
        peer.ontrack = event => {
          video.srcObject = event.streams[0] ?? new MediaStream([event.track]);
          status.textContent = "Matter WebRTC answer received. Waiting for video frames...";
          setPreviewMode(cameraId, "live", "Waiting");
        };
        peer.onicecandidate = event => {
          if (!event.candidate) return;
          const preview = livePreviews.get(cameraId);
          const fragment = candidateToSdpFrag(event.candidate);
          if (!preview?.location) {
            queuedCandidates.push(fragment);
            return;
          }
          void sendWhepCandidate(cameraId, preview, fragment);
        };
        const offer = await peer.createOffer();
        await peer.setLocalDescription({ type: offer.type, sdp: preferH264(offer.sdp) });
        await prewarmLivePreview(cameraId).catch(error => {
          status.textContent = "Relay prewarm warning: " + friendlyError(error.message) + ". Starting live preview...";
        });
        const offerResult = await postWhepOffer(cameraId, peer.localDescription.sdp);
        const response = offerResult.response;
        const answer = offerResult.answer;
        const preview = livePreviews.get(cameraId);
        if (preview) preview.routeBase = offerResult.routeBase;
        if (preview) preview.location = response.headers.get("location");
        if (preview) preview.webRtcSessionId = response.headers.get("x-matter-webrtc-session-id");
        await peer.setRemoteDescription({ type: "answer", sdp: answer });
        if (preview) {
          const pending = preview.queuedCandidates.splice(0);
          await Promise.all(pending.map(fragment => sendWhepCandidate(cameraId, preview, fragment)));
        }
        status.textContent = video?.srcObject ? "Matter WebRTC answer received. Waiting for video frames..." : "Waiting for Matter live video...";
        setPreviewMode(cameraId, "live", "Waiting");
        if (preview) {
          preview.frameTimer = setTimeout(() => {
            void showLivePreviewTimeout(cameraId);
          }, 12000);
        }
        syncPreviewControls(cameraId);
      } catch (error) {
        await window.stopLivePreview(cameraId);
        status.textContent = "Live preview failed: " + friendlyError(error.message);
        setPreviewMode(cameraId, "error", "Live error");
      }
    };
    window.stopLivePreview = async cameraId => {
      const preview = livePreviews.get(cameraId);
      livePreviews.delete(cameraId);
      if (preview?.frameTimer) clearTimeout(preview.frameTimer);
      if (preview?.location) {
        const params = new URLSearchParams({ location: preview.location });
        if (preview.webRtcSessionId) params.set("webRtcSessionId", preview.webRtcSessionId);
        await fetch((preview.routeBase ?? matterCameraRoute(cameraId)) + "/whep-session?" + params.toString(), { method: "DELETE" }).catch(() => {});
      }
      await preview?.peer?.close?.();
      const video = el("live-" + safeId(cameraId));
      if (video?.srcObject) {
        for (const track of video.srcObject.getTracks()) track.stop();
      }
      if (video) {
        video.onloadeddata = null;
        video.onplaying = null;
        video.srcObject = null;
        video.hidden = true;
      }
      const image = el("snapshot-" + safeId(cameraId));
      if (image?.getAttribute("src")) image.hidden = false;
      setPreviewPlaceholder(cameraId, !image?.getAttribute("src"));
      setPreviewMode(cameraId, image?.getAttribute("src") ? "" : "", image?.getAttribute("src") ? "Snapshot" : "Idle");
      syncPreviewControls(cameraId);
    };
    async function sendWhepCandidate(cameraId, preview, fragment) {
      if (!preview?.location || !fragment) return;
      const params = new URLSearchParams({ location: preview.location });
      if (preview.webRtcSessionId) params.set("webRtcSessionId", preview.webRtcSessionId);
      await fetch((preview.routeBase ?? matterCameraRoute(cameraId)) + "/whep-session?" + params.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/trickle-ice-sdpfrag" },
        body: fragment
      }).catch(() => {});
    }
    async function postWhepOffer(cameraId, sdp) {
      const routes = [matterCameraRoute(cameraId), legacyCameraRoute(cameraId)];
      let lastError = null;
      for (const routeBase of routes) {
        const response = await fetch(routeBase + "/whep", {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: sdp
        });
        const answer = await response.text();
        if (response.ok) return { response, answer, routeBase };
        lastError = new Error(answer);
        if (response.status !== 404) throw lastError;
      }
      throw lastError ?? new Error("No WHEP preview route is available.");
    }
    async function prewarmLivePreview(cameraId) {
      const routes = [matterCameraRoute(cameraId), legacyCameraRoute(cameraId)];
      let lastError = null;
      for (const routeBase of routes) {
        const response = await fetch(routeBase + "/prewarm", { method: "POST" });
        const text = await response.text();
        if (response.ok) return text ? JSON.parse(text) : {};
        lastError = new Error(text || ("Prewarm failed: " + response.status));
        if (response.status !== 404) throw lastError;
      }
      throw lastError ?? new Error("No prewarm route is available.");
    }
    function preferH264(sdp) {
      if (!sdp) return sdp;
      const sections = sdp.split(/(?=m=)/);
      return sections.map(section => {
        if (!section.startsWith("m=video ")) return section;

        const lines = section.split(/\\r?\\n/);
        const media = lines[0].split(" ");
        const payloads = media.slice(3);
        const codecByPayload = new Map();
        const aptByPayload = new Map();

        for (const line of lines) {
          const rtpmap = line.match(/^a=rtpmap:(\d+)\s+([^/]+)/i);
          if (rtpmap) codecByPayload.set(rtpmap[1], rtpmap[2].toUpperCase());
          const fmtp = line.match(/^a=fmtp:(\d+)\s+.*(?:^|[ ;])apt=(\d+)/i);
          if (fmtp) aptByPayload.set(fmtp[1], fmtp[2]);
        }

        const h264 = payloads.filter(payload => codecByPayload.get(payload) === "H264");
        if (!h264.length) return section;

        const h264Rtx = payloads.filter(payload => codecByPayload.get(payload) === "RTX" && h264.includes(aptByPayload.get(payload)));
        const preferred = [...h264, ...h264Rtx];
        const rest = payloads.filter(payload => !preferred.includes(payload));
        lines[0] = [...media.slice(0, 3), ...preferred, ...rest].join(" ");
        return lines.join("\\r\\n");
      }).join("");
    }
    function matterCameraRoute(cameraId) {
      return "/api/matter/cameras/" + encodeURIComponent(cameraId);
    }
    function legacyCameraRoute(cameraId) {
      return "/api/cameras/" + encodeURIComponent(cameraId);
    }
    function candidateToSdpFrag(candidate) {
      const mid = candidate.sdpMid ?? "0";
      const index = candidate.sdpMLineIndex ?? 0;
      return "a=mid:" + mid + "\\r\\na=m-line-index:" + index + "\\r\\na=" + candidate.candidate + "\\r\\n";
    }
    async function showLivePreviewTimeout(cameraId) {
      const preview = livePreviews.get(cameraId);
      if (!preview || preview.gotFrame) return;
      const status = el("snapshot-status-" + safeId(cameraId));
      const peer = preview.peer;
      let relay = "";
      try {
        const response = await fetch("/api/status?t=" + Date.now());
        const payload = await response.json();
        const active = (payload.mediaHealth?.activeSessions ?? []).find(session => session.cameraId === cameraId);
        if (active) {
          relay = " Relay: " + (active.connectionState ?? "unknown") + ", ICE: " + (active.iceConnectionState ?? "unknown") + ".";
        }
      } catch {}
      status.textContent = "Live preview has not received video frames yet. Browser WebRTC: " + (peer?.connectionState ?? "unknown") + ", ICE: " + (peer?.iceConnectionState ?? "unknown") + "." + relay;
      setPreviewMode(cameraId, "error", "No frames");
    }
    window.loadSnapshot = async cameraId => {
      const existing = snapshotLoads.get(cameraId);
      if (existing) return existing;
      const task = loadSnapshotFrame(cameraId).finally(() => {
        if (snapshotLoads.get(cameraId) === task) snapshotLoads.delete(cameraId);
      });
      snapshotLoads.set(cameraId, task);
      return task;
    };
    async function loadSnapshotFrame(cameraId) {
      const image = el("snapshot-" + safeId(cameraId));
      const status = el("snapshot-status-" + safeId(cameraId));
      status.textContent = "Loading a fresh camera frame...";
      if (!frameFeeds.has(cameraId)) setPreviewMode(cameraId, "", "Snapshot");
      const hadImage = Boolean(image.dataset.objectUrl || image.getAttribute("src"));
      if (!hadImage) image.hidden = true;
      try {
        const response = await fetch("/api/matter/cameras/" + encodeURIComponent(cameraId) + "/snapshot.jpg?width=640&height=360&t=" + Date.now());
        if (!response.ok) {
          const errorText = await response.text();
          let payload = { error: errorText };
          try {
            payload = JSON.parse(errorText);
          } catch {}
          throw new Error(snapshotError(payload));
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("image/")) throw new Error("Snapshot response was not an image.");
        const blob = await response.blob();
        const previous = image.dataset.objectUrl;
        const objectUrl = URL.createObjectURL(blob);
        await loadImage(image, objectUrl);
        if (previous) URL.revokeObjectURL(previous);
        image.dataset.objectUrl = objectUrl;
        setPreviewPlaceholder(cameraId, false);
        status.textContent = "Snapshot loaded.";
        setPreviewMode(cameraId, frameFeeds.has(cameraId) ? "refresh" : "", frameFeeds.has(cameraId) ? "Frame refresh" : "Snapshot");
      } catch (error) {
        if (!hadImage) {
          const previous = image.dataset.objectUrl;
          if (previous) URL.revokeObjectURL(previous);
          delete image.dataset.objectUrl;
          image.removeAttribute("src");
          image.hidden = true;
          setPreviewPlaceholder(cameraId, true);
        }
        status.textContent = hadImage
          ? "Snapshot failed; keeping last good frame. " + friendlyError(error.message)
          : "Snapshot failed. " + friendlyError(error.message);
        setPreviewMode(cameraId, "error", "Snapshot error");
      }
    }
    function setPreviewPlaceholder(cameraId, visible) {
      const placeholder = el("preview-placeholder-" + safeId(cameraId));
      if (placeholder) placeholder.hidden = !visible;
    }
    window.startFrameFeed = async cameraId => {
      await window.stopLivePreview(cameraId);
      window.stopFrameFeed(cameraId);
      const status = el("snapshot-status-" + safeId(cameraId));
      status.textContent = "Frame refresh is loading a snapshot every 2 seconds...";
      setPreviewMode(cameraId, "refresh", "Frame refresh");
      const feed = { stopped: false, timer: null };
      frameFeeds.set(cameraId, feed);
      syncPreviewControls(cameraId);
      while (!feed.stopped) {
        await window.loadSnapshot(cameraId).catch(() => {});
        if (feed.stopped) break;
        await new Promise(resolve => {
          feed.timer = setTimeout(resolve, 2000);
        });
      }
    };
    window.stopFrameFeed = cameraId => {
      const feed = frameFeeds.get(cameraId);
      if (feed) {
        feed.stopped = true;
        if (feed.timer) clearTimeout(feed.timer);
      }
      frameFeeds.delete(cameraId);
      const status = el("snapshot-status-" + safeId(cameraId));
      if (status && feed) status.textContent = "Frame refresh stopped.";
      const image = el("snapshot-" + safeId(cameraId));
      if (feed) setPreviewMode(cameraId, image?.getAttribute("src") ? "" : "", image?.getAttribute("src") ? "Snapshot" : "Idle");
      syncPreviewControls(cameraId);
    };
    function setPreviewMode(cameraId, klass, label) {
      const mode = el("preview-mode-" + safeId(cameraId));
      if (!mode) return;
      mode.className = "preview-mode" + (klass ? " " + klass : "");
      mode.textContent = label;
    }
    function syncPreviewControls(cameraId = "") {
      const cameraIds = cameraId ? [cameraId] : (state.cameras ?? []).map(camera => camera.id).filter(Boolean);
      for (const id of cameraIds) {
        const camera = (state.cameras ?? []).find(item => item.id === id);
        const ready = Boolean(camera?.probe?.ok && !isRemovalStaged(id) && !cameraConfigDirty && !runtimeRestartMessage && !removedCameras.length);
        const liveActive = livePreviews.has(id);
        const loopActive = frameFeeds.has(id);
        setActionDisabled(id, "load-snapshot", !ready || liveActive);
        setActionDisabled(id, "start-webrtc-preview", !ready || liveActive);
        setActionDisabled(id, "stop-webrtc-preview", !liveActive);
        setActionDisabled(id, "start-frame-feed", !ready || loopActive || liveActive);
        setActionDisabled(id, "stop-frame-feed", !loopActive);
      }
    }
    function setActionDisabled(cameraId, action, disabled) {
      document.querySelectorAll('button[data-action="' + action + '"]').forEach(button => {
        if (button.dataset.cameraId === cameraId) button.disabled = disabled;
      });
    }
    window.checkPtz = async (cameraId, statusId = "") => {
      const status = el(statusId || "ptz-status-" + safeId(cameraId));
      status.textContent = "Checking camera movement through the bridge...";
      try {
        const response = await fetch("/api/matter/cameras/" + encodeURIComponent(cameraId) + "/ptz/status?t=" + Date.now());
        const payload = await response.json();
        if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "PTZ status failed");
        status.textContent = "The bridge reached the camera's ONVIF PTZ service.";
      } catch (error) {
        status.textContent = "Camera movement check failed: " + error.message;
      }
    };
    window.movePtz = async (cameraId, direction, statusId = "") => {
      return window.tapPtz(null, cameraId, direction, statusId);
    };
    window.beginPtz = async (event, cameraId, direction, statusId = "") => {
      if (event?.currentTarget?.disabled) return;
      event?.preventDefault?.();
      event?.currentTarget?.setPointerCapture?.(event.pointerId);
      const key = cameraId + ":" + direction;
      lastPointerPtzAt.set(key, Date.now());
      if (activePtzMoves.has(cameraId)) return;
      activePtzMoves.set(cameraId, direction);
      await movePtzContinuous(cameraId, direction, statusId, 650);
    };
    window.endPtz = async (event, cameraId, statusId = "") => {
      if (!activePtzMoves.has(cameraId)) return;
      event?.preventDefault?.();
      activePtzMoves.delete(cameraId);
      const status = el(statusId || "ptz-status-" + safeId(cameraId));
      try {
        await fetch("/api/matter/cameras/" + encodeURIComponent(cameraId) + "/ptz/stop", { method: "POST" });
        if (status) status.textContent = "Camera movement stopped.";
      } catch {
        if (status) status.textContent = "Stop was sent; waiting for the camera.";
      }
    };
    window.tapPtz = async (event, cameraId, direction, statusId = "") => {
      if (event?.currentTarget?.disabled) return;
      const key = cameraId + ":" + direction;
      if (Date.now() - (lastPointerPtzAt.get(key) ?? 0) < 700) return;
      await movePtzContinuous(cameraId, direction, statusId, 250);
    };
    async function movePtzContinuous(cameraId, direction, statusId = "", stopAfterMs = 350) {
      const status = el(statusId || "ptz-status-" + safeId(cameraId));
      status.textContent = "Moving " + direction + "...";
      try {
        const query = new URLSearchParams({ mode: "continuous", speed: "0.35", stopAfterMs: String(stopAfterMs) });
        const response = await fetch("/api/matter/cameras/" + encodeURIComponent(cameraId) + "/ptz/" + encodeURIComponent(direction) + "?" + query.toString(), { method: "POST" });
        const payload = await response.json();
        if (!response.ok || payload.ok === false) throw new Error(payload.error ?? deepErrorMessage(payload.payload ?? payload));
        status.textContent = "Camera moved " + direction + ".";
      } catch (error) {
        status.textContent = "Camera movement " + direction + " failed: " + friendlyError(error.message);
      }
    }
    window.addCamera = () => {
      if (!cameraConfigLoaded) {
        if (el("save-result")) {
          el("save-result").className = cameraConfigLoadError ? "save-state bad" : "save-state";
          el("save-result").textContent = cameraConfigLoadError
            ? "Camera settings are unavailable. Retry Camera Settings before adding a camera."
            : "Camera settings are still loading. Try again in a moment.";
        }
        return;
      }
      pendingRemoveIndex = null;
      openCameraIndex = cameras.length;
      cameras.push({ id: "", name: "", rtsp_url: "", media_source: "", onvif: { host: "", port: 80, user: "", password_set: false }, matter: { advertise_ptz: true, advertise_audio: true, advertise_person_detection: false } });
      endpointTopologyDirty = true;
      markCameraDirty("New camera added. Name it, then paste the RTSP URL and ONVIF host before saving.");
      cameraChangeNotice = "New camera added. Name it, then paste the RTSP URL and ONVIF host before saving.";
      render();
      openCameraDialog();
      focusCameraField(openCameraIndex, "name");
    };
    el("add-feed").onclick = window.addCamera;
    el("test-camera").onclick = () => testCamera(openCameraIndex);
    function syncCameraEditorControls() {
      const unavailable = !cameraConfigLoaded || Boolean(cameraConfigLoadError);
      const hasDraftChanges = cameraConfigDirty || removedCameras.length > 0;
      const incompleteDraft = cameras.length > 0 && Boolean(firstIncompleteCameraDraft());
      if (el("add-feed")) el("add-feed").disabled = unavailable;
      if (el("save")) {
        el("save").hidden = unavailable;
        el("save").disabled = unavailable || cameraSaveInFlight || !hasDraftChanges || incompleteDraft;
        el("save").textContent = removedCameras.length ? "Save Changes" : "Save Camera";
      }
      if (el("test-camera")) {
        el("test-camera").hidden = unavailable;
        el("test-camera").disabled = unavailable || cameraSaveInFlight || !cameras[openCameraIndex];
      }
      if (el("cancel-camera-edit")) {
        el("cancel-camera-edit").textContent = unavailable ? "Close" : "Cancel";
      }
      if (el("delete-camera")) {
        const savedCameraCount = Array.isArray(state.cameraConfig?.cameras) ? state.cameraConfig.cameras.length : 0;
        const hasOpenCamera = Boolean(cameras[openCameraIndex]);
        const isSavedCamera = hasOpenCamera && openCameraIndex < savedCameraCount;
        const canDelete = hasOpenCamera;
        const confirmingDelete = pendingRemoveIndex === openCameraIndex;
        el("delete-camera").hidden = unavailable || !canDelete || confirmingDelete;
        el("delete-camera").disabled = unavailable || cameraSaveInFlight || !canDelete;
        el("delete-camera").textContent = isSavedCamera ? "Delete Camera" : "Remove Draft";
        el("delete-camera").onclick = () => isSavedCamera ? requestRemoveCamera(openCameraIndex) : removeDraftCamera(openCameraIndex);
      }
      if (el("dialog-footer-status")) {
        const missing = cameras.length > 0 ? firstIncompleteCameraDraft() : null;
        el("dialog-footer-status").textContent = cameraSaveInFlight
          ? "Saving..."
          : unavailable
            ? "Camera storage unavailable"
            : missing
              ? "Complete required fields before saving"
              : hasDraftChanges
                ? "Unsaved changes"
                : "";
      }
    }
    el("save").onclick = async () => {
      if (cameraSaveInFlight) return;
      if (!cameraConfigLoaded) {
        if (cameraConfigLoadError) {
          el("save-result").className = "save-state bad";
          el("save-result").textContent = "Camera settings are unavailable. Retry Camera Settings before saving changes.";
          return;
        }
        el("save-result").textContent = "Camera settings are still loading. Try again in a moment.";
        return;
      }
      const validationErrors = validateCameraDrafts();
      if (validationErrors.length) {
        el("save-result").className = "save-state bad";
        el("save-result").textContent = validationSummary(validationErrors);
        if (Number.isInteger(validationErrors.firstIndex)) openCameraIndex = validationErrors.firstIndex;
        renderCameras();
        focusCameraField(validationErrors.firstIndex, validationErrors.firstPath);
        return;
      }
      el("save-result").className = "save-state";
      el("save-result").textContent = "Saving...";
      cameraSaveInFlight = true;
      syncCameraEditorControls();
      const restartAfterSave = endpointTopologyDirty || removedCameras.length > 0;
      let payload = {};
      try {
        const response = await fetch("/api/cameras", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cameras: collect(), restartRequired: restartAfterSave })
        });
        payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          el("save-result").className = "save-state bad";
          el("save-result").textContent = payload.error ?? "Save failed";
          return;
        }
      } catch (error) {
        el("save-result").className = "save-state bad";
        el("save-result").textContent = "Save failed. Check the add-on logs or retry in a moment. " + friendlyError(error.message);
        return;
      } finally {
        cameraSaveInFlight = false;
        syncCameraEditorControls();
      }
      cameras = clone(payload.cameras ?? []);
      fieldErrors.clear();
      removedCameras.length = 0;
      pendingRemoveIndex = null;
      cameraConfigDirty = false;
      endpointTopologyDirty = false;
      editedCameraFieldsDirty = false;
      runtimeRestartMessage = payload.restartRequired
        ? (payload.message ?? "Saved. Restart this add-on from the Home Assistant add-on page to apply endpoint changes.")
        : "";
      if (payload.restartRequired) {
        el("save-result").className = "save-state warn";
        el("save-result").textContent = runtimeRestartMessage;
        state.cameraConfig = { ...(state.cameraConfig ?? {}), cameras };
        renderRuntimeRestartBar();
        renderCameras();
        showToast("Saved. Restart the add-on so Matter endpoints match the camera list.", "warn");
        return;
      }
      el("save-result").textContent = "Saved. Reloading bridge status...";
      await refreshStatus();
      el("save-result").textContent = payload.bridgeReload?.ok
        ? "Saved. Status refreshed."
        : "Saved, but bridge reload failed. Restart this add-on from the Home Assistant add-on page to apply the camera settings.";
      showToast(payload.bridgeReload?.ok ? "Camera saved and status refreshed." : "Camera saved, but bridge reload needs attention.", payload.bridgeReload?.ok ? "ok" : "warn");
      renderCameras();
    };
    async function testCamera(index) {
      const camera = cameras[index];
      if (!camera) return;
      if (cameraConfigDirty || removedCameras.length) {
        showToast("Save this camera before testing. Tests use the running add-on configuration.", "warn");
        return;
      }
      const status = (state.cameras ?? []).find(item => item.id === camera.id);
      if (!status) {
        showToast("Camera is not running yet. Save it, restart the add-on if prompted, then refresh.", "warn");
        return;
      }
      const passed = [];
      const failed = [];
      if (status.probe?.ok && status.probe?.has_video) passed.push("stream");
      else failed.push("stream");
      try {
        const snapshot = await fetch("/api/matter/cameras/" + encodeURIComponent(camera.id) + "/snapshot.jpg?width=640&height=360&t=" + Date.now());
        if (snapshot.ok && String(snapshot.headers.get("content-type") ?? "").includes("image/")) passed.push("snapshot");
        else failed.push("snapshot");
      } catch {
        failed.push("snapshot");
      }
      if (cameraPtzConfigured(camera)) {
        try {
          const response = await fetch("/api/matter/cameras/" + encodeURIComponent(camera.id) + "/ptz/status?t=" + Date.now());
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload.ok !== false) passed.push("ONVIF PTZ");
          else failed.push("ONVIF PTZ");
        } catch {
          failed.push("ONVIF PTZ");
        }
      }
      showToast(
        (failed.length ? "Camera test needs attention." : "Camera test passed.") +
          (passed.length ? " Passed: " + passed.join(", ") + "." : "") +
          (failed.length ? " Failed: " + failed.join(", ") + "." : ""),
        failed.length ? "bad" : "ok"
      );
    }
    function validateCameraDrafts() {
      const errors = [];
      fieldErrors.clear();
      const ids = new Set();
      const draft = collect();
      const addError = (index, path, message) => {
        fieldErrors.set(fieldKey(index, path), message);
        errors.push(message);
        if (!Number.isInteger(errors.firstIndex)) {
          errors.firstIndex = index;
          errors.firstPath = path;
        }
      };
      draft.forEach((camera, index) => {
        const label = cameraDisplayName(camera, camera.id?.trim() || "Camera " + (index + 1));
        const cameraId = String(camera.id ?? "").trim();
        if (!cameraId) addError(index, "id", label + ": Camera ID is required.");
        else if (!/^[a-zA-Z0-9_-]+$/.test(cameraId)) addError(index, "id", label + ": Camera ID must use only letters, numbers, underscores, or hyphens.");
        else if (ids.has(cameraId)) addError(index, "id", label + ": Camera ID is duplicated.");
        if (cameraId) ids.add(cameraId);
        if (!String(camera.name ?? "").trim()) addError(index, "name", label + ": Display Name is required.");
        const rtspUrl = String(camera.rtsp_url ?? "").trim();
        if (!rtspUrl) addError(index, "rtsp_url", label + ": RTSP URL is required.");
        else {
          const problem = rtspUrlProblem(rtspUrl);
          if (problem) addError(index, "rtsp_url", label + ": " + problem);
        }
        if (camera.matter?.advertise_ptz !== false && !String(camera.onvif?.host ?? "").trim()) addError(index, "onvif.host", label + ": Camera IP / Host is required when mechanical PTZ is enabled.");
      });
      return errors;
    }
    function validationSummary(errors) {
      const details = errors.slice(0, 2).map(error => String(error).replace(/^.*?:\\s*/, "").replace(/[.!?]+$/, ""));
      const more = errors.length > details.length ? " and " + (errors.length - details.length) + " more" : "";
      return "Fix highlighted fields before saving: " + details.join("; ") + more + ".";
    }
    function fieldKey(index, path) {
      return String(index) + ":" + String(path);
    }
    function clearFieldError(index, path, input) {
      fieldErrors.delete(fieldKey(index, path));
      input?.classList.remove("invalid");
      input?.classList.remove("autofill-ghost");
      input?.removeAttribute("aria-invalid");
      input?.parentElement?.querySelector(".field-error")?.remove();
    }
    function hideInvalidEmptyAutofill() {
      requestAnimationFrame(() => {
        document.querySelectorAll("input.invalid").forEach(input => {
          if (input.value === "") input.classList.add("autofill-ghost");
        });
      });
    }
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
      el("reset-result").textContent = "Scheduled. Restart this add-on from the Home Assistant add-on page now.";
      await refreshStatus();
    }
    async function refreshCameraConfig({ force = false } = {}) {
      const response = await fetch("/api/cameras");
      const payload = await response.json();
      if (!response.ok) {
        const detail = payload?.path ? payload.error + " (" + payload.path + ")" : payload?.error;
        throw new Error(detail || "Camera settings request failed.");
      }
      if (force || !cameraConfigDirty) cameras = clone(payload.cameras ?? cameras);
      if (force || !cameraConfigDirty) fieldErrors.clear();
      if (force || !cameraConfigDirty) pendingRemoveIndex = null;
      state.cameraConfig = payload;
      cameraConfigLoaded = true;
      cameraConfigLoadError = "";
      if (!cameraConfigDirty && el("save-result")) el("save-result").textContent = "";
    }
    window.retryCameraConfig = async () => {
      cameraConfigLoadError = "";
      if (el("save-result")) {
        el("save-result").className = "save-state";
        el("save-result").textContent = "Loading camera settings...";
      }
      try {
        await refreshCameraConfig({ force: true });
      } catch (error) {
        cameraConfigLoadError = friendlyError(error.message);
        if (el("save-result")) {
          el("save-result").className = "save-state bad";
          el("save-result").textContent = "Camera settings load failed. " + cameraConfigLoadError;
        }
      }
      render();
    };
    async function refreshStatus() {
      if (cameraConfigDirty || removedCameras.length) {
        warnUnsavedRefreshBlocked();
        return;
      }
      await stopAllLivePreviews();
      const response = await fetch("/api/status");
      state = await response.json();
      await refreshCameraConfig({ force: true });
      runtimeRestartMessage = "";
      render();
    }
    el("refresh").onclick = refreshStatus;
    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
    }
    function showToast(message, klass = "") {
      const target = el("toast");
      if (!target) return;
      target.className = "toast" + (klass ? " " + klass : "");
      target.textContent = message;
      target.hidden = false;
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => {
        target.hidden = true;
      }, 7000);
    }
    function jsString(value) {
      return JSON.stringify(String(value ?? ""));
    }
    function safeId(value) {
      return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
    }
    async function stopAllLivePreviews() {
      for (const cameraId of [...frameFeeds.keys()]) window.stopFrameFeed(cameraId);
      await Promise.all([...livePreviews.keys()].map(cameraId => stopLivePreview(cameraId)));
    }
    async function stopCameraMedia(cameraId) {
      const hadMedia = frameFeeds.has(cameraId) || livePreviews.has(cameraId);
      window.stopFrameFeed(cameraId);
      await window.stopLivePreview(cameraId);
      return hadMedia;
    }
    window.addEventListener("beforeunload", event => {
      for (const feed of frameFeeds.values()) {
        feed.stopped = true;
        if (feed.timer) clearTimeout(feed.timer);
      }
      for (const preview of livePreviews.values()) {
        preview.peer?.close?.();
      }
      if (cameraConfigDirty || removedCameras.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
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
    function friendlyError(message) {
      const value = String(message ?? "");
      if (/401\\s*Unauthorized|authorization failed/i.test(value)) return "Camera rejected the RTSP credentials.";
      if (/404|454\\s*Session Not Found|DESCRIBE failed/i.test(value)) return "Camera rejected that RTSP path.";
      if (/ENOENT|no such file or directory|cameras\\.json/i.test(value)) return "Camera settings file is missing. Restart the add-on or check that STREAM_TO_MATTER_CONFIG points at the mounted cameras.json file.";
      if (/timed?\\s*out|Connection timed out/i.test(value)) return "Camera stream timed out.";
      if (/Connection refused/i.test(value)) return "Camera connection was refused.";
      return value.split("\\n").join(" ").slice(0, 220);
    }
    function cameraConfigLoadDetail() {
      return "Runtime status is still visible, but editing is paused so existing camera entries and passwords are not overwritten. Restart the add-on or fix the camera config mount/path, then retry.";
    }
    try {
      render();
      refreshCameraConfig().then(render).catch(error => {
        cameraConfigLoadError = friendlyError(error.message);
        if (el("save-result")) {
          el("save-result").className = "save-state bad";
          el("save-result").textContent = "Camera settings load failed. " + cameraConfigLoadError;
        }
        render();
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
