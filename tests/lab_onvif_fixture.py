"""Tiny ONVIF fixture for local bridge validation.

This is not a general ONVIF implementation. It only responds to the calls used
by the bridge: GetCapabilities, GetProfiles, GetStreamUri, GetStatus, movement,
and stop.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from threading import Lock
from xml.etree import ElementTree


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
    position = {"pan": 0.0, "tilt": 0.0, "zoom": 1.0}
    position_lock = Lock()

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
            with self.position_lock:
                pan = self.position["pan"]
                tilt = self.position["tilt"]
                zoom = self.position["zoom"]
            body = f"""
    <tptz:GetStatusResponse>
      <tptz:PTZStatus>
        <tt:Position>
          <tt:PanTilt x="{pan}" y="{tilt}" />
          <tt:Zoom x="{zoom}" />
        </tt:Position>
        <tt:MoveStatus>
          <tt:PanTilt>IDLE</tt:PanTilt>
          <tt:Zoom>IDLE</tt:Zoom>
        </tt:MoveStatus>
      </tptz:PTZStatus>
    </tptz:GetStatusResponse>"""
        elif "ContinuousMove" in request:
            pan, tilt, zoom = movement_values(request, "Velocity")
            with self.position_lock:
                self.position["pan"] += pan
                self.position["tilt"] += tilt
                self.position["zoom"] += zoom
            body = """
    <tptz:ContinuousMoveResponse />"""
        elif "RelativeMove" in request:
            pan, tilt, zoom = movement_values(request, "Translation")
            with self.position_lock:
                self.position["pan"] += pan
                self.position["tilt"] += tilt
                self.position["zoom"] += zoom
            body = """
    <tptz:RelativeMoveResponse />"""
        elif "AbsoluteMove" in request:
            pan, tilt, zoom = movement_values(request, "Position")
            with self.position_lock:
                self.position.update(pan=pan, tilt=tilt, zoom=zoom)
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


def movement_values(xml_text: str, container_name: str) -> tuple[float, float, float]:
    root = ElementTree.fromstring(xml_text)
    container = next(
        (element for element in root.iter() if element.tag.rsplit("}", 1)[-1] == container_name),
        None,
    )
    if container is None:
        return 0.0, 0.0, 0.0
    pan = tilt = zoom = 0.0
    for element in container.iter():
        name = element.tag.rsplit("}", 1)[-1]
        if name == "PanTilt":
            pan = float(element.attrib.get("x", 0))
            tilt = float(element.attrib.get("y", 0))
        elif name == "Zoom":
            zoom = float(element.attrib.get("x", 0))
    return pan, tilt, zoom


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"ONVIF fixture listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
