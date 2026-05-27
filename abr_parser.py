"""
Adobe Photoshop ABR (Brush Resource) parser.
Extracts brush tip bitmaps and saves them as grayscale PNG files.

Supported versions:
  v1/v2          (Photoshop 5–7):    full support via PackBits decompression
  v6/v10         (Photoshop CS):     ActionDescriptor-based parsing
  v6 sub2        (Photoshop CC+):    UUID-keyed PackBits entries

Color convention:
  ABR stores brushes with  dark  = full paint, light = no paint.
  Our brush system expects  bright = full paint, dark  = no paint.
  Extracted images are inverted automatically to match our convention.

Enable debug logging with `logging.getLogger("abr_parser").setLevel(logging.DEBUG)`
for verbose per-entry diagnostics.
"""

import logging
import re
import struct
import zlib
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

try:
    from PIL import Image
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False


_MAX_BRUSH_DIM  = 4096   # 一辺の最大ピクセル数
_MAX_BRUSHES    = 500    # 1ファイルあたりの最大ブラシ数

# ─── Public API ───────────────────────────────────────────────────────────────

def extract_brushes(abr_data: bytes, output_dir: Path, stem: str) -> list[Path]:
    """
    Parse ABR bytes and save each brush tip as PNG in output_dir/<stem>/.
    Returns the list of saved file paths.
    """
    if not _HAS_PIL:
        raise RuntimeError(
            "Pillow (PIL) is required for ABR parsing. "
            "Install with: pip install Pillow"
        )
    if len(abr_data) < 4:
        log.warning("ABR file too small (<4 bytes)")
        return []

    version     = struct.unpack_from('>H', abr_data, 0)[0]
    sub_version = struct.unpack_from('>H', abr_data, 2)[0]
    log.info("ABR version=%d sub_version=%d total=%d bytes", version, sub_version, len(abr_data))

    try:
        if version == 1:
            raw_brushes = _parse_v1v2(abr_data, 1)
        elif version == 2:
            # sub_version==6 means ActionDescriptor layout embedded in v2 wrapper
            if sub_version == 6:
                log.debug("ABR v2/sub6 → using v6 ActionDescriptor parser")
                raw_brushes = _parse_v6_sub(abr_data)
            else:
                # v2 (sub!=6) uses block-length prefix format with Unicode names
                raw_brushes = _parse_v2(abr_data)
        elif version in (6, 10):
            raw_brushes = _parse_v6(abr_data)
        else:
            log.warning("Unsupported ABR version %d", version)
            return []
    except Exception:
        log.exception("ABR parse error (version %d)", version)
        return []

    if len(raw_brushes) > _MAX_BRUSHES:
        log.warning("ABR contains %d brushes; capping at %d", len(raw_brushes), _MAX_BRUSHES)
        raw_brushes = raw_brushes[:_MAX_BRUSHES]
    log.info("ABR extracted %d brushes", len(raw_brushes))
    if not raw_brushes:
        return []

    folder = output_dir / stem
    folder.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    for i, raw in enumerate(raw_brushes):
        name = _sanitize(raw.get('name') or '', i)
        out  = _unique_path(folder, name, '.png')
        try:
            img = Image.frombytes(raw['mode'], raw['size'], raw['data'])
            # ABR grayscale: bright(255)=full paint, dark(0)=no paint
            # Save as RGBA: white pixels, alpha = luminance (bright=opaque brush)
            rgba = Image.new('RGBA', img.size, (255, 255, 255, 0))
            rgba.putalpha(img)
            rgba.save(out, 'PNG')
            saved.append(out)
        except Exception:
            log.warning("Failed to save brush %s", out)

    return saved


# ─── Utilities ────────────────────────────────────────────────────────────────

def _sanitize(name: str, idx: int) -> str:
    s = ''.join(c if c.isalnum() or c in ' _-' else '_' for c in name).strip()
    return s or f'brush_{idx + 1:03d}'


def _unique_path(folder: Path, stem: str, ext: str) -> Path:
    p = folder / f'{stem}{ext}'
    n = 1
    while p.exists():
        p = folder / f'{stem}_{n}{ext}'
        n += 1
    return p


# ─── Binary reader ────────────────────────────────────────────────────────────

