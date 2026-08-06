from __future__ import annotations

from base64 import b64encode
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha1
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from .config import OnvifConfig


SOAP_NS = "http://www.w3.org/2003/05/soap-envelope"
WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
WSU_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"


@dataclass(frozen=True)
class OnvifServices:
    device: str
    media: str | None = None
    ptz: str | None = None


def _username_token(user: str, password: str) -> str:
    nonce = os.urandom(16)
    created = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    digest = b64encode(sha1(nonce + created.encode("utf-8") + password.encode("utf-8")).digest()).decode("ascii")
    nonce64 = b64encode(nonce).decode("ascii")
    return f"""
    <s:Header>
      <wsse:Security s:mustUnderstand="1" xmlns:wsse="{WSSE_NS}" xmlns:wsu="{WSU_NS}">
        <wsse:UsernameToken>
          <wsse:Username>{user}</wsse:Username>
          <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{digest}</wsse:Password>
          <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce64}</wsse:Nonce>
          <wsu:Created>{created}</wsu:Created>
        </wsse:UsernameToken>
      </wsse:Security>
    </s:Header>
    """


def _soap_envelope(user: str, password: str, body: str) -> bytes:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="{SOAP_NS}">
{_username_token(user, password)}
  <s:Body>
{body}
  </s:Body>
