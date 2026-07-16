# Bridge simplification map

## Current shape

The Home Assistant add-on under `stream-to-matter/` is the deployable product.
It already contains the Python camera API, WHEP relay, and matter.js sidecar.
The root-level `src/`, `media/`, and `sidecar/` trees are development mirrors,
which makes it easy for fixes to land in only one copy.

## Applied simplifications

1. **Use the add-on tree as the local runtime source of truth.**
   `compose.local-matter.yml` builds only `stream-to-matter/`; the lab no longer
   assembles three production components from the root mirrors.
2. **Make the full validation path one command.**
   `scripts/local_matter_lab.sh test` starts a synthetic RTSP stream, an ONVIF
   PTZ fixture, the all-in-one add-on image, and the official Home Assistant
   Matter Server. It checks REST/media/PTZ health and commissions the bridge.
3. **Remove fixed-port assumptions from add-on startup.**
   The startup readiness checks now follow `STREAM_TO_MATTER_PORT`,
   `MATTER_SIDECAR_PORT`, and `WHEP_RELAY_PORT`, allowing an isolated lab to run
   beside an existing Home Assistant installation.
4. **Keep credentials out of the lab.**
   The committed fixtures are synthetic and the generated Matter/server state
   lives under ignored `.local-matter-lab/`.

## Validation layers

```text
synthetic video -> MediaMTX RTSP -> camera API / WHEP relay
                                  -> ONVIF fixture / PTZ
                                  -> matter.js camera endpoint
                                  -> HA Matter Server commission + node read
```

Run:

```bash
./scripts/local_matter_lab.sh test
```

Use `logs`, `down`, or `reset` for lifecycle management. On a non-ARM host,
the script selects the matching official Matter Server image automatically;
`MATTER_SERVER_IMAGE` can override it.

## Next cleanup boundary

After the current root-level work is committed, remove the mirrored runtime
trees (`src/`, `media/`, and `sidecar/`) and point generic Docker documentation
and tests directly at `stream-to-matter/`. That deletion should be a dedicated
change because the present working tree contains material uncommitted edits in
both copies; deleting either side before those edits are reconciled risks data
loss.