class _R:
    """Big-endian binary reader with bounds tracking."""

    __slots__ = ('data', 'pos', 'end')

    def __init__(self, data: bytes, start: int = 0, end: Optional[int] = None):
        self.data = data
        self.pos  = start
        self.end  = len(data) if end is None else end

    @property
    def remaining(self) -> int:
        return max(0, self.end - self.pos)

    def skip(self, n: int) -> None:
        self.pos += n

    def raw(self, n: int) -> bytes:
        v = self.data[self.pos:self.pos + n]
        self.pos += n
        return v

    def u8(self)  -> int:
        v = self.data[self.pos]; self.pos += 1; return v

    def u16(self) -> int:
        v = struct.unpack_from('>H', self.data, self.pos)[0]
        self.pos += 2; return v

    def i16(self) -> int:
        v = struct.unpack_from('>h', self.data, self.pos)[0]
        self.pos += 2; return v

    def u32(self) -> int:
        v = struct.unpack_from('>I', self.data, self.pos)[0]
        self.pos += 4; return v

    def i32(self) -> int:
        v = struct.unpack_from('>i', self.data, self.pos)[0]
        self.pos += 4; return v

    def f64(self) -> float:
        v = struct.unpack_from('>d', self.data, self.pos)[0]
        self.pos += 8; return v

    def key(self) -> str:
        """Photoshop key: uint32 length (0 → 4-char OSType) then bytes."""
        n = self.u32()
        if n == 0:
            return self.raw(4).decode('latin-1')
        return self.raw(n).decode('latin-1', errors='replace')

    def pstring(self) -> str:
        """Pascal string: 1-byte length + chars, padded to even total."""
        n  = self.u8()
        s  = self.raw(n).decode('mac_roman', errors='replace')
        if (n + 1) % 2:
            self.skip(1)
        return s

    def ustr(self) -> str:
        """UTF-16-BE string: uint32 char-count + utf-16-be bytes."""
        n = self.u32()
        return self.raw(n * 2).decode('utf-16-be', errors='replace')


# ─── PackBits decompression ───────────────────────────────────────────────────

def _unpack_bits(r: _R, want: int) -> bytes:
    """Decompress PackBits from reader until `want` bytes are produced."""
    out = bytearray()
    while len(out) < want and r.remaining > 0:
        n = r.u8()
        if n == 128:        # no-op
            pass
        elif n > 128:       # run: repeat next byte (257-n) times
            count = 257 - n
            if r.remaining:
                b = r.u8()
                out.extend(bytes([b]) * count)
        else:               # literal: copy next (n+1) bytes verbatim
            count = n + 1
            out.extend(r.raw(count))
    return bytes(out[:want])


def _row_packbits(entry_data: bytes, w: int, h: int, table_off: int = 66) -> Optional[bytes]:
    """Per-row PackBits used by modern ABR v6 sub2.

    Layout starting at table_off:
      u16 × h  — compressed byte count for each row (LE or BE depending on ABR source)
      <row data>  — each row is PackBits-compressed independently

    Tries LE byte order first, then BE. Returns None if neither is consistent.
    """
    table_end = table_off + h * 2
    if len(entry_data) < table_end:
        return None

    max_row_bytes = w * 2  # PackBits worst-case expansion
    pixel_data = entry_data[table_end:]

    for fmt in ('<H', '>H'):
        row_counts: list[int] = []
        valid = True
        for i in range(h):
            c = struct.unpack_from(fmt, entry_data, table_off + i * 2)[0]
            if c > max_row_bytes:
                valid = False
                break
            row_counts.append(c)
        if not valid:
            continue
        if sum(row_counts) > len(pixel_data):
            continue

        rows: list[bytes] = []
        pos = 0
        for c in row_counts:
            if c == 0:
                rows.append(b'\x00' * w)
            else:
                row_raw = _unpack_bits(_R(pixel_data[pos: pos + c]), w)
                if len(row_raw) < w:
                    row_raw += b'\x00' * (w - len(row_raw))
                rows.append(row_raw[:w])
                pos += c
        return b''.join(rows)

    return None


# ─── ABR v2 (block-length format, Photoshop 7+) ──────────────────────────────

