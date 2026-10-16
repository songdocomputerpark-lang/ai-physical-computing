#!/usr/bin/env python
"""키트 장치 도감의 회로 그림 100장 가져오기 (판 1.5.0, 구역 K1, DECISIONS O19).

  python scripts/kit/import-circuit-images.py [--src .cache/v150-staging/circuits] [--kit .cache/v150/kit.json] [--out public/images/kit/circuits/third-party/kit-vendor]

브릭셀(고릴라셀) Thonny ESP32 쪽의 회로 그림(circuits_imags/circuit_<장>_<번호>_<이름>.webp)을 받아 둔 폴더(--src)에서 읽어
Pillow로 **다시 인코딩**해 장치 id 이름(d-3-11.webp)으로 저장한다.
  - 긴 변이 1600px보다 크면 줄인다(LANCZOS), 작으면 그대로. WebP 품질 80(method 6).
  - 새 이미지에 픽셀만 붙여 넣어 저장하므로 EXIF·XMP·ICC 같은 메타데이터가 따라오지 않는다.
  - 8.06은 8.05와 같은 그림이라 파일이 따로 없다(devices.yaml이 d-8-05.webp를 가리킨다).
저장소 검사(`npm run check:repo`)는 그림마다 눈 확인 기록을 요구해요 → 접촉 시트로 한 장씩 확인한 뒤 scripts/kit/allowlist-circuits.mjs 로 기록해요.
결과 목록은 --report (기본 .cache/v150-staging/circuits-out.json)에 적어요.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MAX_EDGE = 1600
QUALITY = 80


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", default=str(ROOT / ".cache" / "v150-staging" / "circuits"))
    parser.add_argument("--kit", default=str(ROOT / ".cache" / "v150" / "kit.json"))
    parser.add_argument("--out", default=str(ROOT / "public" / "images" / "kit" / "circuits" / "third-party" / "kit-vendor"))
    parser.add_argument("--report", default=str(ROOT / ".cache" / "v150-staging" / "circuits-out.json"))
    args = parser.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    kit = json.loads(Path(args.kit).read_text(encoding="utf-8"))

    done: dict[str, str] = {}
    report = []
    problems = []
    for device in kit["devices"]:
        file = device["circuit"]["file"]
        if file in done:
            continue  # 같은 그림을 쓰는 장치(8.06)는 먼저 나온 장치(8.05)의 파일을 가리킨다
        done[file] = device["id"]
        source = src / file
        if not source.exists():
            problems.append(f"{device['id']}: {source} 파일이 없어요.")
            continue
        with Image.open(source) as image:
            fmt = image.format
            meta = sorted(key for key in image.info.keys() if key in ("exif", "icc_profile", "xmp", "XML:com.adobe.xmp"))
            if fmt != "WEBP":
                problems.append(f"{device['id']}: WebP가 아니에요({fmt}).")
            width, height = image.size
            mode = image.mode
            frames = getattr(image, "n_frames", 1)
            if frames != 1:
                problems.append(f"{device['id']}: 움직이는 그림이에요(프레임 {frames}).")
            rgb = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            scale = min(1.0, MAX_EDGE / max(width, height))
            if scale < 1.0:
                rgb = rgb.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.LANCZOS)
            clean = Image.new(rgb.mode, rgb.size)
            clean.paste(rgb)  # 픽셀만 — 메타데이터가 따라오지 않는다
            target = out / f"{device['id']}.webp"
            clean.save(target, "WEBP", quality=QUALITY, method=6)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        report.append(
            {
                "id": device["id"],
                "name": device["name"],
                "number": device["number"],
                "from": file,
                "path": target.relative_to(ROOT).as_posix(),
                "sha256": digest,
                "bytes": target.stat().st_size,
                "orig_size": [width, height],
                "orig_mode": mode,
                "orig_metadata": meta,
                "size": list(clean.size),
            }
        )
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    total = sum(item["bytes"] for item in report)
    print(f"회로 그림 {len(report)}장 → {out} ({total / 1024:.0f}KB)")
    withmeta = [item for item in report if item["orig_metadata"]]
    print(f"원본에 메타데이터가 있던 그림 {len(withmeta)}장(다시 인코딩해서 모두 제거됨)")
    for line in problems:
        print("확인 필요:", line, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
