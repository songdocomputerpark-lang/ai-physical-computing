"""원고 이미지 추출 도구의 파이썬 일꾼(PLAN §8.5 P5-01, §9.3, PD-18) — 개발 도구라 배포물에 들어가지 않는다.

scripts/extract-lesson-images.mjs가 JSON 한 덩어리를 표준 입력으로 주면, 결과 JSON 한 덩어리를 표준 출력으로 돌려준다.
어느 그림을 꺼낼지(허용 목록), 제외 쪽인지, 어디에 쓸지는 모두 Node 쪽(scripts/lib/lesson-images.mjs)이 정해서 넘긴다.
이 파일은 받은 작업만 한다 — 목록에 없는 그림을 스스로 찾아 꺼내지 않는다.

- 원본(PDF·PPTX)은 읽기만 한다. 원본을 고치거나 통째로 복사하지 않는다.
- 픽셀만 새 그림(Image.frombytes)으로 옮겨 WebP로 다시 인코딩한다. 그래서 원본 그림에 붙어 있던 EXIF·XMP·ICC
  (작업 PC 경로, 원본 파일 이름, 촬영 기기 등)가 따라 나오지 않는다. 저장한 뒤 다시 열어 한 번 더 확인한다.
- 얼굴 검사는 Node 쪽(scripts/lib/face-check.mjs — 사이트와 같은 OpenCV 4.11)이 한다. 여기서는 검사용 흑백 원시 파일만 쓴다.
- 원본 그림의 XMP에서 권리 표기(제작자·권리 문구·제목·웹 주소)만 읽어 알려 준다(제3자 권리 자료를 가리려고). 파일 경로가 든
  칸은 읽지도 알리지도 않는다(개인정보 — 디자인 작업 PC의 사용자 폴더가 들어 있다).

명령(cmd)
  probe    쓸 수 있는 라이브러리 판 알리기
  extract  jobs의 그림을 꺼내 WebP로 쓰기
  show     한 쪽을 좌표 격자와 그림 번호를 그려 PNG로 저장(구역이 region·image 값을 고를 때 보는 미리 보기, .cache/ 아래)

쓰는 라이브러리: PyMuPDF(pymupdf), Pillow, numpy. OpenCV는 쓰지 않는다.
"""

from __future__ import annotations

import hashlib
import html
import io
import json
import math
import os
import re
import sys
import traceback
import unicodedata
import zipfile
from xml.etree import ElementTree

import numpy as np
import pymupdf
from PIL import Image, ImageDraw

# 표준 출력은 UTF-8 JSON 한 덩어리뿐이다. 경고는 결과 JSON의 warnings에 담는다.
sys.stdout.reconfigure(encoding="utf-8")
pymupdf.TOOLS.mupdf_display_errors(False)

# 권리 표기로 보는 XMP 칸(제작자·권리 문구·웹 주소·크레디트·제목). 경로가 든 칸(stRef:filePath 등)은 넣지 않는다.
RIGHTS_TAGS = {
    "creator": "dc:creator",
    "rights": "dc:rights",
    "title": "dc:title",
    "web": "xmpRights:WebStatement",
    "credit": "photoshop:Credit",
    "source": "photoshop:Source",
    "copyright": "Iptc4xmpCore:CopyrightNotice",
}
# 출판사가 조판할 때 넣은 삽화·컷의 이름표(예: 인피컴_고1-1-1-01(삽), 인피컴_고1-1-04(컷)) — 운영자 할 일 13번
PUBLISHER_TITLE = re.compile(r"\((?:삽|컷)\)")

_DOCS: dict[str, pymupdf.Document] = {}
_RIGHTS_CACHE: dict[tuple[str, int], list[dict]] = {}


def open_doc(path: str) -> pymupdf.Document:
    doc = _DOCS.get(path)
    if doc is None:
        doc = pymupdf.open(path)
        _DOCS[path] = doc
    return doc


# ─────────────────────────────── XMP 권리 표기 ───────────────────────────────