def _parse_v2(data: bytes) -> list[dict]:
    """Parse ABR v2 (non-sub6) files.

    Each brush record:  type(2) + block_len(4) + block_data(block_len bytes)

    Sampled brush block layout:
      u32  misc/index
      u16  spacing
      pstr name  (usually empty pascal string = 2 bytes)
      u16  unicode_name_len
      bytes unicode_name  (unicode_name_len × 2, UTF-16-BE, incl. null)
      u8   antiAlias
      4×i16 bounds_short  (top, left, bottom, right)
      4×i32 bounds_long   (top, left, bottom, right — use for brushes > 32767px)
      u16  depth
      bytes PackBits pixel data
    """
    r = _R(data)
    r.skip(2)            # version
    count = r.u16()
    brushes: list[dict] = []

    for idx in range(count):
        if r.remaining < 6:
            break
        btype     = r.u16()
        block_len = r.u32()
        block_end = r.pos + block_len

        if btype != 2:
            # Computed / unknown brush — skip via block_len
            r.pos = block_end
            continue

        sub = _R(data, r.pos, block_end)

        sub.skip(4 + 2)   # misc/index + spacing
        sub.pstring()     # pascal string (typically empty in v2)

        name = f'brush_{idx + 1:03d}'
        nlen = sub.u16()
        if 0 < nlen <= 256:
            raw_n = sub.raw(nlen * 2)
            try:
                name = raw_n.decode('utf-16-be').rstrip('\x00').strip() or name
            except Exception:
                pass
        elif nlen > 0:
            sub.skip(nlen * 2)

        sub.skip(1)           # antiAlias
        top    = sub.i16()
        left   = sub.i16()
        bottom = sub.i16()
        right  = sub.i16()

        # 4×i32 extended bounds; use if they exceed i16 range
        top_l  = sub.i32()
        left_l = sub.i32()
        bot_l  = sub.i32()
        rgt_l  = sub.i32()
        if bot_l > bottom or rgt_l > right:
            top, left, bottom, right = top_l, left_l, bot_l, rgt_l

        depth = sub.u16()

        w = right - left
        h = bottom - top
        if w <= 0 or h <= 0 or w > _MAX_BRUSH_DIM or h > _MAX_BRUSH_DIM or depth not in (1, 8):
            log.debug("v2 brush#%d: invalid w=%d h=%d depth=%d — skipping", idx, w, h, depth)
            r.pos = block_end
            continue

        bpr   = (w * depth + 7) // 8
        total = bpr * h
        raw   = _unpack_bits(sub, total)

        if len(raw) < total:
            log.warning("v2 brush %r: short data %d/%d — skipping", name, len(raw), total)
            r.pos = block_end
            continue

        if depth == 1:
            expanded = bytearray(w * h)
            for row in range(h):
                for col in range(w):
                    byte_i = row * bpr + col // 8
                    bit    = 7 - (col % 8)
                    expanded[row * w + col] = 255 if (raw[byte_i] >> bit) & 1 else 0
            raw = bytes(expanded)

        log.debug("v2 brush#%d %r: %dx%d depth=%d", idx, name, w, h, depth)
        brushes.append({'name': name, 'size': (w, h), 'data': raw, 'mode': 'L'})
        r.pos = block_end

    return brushes


# ─── ABR v1 / v2 ─────────────────────────────────────────────────────────────

