"""Give changed scripts/styles fresh URLs without a frontend build dependency."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def refresh(path, pattern):
    def version(match):
        name = match.group(1)
        digest = hashlib.sha256((path.parent / name).read_bytes()).hexdigest()[:12]
        return f"{name}?v={digest}"
    path.write_text(re.sub(pattern, version, path.read_text()))


if __name__ == "__main__":
    refresh(ROOT / "app.js", r"(\./[\w-]+\.js)(?:\?v=[\w-]+)?")
    pages = [ROOT / "index.html", *[ROOT / name / "index.html" for name in ("privacy", "credits", "about")]]
    for page in pages:
        refresh(page, r"(?<=[\"'])((?:\.\./)?[\w-]+\.(?:css|js))(?:\?v=[\w-]+)?(?=[\"'])")