def _xmp_values(raw: str, tag: str) -> list[str]:
    values: list[str] = []
    for match in re.finditer(r"<%s\b[^>]*>(.*?)</%s>" % (re.escape(tag), re.escape(tag)), raw, re.S):
        inner = match.group(1)
        items = re.findall(r"<rdf:li\b[^>]*>(.*?)</rdf:li>", inner, re.S)
        values.extend(items if items else [inner])
    for match in re.finditer(r"\b%s=\"([^\"]*)\"" % re.escape(tag), raw):
        values.append(match.group(1))
    cleaned = []
    for value in values:
        # macOS에서 만든 그림은 한글 이름표가 풀어쓴 자모(NFD)로 들어 있기도 하다 → 모아쓴 글자(NFC)로 맞춘다.
        text = unicodedata.normalize("NFC", html.unescape(re.sub(r"<[^>]+>", "", value))).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def xmp_rights(doc: pymupdf.Document, owner_xref: int) -> dict | None:
    """owner_xref(그림 XObject나 표시 내용 속성 사전)의 /Metadata에서 권리 표기 칸만 읽는다."""
    try:
        kind, value = doc.xref_get_key(owner_xref, "Metadata")
    except Exception:
        return None
    if kind != "xref":
        return None
    try:
        raw = doc.xref_stream(int(value.split()[0])).decode("utf-8", "replace")
    except Exception:
        return None
    info = {}
    for key, tag in RIGHTS_TAGS.items():
        values = _xmp_values(raw, tag)
        if values:
            info[key] = " / ".join(values)[:600]
    return info or None


def is_interesting(info: dict | None) -> bool:
    if not info:
        return False
    if any(info.get(key) for key in ("creator", "rights", "web", "credit", "copyright")):
        return True
    return bool(PUBLISHER_TITLE.search(info.get("title", "")))


# ─────────────────────────── 쪽 내용 흐름(content stream) ───────────────────────────

_DELIMS = b"()<>[]{}/%"
_WS = b" \t\r\n\x0c\x00"


def tokenize(data: bytes):
    """PDF 쪽 내용 흐름을 (종류, 값, 시작, 끝)으로 나눈다. 글자열·16진 글자열·사전·인라인 그림은 건너뛴다."""
    i = 0
    n = len(data)
    while i < n:
        c = data[i]
        if c in _WS:
            i += 1
            continue
        if c == 0x25:  # % 주석
            j = data.find(b"\n", i)
            i = n if j < 0 else j + 1
            continue
        if c == 0x28:  # ( 글자열 )
            depth = 1
            j = i + 1
            while j < n and depth:
                if data[j] == 0x5C:
                    j += 2
                    continue
                if data[j] == 0x28:
                    depth += 1
                elif data[j] == 0x29:
                    depth -= 1
                j += 1
            yield ("string", None, i, j)
            i = j
            continue
        if c == 0x3C:  # < 16진 > 또는 << 사전 >>
            if i + 1 < n and data[i + 1] == 0x3C:
                depth = 0
                j = i
                while j < n:
                    if data.startswith(b"<<", j):
                        depth += 1
                        j += 2
                        continue
                    if data.startswith(b">>", j):
                        depth -= 1
                        j += 2
                        if depth == 0:
                            break
                        continue
                    if data[j] == 0x28:  # 사전 안 글자열
                        d2 = 1
                        j += 1
                        while j < n and d2:
                            if data[j] == 0x5C:
                                j += 2
                                continue
                            if data[j] == 0x28:
                                d2 += 1
                            elif data[j] == 0x29:
                                d2 -= 1
                            j += 1
                        continue
                    j += 1
                yield ("dict", None, i, j)
                i = j
                continue
            j = data.find(b">", i)
            j = n if j < 0 else j + 1
            yield ("string", None, i, j)
            i = j
            continue
        if c == 0x2F:  # /이름
            j = i + 1
            while j < n and data[j] not in _WS and data[j] not in _DELIMS:
                j += 1
            yield ("name", data[i + 1 : j], i, j)
            i = j
            continue
        if c in b"[]{}>)":
            i += 1
            continue
        j = i
        while j < n and data[j] not in _WS and data[j] not in _DELIMS:
            j += 1
        word = data[i:j]
        if word == b"BI":  # 인라인 그림: ID 뒤 이진 자료를 EI까지 건너뛴다
            k = data.find(b"ID", j)
            e = data.find(b"EI", k + 2 if k >= 0 else j)
            while e >= 0 and not (e + 2 >= n or data[e + 2] in _WS):
                e = data.find(b"EI", e + 2)
            end = n if e < 0 else e + 2
            yield ("op", b"BI..EI", i, end)
            i = end
            continue
        kind = "number" if re.fullmatch(rb"[+\-]?(?:\d+\.?\d*|\.\d+)", word or b"x") else "op"
        yield (kind, word, i, j)
        i = j if j > i else i + 1