def _parse_v1v2(data: bytes, version: int) -> list[dict]:
    r     = _R(data)
    r.skip(2)            # version already read
    count = r.u16()
    brushes: list[dict] = []

    for idx in range(count):
        if r.remaining < 2:
            break
        btype = r.u16()

        if btype == 1:
            # Computed brush – read common header, no image data
            r.skip(4 + 2)               # misc + spacing
            if version == 2:
                r.pstring()             # name
            r.skip(1 + 8 + 2)          # antiAlias + bounds(4×i16) + depth
            continue

        if btype != 2:
            log.debug("v1v2: unknown brush type %d at idx=%d — skipping rest", btype, idx)
            break  # unknown type; stop parsing

        # Sampled brush
        r.skip(4 + 2)                   # misc + spacing
        name = f'brush_{idx + 1:03d}'
        if version == 2:
            name = r.pstring() or name

        r.skip(1)                        # antiAlias
        top    = r.i16()
        left   = r.i16()
        bottom = r.i16()
        right  = r.i16()
        depth  = r.u16()

        w = right  - left
        h = bottom - top
        if w <= 0 or h <= 0 or w > _MAX_BRUSH_DIM or h > _MAX_BRUSH_DIM or depth not in (1, 8):
            continue

        bpr   = (w * depth + 7) // 8    # bytes per row (uncompressed)
        total = bpr * h

        raw = _unpack_bits(r, total)
        if len(raw) < total:
            continue

        if depth == 1:
            # Expand 1-bit to 8-bit (1 = white, 0 = black)
            expanded = bytearray(w * h)
            for row in range(h):
                for col in range(w):
                    byte_i = row * bpr + col // 8
                    bit    = 7 - (col % 8)
                    expanded[row * w + col] = 255 if (raw[byte_i] >> bit) & 1 else 0
            raw = bytes(expanded)

        brushes.append({'name': name, 'size': (w, h), 'data': raw, 'mode': 'L'})

    return brushes


# ─── ABR v6 / v10  (ActionDescriptor-based) ──────────────────────────────────

def _parse_v6_sub(data: bytes) -> list[dict]:
    """v2 files with sub_version=6: skip 4-byte header then use _parse_v6_blocks."""
    return _parse_v6_blocks(data, skip=4)


def _parse_v6(data: bytes) -> list[dict]:
    return _parse_v6_blocks(data, skip=4)


def _parse_v6_blocks(data: bytes, skip: int) -> list[dict]:
    r = _R(data)
    r.skip(skip)
    brushes: list[dict] = []

    while r.remaining >= 12:
        sig = r.raw(4)
        if sig != b'8BIM':
            log.debug("v6: expected 8BIM at pos=%d, got %r — stopping", r.pos - 4, sig)
            break
        blk_key = r.raw(4).decode('latin-1')
        blk_len = r.u32()
        blk_end = r.pos + blk_len
        log.debug("v6: block key=%r len=%d", blk_key, blk_len)

        if blk_key == 'desc' and blk_len > 0:
            sub = _R(data, r.pos, blk_end)
            try:
                sub.u32()  # descriptor_version, always 16
                desc = _read_descriptor(sub)
                brsh_list = desc.get('Brsh')
                if isinstance(brsh_list, list):
                    desc_names: list[str] = []
                    for b in brsh_list:
                        name = ''
                        if isinstance(b, dict):
                            sampled = b.get('Brsh')
                            if isinstance(sampled, dict):
                                raw_n = sampled.get('Nm  ', '')
                                if isinstance(raw_n, str):
                                    name = raw_n.rstrip('\x00').strip()
                        desc_names.append(name)
                    # Apply names to extracted brushes (sequential mapping)
                    applied = 0
                    for i, brush in enumerate(brushes):
                        if i < len(desc_names) and desc_names[i]:
                            brush['name'] = desc_names[i]
                            applied += 1
                    log.debug("desc: applied %d names from %d brsh entries", applied, len(brsh_list))
            except Exception:
                log.exception("desc block parse failed")

        if blk_key == 'samp':
            # ABR v6 sub2 (Photoshop CC) uses UUID-prefixed entries.
            # Each entry: 4 bytes entry_len + entry_len bytes data + padding to 4-byte align.
            # Entry data starts with a 1-byte length=36 + 36-char UUID Pstring.
            samp_bytes = data[r.pos:blk_end]
            uuid_positions = [(m.start(), m.group(1).decode('ascii'))
                              for m in _UUID_PSTR_PATTERN.finditer(samp_bytes)]
            log.debug("samp: found %d UUID-prefixed entries", len(uuid_positions))

            failed_indices: list[int] = []
            for i, (uuid_pos, uuid_str) in enumerate(uuid_positions):
                # entry data spans from UUID start to (next UUID's entry_len field - 4)
                if i + 1 < len(uuid_positions):
                    entry_end_in_samp = uuid_positions[i+1][0] - 4
                else:
                    entry_end_in_samp = len(samp_bytes)
                entry_data = samp_bytes[uuid_pos:entry_end_in_samp]

                b = _extract_v6sub2_entry(entry_data, uuid_str, idx=i)
                if b:
                    brushes.append(b)
                else:
                    failed_indices.append(i)
            if failed_indices:
                log.warning("samp: %d/%d entries failed to extract (indices: %s)",
                            len(failed_indices), len(uuid_positions), failed_indices)

        r.pos = blk_end
        if blk_len % 2:        # align to 2-byte boundary
            r.skip(1)

    return brushes


