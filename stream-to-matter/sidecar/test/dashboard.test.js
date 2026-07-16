import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { dashboardHtml } from "../src/dashboard.js";

const sampleStatus = {
  ok: true,
  bridge: { ok: true },
  media: { ok: true },
  matterNodeStarted: true,
  matterPairable: false,
  commissioning: {
    started: true,
    pairable: true,
    manualPairingCode: "34970112332",
    qrPairingCode: "MT:-24J0AFN00KA0648G00",
    credentialSource: "default_static",
    cameraEndpoints: {
      matter_fp2_lab: { attached: true }
    }
  },
  cameras: [
    {
      id: "matter_fp2_lab",
      name: "Matter FP2 Lab",
      probe: {
        ok: true,
        has_video: true,
        has_audio: true
      },
      endpoint: {
        attached: true
      }
    }
  ],
  cameraConfig: {
    cameras: [
      {
        id: "matter_fp2_lab",
        name: "Matter FP2 Lab",
        rtsp_url: "rtsp://127.0.0.1:8555/stm_lab",
        matter: {
          advertise_ptz: true,
          advertise_audio: true,
          advertise_person_detection: true
        },
        onvif: {
          host: "127.0.0.1",
          port: 18080,
          user: "",
          password: ""
        }
      }
    ]
  }
};

function extractDashboardFunction(html, assignmentName, nextFunctionName) {
  const start = html.indexOf("window." + assignmentName + " = ");
  const end = html.indexOf("\n\n    function " + nextFunctionName, start);
  assert.notEqual(start, -1, assignmentName + " function should exist");
  assert.notEqual(end, -1, nextFunctionName + " should follow " + assignmentName);
  return html.slice(start, end);
}

function trackedInput(value = "") {
  return {
    value,
    focused: false,
    events: [],
    removeAttribute(name) {
      this.removed = name;
    },
    dispatchEvent(event) {
      this.events.push(event);
    },
    focus() {
      this.focused = true;
    }
  };
}