_PAINT_OPS = {
    b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*", b"S", b"s", b"Do", b"sh", b"Tj", b"TJ", b"'", b'"', b"BI..EI",
}


def marked_blocks(data: bytes) -> list[dict]:
    """표시 내용 구간(BDC/BMC … EMC)의 목록. 구간마다 시작·끝·태그·속성 이름·부모·그리기 연산자 여부."""
    blocks: list[dict] = []
    stack: list[int] = []
    operands: list[tuple] = []
    for kind, value, start, end in tokenize(data):
        if kind in ("name", "dict", "string", "number"):
            operands.append((kind, value, start))
            continue
        if value in (b"BDC", b"BMC"):
            tag = operands[0][1] if operands and operands[0][0] == "name" else None
            prop = operands[1][1] if len(operands) > 1 and operands[1][0] == "name" else None
            first = operands[0][2] if operands else start
            blocks.append({"start": first, "end": None, "tag": tag, "prop": prop, "parent": stack[-1] if stack else None, "paint": False})
            stack.append(len(blocks) - 1)
        elif value == b"EMC":
            if stack:
                blocks[stack.pop()]["end"] = end
        elif value in _PAINT_OPS:
            for index in stack:
                blocks[index]["paint"] = True
        operands = []
    # 닫히지 않은 구간(end가 None)도 그대로 둔다 — parent 번호가 이 목록의 자리를 가리키기 때문이다.
    return blocks