# UUID Pstring pattern: 1-byte length=36 + 36-char UUID
_UUID_PSTR_PATTERN = re.compile(
    rb'\x24'
    rb'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}'
    rb'-[0-9a-f]{4}-[0-9a-f]{12})'
)


def _extract_v6sub2_entry(entry_data: bytes, uuid: str, idx: int) -> Optional[dict]:
    """Extract a single ABR v6 sub2 (Photoshop CC) samp entry.

    Known layouts (both use 1/256-pixel canvas bounds, pixel data at offset 66):
      Older CC:  bounds at offset 48 (after 8-byte crop bounds + 2-byte depth)
      PS CC2024+: bounds at offset 50 (12-byte fixed header instead of 10)
    """
    if len(entry_data) < 67 or entry_data[0] != 36:
        return None

    w = h = None
    img_data = b''

    # Try known canvas-bounds offsets; stop at the first that gives valid dimensions.
    for bounds_off in (48, 50):
        if len(entry_data) < bounds_off + 16:
            continue
        try:
            raw_top, raw_left, raw_bot, raw_right = struct.unpack_from('>4i', entry_data, bounds_off)
            top   = raw_top   // 256
            left  = raw_left  // 256
            bot   = raw_bot   // 256
            right = raw_right // 256
            w_try = right - left
            h_try = bot - top
            if 0 < w_try <= _MAX_BRUSH_DIM and 0 < h_try <= _MAX_BRUSH_DIM:
                w, h = w_try, h_try
                img_data = entry_data[66:]
                log.debug("v6sub2 entry#%d: bounds_off=%d w=%d h=%d", idx, bounds_off, w, h)
                break
        except struct.error:
            pass

    if w is None:
        log.debug("v6sub2 entry#%d: invalid bounds — skipping", idx)
        return None

    needed = w * h
    log.debug("v6sub2 entry#%d: uuid=%s w=%d h=%d", idx, uuid, w, h)

    # Strategy 0: per-row PackBits with row-count table at offset 66
    # (Photoshop CC / PS 2024+ format — tries both LE and BE u16)
    row_data = _row_packbits(entry_data, w, h, table_off=66)
    if row_data is not None and len(row_data) == needed:
        log.debug("v6sub2 entry#%d: decoded via per-row packbits (table_off=66)", idx)
        return {'name': uuid, 'size': (w, h), 'data': row_data, 'mode': 'L'}

    # Strategy 0b: per-row PackBits with BE u16 row-count table at offset 320.
    # Used by Atenais and similar ABR files that have a 254-byte fixed preamble
    # from offset 66, followed by a 26-byte PSD-style image descriptor
    # (bounds, depth, compression=1) ending at byte 319, with the row count
    # table starting at byte 320.
    row_data = _row_packbits(entry_data, w, h, table_off=320)
    if row_data is not None and len(row_data) == needed:
        log.debug("v6sub2 entry#%d: decoded via per-row packbits (table_off=320)", idx)
        return {'name': uuid, 'size': (w, h), 'data': row_data, 'mode': 'L'}

    # Strategy 1: raw 8-bit grayscale (no compression)
    if len(img_data) >= needed:
        return {'name': uuid, 'size': (w, h), 'data': bytes(img_data[:needed]), 'mode': 'L'}

    # Strategy 2: zlib
    try:
        decompressed = zlib.decompress(img_data)
        if len(decompressed) >= needed:
            return {'name': uuid, 'size': (w, h), 'data': bytes(decompressed[:needed]), 'mode': 'L'}
    except Exception:
        pass

    # Strategy 3: single-stream PackBits with optional zero-padding
    try:
        unpacked = _unpack_bits(_R(img_data), needed)
        if len(unpacked) >= needed:
            return {'name': uuid, 'size': (w, h), 'data': bytes(unpacked[:needed]), 'mode': 'L'}
        if len(unpacked) >= needed * 0.95:
            shortfall = needed - len(unpacked)
            log.debug("v6sub2 entry#%d: packbits short by %d bytes — zero-padded", idx, shortfall)
            return {'name': uuid, 'size': (w, h),
                    'data': bytes(unpacked) + b'\x00' * shortfall, 'mode': 'L'}
    except Exception:
        pass

    log.debug("v6sub2 entry#%d: all decode strategies failed", idx)
    return None


