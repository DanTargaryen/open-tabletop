import base64
import json
import os
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "_ref" / "docs" / "identity-plaques-v1"
BASE = "https://www.rightapi.ai"
KEY = os.environ.get("RIGHTCODE_KEY") or os.environ.get("OPENAI_API_KEY")


def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE + path,
        data=data,
        headers={
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        return json.load(response)


def find_image(value):
    if isinstance(value, dict):
        if value.get("b64_json"):
            return "base64", value["b64_json"]
        for key in ("url", "image_url"):
            if isinstance(value.get(key), str) and value[key].startswith("https://"):
                return "url", value[key]
        for child in value.values():
            found = find_image(child)
            if found:
                return found
    if isinstance(value, list):
        for child in value:
            found = find_image(child)
            if found:
                return found
    return None


def generate(stem):
    prompt = (ROOT / f"{stem}-prompt.txt").read_text(encoding="utf-8")
    task = request(
        "/draw/v1/images/generations",
        {"model": "gpt-image-2", "prompt": prompt, "size": "1536x1024", "n": 1, "async": True},
    )["task_id"]
    print(f"{stem}: submitted {task}", flush=True)
    while True:
        result = request("/v1/tasks/" + task)
        status = result.get("status") or "unknown"
        print(f"{stem}: {status}", flush=True)
        image = find_image(result)
        if status == "completed" or image:
            if not image:
                raise RuntimeError("Completed task contains no image")
            if image[0] == "base64":
                raw = base64.b64decode(image[1])
            else:
                with urllib.request.urlopen(image[1], timeout=180) as response:
                    raw = response.read()
            (ROOT / f"identity-{stem}-v1.png").write_bytes(raw)
            return
        if status in {"failed", "cancelled"}:
            raise RuntimeError(json.dumps(result, ensure_ascii=False))
        time.sleep(4)


if not KEY:
    raise RuntimeError("No configured image API key")
for name in ("plaque-a", "plaque-b"):
    target = ROOT / f"identity-{name}-v1.png"
    if target.exists():
        continue
    for attempt in range(1, 4):
        try:
            generate(name)
            break
        except Exception:
            if attempt == 3:
                raise
            print(f"{name}: retry {attempt + 1}/3", flush=True)
            time.sleep(3)