_PATH_PAINT = {b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*", b"S", b"s"}
_BLANK_WITH_OPERANDS = {b"Do", b"sh", b"Tj", b"TJ", b"'", b'"', b"BI..EI"}


def neutralize(data: bytes, spans: list[tuple[int, int]]) -> bytes:
    """spans 안의 '그리기'만 없앤다. 선 채우기·긋기는 n(그리지 않고 경로 끝내기)으로, 그림·글자 그리기는 피연산자째 빈칸으로 바꾼다.
    q/Q·cm·W 같은 상태 연산자는 그대로 두어야 뒤에 그리는 것의 좌표·자르기가 흐트러지지 않는다(바이트 길이도 그대로)."""
    out = bytearray(data)
    for start, end in spans:
        previous_end = start
        for kind, value, s, e in tokenize(data[start:end]):
            s += start
            e += start
            if kind != "op":
                continue
            if value in _PATH_PAINT:
                out[s:e] = b"n" + b" " * (e - s - 1)
            elif value in _BLANK_WITH_OPERANDS:
                begin = s if value == b"BI..EI" else previous_end
                out[begin:e] = b" " * (e - begin)
            previous_end = e
    return bytes(out)


def diff_bbox(doc: pymupdf.Document, pno: int, spans: list[tuple[int, int]], dpi: int = 40) -> list[float] | None:
    """spans(내용 흐름 바이트 구간)의 그리기를 없앤 쪽과 원래 쪽을 그려 비교해, 바뀐 픽셀의 테두리(pt)를 돌려준다."""
    tmp = pymupdf.open()
    tmp.insert_pdf(doc, from_page=pno - 1, to_page=pno - 1)
    page = tmp[0]
    page.clean_contents(sanitize=False)
    xref = page.get_contents()[0]
    data = tmp.xref_stream(xref)
    before = page.get_pixmap(dpi=dpi, alpha=False)
    tmp.update_stream(xref, neutralize(data, spans))
    after = tmp[0].get_pixmap(dpi=dpi, alpha=False)
    a = np.frombuffer(before.samples, dtype=np.uint8).reshape(before.h, before.w, before.n).astype(np.int16)
    b = np.frombuffer(after.samples, dtype=np.uint8).reshape(after.h, after.w, after.n).astype(np.int16)
    changed = np.abs(a - b).max(axis=2) > 8
    ys, xs = np.nonzero(changed)
    tmp.close()
    if len(xs) == 0:
        return None
    s = 72.0 / dpi
    return [float(xs.min() * s), float(ys.min() * s), float((xs.max() + 1) * s), float((ys.max() + 1) * s)]


def page_rights(doc: pymupdf.Document, path: str, pno: int) -> list[dict]:
    """쪽에 있는 '권리 표기가 붙은 그림'의 목록(자리 pt, 제작자·권리 문구·제목). 한 번 구하면 기억해 둔다."""
    key = (path, pno)
    if key in _RIGHTS_CACHE:
        return _RIGHTS_CACHE[key]
    page = doc[pno - 1]
    found: list[dict] = []
    # ① 그림 XObject에 붙은 XMP — 자리는 그림이 놓인 테두리
    seen = set()
    for info in page.get_image_info(xrefs=True):
        xref = info.get("xref") or 0
        if not xref:
            continue
        rights = xmp_rights(doc, xref) if xref not in seen else None
        seen.add(xref)
        if is_interesting(rights):
            found.append({"kind": "image", "id": f"image {xref}", "bbox": [float(v) for v in info["bbox"]], "info": rights})
    # ② InDesign이 놓은 그래픽(표시 내용 속성 /MCn → /Metadata) — 자리는 그 구간을 지우고 다시 그려 비교해 찾는다
    try:
        kind, props = doc.xref_get_key(page.xref, "Resources/Properties")
    except Exception:
        kind, props = "null", ""
    candidates = []
    if kind == "dict":
        for name, ref in re.findall(r"/([^\s/<>\[\]()]+)\s*(\d+) 0 R", props):
            rights = xmp_rights(doc, int(ref))
            if is_interesting(rights):
                candidates.append((name.encode("latin-1", "replace"), rights))
    if candidates:
        tmp = pymupdf.open()
        tmp.insert_pdf(doc, from_page=pno - 1, to_page=pno - 1)
        tmp[0].clean_contents(sanitize=False)
        data = tmp.xref_stream(tmp[0].get_contents()[0])
        tmp.close()
        blocks = marked_blocks(data)
        for name, rights in candidates:
            spans = []
            for block in blocks:
                if block["prop"] != name:
                    continue
                target = block
                # InDesign은 /PlacedGraphic /MCn BDC EMC처럼 빈 표시만 남기고 그림은 바깥 /Figure 구간에 그리기도 한다(원고 010쪽).
                if not block["paint"] and block["parent"] is not None:
                    target = blocks[block["parent"]]
                if target["end"] is not None:
                    spans.append((target["start"], target["end"]))
            bbox = diff_bbox(doc, pno, merge_spans(spans)) if spans else None
            if bbox:
                found.append({"kind": "placed", "id": f"placed {name.decode('latin-1')}", "bbox": bbox, "info": rights})
    _RIGHTS_CACHE[key] = found
    return found


def merge_spans(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    merged: list[list[int]] = []
    for start, end in sorted(spans):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(a, b) for a, b in merged]


def overlap(a: list[float], b: list[float]) -> tuple[float, float]:
    """(겹친 넓이 / a 넓이, 겹친 넓이 / b 넓이)"""
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    area_a = max(1e-6, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))
    return inter / area_a, inter / area_b


# ─────────────────────────────── 그림 만들기 ───────────────────────────────


def half_rect(page: pymupdf.Page, side: str) -> pymupdf.Rect:
    """펼침면(교과서 두 쪽)에서 왼쪽·오른쪽 쪽의 자리. full이면 PDF 쪽 전체."""
    r = page.rect
    if side == "left":
        return pymupdf.Rect(r.x0, r.y0, r.x0 + r.width / 2, r.y1)
    if side == "right":
        return pymupdf.Rect(r.x0 + r.width / 2, r.y0, r.x1, r.y1)
    return pymupdf.Rect(r)


def pixmap_to_image(pix: pymupdf.Pixmap) -> Image.Image:
    """PyMuPDF Pixmap → 새 Pillow 그림(픽셀만). info가 비어 있어 메타데이터가 따라가지 않는다."""
    if pix.colorspace is not None and pix.colorspace.n not in (1, 3):
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    channels = pix.n - pix.alpha
    samples = bytes(pix.samples)
    if pix.stride != pix.width * pix.n:
        rows = [samples[r * pix.stride : r * pix.stride + pix.width * pix.n] for r in range(pix.height)]
        samples = b"".join(rows)
    if channels == 1:
        mode = "LA" if pix.alpha else "L"
    else:
        mode = "RGBA" if pix.alpha else "RGB"
    image = Image.frombytes(mode, (pix.width, pix.height), samples)
    return image.convert("RGBA" if pix.alpha else "RGB")