test("dashboard renders PTZ controls without forbidden Home Assistant copy", () => {
  const html = dashboardHtml(sampleStatus);

  assert.doesNotMatch(html, /PTZ Test/);
  assert.match(html, /Matter QR Code/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml/);
  assert.doesNotMatch(html, /id="workflow"/);
  assert.doesNotMatch(html, /id="next-step"/);
  assert.match(html, /id="add-feed"/);
  assert.match(html, /id="camera-dialog"/);
  assert.match(html, /\.camera-dialog\[open\] \{ display: grid; grid-template-rows: auto minmax\(0, 1fr\) auto; \}/);
  assert.match(html, /\.dialog-footer \.button-group:last-child \{ margin-left: auto; \}/);
  assert.match(html, /\.dialog-body \{ padding: 16px; overflow: auto; \}/);
  assert.match(html, /id="test-camera"/);
  assert.match(html, /html, body \{ width: 100%; max-width: 100%; overflow-x: hidden; \}/);
  assert.match(html, /\.grid \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(180px, 1fr\)\); gap: 12px; \}/);
  assert.match(html, /button\.primary:disabled \{ background: #e2e8f0; border-color: #cbd5e1; color: var\(--muted\); opacity: 1; \}/);
  assert.match(html, /header \{ align-items: flex-start; flex-direction: column; \}/);
  assert.match(html, /header \.primary \{ width: 100%; \}/);
  assert.match(html, /main \{ padding-top: 14px; gap: 14px; \}/);
  assert.match(html, /main, \.panel, \.card, \.camera, \.hero, \.two, \.live-workspace, \.pairing-layout \{ min-width: 0; max-width: 100%; \}/);
  assert.match(html, /\.preview-actions button, \.camera-action-strip \.button-group button \{ width: 100%; \}/);
  assert.match(html, /\.message, \.hint, \.notice \{ overflow-wrap: anywhere; word-break: normal; \}/);
  assert.match(html, /\.copy-row \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(html, /function personSensorConfiguredCount/);
  assert.match(html, /if \(configuredPersonCount\) extras\.push\(`\$\{personCount\} \/ \$\{configuredPersonCount\} person sensors attached`\)/);
  assert.match(html, /camera\?\.matter\?\.advertise_person_detection === true/);
  assert.ok(html.indexOf('id="summary"') < html.indexOf('id="video"'));
  assert.match(html, /<section class="status-strip" id="summary"><\/section>/);
  assert.match(html, /\.status-strip \{ display: grid; grid-template-columns: repeat\(4, minmax\(112px, 1fr\)\);/);
  assert.match(html, /\.status-item \.value \{ overflow-wrap: normal; word-break: normal; \}/);
  assert.match(html, /\.status-action \{ grid-column: 1 \/ -1; display: flex;/);
  assert.match(html, /function renderSummaryStrip/);
  assert.match(html, /summaryItem\("Bridge"/);
  assert.match(html, /summaryItem\("Camera"/);
  assert.match(html, /summaryItem\("Matter"/);
  assert.match(html, /summaryItem\("Live Relay"/);
  assert.match(html, /function primaryNextAction/);
  assert.match(html, /function cameraOverallStatus/);
  assert.doesNotMatch(html, /Person Sensors/);
  assert.doesNotMatch(html, /function renderWorkflow/);
  assert.doesNotMatch(html, /function renderNextStep/);
  assert.match(html, /function renderGuidance/);
  assert.match(html, /renderGuidance\(\)/);
  assert.match(html, /id="setup-focus" class="panel setup-focus"/);
  assert.match(html, /function renderSetupFocus/);
  assert.match(html, /Add one camera feed, then test video and movement before pairing it with Matter/);
  assert.match(html, /Ready to Pair/);
  assert.ok(html.indexOf('class="hero"') < html.indexOf('id="video"'));
  assert.ok(html.indexOf('id="pairing"') < html.indexOf('id="video"'));
  assert.match(html, /function configuredCameraCount/);
  assert.match(html, /Array\.isArray\(state\.cameraConfig\?\.cameras\) \? state\.cameraConfig\.cameras\.length : 0/);
  assert.match(html, /renderPairing\(c, cameraCount, attachedCount, videoCount\)/);
  assert.match(html, /renderLiveFeeds\(cameraStatuses, cameraCount\)/);
  assert.match(html, /function incompleteCameraDraft/);
  assert.match(html, /function firstIncompleteCameraDraft/);
  assert.match(html, /const result = incompleteCameraDraft\(draft\[index\]\)/);
  assert.match(html, /function cameraDisplayName/);
  assert.match(html, /const envDefault = raw\.match/);
  assert.match(html, /return envDefault\[1\]\.trim\(\) \|\| fallback/);
  assert.match(html, /cameraDisplayName\(active\)/);
  assert.match(html, /Camera Feed/);
  assert.match(html, /Configure the saved feed used by snapshots, live preview, ONVIF PTZ, and Matter camera media/);
  assert.match(html, /Enter a display name so Matter controllers show a useful camera name/);
  assert.match(html, /if \(cameraConfigDirty \|\| removedCameras\.length\) \{/);
  assert.match(html, /const incompleteDraft = cameras\.length > 0 && Boolean\(firstIncompleteCameraDraft\(\)\)/);
  assert.match(html, /Save this camera before testing\. Tests use the running add-on configuration\./);
  assert.match(html, /let cameraConfigLoadError = ""/);
  assert.match(html, /Retry Camera Settings/);
  assert.match(html, /Camera settings storage is not available/);
  assert.match(html, /Runtime status is still visible, but editing is paused so existing camera entries and passwords are not overwritten/);
  assert.match(html, /fix the camera config mount\/path/);
  assert.match(html, /window\.retryCameraConfig/);
  assert.match(html, /payload\?\.path \? payload\.error \+ " \(" \+ payload\.path \+ "\)" : payload\?\.error/);
  assert.match(html, /Camera settings file is missing\. Restart the add-on or check that STREAM_TO_MATTER_CONFIG points at the mounted cameras\.json file/);
  assert.match(html, /Camera settings are unavailable\. Retry Camera Settings before saving changes\./);
  assert.match(html, /Loading camera settings/);
  assert.match(html, /saved camera list before enabling Add or Save/);
  assert.match(html, /function syncCameraEditorControls/);
  assert.match(html, /const unavailable = !cameraConfigLoaded \|\| Boolean\(cameraConfigLoadError\)/);
  assert.match(html, /const hasDraftChanges = cameraConfigDirty \|\| removedCameras\.length > 0/);
  assert.match(html, /const incompleteDraft = cameras\.length > 0 && Boolean\(firstIncompleteCameraDraft\(\)\)/);
  assert.doesNotMatch(html, /Add Another Camera/);
  assert.doesNotMatch(html, /el\("add"\)/);
  assert.match(html, /el\("save"\)\.hidden = unavailable/);
  assert.match(html, /el\("test-camera"\)\.hidden = unavailable/);
  assert.match(html, /el\("cancel-camera-edit"\)\.textContent = unavailable \? "Close" : "Cancel"/);
  assert.match(html, /el\("delete-camera"\)\.hidden = unavailable \|\| !canDelete \|\| confirmingDelete/);
  assert.match(html, /el\("save"\)\.disabled = unavailable \|\| cameraSaveInFlight \|\| !hasDraftChanges \|\| incompleteDraft/);
  assert.doesNotMatch(html, /data-action="save-camera-shortcut"/);
  assert.match(html, /syncCameraEditorControls\(\)/);
  assert.match(html, /Camera settings are unavailable\. Retry Camera Settings before adding a camera\./);
  assert.doesNotMatch(html, /function nextStepCard/);
  assert.doesNotMatch(html, /workflow-step/);
  assert.match(html, /function testCamera/);
  assert.match(html, /showToast/);
  assert.match(html, /window\.scrollToCameras/);
  assert.match(html, /window\.scrollToLive/);
  assert.match(html, /window\.scrollToPairing/);
  assert.match(html, /window\.openCameraConfig/);
  assert.match(html, /window\.openProblemLiveCamera/);
  assert.match(html, /if \(!camera\?\.probe\?\.ok \|\| !camera\?\.probe\?\.has_video\) return \{ label: "offline", klass: "bad" \}/);
  assert.match(html, /const problem = \(state\.cameras \?\? \[\]\)\.find\(camera => cameraRuntimeStatus\(camera\)\.label === "offline" \|\| cameraRuntimeStatus\(camera\)\.label === "removing"\)/);
  assert.match(html, /\?\? \(state\.cameras \?\? \[\]\)\.find\(camera => cameraRuntimeStatus\(camera\)\.label === "pending"\)/);
  assert.match(html, /await window\.openLiveCamera\(problem\.id\)/);
  assert.match(html, /window\.addCamera/);
  assert.match(html, /el\("add-feed"\)\.onclick = window\.addCamera/);
  assert.match(html, /el\("test-camera"\)\.onclick = \(\) => testCamera\(openCameraIndex\)/);
  assert.match(html, /const cameraCount = configuredCameraCount\(cameraStatuses\)/);
  assert.doesNotMatch(html, /el\("add"\)\.onclick/);
  assert.match(html, /Edit Camera/);
  assert.ok(html.includes("/matter/onboarding.svg"));
  assert.match(html, /summaryItem\("Matter", matterNodeLabel\(commissioning, cameraCount, attachedCount, videoCount\), matterNodeClass\(commissioning, cameraCount, attachedCount, videoCount\)\)/);
  assert.match(html, /function matterNodeLabel\(commissioning, cameraCount = 1, attachedCount = 1, videoCount = cameraCount\)/);
  assert.match(html, /if \(!cameraCount\) return "Needs camera"/);
  assert.match(html, /if \(attachedCount < cameraCount\) return "Needs restart"/);
  assert.match(html, /if \(videoCount < cameraCount\) return "Video first"/);
  assert.match(html, /function matterNodeClass\(commissioning, cameraCount = 1, attachedCount = 1, videoCount = cameraCount\)/);
  assert.match(html, /if \(!cameraCount \|\| attachedCount < cameraCount\) return "warn"/);
  assert.match(html, /if \(videoCount < cameraCount\) return "warn"/);
  assert.match(html, /Ready to pair/);
  assert.match(html, /Scan this from your Matter controller\. The manual code is below if your controller cannot scan QR\./);
  assert.match(html, /pairing-primary/);
  assert.match(html, /pairing-primary \$\{commissioning\?\.pairable && cameraCount && attachedCount >= cameraCount && videoCount >= cameraCount \? "ready" : ""\}/);
  assert.match(html, /id="runtime-badge" class="runtime-badge"/);
  assert.match(html, /state\.appVersion/);
  assert.match(html, /state\.sidecarPort/);
  assert.match(html, /pairingQr\(commissioning, cameraCount, attachedCount, videoCount\)\}\s+\$?\{pairingCopy\(commissioning, cameraCount, attachedCount, videoCount\)/);
  assert.match(html, /Manual pairing code/);
  assert.match(html, /Advanced QR payload/);
  assert.match(html, /Dashboard version, sidecar port, and the time this browser last loaded status/);
  assert.match(html, /Matter is running, but video is offline\. Fix the stream before pairing, resetting identity, or testing from a Matter controller/);
  assert.match(html, /function pairingVideoNotice\(cameraCount, videoCount\)/);
  assert.match(html, /Video check comes first/);
  assert.match(html, /Fix every camera stream before pairing or rotating Matter identity/);
  assert.match(html, /function pairingCopy\(commissioning, cameraCount = 0, attachedCount = 0, videoCount = cameraCount\)/);
  assert.match(html, /Pairing codes will appear after every configured camera produces video/);
  assert.match(html, /pairingQr\(commissioning, cameraCount, attachedCount, videoCount\)/);
  assert.match(html, /if \(!cameraCount \|\| attachedCount < cameraCount \|\| videoCount < cameraCount\) return ""/);
  assert.match(html, /pairing-copy/);
  assert.match(html, /copy-row/);
  assert.match(html, /manual-pairing-code/);
  assert.match(html, /qr-pairing-code/);
  assert.match(html, /window\.copyMatterText/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.match(html, /label \+ " copied\."/);
  assert.match(html, /Press Ctrl\+C or Command\+C to copy/);
  assert.doesNotMatch(html, /Start All Snapshot Loops/);
  assert.match(html, /camera-tabs/);
  assert.match(html, /camera-tab-name/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /live-panel/);
  assert.match(html, /live-workspace/);
  assert.match(html, /live-preview-column/);
  assert.match(html, /live-control-column/);
  assert.match(html, /No cameras configured/);
  assert.match(html, /No cameras yet/);
  assert.match(html, /All cameras are pending removal\./);
  assert.match(html, /Save Changes to apply an empty camera list, or undo the removal before saving\./);
  assert.match(html, /After saving an empty list, restart this add-on from the Home Assistant add-on page so Matter removes the old camera endpoints\./);
  assert.match(html, /id="camera-change-bar" class="change-bar" tabindex="-1"/);
  assert.match(html, /camera-action-strip/);
  assert.match(html, /Save this camera before testing video or exposing it through Matter/);
  assert.match(html, /Save camera changes before testing\. Live feed and movement controls use the last saved add-on settings\./);
  assert.match(html, /const testable = saved && !cameraConfigDirty/);
  assert.match(html, /if \(!saved\) \{/);
  assert.match(html, /Ready to save/);
  assert.match(html, /Needs required fields/);
  assert.doesNotMatch(html, /<button type="button" onclick='openLiveCamera\(\$\{jsString\(camera\.id\)\}\)' \$\{testable \? "" : "disabled"\}>Open Live Feed<\/button>/);
  assert.match(html, /const saveReady = !incompleteCameraDraft\(camera\)/);
  assert.match(html, /cameraEditorHealth\(camera, status\)/);
  assert.match(html, /function cameraEditorHealth\(camera, status\)/);
  assert.match(html, /health-row/);
  assert.doesNotMatch(html, /function cameraSetupChecklist/);
  assert.doesNotMatch(html, /function setupStep/);
  assert.match(html, /cameraSetupActions\(camera, status, index\)/);
  assert.match(html, /function cameraSetupActions\(camera, status, index\)/);
  assert.doesNotMatch(html, /data-action="save-camera-shortcut" data-index="' \+ index \+ '"/);
  assert.match(html, /Open Live Feed/);
  assert.doesNotMatch(html, /Test PTZ/);
  assert.match(html, /Matter Pairing/);
  assert.match(html, /window\.openLiveCamera/);
  assert.match(html, /scrollToLive\(\)/);
  assert.match(html, /runtime-restart-bar/);
  assert.match(html, /change-bar active/);
  assert.match(html, /Unsaved camera changes/);
  assert.match(html, /Undo Removal/);
  assert.match(html, /Discard Changes/);
  assert.match(html, /let pendingRemoveIndex = null/);
  assert.match(html, /window\.requestRemoveCamera/);
  assert.match(html, /window\.confirmRemoveCamera/);
  assert.match(html, /window\.confirmRemoveCamera = async index/);
  assert.match(html, /window\.cancelRemoveCamera/);
  assert.match(html, /id="delete-camera"/);
  assert.match(html, /Confirm Delete/);
  assert.match(html, /Delete Camera/);
  assert.match(html, /const savedCameraCount = Array\.isArray\(state\.cameraConfig\?\.cameras\) \? state\.cameraConfig\.cameras\.length : 0/);
  assert.match(html, /window\.removeDraftCamera/);
  assert.match(html, /el\("delete-camera"\)\.hidden = unavailable \|\| !canDelete \|\| confirmingDelete/);
  assert.match(html, /function removeConfirmationPanel/);
  assert.match(html, /delete-confirmation/);
  assert.match(html, /Delete \$\{escapeHtml\(label\)\}\?/);
  assert.match(html, /onclick="cancelRemoveCamera\(\)">Cancel/);
  assert.match(html, /onclick="confirmRemoveCamera\(\$\{index\}\)">Confirm Delete/);
  assert.doesNotMatch(html, /Stage Remove/);
  assert.doesNotMatch(html, /Stage Removal/);
  assert.match(html, /Cancel/);
  assert.match(html, /This stages removal only\. Confirm here, then save the removal and restart the add-on so Matter removes the endpoint\./);
  assert.doesNotMatch(html, /Click Confirm Delete in the footer/);
  assert.match(html, /function stagedRemovalsPanel/);
  assert.match(html, /pending removal/);
  assert.match(html, /Nothing is deleted until you click Save Changes/);
  assert.match(html, /removal-item/);
  assert.match(html, /onclick="undoRemoveCamera\(\$\{removalIndex\}\)">Undo/);
  assert.match(html, /el\("delete-camera"\)\.onclick = \(\) => isSavedCamera \? requestRemoveCamera\(openCameraIndex\) : removeDraftCamera\(openCameraIndex\)/);
  assert.match(html, /id="add-feed"/);
  assert.match(html, /id="camera-dialog"/);
  assert.match(html, /Raw Status/);
  assert.doesNotMatch(html, /Start All Live/);
  assert.match(html, /id="remove-warning-\$\{index\}"/);
  assert.match(html, /warning\?\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(html, /warning\?\.focus\(\)/);
  assert.match(html, /window\.undoRemoveCamera/);
  assert.match(html, /window\.removeCamera = async index/);
  assert.match(html, /await stopCameraMedia\(removed\.id\)/);
  assert.match(html, /Preview stopped/);
  assert.match(html, /function stopCameraMedia/);
  assert.match(html, /const hadMedia = frameFeeds\.has\(cameraId\) \|\| livePreviews\.has\(cameraId\)/);
  assert.match(html, /window\.stopFrameFeed\(cameraId\)/);
  assert.match(html, /await window\.stopLivePreview\(cameraId\)/);
  assert.match(html, /activeLiveCameraId === removed\.id/);
  assert.match(html, /window\.discardCameraDraft/);
  assert.match(html, /Unsaved camera changes discarded\. Saved camera settings restored\./);
  assert.match(html, /refreshCameraConfig\(\{ force: true \}\)/);
  assert.match(html, /if \(force \|\| !cameraConfigDirty\) cameras = clone/);
  assert.match(html, /function warnUnsavedRefreshBlocked/);
  assert.match(html, /Unsaved camera changes\. Save or discard them before refreshing status\./);
  assert.match(html, /target\?\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(html, /target\?\.focus\?\.\(\)/);
  assert.match(html, /if \(cameraConfigDirty \|\| removedCameras\.length\) \{\n        warnUnsavedRefreshBlocked\(\);\n        return;\n      \}/);
  assert.doesNotMatch(html, /Discard unsaved camera changes and refresh diagnostics/);
  assert.match(html, /markCameraDirty\("Camera pending removal\. " \+ \(stoppedMedia \? "Preview stopped\. " : ""\) \+ "Save Changes to apply it, or undo the removal\."\);\n      render\(\);\n      openCameraDialog\(\);/);
  assert.match(html, /markCameraDirty\("New camera added\. Name it, then paste the RTSP URL and ONVIF host before saving\."\);\n      cameraChangeNotice = "New camera added\. Name it, then paste the RTSP URL and ONVIF host before saving\.";\n      render\(\);\n      openCameraDialog\(\);\n      focusCameraField\(openCameraIndex, "name"\);/);
  assert.match(html, /function markCameraDirty/);
  assert.match(html, /el\("save-result"\)\.className = "save-state"/);
  assert.match(html, /id="save-result" class="save-state" role="status" aria-live="polite"/);
  assert.match(html, /id="snapshot-status-\$\{safeId\(active\.id\)\}" class="preview-status" role="status" aria-live="polite"/);
  assert.match(html, /id="pairing-copy-status" class="copy-status" role="status" aria-live="polite"/);
  assert.match(html, /id="reset-result" class="label" role="status" aria-live="polite"/);
  assert.match(html, /id="\$\{target\}" class="preview-status" role="status" aria-live="polite"/);
  assert.match(html, /function bindCameraInputs/);
  assert.match(html, /function updateCameraDraftFromInput/);
  assert.match(html, /function maybeAutoGenerateNewCameraId/);
  assert.match(html, /updateCameraDraftFromInput\(input\)/);
  assert.match(html, /const cameraIdAutoGenerated = maybeAutoGenerateNewCameraId\(input\)/);
  assert.match(html, /savedWithSameId \|\| \(currentId && !\/\^camera_\\d\+\$\/\.test\(currentId\)\)/);
  assert.match(html, /input\.addEventListener\("change", \(\) => \{/);
  assert.match(html, /renderCameras\(\)/);
  assert.match(html, /endpointTopologyDirty/);
  assert.match(html, /editedCameraFieldsDirty/);
  assert.match(html, /Removal undone\. No unsaved camera changes\./);
  assert.match(html, /const requestedIndex = Number\.isInteger\(Number\(removalIndex\)\) \? Number\(removalIndex\) : fallbackIndex/);
  assert.match(html, /removedCameras\.splice\(boundedIndex, 1\)\[0\]/);
  assert.match(html, /function renderLiveFeeds/);
  assert.match(html, /<strong>\$\{escapeHtml\(cameraDisplayName\(active\)\)\}<\/strong>/);
  assert.match(html, /<div class="label">\$\{escapeHtml\(active\.id\)\}<\/div>/);
  assert.doesNotMatch(html, /<strong>\$\{active\.name\}<\/strong>/);
  assert.match(html, /function cameraRuntimeStatus/);
  assert.match(html, /function liveDraftNotice/);
  assert.match(html, /function isRemovalStaged/);
  assert.match(html, /Removal pending/);
  assert.match(html, /This live feed is still from the running add-on/);
  assert.match(html, /Save Changes, then restart this add-on from the Home Assistant add-on page to remove this Matter endpoint/);
  assert.match(html, /label === "removing" \? "Removal pending"/);
  assert.match(html, /isRemovalStaged\(camera\?\.id\)/);
  assert.match(html, /const activeRemovalStaged = isRemovalStaged\(active\.id\)/);
  assert.match(html, /const videoReady = Boolean\(active\.probe\?\.ok && active\.probe\?\.has_video && !activeRemovalStaged\)/);
  assert.match(html, /const matterReady = Boolean\(active\.endpoint\?\.attached && !activeRemovalStaged\)/);
  assert.match(html, /livePreviewPanel\(active, videoReady, matterReady\)/);
  assert.match(html, /cameraDiagnostics\(active, videoReady\)/);
  assert.match(html, /function cameraDiagnostics\(camera, videoReady\)/);
  assert.match(html, /videoReady \? ptzSupportPanel\(camera\) : ""/);
  assert.match(html, /videoReady \? ptzQuickPanel\(active\.id, !activeRemovalStaged && !cameraConfigDirty && !runtimeRestartMessage && !removedCameras\.length\)/);
  assert.match(html, /function livePreviewPanel\(active, videoReady, matterReady\)/);
  assert.match(html, /if \(!videoReady\) \{/);
  assert.match(html, /PTZ controls appear after this camera has video\. Matter controllers see the camera after the endpoint is attached/);
  assert.match(html, /Matter endpoint pending restart/);
  assert.match(html, /Uses the Matter media path and keeps the camera relay warm/);
  assert.match(html, /function liveRuntimeNotice/);
  assert.match(html, /function ptzQuickPanel\(cameraId, canOperate = true\)/);
  assert.match(html, /const enabled = Boolean\(canOperate && cameraId && cameraPtzConfigured\(config\)\)/);
  assert.match(html, /const ready = Boolean\(camera\?\.probe\?\.ok && !isRemovalStaged\(id\) && !cameraConfigDirty && !runtimeRestartMessage && !removedCameras\.length\)/);
  assert.match(html, /Endpoint pending restart/);
  assert.match(html, /label: "pending", klass: "warn"/);
  assert.match(html, /window\.selectLiveCamera/);
  assert.match(html, /await stopAllLivePreviews\(\)/);
  assert.doesNotMatch(html, /queueAutoSnapshots/);
  assert.doesNotMatch(html, /autoSnapshotIds/);
  assert.match(html, /icon play/);
  assert.match(html, /icon stop/);
  assert.match(html, /<span>Play Live<\/span>/);
  assert.match(html, /<span>Stop<\/span>/);
  assert.match(html, /preview-placeholder/);
  assert.match(html, /Ready for live view/);
  assert.match(html, /Press Play Live, then use the movement pad beside the image/);
  assert.match(html, /overflow-wrap: anywhere/);
  assert.match(html, /function setPreviewPlaceholder/);
  assert.match(html, /Matter WebRTC answer received\. Waiting for video frames/);
  assert.match(html, /matterCameraRoute\(cameraId\), legacyCameraRoute\(cameraId\)/);
  assert.match(html, /function matterCameraRoute\(cameraId\)/);
  assert.match(html, /function legacyCameraRoute\(cameraId\)/);
  assert.match(html, /\/api\/matter\/cameras\/" \+ encodeURIComponent\(cameraId\) \+ "\/snapshot\.jpg/);
  assert.match(html, /\/api\/matter\/cameras\/" \+ encodeURIComponent\(cameraId\) \+ "\/ptz\/" \+ encodeURIComponent\(direction\)/);
  assert.doesNotMatch(html, /Debug frames/);
  assert.doesNotMatch(html, /live-debug-actions/);
  assert.match(html, />Debug Frames/);
  assert.match(html, /Stop Refresh/);
  assert.match(html, /function liveRepairPanel/);
  assert.match(html, /Video is not ready/);
  assert.match(html, /Open the camera settings to fix the RTSP URL or ONVIF credentials/);
  assert.match(html, /probeRepairActions\(camera\?\.id, "RTSP ONVIF video offline"\)/);
  assert.match(html, /probeDetails\(camera\?\.probe, camera\?\.id, false\)/);
  assert.match(html, /function probeDetails\(probe, cameraId = "", includeActions = true\)/);
  assert.match(html, /includeActions \? probeRepairActions/);
  assert.match(html, /stopLivePreview\(\$\{jsString\(active\.id\)\}\)' disabled/);
  assert.match(html, /stopFrameFeed\(\$\{jsString\(active\.id\)\}\)' disabled/);
  assert.match(html, /Video Stream/);
  assert.match(html, /ONVIF Movement/);
  assert.match(html, /Dashboard buttons exercise the same add-on Matter PTZ command path and then relay movement through ONVIF/);
  assert.doesNotMatch(html, /Camera setup progress/);
  assert.match(html, /const streamProbeKnown = Boolean\(status\?\.probe\)/);
  assert.match(html, /const streamProbeOk = Boolean\(status\?\.probe\?\.ok\)/);
  assert.match(html, /const streamStepOk = streamOk && \(!savedOk \|\| !streamProbeKnown \|\| streamProbeOk\)/);
  assert.match(html, /statusPill\("Stream", streamStepOk/);
  assert.match(html, /statusPill\("Matter", endpointOk/);
  assert.match(html, /health-row/);
  assert.doesNotMatch(html, /setup-step/);
  assert.doesNotMatch(html, /\$\{number\}\. \$\{escapeHtml\(title\)\}/);
  assert.match(html, /Stable Matter endpoint id/);
  assert.match(html, /Name shown by Matter controllers/);
  assert.ok(html.indexOf('"name", "Display Name"') < html.indexOf('"id", "Camera ID"'));
  assert.match(html, /Generate ID from name/);
  assert.match(html, /window\.generateCameraIdFromName = index/);
  assert.match(html, /function slugCameraId/);
  assert.match(html, /function uniqueCameraId/);
  assert.match(html, /Camera ID generated from the display name\. Save Changes to apply it/);
  assert.match(html, /Enter a display name first, then generate the camera ID/);
  assert.match(html, /Plain camera RTSP URL/);
  assert.match(html, /Required for dashboard PTZ tests and Matter PTZ commands/);
  assert.match(html, /Optional while mechanical PTZ is disabled/);
  assert.match(html, /If ONVIF uses the same address or login as RTSP, copy it from the stream URL/);
  assert.match(html, /Copy RTSP host/);
  assert.match(html, /Copy RTSP login/);
  assert.doesNotMatch(html, /function rtspOnvifAssist/);
  assert.doesNotMatch(html, /ONVIF can reuse RTSP details/);
  assert.doesNotMatch(html, /Copy host \$\{escapeHtml\(url\.hostname\)\}/);
  assert.match(html, /window\.useRtspHostForOnvif = index/);
  assert.match(html, /window\.useRtspLoginForOnvif = index/);
  assert.match(html, /new URL\(rtspInput\?\.value \?\? ""\)\.hostname/);
  assert.match(html, /decodeURIComponent\(url\.username \?\? ""\)/);
  assert.match(html, /decodeURIComponent\(url\.password \?\? ""\)/);
  assert.match(html, /ONVIF host copied from RTSP URL\. Save Changes to apply it/);
  assert.match(html, /Paste a valid RTSP URL first, then use RTSP Host/);
  assert.match(html, /ONVIF login copied from RTSP URL\. Save Changes to apply it/);
  assert.match(html, /Add RTSP username\/password to the RTSP URL first, then use RTSP Login/);
  assert.match(html, /Video is ready\. PTZ is disabled or missing an ONVIF host for this camera/);
  assert.match(html, /function cameraPtzConfigured/);
  assert.match(html, /canOperate && cameraId && cameraPtzConfigured\(config\)/);
  assert.match(html, /ptzSupportPanel\(camera\)/);
  assert.match(html, /cameras\.find\(item => item\.id === cameraId\) \?\? camera/);
  assert.match(html, /Dashboard buttons exercise the same add-on Matter PTZ command path and then relay movement through ONVIF/);
  assert.match(html, /Live video and snapshots still work; enable mechanical PTZ and set ONVIF details if this camera can move/);
  assert.match(html, /pending save\/restart/);
  assert.match(html, /required-dot/);
  assert.match(html, /required/);
  assert.match(html, /function validateCameraDrafts/);
  assert.match(html, /fieldErrors = new Map/);
  assert.match(html, /function validationSummary/);
  assert.match(html, /Fix highlighted fields before saving: /);
  assert.match(html, /errors\.slice\(0, 2\)/);
  assert.match(html, /replace\(\/\[\.!\?\]\+\$\/, ""\)/);
  assert.match(html, /input\.invalid/);
  assert.match(html, /field-error/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /validationSummary\(validationErrors\)/);
  assert.match(html, /focusCameraField\(validationErrors\.firstIndex, validationErrors\.firstPath\)/);
  assert.match(html, /errors\.firstPath = path/);
  assert.match(html, /function fieldKey/);
  assert.match(html, /function clearFieldError/);
  assert.match(html, /hideInvalidEmptyAutofill/);
  assert.match(html, /input\?\.classList\.remove\("autofill-ghost"\)/);
  assert.match(html, /clearFieldError\(input\.dataset\.index, input\.dataset\.path, input\)/);
  assert.match(html, /fieldErrors\.clear\(\)/);
  assert.match(html, /name="\$\{escapeHtml\(inputName\)\}"/);
  assert.match(html, /autocomplete="\$\{autocomplete\}"/);
  assert.match(html, /autocapitalize="none"/);
  assert.match(html, /spellcheck="false"/);
  assert.match(html, /input\[readonly\]/);
  assert.match(html, /input\.autofill-ghost/);
  assert.match(html, /input\.invalid:-webkit-autofill/);
  assert.match(html, /readonly onfocus="this\.removeAttribute/);
  assert.match(html, /data-lpignore="true"/);
  assert.match(html, /data-1p-ignore="true"/);
  assert.match(html, /cameras\.push\(\{ id: "", name: "", rtsp_url: ""/);
  assert.doesNotMatch(html, /function nextCameraNumber/);
  assert.match(html, /focusCameraField\(openCameraIndex, "name"\)/);
  assert.match(html, /function firstSaveGuidance/);
  assert.match(html, /Paste the plain RTSP URL and ONVIF host, then save this camera/);
  assert.match(html, /Add the ONVIF host or disable mechanical PTZ, then save this camera/);
  assert.match(html, /New camera added\. Name it, then paste the RTSP URL and ONVIF host before saving\./);
  assert.match(html, /cameraChangeNotice = "New camera added\. Name it, then paste the RTSP URL and ONVIF host before saving\."/);
  assert.match(html, /Fix highlighted fields before saving/);
  assert.match(html, /Use letters, numbers, underscores, or hyphens/);
  assert.match(html, /Camera ID must use only letters, numbers, underscores, or hyphens/);
  assert.match(html, /RTSP URL is required/);
  assert.match(html, /Camera IP \/ Host is required when mechanical PTZ is enabled/);
  assert.match(html, /const restartAfterSave = endpointTopologyDirty \|\| removedCameras\.length > 0/);
  assert.match(html, /restartRequired: restartAfterSave/);
  assert.match(html, /payload\.restartRequired/);
  assert.match(html, /let cameraSaveInFlight = false/);
  assert.match(html, /if \(cameraSaveInFlight\) return/);
  assert.match(html, /cameraSaveInFlight = true/);
  assert.match(html, /syncCameraEditorControls\(\)/);
  assert.match(html, /catch \(error\) \{/);
  assert.match(html, /Save failed\. Check the add-on logs or retry in a moment/);
  assert.match(html, /finally \{/);
  assert.match(html, /cameraSaveInFlight = false/);
  assert.match(html, /Saved\. Restart this add-on from the Home Assistant add-on page to apply endpoint changes\./);
  assert.match(html, /Saved\. Status refreshed\./);
  assert.doesNotMatch(html, /Restart the add-on only after adding or removing cameras/);
  assert.match(html, /runtimeRestartMessage/);
  assert.match(html, /function renderRuntimeRestartBar/);
  assert.match(html, /Restart required/);
  assert.match(html, /Restart this add-on from the Home Assistant add-on page, then come back here and refresh/);
  assert.match(html, /Refresh after Home Assistant restart/);
  assert.match(html, /Until then, Matter endpoints and live-feed runtime status may still reflect the previous camera set/);
  assert.match(html, /if \(payload\.restartRequired\) \{/);
  assert.match(html, /className = "save-state warn"/);
  assert.match(html, /\.save-state\.warn \{ border: 1px solid #fed7aa;/);
  assert.match(html, /\.save-state\.bad \{ border: 1px solid #fecaca;/);
  assert.match(html, /renderRuntimeRestartBar\(\)/);
  assert.match(html, /return;\n      \}/);
  assert.match(html, /WHEP Media Source Override/);
  assert.match(html, /ONVIF Password/);
  assert.match(html, /"password", "Also used when ONVIF returns a stream URI/);
  assert.match(html, /Move Camera/);
  assert.match(html, /preview-frame/);
  assert.match(html, /\.preview-actions \{ display: flex;/);
  assert.match(html, /\.diagnostic-tools \{ border: 1px solid var\(--line\);/);
  assert.match(html, /<summary>Diagnostics<\/summary>/);
  assert.match(html, /\.sr-only \{ position: absolute;/);
  assert.match(html, /preview-mode/);
  assert.match(html, /id="preview-mode-\$\{safeId\(active\.id\)\}"/);
  assert.match(html, /function setPreviewMode/);
  assert.match(html, /setPreviewMode\(cameraId, "live", "Starting live"\)/);
  assert.match(html, /setPreviewMode\(cameraId, "live", "Live"\)/);
  assert.match(html, /setPreviewMode\(cameraId, "refresh", "Frame refresh"\)/);
  assert.match(html, /setPreviewMode\(cameraId, "error", "Snapshot error"\)/);
  assert.match(html, /image\.hidden = true/);
  assert.match(html, /image\.hidden = false/);
  assert.match(html, /message bad/);
  assert.match(html, /message p \+ p/);
  assert.match(html, /<p>' \+ escapeHtml\(error\) \+ '<\/p>/);
  assert.match(html, /\.hero \{ display: grid; grid-template-columns: minmax\(0, 1\.15fr\) minmax\(320px, \.85fr\); gap: 18px; align-items: start; \}/);
  assert.match(html, /\.hero \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /pairing-compact/);
  assert.match(html, /function renderPairing/);
  assert.match(html, /\.two \{ display: grid; grid-template-columns: 1fr; gap: 18px; align-items: start; \}/);
  assert.match(html, /\.live-workspace \{[^}]*grid-template-columns: minmax\(420px, 1fr\) minmax\(248px, 320px\);/);
  assert.match(html, /\.live-control-column \.ptz-actions \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.live-workspace \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /width: 100%; margin: 0 auto/);
  assert.match(html, /width: min\(420px, 100%\)/);
  assert.match(html, /#summary\.grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 6px; \}/);
  assert.match(html, /#summary \.card \{ min-height: 54px; padding: 8px 10px; \}/);
  assert.match(html, /\.qr-card img \{ width: min\(240px, 100%\); \}/);
  assert.match(html, /\.pairing-copy \{ display: grid; grid-template-columns: 1fr;/);
  assert.match(html, /\.ptz-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(html, /aria-label="\$\{escapeHtml\(label\.name\)\}"/);
  assert.match(html, /"up-left": \{ symbol: "↖", name: "Move up left" \}/);
  assert.match(html, />Test<\/button>/);
  assert.match(html, /data-action="start-frame-feed"/);
  assert.match(html, /data-action="ptz-\$\{escapeHtml\(direction\)\}"/);
  assert.match(html, /onpointerdown='beginPtz\(event,/);
  assert.match(html, /onpointerup='endPtz\(event,/);
  assert.match(html, /onclick='tapPtz\(event,/);
  assert.match(html, /const activePtzMoves = new Map/);
  assert.match(html, /mode: "continuous", speed: "0\.35"/);
  assert.match(html, /snapshotLoads = new Map/);
  assert.match(html, /if \(existing\) return existing/);
  assert.match(html, /const errorText = await response\.text\(\)/);
  assert.match(html, /payload = JSON\.parse\(errorText\)/);
  assert.match(html, /Frame refresh is loading a snapshot every 2 seconds/);
  assert.match(html, /Start the real WebRTC live stream/);
  assert.match(html, /function syncPreviewControls/);
  assert.match(html, /function setActionDisabled/);
  assert.match(html, /await window\.stopLivePreview\(cameraId\)/);
  assert.match(html, /window\.stopFrameFeed\(cameraId\)/);
  assert.match(html, /setActionDisabled\(id, "load-snapshot", !ready \|\| liveActive\)/);
  assert.match(html, /!ready \|\| liveActive/);
  assert.match(html, /!ready \|\| loopActive \|\| liveActive/);
  assert.match(html, /keeping last good frame/);
  assert.match(html, /Camera rejected the RTSP credentials/);
  assert.match(html, /friendlyProbeError/);
  assert.match(html, /Camera rejected the RTSP username or password/);
  assert.match(html, /probeRepairActions/);
  assert.match(html, /repair-actions/);
  assert.match(html, /Edit RTSP URL/);
  assert.match(html, /Edit ONVIF\/PTZ/);
  assert.match(html, /openCameraConfig\(\$\{jsString\(cameraId\)\}, "rtsp_url"\)/);
  assert.match(html, /openCameraConfig\(\$\{jsString\(cameraId\)\}, "onvif\.host"\)/);
  assert.match(html, /window\.openCameraConfig = \(cameraId, focusPath = ""\)/);
  assert.match(html, /function focusCameraField/);
  assert.match(html, /input\?\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(html, /input\?\.removeAttribute\("readonly"\)/);
  assert.match(html, /input\?\.focus\(\)/);
  assert.match(html, /Expose PTZ controls to Matter controllers/);
  assert.match(html, /Expose audio stream support/);
  assert.match(html, /Create Matter person presence sensor/);
  assert.match(html, /Changing Matter-facing controls or sensors requires restarting this add-on from the Home Assistant add-on page/);
  assert.doesNotMatch(html, /Advertise mechanical PTZ to Matter controllers/);
  assert.doesNotMatch(html, /Add Matter person presence sensor endpoint/);
  assert.match(html, /Tap or press while Play Live is running to validate the same motion path a Matter controller reaches/);
  assert.match(html, /This section counts requests coming from Matter controllers/);
  assert.match(html, /knownIds = \[\.\.\.new Set/);
  assert.match(html, /normalizeMatterActivityCameras\(activity\.cameras\)/);
  assert.match(html, /normalizeMatterCommands\(observed\.commands\)/);
  assert.match(html, /normalizeMatterActivityCameras\(state\.matterActivity\?\.cameras\)/);
  assert.match(html, /function normalizeMatterActivityCameras/);
  assert.match(html, /function normalizeMatterCommands/);
  assert.match(html, /activityById/);
  assert.match(html, /runtimeById/);
  assert.match(html, /configById/);
  assert.match(html, /endpointAttached/);
  assert.match(html, /Endpoint attached/);
  assert.match(html, /Endpoint pending restart/);
  assert.match(html, /no Matter controller has asked it for snapshot, live view, or PTZ yet/);
  assert.match(html, /No Matter camera cluster commands observed yet/);
  assert.match(html, /Only use this when pairing is broken or you intentionally want a new Matter device/);
  assert.match(html, /attestationNotice\(commissioning, cameraCount, attachedCount\)/);
  assert.match(html, /if \(!commissioning\?\.matterNodeStarted\) return ""/);
  assert.match(html, /autocomplete="off" spellcheck="false"/);
  assert.match(html, /id="reset-matter" disabled/);
  assert.match(html, /resetConfirmation\.value = ""/);
  assert.match(html, /resetButton\.disabled = resetConfirmation\.value !== "RESET MATTER"/);
  assert.match(html, /event\.preventDefault\(\)/);
  assert.match(html, /event\.returnValue = ""/);
  assert.doesNotMatch(html, /install the native integration for reliable PTZ buttons/);
});

test("dashboard hides QR after commissioning and explains paired fabric state", () => {
  const html = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      pairable: false,
      commissioned: true,
      commissionedFabrics: 2
    }
  });

  assert.match(html, /Paired/);
  assert.doesNotMatch(html, /matterOperationChecklist\(commissioning, cameraCount, attachedCount\)/);
  assert.doesNotMatch(html, /function matterOperationChecklist/);
  assert.doesNotMatch(html, /Matter operation checks/);
  assert.match(html, /Paired to/);
  assert.match(html, /Matter controller\/fabric/);
  assert.match(html, /Paired Matter fabrics: \${count}/);
  assert.match(html, /renderPairing\(c, cameraCount, attachedCount, videoCount\)/);
  assert.match(html, /<div class="pairing-compact">/);
  assert.match(html, /if \(isCommissioned\(commissioning\)\) \{/);
  assert.doesNotMatch(html, /QR hidden after pairing/);
  assert.doesNotMatch(html, /Pairing codes are hidden while this Matter node is paired/);
  assert.doesNotMatch(html, /Commissionable/);
});

test("dashboard Use RTSP Host fills ONVIF host from the stream URL", () => {
  const html = dashboardHtml(sampleStatus);
  const helperSource = extractDashboardFunction(html, "useRtspHostForOnvif", "markCameraDirty");
  const status = { className: "", textContent: "" };
  const rtspInput = { value: "rtsp://camera-user:secret@front-door.local:554/av_stream/ch0" };
  const hostInput = {
    value: "",
    focused: false,
    events: [],
    removeAttribute(name) {
      this.removed = name;
    },
    dispatchEvent(event) {
      this.events.push(event);
    },
    focus() {
      this.focused = true;
    }
  };
  const context = {
    window: {},
    URL,
    Event: class Event {
      constructor(type, options) {
        this.type = type;
        this.options = options;
      }
    },
    document: {
      querySelector(selector) {
        if (selector.includes('data-path="rtsp_url"')) return rtspInput;
        if (selector.includes('data-path="onvif.host"')) return hostInput;
        return null;
      }
    },
    el(id) {
      return id === "save-result" ? status : null;
    },
    focusCameraField() {
      throw new Error("focusCameraField should not run for valid RTSP URL");
    }
  };

  vm.runInNewContext(helperSource, context);
  context.window.useRtspHostForOnvif(0);

  assert.equal(hostInput.value, "front-door.local");
  assert.equal(hostInput.removed, "readonly");
  assert.equal(hostInput.focused, true);
  assert.equal(hostInput.events[0].type, "input");
  assert.equal(hostInput.events[0].options.bubbles, true);
  assert.equal(status.className, "save-state");
  assert.equal(status.textContent, "ONVIF host copied from RTSP URL. Save Changes to apply it.");
});

test("dashboard Use RTSP Host points back to RTSP URL when parsing fails", () => {
  const html = dashboardHtml(sampleStatus);
  const helperSource = extractDashboardFunction(html, "useRtspHostForOnvif", "markCameraDirty");
  const status = { className: "", textContent: "" };
  const rtspInput = { value: "not an rtsp url" };
  let focused = null;
  const context = {
    window: {},
    URL,
    Event,
    document: {
      querySelector(selector) {
        if (selector.includes('data-path="rtsp_url"')) return rtspInput;
        return null;
      }
    },
    el(id) {
      return id === "save-result" ? status : null;
    },
    focusCameraField(index, path) {
      focused = { index, path };
    }
  };

  vm.runInNewContext(helperSource, context);
  context.window.useRtspHostForOnvif(2);

  assert.equal(status.className, "save-state bad");
  assert.equal(status.textContent, "Paste a valid RTSP URL first, then use RTSP Host.");
  assert.deepEqual(focused, { index: 2, path: "rtsp_url" });
});

test("dashboard Use RTSP Login fills ONVIF username and password from the stream URL", () => {
  const html = dashboardHtml(sampleStatus);
  const helperSource = extractDashboardFunction(html, "useRtspLoginForOnvif", "markCameraDirty");
  const status = { className: "", textContent: "" };
  const rtspInput = { value: "rtsp://camera%20user:s3cret%21@front-door.local:554/av_stream/ch0" };
  const userInput = trackedInput();
  const passwordInput = trackedInput();
  const context = {
    window: {},
    URL,
    decodeURIComponent,
    Event: class Event {
      constructor(type, options) {
        this.type = type;
        this.options = options;
      }
    },
    document: {
      querySelector(selector) {
        if (selector.includes('data-path="rtsp_url"')) return rtspInput;
        if (selector.includes('data-path="onvif.user"')) return userInput;
        if (selector.includes('data-path="onvif.password"')) return passwordInput;
        return null;
      }
    },
    el(id) {
      return id === "save-result" ? status : null;
    },
    focusCameraField() {
      throw new Error("focusCameraField should not run for RTSP URL with login");
    }
  };

  vm.runInNewContext(helperSource, context);
  context.window.useRtspLoginForOnvif(0);

  assert.equal(userInput.value, "camera user");
  assert.equal(passwordInput.value, "s3cret!");
  assert.equal(userInput.removed, "readonly");
  assert.equal(passwordInput.removed, "readonly");
  assert.equal(userInput.focused, true);
  assert.equal(userInput.events[0].type, "input");
  assert.equal(passwordInput.events[0].type, "input");
  assert.equal(status.className, "save-state");
  assert.equal(status.textContent, "ONVIF login copied from RTSP URL. Save Changes to apply it.");
});

test("dashboard Use RTSP Login points back to RTSP URL when no login exists", () => {
  const html = dashboardHtml(sampleStatus);
  const helperSource = extractDashboardFunction(html, "useRtspLoginForOnvif", "markCameraDirty");
  const status = { className: "", textContent: "" };
  const rtspInput = { value: "rtsp://front-door.local:554/av_stream/ch0" };
  let focused = null;
  const context = {
    window: {},
    URL,
    decodeURIComponent,
    Event,
    document: {
      querySelector(selector) {
        if (selector.includes('data-path="rtsp_url"')) return rtspInput;
        return null;
      }
    },
    el(id) {
      return id === "save-result" ? status : null;
    },
    focusCameraField(index, path) {
      focused = { index, path };
    }
  };

  vm.runInNewContext(helperSource, context);
  context.window.useRtspLoginForOnvif(1);

  assert.equal(status.className, "save-state bad");
  assert.equal(status.textContent, "Add RTSP username/password to the RTSP URL first, then use RTSP Login.");
  assert.deepEqual(focused, { index: 1, path: "rtsp_url" });
});

test("dashboard can generate a safe unique camera id from display name", () => {
  const html = dashboardHtml(sampleStatus);
  const helperSource = extractDashboardFunction(html, "generateCameraIdFromName", "markCameraDirty");
  const status = { className: "", textContent: "" };
  const nameInput = { value: "Front Door FP2!" };
  const idInput = trackedInput();
  const context = {
    window: {},
    cameras: [
      { id: "front_door_fp2" },
      { id: "camera_2" }
    ],
    Number,
    String,
    Set,
    Math,
    Event: class Event {
      constructor(type, options) {
        this.type = type;
        this.options = options;
      }
    },
    document: {
      querySelector(selector) {
        if (selector.includes('data-path="name"')) return nameInput;
        if (selector.includes('data-path="id"')) return idInput;
        return null;
      }
    },
    el(id) {
      return id === "save-result" ? status : null;
    },
    focusCameraField() {
      throw new Error("focusCameraField should not run when name exists");
    }
  };

  vm.runInNewContext(helperSource, context);
  context.window.generateCameraIdFromName(1);

  assert.equal(idInput.value, "front_door_fp2_2");
  assert.equal(idInput.removed, "readonly");
  assert.equal(idInput.focused, true);
  assert.equal(idInput.events[0].type, "input");
  assert.equal(idInput.events[0].options.bubbles, true);
  assert.equal(status.className, "save-state");
  assert.equal(status.textContent, "Camera ID generated from the display name. Save Changes to apply it.");
});

test("dashboard auto-generates ids only for unsaved blank or generic new cameras", () => {
  const html = dashboardHtml(sampleStatus);
  const start = html.indexOf("function maybeAutoGenerateNewCameraId");
  const end = html.indexOf("\n\n    window.useRtspHostForOnvif", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const helperSource = html.slice(start, end);
  const blankIdInput = trackedInput("");
  const genericIdInput = trackedInput("camera_2");
  const savedIdInput = trackedInput("camera_3");
  const customIdInput = trackedInput("custom_id");
  const cleared = [];
  const context = {
    cameras: [
      { id: "existing_camera" },
      { id: "" },
      { id: "camera_2" },
      { id: "camera_3" },
      { id: "custom_id" }
    ],
    state: {
      cameras: [
        { id: "existing_camera" },
        { id: "camera_3" }
      ]
    },
    Number,
    String,
    document: {
      querySelector(selector) {
        if (!selector.includes('data-path="id"')) return null;
        if (selector.includes('data-index="1"')) return blankIdInput;
        if (selector.includes('data-index="2"')) return genericIdInput;
        if (selector.includes('data-index="3"')) return savedIdInput;
        if (selector.includes('data-index="4"')) return customIdInput;
        return null;
      }
    },
    slugCameraId(value) {
      return String(value).toLowerCase().replaceAll(" ", "_").replaceAll("!", "");
    },
    uniqueCameraId(base) {
      return base;
    },
    clearFieldError(index, path, input) {
      cleared.push({ index, path, input });
    }
  };

  vm.runInNewContext(helperSource, context);
  const changed = context.maybeAutoGenerateNewCameraId({ dataset: { index: "1", path: "name" }, value: "Front Door!" });

  assert.equal(changed, true);
  assert.equal(context.cameras[1].id, "front_door");
  assert.equal(blankIdInput.value, "front_door");
  assert.equal(blankIdInput.removed, "readonly");

  const genericChanged = context.maybeAutoGenerateNewCameraId({ dataset: { index: "2", path: "name" }, value: "Garage!" });
  assert.equal(genericChanged, true);
  assert.equal(context.cameras[2].id, "garage");
  assert.equal(genericIdInput.value, "garage");

  const savedChanged = context.maybeAutoGenerateNewCameraId({ dataset: { index: "3", path: "name" }, value: "Back Door" });
  assert.equal(savedChanged, false);
  assert.equal(context.cameras[3].id, "camera_3");

  const customChanged = context.maybeAutoGenerateNewCameraId({ dataset: { index: "4", path: "name" }, value: "Side Door" });
  assert.equal(customChanged, false);
  assert.equal(context.cameras[4].id, "custom_id");
  assert.deepEqual(cleared, [
    { index: 1, path: "id", input: blankIdInput },
    { index: 2, path: "id", input: genericIdInput }
  ]);
});

test("dashboard treats older commissioned reason payload as paired", () => {
  const html = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      pairable: false,
      commissioned: undefined,
      commissionedFabrics: undefined,
      reason: "Matter ServerNode is running and already commissioned to at least one fabric."
    }
  });

  assert.match(html, /Paired/);
  assert.match(html, /function isCommissioned/);
  assert.match(html, /already commissioned\|commissioned to at least one fabric/);
  assert.doesNotMatch(html, /Pairing codes are hidden while this Matter node is paired/);
});

test("dashboard contract includes commissioned Matter state from status payload", async () => {
  const indexSource = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/index.js", import.meta.url), "utf8"));

  assert.match(indexSource, /commissioned: Boolean\(nodeStatus\.commissioned\)/);
  assert.match(indexSource, /commissionedFabrics: Number\(nodeStatus\.commissionedFabrics \?\? 0\)/);
  assert.match(indexSource, /return json\(response, 500, errorPayload\(error\)\)/);
  assert.match(indexSource, /code: error\.code/);
  assert.match(indexSource, /path: error\.path/);
});

test("camera save API keeps endpoint restart state explicit", async () => {
  const indexSource = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/index.js", import.meta.url), "utf8"));

  assert.match(indexSource, /const restartRequired = emptyRegistry \|\| Boolean\(payload\.restartRequired\)/);
  assert.match(indexSource, /restartRequired,\n\s+bridgeReloadOk/);
  assert.match(indexSource, /Saved\. Restart this add-on from the Home Assistant add-on page so Matter endpoint changes are rebuilt\./);
});

test("dashboard first-run state does not show zero-camera success", () => {
  const html = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      cameraEndpoints: {},
      personEndpoints: {}
    },
    cameras: [],
    cameraConfig: { cameras: [] }
  });

  assert.match(html, /No cameras/);
  assert.match(html, /Needs camera/);
  assert.match(html, /Add Camera/);
  assert.match(html, /Start with the plain camera RTSP URL and ONVIF host/);
  assert.match(html, /no cameras are configured yet/i);
  assert.match(html, /Add a camera, save it, then restart this add-on from the Home Assistant add-on page/);
  assert.match(html, /Matter can create the endpoint/);
  assert.match(html, /Pairing codes will appear after you add a camera and Matter has an endpoint to expose/);
  assert.doesNotMatch(html, /canPairUsefulDevice/);
  assert.match(html, /Start with the plain camera RTSP URL and ONVIF host/);
  assert.match(html, /id="add-feed">Add Camera/);
  assert.match(html, /if \(!cameraCount\) return "Matter is ready, but no cameras are configured yet/);
  assert.match(html, /if \(!cameraCount\) return \{ label: "Add Camera", onclick: "addCamera\(\)", primary: true \}/);
  assert.match(html, /if \(!cameraCount\) return \{ label: "No cameras", klass: "warn" \}/);
  assert.doesNotMatch(html, /0 \/ 0 attached/);
  assert.doesNotMatch(html, /0 \/ 0 detected/);
  assert.match(html, /if \(!cameraCount \|\| attachedCount < cameraCount \|\| videoCount < cameraCount\) return ""/);
});

test("dashboard waits for Matter endpoint attachment before exposing pairing codes", () => {
  const html = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      cameraEndpoints: {}
    },
    cameras: [
      {
        ...sampleStatus.cameras[0],
        endpoint: { attached: false, reason: "Restart required" }
      }
    ]
  });

  assert.match(html, /pending restart/);
  assert.match(html, /Needs restart/);
  assert.match(html, /Matter endpoint is not attached yet/);
  assert.match(html, /Video is detected, but this camera is not available through the Matter camera path/);
  assert.match(html, /Edit Camera/);
  assert.match(html, /only \$\{attachedCount\} of \$\{cameraCount\} camera endpoints are attached/);
  assert.match(html, /Pairing codes will appear after Matter attaches the configured camera endpoints/);
  assert.match(html, /onclick="openFirstCameraConfig\(\)">Edit Camera/);
  assert.match(html, /onclick="refreshStatus\(\)">Refresh after Home Assistant restart/);
  assert.match(html, /renderPairing\(c, cameraCount, attachedCount, videoCount\)/);
  assert.match(html, /pairingCopy\(commissioning, cameraCount, attachedCount, videoCount\)/);
  assert.match(html, /pairingQr\(commissioning, cameraCount, attachedCount, videoCount\)/);
  assert.match(html, /if \(attachedCount < cameraCount\) \{/);
  assert.match(html, /if \(!cameraCount \|\| attachedCount < cameraCount \|\| videoCount < cameraCount\) return ""/);
});

test("dashboard allows stream diagnostics while Matter endpoint is pending restart", () => {
  const html = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      cameraEndpoints: {}
    },
    cameras: [
      {
        ...sampleStatus.cameras[0],
        endpoint: { attached: false, reason: "Restart required" }
      }
    ]
  });

  assert.match(html, /Matter endpoint pending restart/);
  assert.match(html, /Restart the add-on before testing this camera from an external Matter controller/);
  assert.match(html, /data-action="start-webrtc-preview"/);
  assert.match(html, /data-action="load-snapshot"/);
  assert.match(html, /data-action="start-frame-feed"/);
  assert.match(html, /data-action="ptz-\$\{escapeHtml\(direction\)\}"/);
  assert.match(html, /\/api\/matter\/cameras\/" \+ encodeURIComponent\(cameraId\) \+ "\/snapshot\.jpg/);
  assert.match(html, /\/api\/matter\/cameras\/" \+ encodeURIComponent\(cameraId\) \+ "\/ptz\/" \+ encodeURIComponent\(direction\)/);
});

test("dashboard separates saved cameras from running camera endpoints", () => {
  const html = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      cameraEndpoints: {},
      personEndpoints: {}
    },
    cameras: [],
    cameraConfig: sampleStatus.cameraConfig
  });
  const start = html.indexOf("function configuredCameraCount");
  const end = html.indexOf("\n\n    function renderLiveFeeds", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const helperSource = html.slice(start, end);
  const context = {
    Math,
    Array,
    cameras: [],
    state: { cameraConfig: sampleStatus.cameraConfig }
  };
  vm.runInNewContext(helperSource, context);

  assert.equal(context.configuredCameraCount([]), 1);
  context.cameras = [{}, {}];
  assert.equal(context.configuredCameraCount([]), 2);
  assert.match(html, /if \(cameraCount && attachedCount !== cameraCount\) extras\.push\(`\$\{attachedCount\} \/ \$\{cameraCount\} camera endpoints attached`\)/);
  assert.match(html, /if \(cameraCount && videoCount !== cameraCount\) extras\.push\(`\$\{videoCount\} \/ \$\{cameraCount\} video sources detected`\)/);
  assert.match(html, /cameraOverallStatus\(cameraStatuses, cameraCount, attachedCount, videoCount\)/);
  assert.doesNotMatch(html, /card\("Camera Endpoints"/);
  assert.doesNotMatch(html, /card\("Video Sources"/);
  assert.match(html, /summaryItem\("Matter", matterNodeLabel\(commissioning, cameraCount, attachedCount, videoCount\), matterNodeClass\(commissioning, cameraCount, attachedCount, videoCount\)\)/);
  assert.match(html, /Camera saved, runtime pending/);
  assert.match(html, /Restart this add-on from the Home Assistant add-on page, then refresh this dashboard/);
  assert.match(html, /Pairing codes will appear after Matter attaches the configured camera endpoints/);
});

test("dashboard keeps paired endpoint repair separate from first pairing", () => {
  const html = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      pairable: false,
      commissioned: true,
      commissionedFabrics: 1,
      cameraEndpoints: {}
    },
    cameras: [
      {
        ...sampleStatus.cameras[0],
        endpoint: { attached: false, reason: "Restart required" }
      }
    ]
  });

  assert.match(html, /Matter endpoint is not attached yet/);
  assert.match(html, /Video is detected, but this camera is not available through the Matter camera path/);
  assert.match(html, /Only \$\{attachedCount\} of \$\{cameraCount\} camera endpoints are attached/);
  assert.doesNotMatch(html, /Pairing codes are hidden while this Matter node is paired/);
  assert.match(html, /if \(isCommissioned\(commissioning\)\) \{/);
});

test("dashboard live feed and pairing copy handle ready and media failure states", () => {
  const readyHtml = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      pairable: false,
      commissioned: true,
      commissionedFabrics: 1
    }
  });
  assert.match(readyHtml, /Paired to \$\{fabrics\} Matter controller/);
  assert.match(readyHtml, /Live Feeds/);
  assert.match(readyHtml, /Edit Camera/);

  const mediaFailureHtml = dashboardHtml({
    ...sampleStatus,
    cameras: [
      {
        ...sampleStatus.cameras[0],
        probe: {
          ok: false,
          has_video: false,
          has_audio: false,
          error: "401 Unauthorized"
        }
      }
    ]
  });
  assert.match(mediaFailureHtml, /Matter is running, but video is offline/);
  assert.match(mediaFailureHtml, /Video first/);
  assert.match(mediaFailureHtml, /Fix every camera stream before pairing or rotating Matter identity/);
  assert.match(mediaFailureHtml, /Pairing codes will appear after every configured camera produces video/);
  assert.match(mediaFailureHtml, /Video is not ready/);
  assert.match(mediaFailureHtml, /Edit RTSP URL/);

  const pairedMediaFailureHtml = dashboardHtml({
    ...sampleStatus,
    commissioning: {
      ...sampleStatus.commissioning,
      pairable: false,
      commissioned: true,
      commissionedFabrics: 1
    },
    cameras: [
      {
        ...sampleStatus.cameras[0],
        probe: {
          ok: false,
          has_video: false,
          has_audio: false,
          error: "401 Unauthorized"
        }
      }
    ]
  });
  assert.match(pairedMediaFailureHtml, /Paired to \$\{fabrics\} Matter controller/);
  assert.match(pairedMediaFailureHtml, /Video is not ready/);
});

test("dashboard save uses the app draft instead of silent browser autofill", () => {
  const html = dashboardHtml(sampleStatus);
  const start = html.indexOf("function collect()");
  const end = html.indexOf("\n\n    window.requestRemoveCamera", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const helperSource = html.slice(start, end);
  const context = {
    cameras: [
      {
        id: "",
        name: "",
        rtsp_url: "",
        onvif: { host: "", port: 80, user: "", password: "" },
        matter: { advertise_ptz: true }
      }
    ],
    clone(value) {
      return JSON.parse(JSON.stringify(value));
    },
    document: {
      querySelectorAll() {
        return [
          {
            dataset: { index: "0", path: "name" },
            value: "Front Door"
          },
          {
            dataset: { index: "0", path: "id" },
            value: "front_door"
          }
        ];
      }
    }
  };

  vm.runInNewContext(helperSource, context);

  assert.deepEqual(context.collect()[0], context.cameras[0]);
  assert.match(html, /const inputName = "stm_field_" \+ safeId\(index \+ "_" \+ path\)\.split\(""\)\.reverse\(\)\.join\(""\)/);
  assert.match(html, /const autocomplete = "off"/);
});
