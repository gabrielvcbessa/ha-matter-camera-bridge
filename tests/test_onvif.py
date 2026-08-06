import unittest

from stream_to_matter.config import OnvifConfig
from stream_to_matter.onvif import OnvifServices, _rebase_service_url, _text_by_local_name


class OnvifTests(unittest.TestCase):
    def test_device_service_url(self):
        config = OnvifConfig(host="192.168.68.59", port=80, user="rtsp", password="camera-password")
        self.assertEqual(config.device_service_url, "http://192.168.68.59:80/onvif/device_service")

    def test_parses_xaddr_by_local_name(self):
        xml = """<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
          <s:Body>
            <GetCapabilitiesResponse>
              <Capabilities>
                <Media><XAddr>http://camera/onvif/media_service</XAddr></Media>
                <PTZ><XAddr>http://camera/onvif/ptz_service</XAddr></PTZ>
              </Capabilities>
            </GetCapabilitiesResponse>
          </s:Body>
        </s:Envelope>"""
        self.assertEqual(
            _text_by_local_name(xml, "XAddr"),
            [
                "http://camera/onvif/media_service",
                "http://camera/onvif/ptz_service",
            ],
        )

    def test_onvif_services_shape(self):
        services = OnvifServices(
            device="http://camera/onvif/device_service",
            media="http://camera/onvif/media_service",
            ptz="http://camera/onvif/ptz_service",
        )
        self.assertIsNotNone(services.ptz)

    def test_rebases_discovered_service_to_configured_authority(self):
        config = OnvifConfig(
            host="host.docker.internal",
            port=29080,
            user="rtsp",
            password="camera-password",
        )
        self.assertEqual(
            _rebase_service_url(config, "http://192.168.68.59:80/onvif/ptz_service?profile=1"),
            "http://host.docker.internal:29080/onvif/ptz_service?profile=1",
        )

    def test_rebase_preserves_missing_service(self):
        config = OnvifConfig(host="camera", port=80, user="rtsp", password="camera-password")
        self.assertIsNone(_rebase_service_url(config, None))

    def test_parses_stream_uri_by_local_name(self):
        xml = """<Envelope><Body><GetStreamUriResponse><MediaUri>
          <Uri>rtsp://camera:554/stream1</Uri>
        </MediaUri></GetStreamUriResponse></Body></Envelope>"""
        self.assertEqual(_text_by_local_name(xml, "Uri"), ["rtsp://camera:554/stream1"])


if __name__ == "__main__":
    unittest.main()