def render_region(page: pymupdf.Page, rect: pymupdf.Rect, dpi: int) -> Image.Image:
    pix = page.get_pixmap(clip=rect, dpi=dpi, alpha=False, colorspace=pymupdf.csRGB, annots=False)
    return pixmap_to_image(pix)


def xref_image(doc: pymupdf.Document, xref: int) -> Image.Image:
    pix = pymupdf.Pixmap(doc, xref)
    smask = 0
    try:
        smask = doc.extract_image(xref).get("smask", 0) or 0
    except Exception:
        smask = 0
    if smask:
        try:
            mask = pymupdf.Pixmap(doc, smask)
            if pix.alpha:
                pix = pymupdf.Pixmap(pix, 0)
            pix = pymupdf.Pixmap(pix, mask)
        except Exception:
            pass
    return pixmap_to_image(pix)


def visibility_check(page: pymupdf.Page, image: Image.Image, bbox: pymupdf.Rect) -> dict:
    """xref로 꺼낸 원본 그림이 쪽에 보이는 모습과 다른지(가려지거나 잘린 부분, 겹친 그림) 대략 본다. 경고용."""
    w, h = image.size
    if bbox.width <= 0 or bbox.height <= 0 or w < 4 or h < 4:
        return {"checked": False}
    scale_x = w / bbox.width
    scale_y = h / bbox.height
    pix = page.get_pixmap(clip=bbox, matrix=pymupdf.Matrix(scale_x, scale_y), alpha=False, colorspace=pymupdf.csRGB)
    shown = pixmap_to_image(pix).convert("L").resize((min(w, 400), max(1, round(h * min(w, 400) / w))))
    base = image
    if base.mode == "RGBA":
        white = Image.new("RGBA", base.size, (255, 255, 255, 255))
        base = Image.alpha_composite(white, base)
    raw = base.convert("L").resize(shown.size)
    a = np.asarray(shown, dtype=np.int16)
    b = np.asarray(raw, dtype=np.int16)
    differ = float((np.abs(a - b) > 48).mean())
    return {"checked": True, "differ": round(differ, 4), "hidden_risk": differ > 0.05}


def face_probe(image: Image.Image, path: str) -> dict:
    """얼굴 검사용 흑백 원시 파일(너비×높이 바이트)을 쓴다. 긴 변 1600px 이하로 줄이고, 짧은 변 240px 미만이면 두 배로 키운다."""
    gray = image.convert("L")
    w, h = gray.size
    factor = 1.0
    if max(w, h) > 1600:
        factor = 1600 / max(w, h)
    elif min(w, h) < 240:
        factor = 2.0
    if factor != 1.0:
        gray = gray.resize((max(1, round(w * factor)), max(1, round(h * factor))), Image.LANCZOS)
    with open(path, "wb") as handle:
        handle.write(gray.tobytes())
    return {"path": path, "width": gray.size[0], "height": gray.size[1], "scale": gray.size[0] / w}


def save_webp(image: Image.Image, out: str, quality: int, lossless: bool) -> dict:
    fresh = Image.frombytes(image.mode, image.size, image.tobytes())  # info 없는 새 그림
    os.makedirs(os.path.dirname(out), exist_ok=True)
    buffer = io.BytesIO()
    fresh.save(buffer, "WEBP", quality=int(quality), method=6, lossless=bool(lossless), exact=False)
    data = buffer.getvalue()
    check = Image.open(io.BytesIO(data))
    leaked = sorted(k for k in check.info if k in ("exif", "xmp", "icc_profile", "XML:com.adobe.xmp"))
    if leaked:
        raise RuntimeError(f"다시 인코딩한 그림에 메타데이터가 남았어요: {leaked}")
    with open(out, "wb") as handle:
        handle.write(data)
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "width": fresh.size[0], "height": fresh.size[1]}


# ─────────────────────────────── PPTX ───────────────────────────────

_NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _rels(zf: zipfile.ZipFile, part: str) -> dict[str, str]:
    folder, name = part.rsplit("/", 1)
    rels_path = f"{folder}/_rels/{name}.rels"
    if rels_path not in zf.namelist():
        return {}
    root = ElementTree.fromstring(zf.read(rels_path))
    out = {}
    for rel in root.findall("rel:Relationship", _NS):
        target = rel.get("Target", "")
        parts = (folder + "/" + target).split("/")
        resolved: list[str] = []
        for piece in parts:
            if piece == "..":
                if resolved:
                    resolved.pop()
            elif piece and piece != ".":
                resolved.append(piece)
        out[rel.get("Id")] = "/".join(resolved)
    return out


def pptx_slide_pictures(path: str, slide_no: int) -> list[tuple[str, bytes]]:
    """발표 순서로 slide_no번째 슬라이드의 그림들(놓인 순서) → [(미디어 이름, 바이트)]."""
    with zipfile.ZipFile(path) as zf:
        pres = ElementTree.fromstring(zf.read("ppt/presentation.xml"))
        rels = _rels(zf, "ppt/presentation.xml")
        ids = [el.get("{%s}id" % _NS["r"]) for el in pres.findall("p:sldIdLst/p:sldId", _NS)]
        if slide_no < 1 or slide_no > len(ids):
            raise ValueError(f"슬라이드 {slide_no}번이 없어요(모두 {len(ids)}장).")
        slide_part = rels[ids[slide_no - 1]]
        slide = ElementTree.fromstring(zf.read(slide_part))
        slide_rels = _rels(zf, slide_part)
        pictures = []
        for blip in slide.iter("{%s}blip" % _NS["a"]):
            rid = blip.get("{%s}embed" % _NS["r"])
            target = slide_rels.get(rid)
            if target and target in zf.namelist():
                pictures.append((target.rsplit("/", 1)[-1], zf.read(target)))
        return pictures


# ─────────────────────────────── 명령 ───────────────────────────────


def cmd_probe(_request: dict) -> dict:
    import PIL
    from PIL import features

    return {
        "ok": True,
        "python": sys.version.split()[0],
        "pymupdf": pymupdf.VersionBind,
        "pillow": PIL.__version__,
        "numpy": np.__version__,
        "webp": bool(features.check("webp")),
    }