def _parse_v6_entry(r: _R) -> Optional[dict]:
    desc = _read_descriptor(r)

    raw_name = desc.get('dsnm') or desc.get('nm  ') or ''
    if isinstance(raw_name, bytes):
        raw_name = raw_name.decode('utf-16-be', errors='replace')
    name = str(raw_name).strip('\x00').strip()

    img_desc: Optional[dict] = None
    for k in ('Msks', 'mask', 'Msck', 'imsp'):
        v = desc.get(k)
        if isinstance(v, dict):
            img_desc = v
            break
    if img_desc is None:
        log.debug("v6 entry: no image descriptor in keys %s", list(desc.keys()))
        return None

    compressed = bool(img_desc.get('Comp', False))
    depth      = int(img_desc.get('Mdpx', 8))

    bounds = img_desc.get('Bnd ')
    if not isinstance(bounds, dict):
        return None

    top    = int(bounds.get('Top ', 0) or 0)
    left   = int(bounds.get('Left', 0) or 0)
    bottom = int(bounds.get('Btom', 0) or 0)
    right  = int(bounds.get('Rght', 0) or 0)
    w = right - left
    h = bottom - top
    if w <= 0 or h <= 0:
        return None

    imgs = img_desc.get('Imgs')
    if not isinstance(imgs, (bytes, bytearray)) or not imgs:
        return None

    if compressed:
        try:
            imgs = zlib.decompress(imgs)
        except Exception:
            log.debug("v6 entry %r: zlib decompress failed", name)
            return None

    needed = w * h * (depth // 8)
    if len(imgs) < needed:
        return None

    return {'name': name or 'brush', 'size': (w, h), 'data': bytes(imgs[:needed]), 'mode': 'L'}


# ─── ActionDescriptor parser ──────────────────────────────────────────────────

def _read_descriptor(r: _R) -> dict:
    """Read a standard Photoshop ActionDescriptor:
       Unicode name (4-byte char count + N*2 bytes UTF-16-BE)
       + class ID (key format) + item count + items.
    """
    name_len_chars = r.u32()
    if name_len_chars > 0:
        r.skip(name_len_chars * 2)
    r.key()              # class ID (skip)
    count  = r.u32()
    result: dict = {}
    for _ in range(count):
        k          = r.key()
        vtype      = r.raw(4).decode('latin-1')
        result[k]  = _read_value(r, vtype)
    return result


def _read_value(r: _R, vtype: str):  # noqa: C901
    if vtype == 'long':
        return r.i32()
    if vtype == 'comp':
        hi = r.i32(); lo = r.u32()
        return (hi << 32) | lo
    if vtype == 'doub':
        return r.f64()
    if vtype == 'bool':
        return bool(r.u8())
    if vtype == 'TEXT':
        return r.ustr()
    if vtype == 'tdta':
        n = r.u32(); return r.raw(n)
    if vtype in ('Objc', 'GlbO'):
        return _read_descriptor(r)
    if vtype == 'VlLs':
        n = r.u32()
        return [_read_value(r, r.raw(4).decode('latin-1')) for _ in range(n)]
    if vtype == 'enum':
        r.key(); r.key(); return None
    if vtype == 'UntF':
        r.raw(4); return r.f64()    # unit OSType + double
    if vtype == 'UnFl':
        r.raw(4)                    # unit OSType
        n = r.u32()
        return [r.f64() for _ in range(n)]
    if vtype in ('type', 'GlbC'):
        return r.key()
    if vtype in ('alis', 'Pth '):
        n = r.u32(); return r.raw(n)
    if vtype == 'ObAr':
        r.key()                     # class
        n = r.u32()
        for _ in range(n):
            r.key()
            it = r.raw(4).decode('latin-1')
            _read_value(r, it)
        return None
    raise ValueError(f"Unknown descriptor type: {vtype!r}")
