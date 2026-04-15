from __future__ import annotations

import json
import os
from pathlib import Path

import requests


def run() -> None:
    base_url = os.getenv("PYTHON_SERVICE_URL", "http://localhost:8001")
    sample_file = os.getenv("SAMPLE_INVOICE_PATH", "")
    kind = os.getenv("SAMPLE_KIND", "image")

    if not sample_file:
        raise RuntimeError("Set SAMPLE_INVOICE_PATH to an invoice image/pdf file before running this test.")

    file_path = Path(sample_file)
    if not file_path.exists():
        raise RuntimeError(f"Sample file does not exist: {file_path}")

    with file_path.open("rb") as fp:
        files = {"file": (file_path.name, fp)}
        response = requests.post(f"{base_url}/parse/{kind}", files=files, timeout=120)

    response.raise_for_status()
    payload = response.json()

    assert isinstance(payload.get("success"), bool), "success must be boolean"
    assert isinstance(payload.get("columns"), list), "columns must be list"
    assert isinstance(payload.get("rows"), list), "rows must be list"
    assert isinstance(payload.get("confidence"), (int, float)), "confidence must be number"
    if payload.get("success"):
        assert len(payload["rows"]) > 0, "expected extracted rows for sample document"

    print(json.dumps(payload, indent=2))
    print("Sample Gemini parse test passed.")


if __name__ == "__main__":
    run()