def extract_one(job: dict) -> dict:
    result: dict = {"id": job["id"], "ok": False, "warnings": []}
    crop = job.get("crop")
    if job["kind"] == "pdf":
        doc = open_doc(job["file"])
        pno = int(job["pdf_page"])
        if pno < 1 or pno > len(doc):
            raise ValueError(f"PDF에 {pno}번째 쪽이 없어요(모두 {len(doc)}쪽).")
        page = doc[pno - 1]
        half = half_rect(page, job.get("side", "full"))
        area = None
        if job.get("region") is not None:
            rx0, ry0, rx1, ry1 = job["region"]
            if rx1 > half.width + 0.5 or ry1 > half.height + 0.5:
                raise ValueError(f"region {job['region']}이(가) 쪽 크기 {half.width:.1f}×{half.height:.1f}pt 밖으로 나가요.")
            area = pymupdf.Rect(half.x0 + rx0, half.y0 + ry0, half.x0 + rx1, half.y0 + ry1)
            image = render_region(page, area, int(job.get("dpi") or 220))
        else:
            xref = int(job["xref"])
            placements = [pymupdf.Rect(info["bbox"]) for info in page.get_image_info(xrefs=True) if info.get("xref") == xref]
            result["placements"] = [[round(r.x0 - half.x0, 1), round(r.y0 - half.y0, 1), round(r.x1 - half.x0, 1), round(r.y1 - half.y0, 1)] for r in placements]
            result["placement_abs"] = [[r.x0, r.y0, r.x1, r.y1] for r in placements]
            if not placements:
                raise ValueError(f"PDF {pno}쪽(인쇄 쪽 {job.get('printed', '?')})에 그림 번호 {xref}이(가) 놓여 있지 않아요. --show로 번호를 확인해요.")
            image = xref_image(doc, xref)
            area = placements[0]
            for rect in placements[1:]:
                area |= rect
            result["visibility"] = visibility_check(page, image, placements[0])
        if job.get("rights_scan", True):
            hits = []
            for item in page_rights(doc, job["file"], pno):
                of_item, of_area = overlap(item["bbox"], [area.x0, area.y0, area.x1, area.y1])
                if of_item >= 0.2 or of_area >= 0.2:
                    hits.append({
                        "id": item["id"],
                        "bbox": [round(item["bbox"][0] - half.x0, 1), round(item["bbox"][1] - half.y0, 1), round(item["bbox"][2] - half.x0, 1), round(item["bbox"][3] - half.y0, 1)],
                        "overlap_item": round(of_item, 3),
                        "overlap_area": round(of_area, 3),
                        "info": item["info"],
                        "publisher": bool(PUBLISHER_TITLE.search(item["info"].get("title", ""))),
                    })
            result["rights"] = hits
    elif job["kind"] == "pptx":
        pictures = pptx_slide_pictures(job["file"], int(job["slide"]))
        index = int(job["picture"])
        if index < 1 or index > len(pictures):
            raise ValueError(f"슬라이드 {job['slide']}에 {index}번째 그림이 없어요(모두 {len(pictures)}개).")
        name, data = pictures[index - 1]
        with Image.open(io.BytesIO(data)) as opened:
            opened.load()
            mode = "RGBA" if (opened.mode in ("RGBA", "LA", "PA") or (opened.mode == "P" and "transparency" in opened.info)) else "RGB"
            image = opened.convert(mode)
        image = Image.frombytes(image.mode, image.size, image.tobytes())
        result["media"] = name
        result["rights"] = []
    else:
        raise ValueError(f"모르는 원본 종류: {job['kind']}")

    result["source_size"] = list(image.size)
    if crop is not None:
        x0, y0, x1, y1 = [int(round(v)) for v in crop]
        if not (0 <= x0 < x1 <= image.size[0] and 0 <= y0 < y1 <= image.size[1]):
            raise ValueError(f"crop {crop}가 꺼낸 그림 크기 {image.size[0]}×{image.size[1]}px 밖으로 나가요.")
        image = image.crop((x0, y0, x1, y1))
    result["face_probe"] = face_probe(image, job["face_raw"])
    max_width = int(job.get("max_width") or 960)
    if image.size[0] > max_width:
        height = max(1, round(image.size[1] * max_width / image.size[0]))
        image = image.resize((max_width, height), Image.LANCZOS)
    if image.mode == "RGBA" and image.getextrema()[3][0] == 255:
        image = image.convert("RGB")  # 모두 불투명하면 알파를 뺀다
    result.update(save_webp(image, job["out"], job.get("quality") or 85, job.get("lossless", False)))
    result["mode"] = image.mode
    result["ok"] = True
    return result


def cmd_extract(request: dict) -> dict:
    results = []
    for job in request.get("jobs", []):
        try:
            results.append(extract_one(job))
        except Exception as error:  # 한 그림이 실패해도 나머지는 계속한다
            results.append({"id": job.get("id"), "ok": False, "error": f"{type(error).__name__}: {error}", "trace": traceback.format_exc(limit=3)})
    return {"ok": True, "results": results}


