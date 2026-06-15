#!/usr/bin/env python3
"""Warm local Whisper server for Hex's Diane recordings.

Spawned by `hex dashboard` when faster-whisper is installed: loads the model
ONCE, then serves `POST /transcribe` (raw 16 kHz wav bytes -> {"text": ...}) on
127.0.0.1. The model stays resident only while the dashboard runs — `hex
dashboard` kills this process on exit, freeing the memory. Stdlib only (no
extra deps); transcription stays fully on-device.

Usage: whisper-server.py <port>
Env:   HEX_WHISPER_MODEL_NAME (default "base")
"""
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

MODEL_NAME = os.environ.get("HEX_WHISPER_MODEL_NAME", "base")


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    try:
        from faster_whisper import WhisperModel
    except Exception as e:  # noqa: BLE001 — any import failure means "no engine"
        sys.stderr.write(f"hex-whisper: faster-whisper not available ({e})\n")
        return 1

    # Load once. CPU + int8 (matches the verified setup; no GPU dependency).
    model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):  # silence per-request logging
            pass

        def _json(self, code: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                self._json(200, {"ok": True, "model": MODEL_NAME})
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/transcribe":
                self._json(404, {"error": "not found"})
                return
            length = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(length) if length else b""
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            try:
                tmp.write(data)
                tmp.close()
                segments, _ = model.transcribe(tmp.name, language="en")
                text = " ".join(s.text.strip() for s in segments).strip()
                self._json(200, {"text": text})
            except Exception as e:  # noqa: BLE001
                self._json(500, {"error": str(e)})
            finally:
                try:
                    os.unlink(tmp.name)
                except OSError:
                    pass

    server = HTTPServer(("127.0.0.1", port), Handler)
    sys.stderr.write(
        f"hex-whisper: model '{MODEL_NAME}' loaded (cpu/int8), listening on 127.0.0.1:{port}\n"
    )
    sys.stderr.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
