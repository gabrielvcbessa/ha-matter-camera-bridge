"""Commission the local bridge through Home Assistant Matter Server."""

from __future__ import annotations

import asyncio
import json
import os
import re

from aiohttp import ClientSession
from matter_server.client.client import MatterClient


async def main() -> None:
    server_url = os.environ.get("MATTER_SERVER_URL", "ws://127.0.0.1:15580/ws")
    pairing_code = os.environ["MATTER_PAIRING_CODE"]
    async with ClientSession() as session:
        client = MatterClient(server_url, session)
        await client.connect()
        listener = asyncio.create_task(client.start_listening())
        try:
            info = client.server_info
            await asyncio.sleep(1)
            existing = client.get_nodes()
            if existing:
                node = max(existing, key=lambda item: item.node_id)
                await client.interview_node(node.node_id)
                await asyncio.sleep(2)
                node = client.get_node(node.node_id)
                action = "reused"
            else:
                node = await client.commission_with_code(pairing_code, network_only=True)
                action = "commissioned"

            node_data = getattr(node, "node_data", node)
            attributes = getattr(node_data, "attributes", {}) or {}
            endpoint_ids = set(getattr(node, "endpoints", {}).keys())
            for path in attributes:
                endpoint_id = getattr(path, "endpoint_id", None)
                if endpoint_id is None:
                    match = re.match(r"^(\d+)/", str(path))
                    endpoint_id = int(match.group(1)) if match else None
                if endpoint_id is not None:
                    endpoint_ids.add(int(endpoint_id))
            endpoint_ids = sorted(endpoint_ids)
            if not {0, 1, 2}.issubset(endpoint_ids):
                raise RuntimeError(f"Expected root, aggregator, and camera endpoints; got {endpoint_ids}")
            print(json.dumps({
                "ok": True,
                "action": action,
                "server": getattr(info, "sdk_version", str(info)),
                "node_id": node.node_id,
                "endpoint_ids": endpoint_ids,
                "attribute_count": len(attributes),
            }, indent=2))
        finally:
            listener.cancel()
            await client.disconnect()


asyncio.run(main())
