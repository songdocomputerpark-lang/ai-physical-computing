#!/usr/bin/env python
"""브릭셀(고릴라셀) Thonny ESP32 예제 쪽 HTML에서 장치 카드·코드를 뽑아 JSON으로 저장한다 (판 1.5.0 키트 장치 도감, 구역 K1).

개발 도구예요 — 운영자 PC에서 한 번 돌리고 결과(.cache/v150/kit.json)를 scripts/kit/generate-kit.mjs가 읽어요. 배포물에는 들어가지 않아요.

  python scripts/kit/extract-brixel.py [--html <esp32.html>] [--out <kit.json>]

기본값
  --html  .cache/v150/src/esp32.html   (https://brixel.gorillacell.kr/07_thonny/03_esp32/ 를 받아 둔 파일)
  --out   .cache/v150/kit.json

뽑는 것
  - 장치 카드 101개(div.block-card#d-<장>-<번호>): 번호·이름·영문 이름·설명·기본 정보(Interface·Pins·GPIO·Part ID·Library)·배선 줄·
    사진 파일·변형 사진·회로 그림 주소·1단계/2단계(제목·요점·코드 라벨·코드)·내려받기 링크
  - 1장 시작하기 소절의 코드 12개(div.code-block) — 소절 번호·제목·앞 설명
코드 글은 브라우저 innerText와 같아요(HTML 엔티티를 풀고 줄바꿈·들여쓰기·공백을 그대로 둠). 앞뒤 빈 줄만 없애요.

필요: Python 3 + beautifulsoup4.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
SOURCE_URL = "https://brixel.gorillacell.kr/07_thonny/03_esp32/"
BASE_URL = SOURCE_URL


def text(node) -> str:
    """보이는 글자 — 안쪽 줄바꿈·연속 공백을 한 칸으로."""
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node is not None else ""


def code_text(node) -> str:
    """코드 칸의 글 — HTML 엔티티는 파서가 풀었고, 앞뒤 빈 줄만 없앤다."""
    raw = node.get_text()
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    raw = re.sub(r"\A(?:[ \t]*\n)+", "", raw)
    raw = re.sub(r"(?:\n[ \t]*)+\Z", "", raw)
    return raw.rstrip(" \t")


def file_of(src: str | None) -> str | None:
    if not src:
        return None
    return unquote(src.split("?", 1)[0].rsplit("/", 1)[-1])


def absolute(href: str | None) -> str | None:
    if not href:
        return None
    if href.startswith("http"):
        return href
    # ../../10_docs/... 같은 상대 주소 — 쪽 주소 기준으로 푼다
    parts = href.split("?", 1)[0]
    if parts.startswith("../../"):
        return "https://brixel.gorillacell.kr/" + parts[len("../../"):]
    return BASE_URL + parts


def parse_h4(title: str):
    """"3.11. 초음파 센서 (HC-SR04)" → ("3.11", "초음파 센서 (HC-SR04)"); "1.5.4 Hello World" → ("1.5.4", ...)"""
    m = re.match(r"^(\d+(?:\.\d+)+)\.?\s+(.*)$", title)
    if not m:
        raise ValueError(f"카드 제목을 읽지 못했어요: {title!r}")
    return m.group(1), m.group(2).strip()


def parse_step(box) -> dict:
    head = box.select_one(".step-head")
    badge = text(head.select_one(".step-badge")) if head else ""
    kind = text(head.select_one(".step-kind")) if head else ""
    full = text(head)
    title = full
    for part in (badge, kind):
        if part and title.startswith(part):
            title = title[len(part):].strip()
    n = int(re.sub(r"\D", "", badge) or "0")
    label = text(box.select_one(".code-label"))
    file_name = None
    m = re.search(r"—\s*(\S+\.py)\s*$", label)
    if m:
        file_name = m.group(1)
    code_node = box.select_one(".code-block")
    return {
        "n": n,
        "kind": kind,
        "title": title,
        "points": [text(li) for li in box.select(".step-points li")],
        "label": label,
        "label_file": file_name,
        "code": code_text(code_node) if code_node is not None else "",
    }


def parse_card(card, chapter_names: dict[int, str]) -> dict:
    cid = card.get("id")
    m = re.match(r"^d-(\d+)-(\d+)$", cid)
    chapter, seq = int(m.group(1)), int(m.group(2))
    number, name = parse_h4(text(card.find("h4")))
    params: dict[str, str] = {}
    for li in card.select(".params li"):
        strong = li.find("strong")
        key = text(strong).rstrip(":").strip()
        params[key] = text(li)[len(text(strong)):].strip()
    photo_img = card.select_one(".device-img img")
    variants = []
    for fig in card.select(".device-variants figure"):
        variants.append({"file": file_of(fig.find("img").get("src")), "label": text(fig.find("figcaption"))})
    circuit_img = card.select_one(".circuit-img img")
    downloads = {"listings": [], "libs": []}
    for a in card.select(".download-row a"):
        item = {"name": (a.get("title") or text(a)).strip(), "href": absolute(unquote(a.get("href") or ""))}
        (downloads["libs"] if "dl-lib" in (a.get("class") or []) else downloads["listings"]).append(item)
    steps = [parse_step(box) for box in card.select(".step-box")]
    tip = card.select_one(".tip-box")
    desc_p = None
    for child in card.find_all("p", recursive=False):
        desc_p = child
        break
    return {
        "id": cid,
        "number": number,
        "chapter": chapter,
        "chapter_name": chapter_names.get(chapter, ""),
        "seq": seq,
        "name": name,
        "name_en": (photo_img.get("alt") or "").strip() if photo_img is not None else "",
        "description": text(desc_p),
        "interface": params.get("Interface", ""),
        "pins": params.get("Pins", ""),
        "gpio": params.get("GPIO", ""),
        "part_id": params.get("Part ID", ""),
        "library": params.get("Library", ""),
        "photo": {"file": file_of(photo_img.get("src")) if photo_img is not None else None, "variants": variants},
        "wiring": [text(li) for li in card.select(".warn-box li")],
        "circuit": {
            "file": file_of(circuit_img.get("src")) if circuit_img is not None else None,
            "url": absolute(circuit_img.get("src").split("?", 1)[0]) if circuit_img is not None else None,
            "alt": (circuit_img.get("alt") or "").strip() if circuit_img is not None else "",
        },
        "steps": steps,
        "downloads": downloads,
        "tip": text(tip) if tip is not None else "",
    }


def parse_intro(section) -> list[dict]:
    items = []
    for card in section.select("div.block-card"):
        codes = card.select(".code-block")
        if not codes:
            continue
        number, title = parse_h4(text(card.find("h4")))
        lead = text(card.find("p"))
        for index, node in enumerate(codes, start=1):
            prev = node.find_previous_sibling()
            while prev is not None and prev.name == "div" and "code-label" not in (prev.get("class") or []) and not text(prev):
                prev = prev.find_previous_sibling()
            label = text(prev) if prev is not None and "code-block" not in (prev.get("class") or []) else ""
            items.append(
                {
                    "id": card.get("id"),
                    "number": number,
                    "title": title,
                    "index": index,
                    "of": len(codes),
                    "lead": lead,
                    "label": label,
                    "mp": node.get("data-mp"),
                    "mp_file": node.get("data-mp-file"),
                    "code": code_text(node),
                }
            )
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--html", default=str(ROOT / ".cache" / "v150" / "src" / "esp32.html"))
    parser.add_argument("--out", default=str(ROOT / ".cache" / "v150" / "kit.json"))
    args = parser.parse_args()

    html = Path(args.html).read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")

    chapter_names: dict[int, str] = {}
    for sec in soup.select("div.category-section"):
        heading = sec.find(["h2", "h3"])
        m = re.match(r"^Chapter\s+(\d+):\s*(.+)$", text(heading))
        if m:
            chapter_names[int(m.group(1))] = m.group(2).strip()

    devices = [parse_card(card, chapter_names) for card in soup.select('div.block-card[id^="d-"]')]
    intro_section = soup.select_one("#cat-ch1")
    intro = parse_intro(intro_section) if intro_section is not None else []

    problems = []
    if len(devices) != 101:
        problems.append(f"장치 카드가 {len(devices)}개예요(기대 101).")
    step_codes = sum(1 for d in devices for s in d["steps"] if s["code"])
    if step_codes != 202:
        problems.append(f"단계 코드가 {step_codes}개예요(기대 202).")
    if len(intro) != 12:
        problems.append(f"1장 코드가 {len(intro)}개예요(기대 12).")
    for d in devices:
        if len(d["steps"]) != 2:
            problems.append(f"{d['id']}: 단계가 {len(d['steps'])}개예요.")
        if not d["photo"]["file"]:
            problems.append(f"{d['id']}: 사진이 없어요.")
        if not d["circuit"]["file"]:
            problems.append(f"{d['id']}: 회로 그림이 없어요.")
    for line in problems:
        print("확인 필요:", line, file=sys.stderr)

    out = {
        "source": {"url": SOURCE_URL, "fetched": "2026-10-16"},
        "chapters": [{"n": n, "name": name} for n, name in sorted(chapter_names.items())],
        "devices": devices,
        "intro": intro,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"장치 {len(devices)}개, 단계 코드 {step_codes}개, 1장 코드 {len(intro)}개 → {out_path}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
