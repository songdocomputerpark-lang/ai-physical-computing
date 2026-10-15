"""출판본 교과서 PDF의 쪽별 글자 뽑기(같음 검사용 일꾼) — 개발 도구라 배포물에 들어가지 않는다.

scripts/check-book-fidelity.mjs가 JSON 한 덩어리({"file": PDF 경로, "pages": [쪽 번호…]})를 표준 입력으로 주면,
{"ok": true, "pages": {"124": {"lines": ["글 줄", …], "native": ["글 줄", …]}, …}}를 표준 출력으로 돌려준다.
lines는 쪽의 모든 글 줄(위→아래·왼→오른쪽으로 정렬), native는 PDF 안에 들어 있는 글 덩어리 차례 그대로의 글 줄 — 출판본은 문단 줄이 이 차례로 이어져 있어서
(옆 용어 풀이 상자·코드 설명이 사이에 끼지 않는다) 같음 검사가 문단 줄바꿈을 넘는 조각을 맞출 때 쓴다. 원본 PDF는 읽기만 한다(고치거나 복사하지 않는다).

쪽 번호 = PDF 쪽 번호(출판본은 인쇄 쪽과 1:1). 줄 순서는 위→아래·왼→오른쪽 대강의 차례이고(같음 검사는 줄별 조각 겹침이라 차례에 민감하지 않다),
아래는 뺀다:
  - 쪽 아래 머리말·쪽 번호 줄(y 772~793 — 재단 표시를 포함한 전체 쪽 좌표), "…indd 124 2025-12-04 …" 파일 이름 줄(굴림 글꼴, y 830 아래)
  - 코드 설명선의 점선(Korail-Round-Gothic 글꼴 — 글자가 깨져 나온다)과 눈에 안 보이는 아주 작은 글자(4pt 미만)
  - 코드 상자의 줄 번호(Times-Roman 8~10pt의 숫자 한두 자리)
쓰는 라이브러리: PyMuPDF(pymupdf)만.
"""

from __future__ import annotations

import json
import re
import sys
import traceback

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
pymupdf.TOOLS.mupdf_display_errors(False)

FOOTER_ZONE = (772.0, 793.0)
INDD_Y = 830.0
LEADER_FONTS = ("Korail-Round-Gothic",)
INDD_FONTS = ("Gulim",)
MIN_SIZE = 4.0
CONTROL = re.compile("[\x00-\x08\x0b-\x1f​‌‍﻿]")
PRIVATE_USE = re.compile("[-]")


def clean(text: str) -> str:
    text = text.replace(" ", " ").replace(" ", " ")
    text = CONTROL.sub("", text)
    text = PRIVATE_USE.sub("", text)
    return text.replace("�", "")


def is_line_number(span: dict) -> bool:
    return (
        span["font"].startswith("Times-Roman")
        and 8.0 <= span["size"] <= 10.0
        and re.fullmatch(r"\d{1,3}", span["text"].strip()) is not None
    )


def page_text(page: pymupdf.Page) -> dict:
    found: list[tuple[float, float, str]] = []
    native: list[str] = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            spans = []
            for span in line["spans"]:
                if not span["text"].strip() or span["size"] < MIN_SIZE:
                    continue
                if any(span["font"].startswith(name) for name in LEADER_FONTS):
                    continue
                if any(span["font"].startswith(name) for name in INDD_FONTS) and span["bbox"][1] > INDD_Y:
                    continue
                spans.append(span)
            if not spans:
                continue
            spans.sort(key=lambda s: s["bbox"][0])
            top = min(s["bbox"][1] for s in spans)
            if FOOTER_ZONE[0] <= top <= FOOTER_ZONE[1]:
                continue
            if is_line_number(spans[0]):
                spans = spans[1:]
                if not spans:
                    continue
            text = clean("".join(s["text"] for s in spans)).strip()
            if text:
                found.append((top, spans[0]["bbox"][0], text))
                native.append(text)
    found.sort(key=lambda item: (round(item[0] / 3.0), item[1]))
    return {"lines": [item[2] for item in found], "native": native}


def main() -> int:
    try:
        request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        doc = pymupdf.open(request["file"])
        pages: dict[str, dict] = {}
        for number in request["pages"]:
            if number < 1 or number > len(doc):
                raise ValueError(f"PDF에 {number}번째 쪽이 없어요(모두 {len(doc)}쪽).")
            pages[str(number)] = page_text(doc[number - 1])
        response = {"ok": True, "pages": pages}
    except Exception as error:  # 한 덩어리로 알린다
        response = {"ok": False, "error": f"{type(error).__name__}: {error}", "trace": traceback.format_exc(limit=5)}
    sys.stdout.write(json.dumps(response, ensure_ascii=False))
    sys.stdout.flush()
    return 0 if response.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
