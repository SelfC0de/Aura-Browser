import struct
import traceback
from pathlib import Path

log = Path(r"C:\AuraBrowser\src\png2ico.log")
try:
    png_path = Path(r"C:\AuraBrowser\Aura.png")
    ico_path = Path(r"C:\AuraBrowser\src\Aura.ico")
    data = png_path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit("Aura.png is not a PNG")
    w = int.from_bytes(data[16:20], "big")
    h = int.from_bytes(data[20:24], "big")
    iw = 0 if w >= 256 else w
    ih = 0 if h >= 256 else h
    offset = 6 + 16
    ico = struct.pack("<HHH", 0, 1, 1)
    ico += struct.pack("<BBBBHHII", iw, ih, 0, 0, 1, 32, len(data), offset)
    ico += data
    ico_path.write_bytes(ico)
    log.write_text(f"ok {w}x{h} ico={len(ico)}\n", encoding="utf-8")
except Exception:
    log.write_text(traceback.format_exc(), encoding="utf-8")
    raise