def cmd_show(request: dict) -> dict:
    kind = request["kind"]
    out = request["out"]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if kind == "pptx":
        pictures = pptx_slide_pictures(request["file"], int(request["slide"]))
        thumbs = []
        listing = []
        for index, (name, data) in enumerate(pictures, start=1):
            with Image.open(io.BytesIO(data)) as opened:
                opened.load()
                listing.append({"picture": index, "media": name, "width": opened.size[0], "height": opened.size[1]})
                thumb = opened.convert("RGB")
                thumb.thumbnail((360, 360))
                thumbs.append((index, thumb))
        sheet = Image.new("RGB", (max(1, len(thumbs)) * 380, 400), "white")
        draw = ImageDraw.Draw(sheet)
        for position, (index, thumb) in enumerate(thumbs):
            sheet.paste(thumb, (position * 380 + 10, 30))
            draw.text((position * 380 + 10, 8), f"picture {index}", fill=(200, 0, 0))
        sheet.save(out, "PNG")
        return {"ok": True, "out": out, "pictures": listing}

    doc = open_doc(request["file"])
    pno = int(request["pdf_page"])
    page = doc[pno - 1]
    half = half_rect(page, request.get("side", "full"))
    dpi = int(request.get("dpi") or 110)
    image = render_region(page, half, dpi).convert("RGB")
    scale = dpi / 72.0
    draw = ImageDraw.Draw(image)
    step = 50
    for x in range(0, int(half.width) + 1, step):
        px = round(x * scale)
        draw.line([(px, 0), (px, image.size[1])], fill=(0, 170, 255) if x % 100 == 0 else (170, 220, 255), width=1)
        draw.text((px + 2, 2), str(x), fill=(0, 90, 200))
    for y in range(0, int(half.height) + 1, step):
        py = round(y * scale)
        draw.line([(0, py), (image.size[0], py)], fill=(0, 170, 255) if y % 100 == 0 else (170, 220, 255), width=1)
        draw.text((2, py + 2), str(y), fill=(0, 90, 200))
    listing = []
    seen = set()
    small = 0
    for info in page.get_image_info(xrefs=True):
        rect = pymupdf.Rect(info["bbox"]) & half
        xref = info.get("xref") or 0
        # 벡터 그림을 이루는 작은 조각(인라인 그림, 넓이 1,500pt² 미만)은 표에 넣지 않는다 — 그런 그림은 region으로 꺼낸다.
        if rect.is_empty or not xref or rect.width * rect.height < 1500:
            small += 0 if rect.is_empty else 1
            continue
        key = (xref, round(rect.x0), round(rect.y0))
        if key in seen:
            continue
        seen.add(key)
        rel = [round(rect.x0 - half.x0, 1), round(rect.y0 - half.y0, 1), round(rect.x1 - half.x0, 1), round(rect.y1 - half.y0, 1)]
        shown = visibility_check(page, xref_image(doc, xref), pymupdf.Rect(info["bbox"]))
        listing.append({"image": xref, "bbox": rel, "pixels": [info.get("width"), info.get("height")], "hidden_risk": bool(shown.get("hidden_risk"))})
        box = [round(v * scale) for v in rel]
        colour = (150, 150, 150) if shown.get("hidden_risk") else (230, 60, 0)
        draw.rectangle(box, outline=colour, width=2)
        draw.text((box[0] + 3, box[1] + 3), f"image {xref}" + (" (hidden?)" if shown.get("hidden_risk") else ""), fill=colour)
    rights = []
    for item in page_rights(doc, request["file"], pno):
        rect = pymupdf.Rect(item["bbox"]) & half
        if rect.is_empty:
            continue
        rel = [round(rect.x0 - half.x0, 1), round(rect.y0 - half.y0, 1), round(rect.x1 - half.x0, 1), round(rect.y1 - half.y0, 1)]
        rights.append({"id": item["id"], "bbox": rel, "info": item["info"], "publisher": bool(PUBLISHER_TITLE.search(item["info"].get("title", "")))})
        box = [round(v * scale) for v in rel]
        draw.rectangle(box, outline=(160, 0, 160), width=3)
        draw.text((box[0] + 3, box[3] - 14), "rights", fill=(160, 0, 160))
    image.save(out, "PNG")
    return {"ok": True, "out": out, "size_pt": [round(half.width, 1), round(half.height, 1)], "images": listing, "small_pieces": small, "rights": rights}


def cmd_probe_files(request: dict) -> dict:
    """원본에서 꺼내지 않은 그림(origin)을 고치지 않고 열어, 얼굴 검사용 흑백 원시 파일과 크기만 돌려준다."""
    results = []
    for job in request.get("jobs", []):
        try:
            with Image.open(job["file"]) as opened:
                opened.load()
                image = opened.convert("RGB")
            results.append({"id": job["id"], "ok": True, "width": image.size[0], "height": image.size[1], "rights": [], "face_probe": face_probe(image, job["face_raw"])})
        except Exception as error:
            results.append({"id": job.get("id"), "ok": False, "error": f"{type(error).__name__}: {error}"})
    return {"ok": True, "results": results}


COMMANDS = {"probe": cmd_probe, "extract": cmd_extract, "show": cmd_show, "probe-files": cmd_probe_files}


def main() -> int:
    try:
        request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        handler = COMMANDS.get(request.get("cmd"))
        if handler is None:
            raise ValueError(f"모르는 명령: {request.get('cmd')}")
        response = handler(request)
    except Exception as error:
        response = {"ok": False, "error": f"{type(error).__name__}: {error}", "trace": traceback.format_exc(limit=5)}
    sys.stdout.write(json.dumps(response, ensure_ascii=False))
    sys.stdout.flush()
    return 0 if response.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
