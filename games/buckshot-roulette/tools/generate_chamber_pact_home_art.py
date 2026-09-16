import base64
import json
import os
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPT = ROOT / "_ref" / "docs" / "chamber-pact-home-art-v1-prompt.txt"
OUTPUT = ROOT / "web" / "assets" / "chamber-pact-home-v1.png"
BASE = "https://www.rightapi.ai"
KEY = os.environ.get("RIGHTCODE_KEY") or os.environ.get("OPENAI_API_KEY")


def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data, headers={
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    })
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


if not KEY:
    raise RuntimeError("No configured image API key")
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
prompt = PROMPT.read_text(encoding="utf-8")
submitted = request("/draw/v1/images/generations", {
    "model": "gpt-image-2", "prompt": prompt, "size": "2048x1152", "n": 1, "async": True,
})
task = submitted["task_id"]
print("submitted", task, flush=True)
for _ in range(75):
    result = request("/v1/tasks/" + task)
    image = find_image(result)
    status = result.get("status") or "syncing"
    print(status, flush=True)
    if image:
        if image[0] == "base64":
            raw = base64.b64decode(image[1])
        else:
            with urllib.request.urlopen(image[1], timeout=180) as response:
                raw = response.read()
        OUTPUT.write_bytes(raw)
        print(OUTPUT, flush=True)
        break
    if status in {"failed", "cancelled"}:
        raise RuntimeError(json.dumps(result, ensure_ascii=False))
    time.sleep(4)
else:
    raise TimeoutError("Image task did not finish in time")
