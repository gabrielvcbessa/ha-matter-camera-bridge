"""Tiny ONVIF fixture for local bridge validation.

This is not a general ONVIF implementation. It only responds to the calls used
by the bridge: GetCapabilities, GetProfiles, GetStreamUri, GetStatus, movement,
and stop.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os


HOST = os.environ.get("ONVIF_FIXTURE_HOST", "0.0.0.0")
PORT = int(os.environ.get("ONVIF_FIXTURE_PORT", "18080"))
PUBLIC_HOST = os.environ.get("ONVIF_FIXTURE_PUBLIC_HOST", "127.0.0.1")
RTSP_URI = os.environ.get("ONVIF_FIXTURE_RTSP_URI", "rtsp://127.0.0.1:8555/stm_lab")


def envelope(body: str) -> bytes:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
{body}
  </s:Body>
</s:Envelope>
""".encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        request = self.rfile.read(length).decode("utf-8", errors="replace")

        if "GetCapabilities" in request:
            body = f"""
    <tds:GetCapabilitiesResponse>
      <tds:Capabilities>
        <tds:Media>
          <tds:XAddr>http://{PUBLIC_HOST}:{PORT}/onvif/media_service</tds:XAddr>
        </tds:Media>
        <tds:PTZ>
          <tds:XAddr>http://{PUBLIC_HOST}:{PORT}/onvif/ptz_service</tds:XAddr>
        </tds:PTZ>
      </tds:Capabilities>
    </tds:GetCapabilitiesResponse>"""
        elif "GetProfiles" in request:
            body = """
    <trt:GetProfilesResponse>
      <trt:Profiles token="profile_1">
        <tt:Name>Lab Camera</tt:Name>
      </trt:Profiles>
    </trt:GetProfilesResponse>"""
        elif "GetStreamUri" in request:
            body = f"""
    <trt:GetStreamUriResponse>
      <trt:MediaUri>
        <tt:Uri>{RTSP_URI}</tt:Uri>
      </trt:MediaUri>
    </trt:GetStreamUriResponse>"""
        elif "GetStatus" in request:
            body = """
    <tptz:GetStatusResponse>
      <tptz:PTZStatus>
        <tt:Position>
          <tt:PanTilt x="0.0" y="0.0" />
          <tt:Zoom x="1.0" />
        </tt:Position>
        <tt:MoveStatus>
          <tt:PanTilt>IDLE</tt:PanTilt>
          <tt:Zoom>IDLE</tt:Zoom>
        </tt:MoveStatus>
      </tptz:PTZStatus>
    </tptz:GetStatusResponse>"""
        elif "ContinuousMove" in request:
            body = """
    <tptz:ContinuousMoveResponse />"""
        elif "RelativeMove" in request:
            body = """
    <tptz:RelativeMoveResponse />"""
        elif "AbsoluteMove" in request:
            body = """
    <tptz:AbsoluteMoveResponse />"""
        elif "Stop" in request:
            body = """
    <tptz:StopResponse />"""
        else:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"Unsupported ONVIF request")
            return

        payload = envelope(body)
        self.send_response(200)
        self.send_header("Content-Type", "application/soap+xml; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:
        if os.environ.get("ONVIF_FIXTURE_ACCESS_LOG") == "1":
            super().log_message(format, *args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"ONVIF fixture listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
