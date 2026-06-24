from __future__ import annotations

from .config import CameraConfig
from .matter_model import camera_capabilities, stream_profiles


MATTER_CAMERA_STANDARD = "Matter 1.5.1"


def matter_endpoint_manifest(camera: CameraConfig, base_url: str = "http://127.0.0.1:8080") -> dict[str, object]:
    """Describe the boundary a real Matter SDK camera endpoint should bind to.

    The Python bridge intentionally does not claim to be a commissioned Matter
    node. This manifest is the integration contract for a connectedhomeip/CHIP
    sidecar: media negotiation maps to relay endpoints, PTZ maps to ONVIF
    actions, and zone/snapshot state maps to local bridge state.
    """
    camera_base = f"{base_url.rstrip('/')}/cameras/{camera.id}"
    return {
        "schema": "stream-to-matter.endpoint.v1",
        "matter_standard": MATTER_CAMERA_STANDARD,
        "commissioning": {
            "status": "sidecar_required",
            "notes": "Bind this manifest to a Matter SDK camera endpoint with valid device attestation for real ecosystem pairing.",
        },
        "node": {
            "vendor_name": "Local Bridge",
            "product_name": f"{camera.name} Matter Camera Bridge",
            "serial_number": camera.id,
        },
        "endpoint": {
            "id": camera.id,
            "name": camera.name,
            "device_type": "camera",
            "capabilities": camera_capabilities(camera)["capabilities"],
            "stream_profiles": stream_profiles(camera)["profiles"],
            "routes": {
                "probe": f"{camera_base}/probe",
                "onvif": f"{camera_base}/onvif",
                "stream_uri": f"{camera_base}/stream-uri",
                "hls_high": f"{camera_base}/streams/high/hls",
                "hls_mobile": f"{camera_base}/streams/mobile/hls",
                "hls_analysis": f"{camera_base}/streams/analysis/hls",
                "dash_high": f"{camera_base}/streams/high/dash",
                "dash_mobile": f"{camera_base}/streams/mobile/dash",
                "dash_analysis": f"{camera_base}/streams/analysis/dash",
                "snapshot_jpeg": f"{camera_base}/snapshot.jpg",
                "snapshot_heic": f"{camera_base}/snapshot.heic",
                "snapshot_heic_data": f"{camera_base}/snapshot-data.heic",
                "ptz_status": f"{camera_base}/ptz/status",
                "ptz_continuous": f"{camera_base}/ptz/continuous",
                "ptz_direction": f"{camera_base}/ptz/direction/{{direction}}",
                "ptz_relative": f"{camera_base}/ptz/relative",
                "ptz_absolute": f"{camera_base}/ptz/absolute",
                "ptz_stop": f"{camera_base}/ptz/stop",
                "privacy_zones": f"{camera_base}/zones/privacy",
                "detection_zones": f"{camera_base}/zones/detection",
            },
        },
    }
