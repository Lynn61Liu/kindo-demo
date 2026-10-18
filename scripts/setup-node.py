"""Install the project's official Node binary locally; global Node stays unchanged."""
import hashlib
from pathlib import Path
import platform
import tarfile
from urllib.request import urlopen, urlretrieve

root = Path(__file__).resolve().parents[1]
version = root.joinpath(".nvmrc").read_text().strip()
system = {"Darwin": "darwin", "Linux": "linux"}.get(platform.system())
arch = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64"}.get(platform.machine())
if not system or not arch:
    raise SystemExit("Use a Node version manager with .nvmrc on this platform")
name = f"node-v{version}-{system}-{arch}"
directory = root / ".local"
directory.mkdir(exist_ok=True)
if directory.joinpath(name, "bin/node").exists():
    print(f"Already installed: {name}")
    raise SystemExit(0)
base = f"https://nodejs.org/dist/v{version}/"
archive = directory / f"{name}.tar.gz"
urlretrieve(base + archive.name, archive)
checks = urlopen(base + "SHASUMS256.txt").read().decode()
expected = next(line.split()[0] for line in checks.splitlines() if line.endswith("  " + archive.name))
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit("Node archive SHA256 mismatch; refusing extraction")
with tarfile.open(archive) as tar:
    tar.extractall(directory, filter="data")
archive.unlink()
print(f"Installed {name}; SHA256 {expected}")