</s:Envelope>
""".encode("utf-8")


def _post(url: str, config: OnvifConfig, body: str, timeout: int = 8) -> str:
    request = urllib.request.Request(
        url,
        data=_soap_envelope(config.user, config.password, body),
        headers={"Content-Type": "application/soap+xml; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def _text_by_local_name(xml_text: str, local_name: str) -> list[str]:
    root = ET.fromstring(xml_text)
    values: list[str] = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == local_name and element.text:
            values.append(element.text)
    return values


def _rebase_service_url(config: OnvifConfig, address: str | None) -> str | None:
    """Keep the camera-advertised path on the configured reachable authority."""
    if not address:
        return None

    configured = urllib.parse.urlsplit(config.device_service_url)
    discovered = urllib.parse.urlsplit(address)
    return urllib.parse.urlunsplit(
        (
            configured.scheme,
            configured.netloc,
            discovered.path or "/",
            discovered.query,
            discovered.fragment,
        )
    )


def discover_services(config: OnvifConfig) -> OnvifServices:
    body = """
    <tds:GetCapabilities xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
      <tds:Category>All</tds:Category>
    </tds:GetCapabilities>
    """
    xml_text = _post(config.device_service_url, config, body)
    addresses = _text_by_local_name(xml_text, "XAddr")

    media = _rebase_service_url(
        config,
        next((addr for addr in addresses if re.search(r"media", addr, re.IGNORECASE)), None),
    )
    ptz = _rebase_service_url(
        config,
        next((addr for addr in addresses if re.search(r"ptz", addr, re.IGNORECASE)), None),
    )
    return OnvifServices(device=config.device_service_url, media=media, ptz=ptz)


def get_profiles(config: OnvifConfig, media_url: str) -> list[dict[str, str]]:
    body = """
    <trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl" />
    """
    xml_text = _post(media_url, config, body)
    root = ET.fromstring(xml_text)
    profiles: list[dict[str, str]] = []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] != "Profiles":
            continue
        token = element.attrib.get("token", "")
        name = ""
        for child in element:
            if child.tag.rsplit("}", 1)[-1] == "Name" and child.text:
                name = child.text
                break
        profiles.append({"token": token, "name": name})
    return profiles


def get_ptz_status(config: OnvifConfig, ptz_url: str, profile_token: str) -> dict[str, object]:
    body = f"""
    <tptz:GetStatus xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
    </tptz:GetStatus>
    """
    xml_text = _post(ptz_url, config, body)
    root = ET.fromstring(xml_text)
    position: dict[str, float] = {}
    move_status: dict[str, str] = {}
    for element in root.iter():
        local_name = element.tag.rsplit("}", 1)[-1]
        if local_name == "PanTilt" and "x" in element.attrib and "y" in element.attrib:
            position["pan"] = float(element.attrib["x"])
            position["tilt"] = float(element.attrib["y"])
        elif local_name == "Zoom" and "x" in element.attrib:
            position["zoom"] = float(element.attrib["x"])
        elif local_name == "PanTilt" and element.text:
            move_status["pan_tilt"] = element.text
        elif local_name == "Zoom" and element.text:
            move_status["zoom"] = element.text
    return {"ok": True, "position": position, "move_status": move_status}


def get_stream_uri(config: OnvifConfig, media_url: str, profile_token: str) -> dict[str, object]:
    body = f"""
    <trt:GetStreamUri xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
      <trt:StreamSetup>
        <tt:Stream>RTP-Unicast</tt:Stream>
        <tt:Transport>
          <tt:Protocol>RTSP</tt:Protocol>
        </tt:Transport>
      </trt:StreamSetup>
      <trt:ProfileToken>{profile_token}</trt:ProfileToken>
    </trt:GetStreamUri>
    """
    xml_text = _post(media_url, config, body)
    uris = _text_by_local_name(xml_text, "Uri")
    return {"ok": bool(uris), "uri": uris[0] if uris else None}


def continuous_move(
    config: OnvifConfig,
    ptz_url: str,
    profile_token: str,
    pan: float = 0.0,
    tilt: float = 0.0,
    zoom: float = 0.0,
) -> dict[str, object]:
    body = f"""
    <tptz:ContinuousMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="{pan}" y="{tilt}" />
        <tt:Zoom x="{zoom}" />
      </tptz:Velocity>
    </tptz:ContinuousMove>
    """
    _post(ptz_url, config, body)
    return {"ok": True, "action": "continuous_move", "pan": pan, "tilt": tilt, "zoom": zoom}


def relative_move(
    config: OnvifConfig,
    ptz_url: str,
    profile_token: str,
    pan: float = 0.0,
    tilt: float = 0.0,
    zoom: float = 0.0,
) -> dict[str, object]:
    body = f"""
    <tptz:RelativeMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
      <tptz:Translation>
        <tt:PanTilt x="{pan}" y="{tilt}" />
        <tt:Zoom x="{zoom}" />
      </tptz:Translation>
    </tptz:RelativeMove>
    """
    _post(ptz_url, config, body)
    return {"ok": True, "action": "relative_move", "pan": pan, "tilt": tilt, "zoom": zoom}


def absolute_move(
    config: OnvifConfig,
    ptz_url: str,
    profile_token: str,
    pan: float = 0.0,
    tilt: float = 0.0,
    zoom: float = 0.0,
) -> dict[str, object]:
    body = f"""
    <tptz:AbsoluteMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
      <tptz:Position>
        <tt:PanTilt x="{pan}" y="{tilt}" />
        <tt:Zoom x="{zoom}" />
      </tptz:Position>
    </tptz:AbsoluteMove>
    """
    _post(ptz_url, config, body)
    return {"ok": True, "action": "absolute_move", "pan": pan, "tilt": tilt, "zoom": zoom}


def stop(config: OnvifConfig, ptz_url: str, profile_token: str) -> dict[str, object]:
    body = f"""
    <tptz:Stop xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
      <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
    """
    _post(ptz_url, config, body)
    return {"ok": True, "action": "stop"}


def safe_onvif_summary(config: OnvifConfig) -> dict[str, object]:
    try:
        services = discover_services(config)
        profiles = get_profiles(config, services.media) if services.media else []
        return {
            "ok": True,
            "services": services.__dict__,
            "profiles": profiles,
            "ptz_available": bool(services.ptz),
        }
    except (urllib.error.URLError, TimeoutError, ET.ParseError, OSError) as exc:
        return {"ok": False, "error": str(exc)}
