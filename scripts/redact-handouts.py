#!/usr/bin/env python3
"""가린 편집본 교안 PDF 만들기·검사 — PLAN §8.5 P5-14, PD-31 (개발 도구: 배포물에 실리지 않아요)

원본 블루투스 통신 수업 교안(PDF)과 PyAutoGUI 수업 슬라이드(PPTX)에서 개인정보가 보이는 곳을 **진짜로 지운**
편집본 PDF를 교사용 자료실 자리(public/teacher/handouts/)에 만든다. 가릴 곳과 쪽별 눈 확인 기록은
scripts/handout-redactions.yaml 한 곳에 있다(형식은 그 파일 머리말).

  python scripts/redact-handouts.py build [bt|ppt ...] [--materials <원본 폴더>] [--fresh-export]
      편집본을 다시 만들고 바로 검사한다. 원본 폴더 기본값은 저장소 뿌리(운영자 PC), 다른 컴퓨터는 비공개 자료 저장소의 originals/.
  python scripts/redact-handouts.py check [bt|ppt ...]
      저장소에 있는 편집본만 검사한다(원본 필요 없음). 문제가 있으면 종료 코드 1.
  python scripts/redact-handouts.py preview [bt|ppt ...] [--zoom 1.0] [--pdf <파일>]
      쪽마다 PNG(.cache/handouts/<문서>/pNN.png)를 그린다 — 쪽별 눈 확인용.
  python scripts/redact-handouts.py compare [bt|ppt ...] --baseline <옛 편집본 폴더>
      원본 쪽(1~source.pages)을 옛 편집본과 같은 배율로 그려 픽셀이 같은지 쪽마다 대조한다. 끝에 덧붙인 쪽만 바뀌었을 때
      옛 쪽의 눈 확인 기록을 그대로 둘 수 있는지 보는 데 쓴다(2026-09-26 P6-04 — 출처·라이선스 쪽을 덧붙일 때 처음 씀).

출처·라이선스 쪽(credits_page, 2026-09-26 P6-04 — PROGRESS 미해결 183): 기록에 credits_page가 있으면 원본 쪽 **뒤에** 사이트가 만든
쪽 한 장을 덧붙인다(제목·짧은 칸 몇 개를 Pretendard로 적은 글자 쪽 — 링크 주석은 만들지 않는다). 원본 쪽은 하나도 바꾸거나 옮기지 않아
차시의 #page= 링크와 쪽별 눈 확인 기록이 그대로 맞고, 새 쪽만 눈 확인 기록을 더한다(검사하는 쪽 수 = source.pages + 1).

필요한 것: 파이썬 3.11 + PyMuPDF(1.28.2에서 확인)·Pillow·numpy·fontTools(글꼴 줄이기), Node.js(저장소의 yaml 패키지와
scripts/lib/repo-check.mjs의 개인정보 검사를 그대로 쓴다 — 규칙을 두 벌 두지 않으려고), 라벨 글꼴은 npm 패키지 pretendard
(devDependency, OFL-1.1)의 Pretendard-Regular.ttf. PPTX를 PDF로 바꾸는 단계만 Windows의 PowerPoint가 필요하다
(원본은 열지 않고 임시 폴더의 복사본을 읽기 전용으로 연다. 바꾼 PDF는 .cache/handouts/에 두고 원본 SHA-256이 같으면 다시 쓴다 —
PowerPoint가 내보낼 때마다 날짜·식별자가 달라지므로, 같은 PDF에서 시작해야 편집본이 같은 바이트로 나온다).

진짜로 지우는 방법(PyMuPDF 가림 주석: add_redact_annot → apply_redactions)
  - 글자: 가림 상자와 겹치는 글자를 내용 흐름에서 지운다(PDF_REDACT_TEXT_REMOVE).
  - 그림: 상자와 겹치는 픽셀을 흰색으로 바꾼 새 그림으로 바꾼다(PDF_REDACT_IMAGE_PIXELS). 여러 쪽이 함께 쓰는 그림은
    그 쪽에만 새 복사본이 생기고 다른 쪽은 그대로다.
  - 선·도형: 상자에 완전히 덮인 것만 지운다(PDF_REDACT_LINE_ART_REMOVE_IF_COVERED).
  그 뒤 상자 자리에 회색 상자·테두리와 무엇을 가렸는지 한 줄(사이트 글꼴 Pretendard)을 그린다.
문서 전체에서 지우는 것: 메타데이터(작성자·제목·만든 프로그램·날짜)·XMP·태그 구조(자동 대체 글 포함)·원본 책갈피·링크·주석·
첨부·양식·자바스크립트·숨은 층·쪽 썸네일. 사진(원본이 JPEG인 그림)은 픽셀만 다시 인코딩해 JPEG 안의 EXIF 조각을 없애고
화면에 놓인 크기 기준 photos.max_dpi로 줄인다(파일을 5MB 안으로). 쪽 수와 쪽 번호는 원본과 같다(차시의 #page= 링크가 그대로 맞게).

검사(build 끝과 check)
  - 가림 상자와 겹치는 글자가 없다(라벨 글자만 있다), 상자와 겹치는 그림 픽셀이 모두 비었다(그림 자료 자체를 읽어 본다).
  - 문서 구조: 정보 사전은 Title만, XMP·태그 구조·주석·링크·첨부·양식·자바스크립트·숨은 층·/Metadata 없음, JPEG 안에 APP0(JFIF) 말고 다른 조각 없음.
  - 파일 어디에도(쪽 글자, 모든 객체 사전, 압축을 푼 모든 흐름 — 글꼴·그림 자료 제외) 개인정보 모양(사용자 폴더·OneDrive 경로·MAC·
    이메일·전화번호)과 비공개 이름(scripts/privacy-needles.json 해시)이 없다. 원본 파일 이름은 객체·흐름·파일 바이트에 없어야 하고,
    쪽 본문에 보이는 수업 자료 이름(압축 파일 이름 등)은 참고로만 알린다.
  - 쪽별 눈 확인 기록(review)이 모든 쪽에 있고, 기록한 편집본(output.sha256)이 지금 파일과 같다.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Windows 콘솔(코드 페이지 949)에서도 한국어·기호(—)를 그대로 찍게 한다(npm run handouts:* — Phase 5 통합 2026-09-25).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):  # pragma: no cover - 바꿀 수 없는 스트림
        pass

try:
    import pymupdf
except ImportError:  # pragma: no cover - 안내만
    sys.exit('[편집본] PyMuPDF가 없어요. 이 도구는 운영자 PC의 파이썬(PyMuPDF 1.28.2)에서 돌려요.')
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PLAN_FILE = ROOT / 'scripts' / 'handout-redactions.yaml'
CACHE_DIR = ROOT / '.cache' / 'handouts'
LABEL_FONT_FILE = ROOT / 'node_modules' / 'pretendard' / 'dist' / 'public' / 'static' / 'alternative' / 'Pretendard-Regular.ttf'
# 출처·라이선스 쪽의 제목·칸 이름(같은 npm 패키지의 굵은 글꼴, OFL-1.1)
BOLD_FONT_FILE = ROOT / 'node_modules' / 'pretendard' / 'dist' / 'public' / 'static' / 'alternative' / 'Pretendard-Bold.ttf'

KINDS = ('face', 'path', 'device-address', 'classroom', 'desktop')
PAGE_BOX = (1440.0, 810.0)
FILL = (0.86, 0.86, 0.86)  # 가림 상자 바탕(밝은 회색)
BORDER = (0.36, 0.36, 0.36)  # 테두리
INK = (0.18, 0.18, 0.18)  # 라벨 글자
NOTICE_INK = (0.35, 0.35, 0.35)
LABEL_MAX_SIZE = 16.0
LABEL_MIN_SIZE = 6.0
# 출처·라이선스 쪽: 글자 칸(쪽 1440×810pt 안쪽 여백), 처음 글자 크기(제목·부제·칸 이름·본문), 들어가지 않으면 줄이는 비율과 하한
CREDITS_BOX = (110.0, 84.0, 1330.0, 752.0)
CREDITS_SIZES = {'title': 38.0, 'subtitle': 19.0, 'heading': 22.0, 'text': 19.0}
CREDITS_SHRINK = 0.95
CREDITS_MIN_SCALE = 0.6
CREDITS_HEADING_INK = (0.08, 0.08, 0.08)
# 상자와 겹친 글자: 글자 상자가 가림 상자와 이만큼(pt²)보다 많이 겹치면 남은 것으로 본다(가장자리 반올림 오차 무시)
TEXT_OVERLAP_EPS = 0.5
# 그림 픽셀 검사: 가장자리 반올림을 빼려고 안쪽으로 줄이는 픽셀 수와, 빈 픽셀로 보는 밝기.
# 가림 직후(strict)는 MuPDF가 비운 흰 픽셀 그대로라 엄격히, 저장한 편집본은 사진을 JPEG로 다시 인코딩한 뒤라
# 8×8 블록 가장자리 번짐을 빼려고 안쪽을 더 줄이고 조금 너그럽게 본다(비운 자리에는 원래 내용이 남을 수 없다).
PIXEL_MARGIN = {True: 2, False: 8}
BLANK_MIN = {True: 250, False: 225}

CATALOG_DROP_KEYS = (
    'StructTreeRoot', 'MarkInfo', 'Metadata', 'Outlines', 'Names', 'AcroForm', 'OCProperties', 'OpenAction', 'AA',
    'Threads', 'SpiderInfo', 'PieceInfo', 'Perms', 'Legal', 'Collection', 'URI', 'Dests', 'PageLabels', 'Extensions',
)
PAGE_DROP_KEYS = ('Annots', 'StructParents', 'Thumb', 'PieceInfo', 'AA', 'Metadata', 'B', 'ID', 'PZ', 'SeparationInfo', 'Tabs')
# 어느 객체에든 있으면 안 되는 키(검사). 새 책갈피(/Outlines)와 문서 제목(/Title)은 이 도구가 붙인 것이라 괜찮다.
FORBIDDEN_KEYS = (
    '/StructTreeRoot', '/MarkInfo', '/Metadata', '/AcroForm', '/OCProperties', '/OpenAction', '/JavaScript', '/JS',
    '/EmbeddedFile', '/EmbeddedFiles', '/Launch', '/URI', '/Annots', '/PieceInfo', '/Thumb', '/ActualText', '/Alt', '/StructParents',
    '/SubmitForm', '/ImportData', '/RichMedia', '/GoToR', '/GoToE', '/Names', '/AA',
)
# 내용 흐름 안의 표시 내용 속성(BDC)에 대체 글이 숨어 있으면 안 된다
FORBIDDEN_STREAM_KEYS = (rb'/ActualText', rb'/Alt(?![A-Za-z])', rb'/E\s*\(', rb'/Contents\s*\(')


def log(message: str) -> None:
    print(f'[편집본] {message}', flush=True)


class Problems:
    """검사에서 나온 문제 모음(문서 id별)."""

    def __init__(self) -> None:
        self.items: list[tuple[str, str]] = []
        self.notes: list[tuple[str, str]] = []

    def add(self, where: str, message: str) -> None:
        self.items.append((where, message))

    def note(self, where: str, message: str) -> None:
        self.notes.append((where, message))

    def report(self, title: str) -> bool:
        for where, message in self.notes:
            log(f'참고: {title} {where}: {message}')
        if not self.items:
            log(f'{title}: 검사 통과')
            return True
        log(f'{title}: 검사 실패 — 문제 {len(self.items)}건')
        for where, message in self.items:
            log(f'  - {where}: {message}')
        return False


# ── Node 도우미(yaml 읽기, 원본 목록, 개인정보 검사 — 저장소 검사와 같은 규칙) ───────────────────────────────


def find_node() -> str:
    for candidate in (os.environ.get('APC_NODE'), shutil.which('node'), r'C:\Program Files\nodejs\node.exe'):
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit('[편집본] Node.js를 찾지 못했어요. PATH에 node를 넣거나 APC_NODE에 node 경로를 적어요.')


def run_node(code: str, args: list[str] | None = None, stdin: str | None = None) -> dict:
    completed = subprocess.run(
        [find_node(), '--input-type=module', '-e', code, *(args or [])],
        cwd=ROOT,
        input=(stdin or '').encode('utf-8'),
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        sys.exit('[편집본] Node 도우미가 실패했어요:\n' + completed.stderr.decode('utf-8', 'replace'))
    return json.loads(completed.stdout.decode('utf-8'))


NODE_LOAD_PLAN = """
import fs from 'node:fs';
import { parse } from 'yaml';
import { SOURCES } from './scripts/lib/lesson-images.mjs';
const plan = parse(fs.readFileSync(process.argv[1], 'utf8'));
process.stdout.write(JSON.stringify({ plan, sources: SOURCES }));
"""

NODE_PRIVACY_SCAN = """
import fs from 'node:fs';
import { loadRepoRules, findPrivacyPatterns, findPrivacyNeedles } from './scripts/lib/repo-check.mjs';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const { rules, errors } = loadRepoRules(process.cwd());
const findings = [];
for (const item of input.texts) {
  for (const detail of findPrivacyPatterns(item.text)) findings.push({ where: item.where, kind: 'pattern', detail });
  for (const detail of findPrivacyNeedles(item.text, rules.privacyNeedles)) findings.push({ where: item.where, kind: 'needle', detail });
  const lower = item.text.normalize('NFC').toLowerCase();
  for (const name of rules.originalNameNeedles) {
    if (lower.includes(name.toLowerCase())) findings.push({ where: item.where, kind: 'original-name', detail: name });
  }
}
for (const file of input.files) {
  const buffer = fs.readFileSync(file.path);
  for (const name of rules.originalNameNeedles) {
    if (buffer.includes(Buffer.from(name, 'utf8'))) findings.push({ where: file.where, kind: 'original-name-bytes', detail: name });
  }
}
process.stdout.write(JSON.stringify({
  findings,
  errors,
  needles: rules.privacyNeedles ? rules.privacyNeedles.needles.length : 0,
  originalNames: rules.originalNameNeedles.length,
}));
"""


def load_plan() -> tuple[dict, dict]:
    data = run_node(NODE_LOAD_PLAN, [str(PLAN_FILE)])
    plan = data['plan'] or {}
    documents = plan.get('documents') or {}
    if not documents:
        sys.exit(f'[편집본] {PLAN_FILE.relative_to(ROOT)}에 documents가 없어요.')
    return documents, data['sources']


def appended_pages(spec: dict) -> int:
    """원본 쪽 뒤에 사이트가 덧붙이는 쪽 수(지금은 출처·라이선스 쪽 하나뿐)."""
    return 1 if spec.get('credits_page') else 0


def total_pages(spec: dict) -> int:
    """편집본의 쪽 수 = 원본 쪽 수 + 덧붙인 쪽 수. 원본 쪽 번호(1~source.pages)는 원본과 같다."""
    return int((spec.get('source') or {}).get('pages') or 0) + appended_pages(spec)


def validate_credits_page(where: str, credits: object, problems: Problems) -> None:
    label = f'{where} credits_page'
    if not isinstance(credits, dict):
        problems.add(label, 'title·subtitle·sections를 가진 항목으로 적어요.')
        return
    for key in ('title', 'subtitle'):
        if not str(credits.get(key) or '').strip():
            problems.add(label, f'{key}를 적어요.')
    sections = credits.get('sections')
    if not isinstance(sections, list) or not sections:
        problems.add(label, 'sections(칸 이름 heading과 글 text의 목록)를 하나 이상 적어요.')
        return
    for index, section in enumerate(sections):
        if not (isinstance(section, dict) and str(section.get('heading') or '').strip() and str(section.get('text') or '').strip()):
            problems.add(f'{label}.sections[{index}]', 'heading과 text를 모두 적어요.')
    unknown = set(credits) - {'title', 'subtitle', 'sections'}
    if unknown:
        problems.add(label, f'모르는 칸: {", ".join(sorted(unknown))}(title·subtitle·sections만 써요).')


def validate_plan(doc_id: str, spec: dict, problems: Problems) -> None:
    where = f'{doc_id}(scripts/handout-redactions.yaml)'
    pages = int((spec.get('source') or {}).get('pages') or 0)
    if pages <= 0:
        problems.add(where, 'source.pages가 없어요.')
    if 'credits_page' in spec:
        validate_credits_page(where, spec.get('credits_page'), problems)
    output = (spec.get('output') or {}).get('path', '')
    if not str(output).startswith('public/teacher/handouts/') or not str(output).endswith('.pdf'):
        problems.add(where, 'output.path는 public/teacher/handouts/ 아래 .pdf여야 해요(src/components/lesson/handouts.ts와 같은 이름).')
    for index, item in enumerate(spec.get('redactions') or []):
        label = f'{where} redactions[{index}]'
        page = item.get('page')
        if not isinstance(page, int) or not 1 <= page <= pages:
            problems.add(label, f'page {page!r}가 1~{pages} 밖이에요.')
        if item.get('kind') not in KINDS:
            problems.add(label, f'kind는 {", ".join(KINDS)} 가운데 하나예요.')
        if not str(item.get('reason') or '').strip():
            problems.add(label, 'reason(왜 가리는지)을 적어요.')
        rects = item.get('rects') or []
        if not rects:
            problems.add(label, 'rects가 비었어요.')
        for rect in rects:
            if not (isinstance(rect, list) and len(rect) == 4 and all(isinstance(v, (int, float)) for v in rect)):
                problems.add(label, f'rect {rect!r}는 [x0, y0, x1, y1] 숫자 넷이에요.')
                continue
            x0, y0, x1, y1 = rect
            if not (0 <= x0 < x1 <= PAGE_BOX[0] and 0 <= y0 < y1 <= PAGE_BOX[1]):
                problems.add(label, f'rect {rect!r}가 쪽(1440×810) 밖이거나 뒤집혔어요.')
    for index, entry in enumerate(spec.get('outline') or []):
        # 책갈피는 덧붙인 쪽(출처·라이선스)도 가리킬 수 있다
        if not (isinstance(entry, list) and len(entry) == 3 and entry[0] in (1, 2) and isinstance(entry[2], int) and 1 <= entry[2] <= total_pages(spec)):
            problems.add(f'{where} outline[{index}]', '[단계(1·2), 제목, 쪽] 모양이 아니에요.')


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


# ── 원본 열기(PPTX는 PowerPoint로 PDF를 만든다) ───────────────────────────────────────────────


POWERSHELL_EXPORT = r"""
$ErrorActionPreference = 'Stop'
$ppt = $null; $pres = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  # Open(FileName, ReadOnly = msoTrue, Untitled = msoFalse, WithWindow = msoFalse)
  $pres = $ppt.Presentations.Open($env:APC_PPTX_COPY, -1, 0, 0)
  if ($pres.Slides.Count -ne [int]$env:APC_PPTX_SLIDES) { throw ('slides=' + $pres.Slides.Count) }
  # ppSaveAsPDF = 32. 숨긴 슬라이드는 원본에 없다(docProps/app.xml HiddenSlides 0 — 2026-09-25 확인), 메모는 내보내지 않는다.
  $pres.SaveAs($env:APC_PDF_OUT, 32)
} finally {
  if ($pres -ne $null) { $pres.Close() }
  if ($ppt -ne $null) { $ppt.Quit() }
  if ($pres -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) }
  if ($ppt -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
"""


def export_pptx(source: Path, spec: dict, fresh: bool) -> Path:
    """PPTX를 PDF로 바꾼다(.cache/handouts/<id>-export.pdf). 원본 SHA-256이 같으면 전에 바꾼 PDF를 다시 쓴다."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached_pdf = CACHE_DIR / 'ppt-export.pdf'
    stamp = CACHE_DIR / 'ppt-export.json'
    source_sha = spec['source']['sha256']
    if not fresh and cached_pdf.exists() and stamp.exists():
        info = json.loads(stamp.read_text(encoding='utf-8'))
        if info.get('source_sha256') == source_sha and info.get('pdf_sha256') == sha256_file(cached_pdf):
            log(f'PowerPoint로 바꾼 PDF를 다시 써요({cached_pdf.relative_to(ROOT)}, 원본 SHA-256 같음).')
            return cached_pdf
    if os.name != 'nt':
        sys.exit('[편집본] PPTX를 PDF로 바꾸는 단계는 Windows의 PowerPoint가 필요해요(운영자 PC). 다른 컴퓨터에서는 check만 돌려요.')
    with tempfile.TemporaryDirectory(prefix='apc-handout-') as temp:
        copy = Path(temp) / 'slides.pptx'
        shutil.copyfile(source, copy)  # 원본은 PowerPoint로 열지 않는다(잠금 파일·자동 저장이 원본 폴더에 생기지 않게)
        if sha256_file(copy) != source_sha:
            sys.exit('[편집본] 복사본의 SHA-256이 원본과 달라요.')
        out = Path(temp) / 'slides.pdf'
        env = dict(os.environ, APC_PPTX_COPY=str(copy), APC_PDF_OUT=str(out), APC_PPTX_SLIDES=str(spec['source']['pages']))
        completed = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_EXPORT],
            env=env, capture_output=True, check=False,
        )
        if completed.returncode != 0 or not out.exists():
            sys.exit('[편집본] PowerPoint로 PDF를 만들지 못했어요:\n' + completed.stderr.decode('utf-8', 'replace'))
        shutil.copyfile(out, cached_pdf)
    stamp.write_text(json.dumps({'source_sha256': source_sha, 'pdf_sha256': sha256_file(cached_pdf)}, indent=2), encoding='utf-8')
    log(f'PowerPoint로 PDF를 만들었어요({cached_pdf.relative_to(ROOT)}).')
    return cached_pdf


def open_source(doc_id: str, spec: dict, sources: dict, materials: Path, fresh_export: bool) -> tuple[pymupdf.Document, str]:
    source_id = spec['source']['id']
    info = sources.get(source_id)
    if not info:
        sys.exit(f'[편집본] {doc_id}: 원본 약칭 {source_id}가 scripts/lib/lesson-images.mjs의 SOURCES에 없어요.')
    path = materials / info['file']
    if not path.exists():
        sys.exit(f'[편집본] {doc_id}: 원본이 없어요({source_id}). 운영자 PC의 저장소 뿌리에서 돌리거나 --materials <originals 폴더>를 줘요.')
    actual = sha256_file(path)
    if actual != spec['source']['sha256']:
        sys.exit(f'[편집본] {doc_id}: 원본 SHA-256이 기록과 달라요({actual}). 원본이 바뀌었으면 가릴 곳 좌표를 쪽마다 다시 확인해요.')
    pdf_path = export_pptx(path, spec, fresh_export) if info['kind'] == 'pptx' else path
    doc = pymupdf.open(pdf_path)
    if doc.page_count != spec['source']['pages']:
        sys.exit(f'[편집본] {doc_id}: 쪽 수가 {doc.page_count}쪽이에요(기록 {spec["source"]["pages"]}쪽).')
    for page in doc:
        if abs(page.rect.width - PAGE_BOX[0]) > 1 or abs(page.rect.height - PAGE_BOX[1]) > 1:
            sys.exit(f'[편집본] {doc_id}: {page.number + 1}쪽 크기가 1440×810pt가 아니에요.')
    return doc, actual


# ── 그림 도우미 ─────────────────────────────────────────────────────────────


def image_axes(transform: pymupdf.Matrix) -> tuple[float, float]:
    """그림 좌표계의 가로·세로가 쪽에서 차지하는 길이(pt) — 90도 돌린 사진도 맞게."""
    return math.hypot(transform.a, transform.b), math.hypot(transform.c, transform.d)


def is_dct(doc: pymupdf.Document, xref: int) -> bool:
    kind, value = doc.xref_get_key(xref, 'Filter')
    return kind != 'null' and 'DCTDecode' in value


def has_smask(doc: pymupdf.Document, xref: int) -> bool:
    return doc.xref_get_key(xref, 'SMask')[0] != 'null'


def photo_placements(doc: pymupdf.Document) -> dict[int, list[pymupdf.Rect]]:
    """쪽마다 사진(원본이 JPEG인 그림)이 놓인 자리. 가림 뒤 새 복사본이 생겨도 자리로 사진인지 알아본다."""
    placements: dict[int, list[pymupdf.Rect]] = {}
    for page in doc:
        for info in page.get_image_info(xrefs=True):
            if info['xref'] and is_dct(doc, info['xref']):
                placements.setdefault(page.number, []).append(pymupdf.Rect(info['bbox']))
    return placements


def pixel_region(info: dict, rect: pymupdf.Rect, margin: int) -> tuple[int, int, int, int] | None:
    """쪽의 rect와 겹치는 그림 픽셀 범위(가장자리 margin만큼 안쪽). 겹치지 않으면 None.
    그림 좌표(0~1)는 transform의 역행렬로 구한다 — 돌려 놓은 사진도 맞다."""
    transform = pymupdf.Matrix(info['transform'])
    overlap = pymupdf.Rect(info['bbox']) & rect
    if overlap.is_empty or overlap.width < 1 or overlap.height < 1:
        return None
    inverse = ~transform
    corners = [pymupdf.Point(x, y) * inverse for x in (overlap.x0, overlap.x1) for y in (overlap.y0, overlap.y1)]
    us = [min(max(p.x, 0.0), 1.0) for p in corners]
    vs = [min(max(p.y, 0.0), 1.0) for p in corners]
    width, height = info['width'], info['height']
    x0 = math.floor(min(us) * width) + margin
    x1 = math.ceil(max(us) * width) - margin
    y0 = math.floor(min(vs) * height) + margin
    y1 = math.ceil(max(vs) * height) - margin
    if x1 <= x0 or y1 <= y0:
        return None
    return x0, y0, x1, y1


def image_arrays(doc: pymupdf.Document, xref: int):
    """그림 자료를 (RGB 배열, 투명도 배열 또는 None)으로. 투명한 픽셀은 쪽에 아무것도 그리지 않는다."""
    import numpy as np

    pix = pymupdf.Pixmap(doc, xref)
    alpha = None
    if pix.alpha:
        samples = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        alpha = samples[:, :, -1].copy()
        pix = pymupdf.Pixmap(pix, 0)
    if pix.colorspace is None or pix.colorspace.n != 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
    return rgb, alpha


# ── 가림·라벨 ───────────────────────────────────────────────────────────────


def redaction_rects(spec: dict) -> dict[int, list[tuple[pymupdf.Rect, dict]]]:
    by_page: dict[int, list[tuple[pymupdf.Rect, dict]]] = {}
    for item in spec.get('redactions') or []:
        for rect in item['rects']:
            by_page.setdefault(item['page'] - 1, []).append((pymupdf.Rect(rect), item))
    return by_page


def apply_redactions(doc: pymupdf.Document, spec: dict) -> int:
    count = 0
    for pno, entries in sorted(redaction_rects(spec).items()):
        page = doc[pno]
        for rect, _item in entries:
            page.add_redact_annot(rect, fill=FILL)
            count += 1
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
            graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
            text=pymupdf.PDF_REDACT_TEXT_REMOVE,
        )
    return count


def label_font() -> pymupdf.Font:
    if not LABEL_FONT_FILE.exists():
        sys.exit('[편집본] 라벨 글꼴(node_modules/pretendard)이 없어요. 저장소 뿌리에서 npm ci를 먼저 해요.')
    return pymupdf.Font(fontfile=str(LABEL_FONT_FILE))


def fit_lines(font: pymupdf.Font, text: str, box: pymupdf.Rect, max_size: float, max_lines: int) -> tuple[list[str], float] | None:
    """box 안에 들어가는 가장 큰 글자 크기와 줄 나눔(띄어쓰기 기준, 최대 max_lines줄)."""
    words = text.split(' ')
    size = max_size
    while size >= LABEL_MIN_SIZE:
        lines: list[str] = []
        current = ''
        for word in words:
            trial = f'{current} {word}' if current else word
            if font.text_length(trial, fontsize=size) <= box.width:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        line_height = size * 1.3
        fits_width = all(font.text_length(line, fontsize=size) <= box.width for line in lines)
        if fits_width and len(lines) <= max_lines and line_height * len(lines) <= box.height:
            return lines, size
        size -= 0.5
    return None


def write_centered(page: pymupdf.Page, font: pymupdf.Font, lines: list[str], size: float, box: pymupdf.Rect, color) -> None:
    line_height = size * 1.3
    total = line_height * len(lines)
    top = box.y0 + (box.height - total) / 2
    writer = pymupdf.TextWriter(page.rect)
    for index, line in enumerate(lines):
        width = font.text_length(line, fontsize=size)
        # 줄 가운데에 글자 높이(ascender~descender)의 가운데를 맞춘다
        center_y = top + line_height * (index + 0.5)
        baseline = center_y + (font.ascender + font.descender) / 2 * size
        writer.append(pymupdf.Point(box.x0 + (box.width - width) / 2, baseline), line, font=font, fontsize=size)
    writer.write_text(page, color=color)


def draw_labels(doc: pymupdf.Document, spec: dict, font: pymupdf.Font) -> list[str]:
    skipped: list[str] = []
    for pno, entries in sorted(redaction_rects(spec).items()):
        page = doc[pno]
        for rect, item in entries:
            page.draw_rect(rect, color=BORDER, width=0.8)
            label = str(item.get('label') or '').strip()
            if not label:
                continue
            inner = rect + (4, 2, -4, -2)
            fitted = fit_lines(font, label, inner, min(LABEL_MAX_SIZE, inner.height * 0.72), 3)
            if fitted is None:
                skipped.append(f'{pno + 1}쪽 {tuple(round(v) for v in rect)}')
                continue
            write_centered(page, font, *fitted, inner, INK)
    return skipped


def draw_notice(doc: pymupdf.Document, spec: dict, font: pymupdf.Font) -> None:
    notice = spec.get('notice')
    if not notice:
        return
    box = pymupdf.Rect(notice['rect'])
    fitted = fit_lines(font, notice['text'], box, 14.0, 2)
    if fitted is None:
        sys.exit('[편집본] 표지 안내 글이 notice.rect에 들어가지 않아요.')
    write_centered(doc[notice['page'] - 1], font, *fitted, box, NOTICE_INK)


def wrap_text(font: pymupdf.Font, text: str, size: float, width: float) -> list[str]:
    """띄어쓰기 기준으로 줄을 나눈다. 한 낱말(긴 주소 등)이 폭보다 길면 글자 단위로 자른다. 원래 줄바꿈(\\n)은 지킨다."""
    lines: list[str] = []
    for paragraph in str(text).split('\n'):
        current = ''
        for word in paragraph.split(' '):
            trial = f'{current} {word}' if current else word
            if font.text_length(trial, fontsize=size) <= width:
                current = trial
                continue
            if current:
                lines.append(current)
            current = ''
            while font.text_length(word, fontsize=size) > width:
                cut = len(word)
                while cut > 1 and font.text_length(word[:cut], fontsize=size) > width:
                    cut -= 1
                lines.append(word[:cut])
                word = word[cut:]
            current = word
        lines.append(current)
    return lines


def layout_credits(credits: dict, regular: pymupdf.Font, bold: pymupdf.Font, scale: float) -> tuple[list[tuple], float]:
    """출처·라이선스 쪽의 줄 배치 [(글꼴, 크기, 글, 칸 안 y 기준선, 색, 선을 그을지)]와 전체 높이."""
    width = CREDITS_BOX[2] - CREDITS_BOX[0]
    sizes = {key: value * scale for key, value in CREDITS_SIZES.items()}
    placed: list[tuple] = []
    y = 0.0

    def add_lines(font: pymupdf.Font, size: float, text: str, color, gap_before: float) -> None:
        nonlocal y
        y += gap_before
        for line in wrap_text(font, text, size, width):
            y += size * 1.35
            placed.append((font, size, line, y - size * 0.3, color, False))

    add_lines(bold, sizes['title'], credits['title'], CREDITS_HEADING_INK, 0.0)
    add_lines(regular, sizes['subtitle'], credits['subtitle'], NOTICE_INK, sizes['subtitle'] * 0.3)
    y += sizes['subtitle'] * 0.7
    placed.append((None, 0.0, '', y, BORDER, True))  # 제목 아래 가는 선
    for section in credits['sections']:
        add_lines(bold, sizes['heading'], section['heading'], CREDITS_HEADING_INK, sizes['heading'] * 0.75)
        add_lines(regular, sizes['text'], section['text'], INK, sizes['text'] * 0.15)
    return placed, y


def add_credits_page(doc: pymupdf.Document, spec: dict, regular: pymupdf.Font, bold: pymupdf.Font) -> int | None:
    """원본 쪽 뒤에 출처·라이선스 쪽을 한 장 덧붙인다(원본 쪽은 건드리지 않는다). 덧붙인 쪽 번호(1부터)를 돌려준다."""
    credits = spec.get('credits_page')
    if not credits:
        return None
    box = pymupdf.Rect(CREDITS_BOX)
    scale = 1.0
    while True:
        placed, height = layout_credits(credits, regular, bold, scale)
        if height <= box.height:
            break
        scale *= CREDITS_SHRINK
        if scale < CREDITS_MIN_SCALE:
            sys.exit('[편집본] 출처·라이선스 쪽(credits_page) 글이 한 쪽에 들어가지 않아요 — 글을 줄여요.')
    page = doc.new_page(-1, width=PAGE_BOX[0], height=PAGE_BOX[1])
    writers: dict[tuple, pymupdf.TextWriter] = {}
    for font, size, text, baseline, color, is_rule in placed:
        if is_rule:
            page.draw_line(pymupdf.Point(box.x0, box.y0 + baseline), pymupdf.Point(box.x1, box.y0 + baseline), color=color, width=0.8)
            continue
        if not text:
            continue
        writer = writers.setdefault(color, pymupdf.TextWriter(page.rect))
        writer.append(pymupdf.Point(box.x0, box.y0 + baseline), text, font=font, fontsize=size)
    for color, writer in writers.items():
        writer.write_text(page, color=color)
    return page.number + 1


def bold_font() -> pymupdf.Font:
    if not BOLD_FONT_FILE.exists():
        sys.exit('[편집본] 굵은 글꼴(node_modules/pretendard의 Pretendard-Bold.ttf)이 없어요. 저장소 뿌리에서 npm ci를 먼저 해요.')
    return pymupdf.Font(fontfile=str(BOLD_FONT_FILE))


# ── 사진 다시 인코딩·문서 정리·저장 ────────────────────────────────────────────


def reencode_photos(doc: pymupdf.Document, placements: dict[int, list[pymupdf.Rect]], max_dpi: float, quality: int) -> tuple[int, int]:
    """사진을 픽셀만 다시 JPEG로(EXIF 등 JPEG 안 조각 없음), 화면에 놓인 크기 기준 max_dpi를 넘으면 줄인다."""
    targets: dict[int, dict] = {}
    for page in doc:
        for info in page.get_image_info(xrefs=True):
            xref = info['xref']
            if not xref or has_smask(doc, xref):
                continue
            bbox = pymupdf.Rect(info['bbox'])
            was_photo = is_dct(doc, xref) or any(
                abs(bbox.x0 - r.x0) < 1 and abs(bbox.y0 - r.y0) < 1 and abs(bbox.x1 - r.x1) < 1 and abs(bbox.y1 - r.y1) < 1
                for r in placements.get(page.number, [])
            )
            if not was_photo:
                continue
            len_x, len_y = image_axes(pymupdf.Matrix(info['transform']))
            dpi = max(info['width'] / (len_x / 72), info['height'] / (len_y / 72))
            entry = targets.setdefault(xref, {'page': page.number, 'dpi': 0.0})
            entry['dpi'] = max(entry['dpi'], dpi)
    before = after = 0
    for xref, entry in sorted(targets.items()):
        before += len(doc.xref_stream_raw(xref))
        pix = pymupdf.Pixmap(doc, xref)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        gray = pix.colorspace is not None and pix.colorspace.n == 1
        if not gray and (pix.colorspace is None or pix.colorspace.n != 3):
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        image = Image.frombytes('L' if gray else 'RGB', (pix.width, pix.height), pix.samples)
        scale = min(1.0, max_dpi / entry['dpi']) if entry['dpi'] > 0 else 1.0
        if scale < 0.999:
            size = (max(1, round(pix.width * scale)), max(1, round(pix.height * scale)))
            image = image.resize(size, Image.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, 'JPEG', quality=quality, optimize=True)  # Pillow는 JFIF(APP0)만 쓴다 — EXIF·XMP·ICC 없음
        data = buffer.getvalue()
        # 같은 그림 객체의 흐름만 바꾼다(그림을 쓰는 모든 쪽이 새 픽셀을 본다). 쪽에 놓인 자리·크기는 변환 행렬이라 그대로다.
        doc.update_stream(xref, data, new=0, compress=0)
        for key, value in (
            ('Filter', '/DCTDecode'), ('DecodeParms', 'null'), ('Decode', 'null'), ('Metadata', 'null'),
            ('Width', str(image.width)), ('Height', str(image.height)), ('BitsPerComponent', '8'),
            ('ColorSpace', '/DeviceGray' if gray else '/DeviceRGB'),
        ):
            doc.xref_set_key(xref, key, value)
        after += len(data)
    return before, after


def scrub_document(doc: pymupdf.Document, spec: dict) -> None:
    for page in doc:
        for annot in list(page.annots() or []):
            page.delete_annot(annot)
        for link in list(page.get_links()):
            page.delete_link(link)
    doc.scrub(
        attached_files=True, clean_pages=True, embedded_files=True, hidden_text=True, javascript=True, metadata=True,
        redactions=True, remove_links=True, reset_fields=True, reset_responses=True, thumbnails=True, xml_metadata=True,
    )
    if doc.get_xml_metadata():
        doc.del_xml_metadata()
    catalog = doc.pdf_catalog()
    for key in CATALOG_DROP_KEYS:
        if doc.xref_get_key(catalog, key)[0] != 'null':
            doc.xref_set_key(catalog, key, 'null')
    for page in doc:
        for key in PAGE_DROP_KEYS:
            if doc.xref_get_key(page.xref, key)[0] != 'null':
                doc.xref_set_key(page.xref, key, 'null')
    doc.set_metadata({})
    doc.set_metadata({'title': spec['title']})
    doc.xref_set_key(catalog, 'Lang', pdf_string(spec.get('lang') or 'ko-KR'))
    doc.xref_set_key(catalog, 'ViewerPreferences', '<</DisplayDocTitle true>>')
    doc.set_toc([[level, title, page] for level, title, page in spec.get('outline') or []])
    if spec.get('outline'):
        doc.xref_set_key(catalog, 'PageMode', '/UseOutlines')
    drop_null_keys(doc)


def pdf_string(text: str) -> str:
    return '(' + text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ')'


TOP_LEVEL_NULL = re.compile(r'^  /[A-Za-z0-9#]+ null\n', re.M)


def drop_null_keys(doc: pymupdf.Document) -> int:
    """xref_set_key(…, 'null')는 키를 null 값으로 남긴다(PDF에서는 없는 것과 같다). 파일에 이름조차 남지 않게 사전 맨 윗단계의
    `/키 null` 줄을 지운다. 줄 단위로 맨 윗단계(들여쓰기 두 칸)만 보므로 책갈피 목적지 배열(/XYZ null …) 같은 값은 건드리지 않는다."""
    removed = 0
    for xref in range(1, doc.xref_length()):
        try:
            source = doc.xref_object(xref, compressed=False)
        except Exception:
            continue
        if not source.startswith('<<'):
            continue
        cleaned, count = TOP_LEVEL_NULL.subn('', source + '\n' if not source.endswith('\n') else source)
        if count:
            doc.update_object(xref, cleaned.rstrip('\n'))
            removed += count
    return removed


def save_deterministic(doc: pymupdf.Document, out: Path, seed: str) -> None:
    """같은 원본·같은 기록이면 같은 바이트가 나오게(파일 식별자 /ID를 원본·기록에서 만든다)."""
    doc.subset_fonts()
    file_id = hashlib.sha256(seed.encode('utf-8')).hexdigest()[:32].upper()
    doc.xref_set_key(-1, 'ID', f'[<{file_id}><{file_id}>]')
    out.parent.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    temp = CACHE_DIR / f'{out.stem}.saving.pdf'  # 저장 중에 멈춰도 public/에 반쪽 파일이 남지 않게
    doc.save(
        temp, garbage=4, clean=True, deflate=True, deflate_images=True, deflate_fonts=True, no_new_id=True, use_objstms=1,
        reproducible=True,
    )
    doc.close()
    if out.exists() and sha256_file(out) == sha256_file(temp):
        temp.unlink()  # 같은 바이트면 바꾸지 않는다(눈 확인 기록의 SHA-256이 그대로 맞다)
        return
    for attempt in range(5):
        try:
            os.replace(temp, out)
            return
        except PermissionError:
            # Windows에서는 PDF 보기 프로그램·백신·개발 서버가 파일을 잠깐 열고 있으면 바꿔 넣기가 막힌다 — 잠깐 기다렸다 다시
            if attempt == 4:
                sys.exit(f'[편집본] {out.relative_to(ROOT).as_posix()}을(를) 다른 프로그램(PDF 보기·개발 서버 등)이 열고 있어 바꾸지 못했어요. '
                         f'닫고 다시 해요(새 파일은 {temp.relative_to(ROOT).as_posix()}에 있어요).')
            import time
            time.sleep(1.5)


# ── 검사 ──────────────────────────────────────────────────────────────────


def check_blank(doc: pymupdf.Document, spec: dict, problems: Problems, labels_drawn: bool) -> None:
    """가림 상자와 겹치는 글자·그림 픽셀이 남지 않았는지. labels_drawn=False는 가림 직후(엄격), True는 저장한 편집본."""
    strict = not labels_drawn
    margin, blank_min = PIXEL_MARGIN[strict], BLANK_MIN[strict]
    by_page = redaction_rects(spec)
    for pno, entries in sorted(by_page.items()):
        page = doc[pno]
        rects = [rect for rect, _ in entries]
        allowed = {re.sub(r'\s+', '', str(item.get('label') or '')) for _, item in entries} if labels_drawn else set()
        # 글자: 상자와 겹친 글자를 줄 단위로 모아 라벨과 견준다
        leftovers: list[str] = []
        raw = page.get_text('rawdict', flags=pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP)
        for block in raw['blocks']:
            for line in block.get('lines', []):
                chars = [ch for span in line['spans'] for ch in span['chars']
                         if any((pymupdf.Rect(ch['bbox']) & rect).get_area() > TEXT_OVERLAP_EPS for rect in rects)]
                text = re.sub(r'\s+', '', ''.join(ch['c'] for ch in chars))
                if text and text not in allowed:
                    leftovers.append(text)
        if labels_drawn:
            # 라벨 여러 줄은 줄마다 따로 나오므로, 남은 조각을 이어 붙여 라벨 글자에서 모두 설명되는지 본다
            joined = ''.join(leftovers)
            if joined and all(part in ''.join(allowed) for part in leftovers):
                leftovers = []
        if leftovers:
            problems.add(f'{pno + 1}쪽', f'가림 상자 안에 글자가 남았어요({len("".join(leftovers))}글자).')
        # 그림: 상자와 겹치는 모든 그림의 픽셀이 비었는지(그림 자료를 직접 읽는다)
        for info in page.get_image_info(xrefs=True):
            xref = info['xref']
            if not xref:
                continue
            regions = [region for rect in rects if (region := pixel_region(info, rect, margin))]
            if not regions:
                continue
            rgb, alpha = image_arrays(doc, xref)
            for x0, y0, x1, y1 in regions:
                block = rgb[y0:y1, x0:x1]
                if not block.size:
                    continue
                not_blank = block.min(axis=2) < blank_min
                if alpha is not None:
                    not_blank &= alpha[y0:y1, x0:x1] > 0  # 투명한 픽셀은 아무것도 그리지 않는다
                if not_blank.any():
                    problems.add(f'{pno + 1}쪽 그림 {info["width"]}×{info["height"]}', f'가림 상자 아래 픽셀 {int(not_blank.sum())}개가 비지 않았어요.')
                    break


def jpeg_segments(raw: bytes) -> list[tuple[int, bytes]]:
    segments = []
    index = 2
    while index + 4 <= len(raw) and raw[index] == 0xFF:
        marker = raw[index + 1]
        if marker == 0xDA:
            break
        length = int.from_bytes(raw[index + 2:index + 4], 'big')
        segments.append((marker, raw[index + 4:index + 4 + min(length - 2, 16)]))
        index += 2 + length
    return segments


def decode_pdf_strings(source: str) -> list[str]:
    """객체 사전 안의 PDF 글자((…)·<…>)를 풀어 UTF-16BE·PDFDocEncoding 글자로."""
    found = []
    for match in re.finditer(r'\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>', source):
        token = match.group(0)
        if token.startswith('<'):
            digits = re.sub(r'\s', '', token[1:-1])
            if len(digits) % 2:
                digits += '0'
            data = bytes.fromhex(digits)
        else:
            body = token[1:-1]
            data = re.sub(r'\\([()\\])', r'\1', body).encode('latin-1', 'replace')
        if data.startswith(b'\xfe\xff'):
            found.append(data[2:].decode('utf-16-be', 'replace'))
        elif data.startswith(b'\xef\xbb\xbf'):
            found.append(data[3:].decode('utf-8', 'replace'))
        else:
            found.append(data.decode('latin-1'))
    return found


def inspect_pdf(path: Path, doc_id: str, spec: dict, sources: dict, problems: Problems) -> None:
    doc = pymupdf.open(path)
    where = path.relative_to(ROOT).as_posix()
    if doc.page_count != total_pages(spec):
        problems.add(where, f'쪽 수 {doc.page_count}(원본 {spec["source"]["pages"]}쪽 + 덧붙인 쪽 {appended_pages(spec)}과 달라요).')
    # 정보 사전: Title만
    metadata = {key: value for key, value in (doc.metadata or {}).items() if value and key not in ('format', 'encryption')}
    if set(metadata) - {'title'} or metadata.get('title') != spec['title']:
        problems.add(where, f'정보 사전에 제목 말고 다른 값이 있어요({", ".join(sorted(metadata))}).')
    if doc.get_xml_metadata():
        problems.add(where, 'XMP 메타데이터가 남았어요.')
    if doc.embfile_count():
        problems.add(where, '첨부 파일이 있어요.')
    if doc.is_form_pdf:
        problems.add(where, '양식(AcroForm)이 있어요.')
    if doc.get_ocgs():
        problems.add(where, '숨은 층(OCG)이 있어요.')
    if doc.xref_get_key(-1, 'Encrypt')[0] != 'null':
        problems.add(where, '암호화돼 있어요.')
    for page in doc:
        if list(page.annots() or []) or page.get_links():
            problems.add(f'{where} {page.number + 1}쪽', '주석·링크가 남았어요.')
    texts: list[dict] = []
    content_streams: set[int] = set()
    for page in doc:
        texts.append({'where': f'{where} {page.number + 1}쪽 본문', 'text': page.get_text('text')})
        content_streams.update(page.get_contents())
    for xref in range(1, doc.xref_length()):
        try:
            source = doc.xref_object(xref, compressed=False)
        except Exception:  # 빈 칸
            continue
        if doc.xref_get_key(xref, 'Subtype')[1] == '/Form':
            content_streams.add(xref)
        for key in FORBIDDEN_KEYS:
            # 값이 null인 키는 PDF에서 없는 것과 같지만, 이름도 남지 않게 drop_null_keys가 지운다 — 남았으면 함께 알린다
            if re.search(re.escape(key) + r'(?![A-Za-z0-9])', source):
                problems.add(f'{where} 객체 {xref}', f'{key} 키가 남았어요.')
        strings = decode_pdf_strings(source)
        texts.append({'where': f'{where} 객체 {xref}', 'text': source + '\n' + '\n'.join(strings)})
        if doc.xref_is_stream(xref):
            subtype = doc.xref_get_key(xref, 'Subtype')[1]
            is_font_file = any(doc.xref_get_key(xref, key)[0] != 'null' for key in ('Length1', 'Length2', 'Length3')) or subtype in (
                '/Type1C', '/CIDFontType0C', '/OpenType')
            if subtype == '/Image':
                if is_dct(doc, xref):
                    raw = doc.xref_stream_raw(xref)
                    extra = [f'APP{marker - 0xE0}' if 0xE0 <= marker <= 0xEF else hex(marker)
                             for marker, head in jpeg_segments(raw) if (0xE1 <= marker <= 0xEF) or marker == 0xFE]
                    if extra:
                        problems.add(f'{where} 그림 {xref}', f'JPEG 안에 메타데이터 조각이 있어요({", ".join(extra)}).')
                continue
            if is_font_file:
                continue
            try:
                data = doc.xref_stream(xref) or b''
            except Exception:
                data = doc.xref_stream_raw(xref) or b''
            for pattern in FORBIDDEN_STREAM_KEYS:
                if re.search(pattern, data):
                    problems.add(f'{where} 흐름 {xref}', f'{pattern.decode()} 속성이 남았어요(표시 내용 안 대체 글).')
            if xref in content_streams:
                # 쪽 내용 흐름은 그리기 명령과 좌표 숫자뿐이다(글자는 글꼴 번호로 들어 있어 쪽 본문 글자로 따로 검사한다).
                # 좌표 숫자가 전화번호 모양으로 잘못 걸리므로 모양 검사에서는 빼고, 대체 글 속성만 위에서 본다.
                continue
            texts.append({'where': f'{where} 흐름 {xref}', 'text': data.decode('latin-1')})
    doc.close()
    scan = run_node(NODE_PRIVACY_SCAN, stdin=json.dumps({'texts': texts, 'files': [{'where': where, 'path': str(path)}]}))
    for error in scan['errors']:
        problems.add('저장소 검사 규칙', f'{error["file"]}: {error["message"]}')
    if scan['needles'] == 0:
        problems.note(where, 'scripts/privacy-needles.json에 비공개 이름이 없어 이름 검사는 건너뛰었어요.')
    source_names = {Path(sources[spec['source']['id']]['file']).name.lower(), Path(sources[spec['source']['id']]['file']).stem.lower()}
    for finding in scan['findings']:
        kind, place, detail = finding['kind'], finding['where'], finding['detail']
        if kind == 'original-name' and '쪽 본문' in place and detail.lower() not in source_names:
            problems.note(place, f'쪽에 보이는 수업 자료 이름 "{detail}"(개인정보 아님 — 원본 슬라이드 본문 그대로)')
        elif kind in ('original-name', 'original-name-bytes'):
            problems.add(place, f'원본 파일 이름이 들어 있어요("{detail}").')
        else:
            problems.add(place, detail)


def check_reviews(doc_id: str, spec: dict, actual_sha: str, problems: Problems) -> None:
    where = f'{doc_id} 눈 확인 기록'
    recorded = str((spec.get('output') or {}).get('sha256') or '')
    if recorded != actual_sha:
        problems.add(where, f'output.sha256({recorded or "없음"})이 지금 편집본({actual_sha})과 달라요 — 쪽 그림을 다시 보고 기록을 고쳐요.')
    pages = total_pages(spec)  # 덧붙인 출처·라이선스 쪽도 눈 확인 기록이 있어야 한다
    seen: dict[int, dict] = {}
    for entry in spec.get('review') or []:
        page = entry.get('page')
        if not isinstance(page, int) or not 1 <= page <= pages:
            problems.add(where, f'page {page!r}가 1~{pages} 밖이에요.')
            continue
        if page in seen:
            problems.add(where, f'{page}쪽 기록이 두 번 있어요.')
        seen[page] = entry
        if not str(entry.get('by') or '').strip():
            problems.add(where, f'{page}쪽: by(확인한 사람)가 없어요.')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(entry.get('date') or '')):
            problems.add(where, f'{page}쪽: date는 YYYY-MM-DD예요.')
        if not str(entry.get('result') or '').startswith('통과'):
            problems.add(where, f'{page}쪽: result는 "통과"로 시작해요(통과가 아니면 가릴 곳을 고쳐 다시 만들어요).')
    missing = [str(page) for page in range(1, pages + 1) if page not in seen]
    if missing:
        problems.add(where, f'기록이 없는 쪽 {len(missing)}개: {", ".join(missing[:20])}{" …" if len(missing) > 20 else ""}')


# ── 명령 ──────────────────────────────────────────────────────────────────


def build(doc_id: str, spec: dict, sources: dict, materials: Path, fresh_export: bool) -> bool:
    problems = Problems()
    validate_plan(doc_id, spec, problems)
    if problems.items:
        return problems.report(f'{doc_id} 기록')
    doc, source_sha = open_source(doc_id, spec, sources, materials, fresh_export)
    placements = photo_placements(doc)
    count = apply_redactions(doc, spec)
    log(f'{doc_id}: 가림 상자 {count}개 적용(글자 지움·그림 픽셀 비움·덮인 선 지움).')
    check_blank(doc, spec, problems, labels_drawn=False)
    if problems.items:
        return problems.report(f'{doc_id} 가림 직후')
    font = label_font()
    skipped = draw_labels(doc, spec, font)
    for item in skipped:
        log(f'참고: {doc_id} {item} — 상자가 작아 라벨을 적지 않았어요(회색 상자만).')
    draw_notice(doc, spec, font)
    credits_page = add_credits_page(doc, spec, font, bold_font()) if spec.get('credits_page') else None
    if credits_page:
        log(f'{doc_id}: {credits_page}쪽에 출처·라이선스 쪽을 덧붙였어요(원본 1~{spec["source"]["pages"]}쪽은 그대로).')
    photos = spec.get('photos') or {}
    before, after = reencode_photos(doc, placements, float(photos.get('max_dpi', 150)), int(photos.get('quality', 80)))
    log(f'{doc_id}: 사진 다시 인코딩 {before / 1e6:.2f}MB → {after / 1e6:.2f}MB(JPEG 안 EXIF 조각 없음).')
    scrub_document(doc, spec)
    out = ROOT / spec['output']['path']
    # 파일 식별자(/ID)의 씨앗: 편집본 모양을 정하는 칸들. 출처·라이선스 쪽이 없는 기록은 전과 같은 씨앗이 나온다(같은 바이트).
    plan_keys = ('title', 'lang', 'notice', 'outline', 'photos', 'redactions') + (('credits_page',) if spec.get('credits_page') else ())
    plan_text = json.dumps({key: spec.get(key) for key in plan_keys}, sort_keys=True, ensure_ascii=False)
    save_deterministic(doc, out, f'{source_sha}\n{plan_text}')
    actual_sha = sha256_file(out)
    size = out.stat().st_size
    log(f'{doc_id}: {out.relative_to(ROOT).as_posix()} — {size:,}바이트({size / 1024 / 1024:.2f}MB), SHA-256 {actual_sha}')
    if size > 5 * 1024 * 1024:
        problems.add(out.relative_to(ROOT).as_posix(), f'5MB를 넘어요({size / 1024 / 1024:.2f}MB) — photos.max_dpi·quality를 낮추거나 저장소 검사 large_files에 적어요.')
    verify = pymupdf.open(out)
    check_blank(verify, spec, problems, labels_drawn=True)
    verify.close()
    inspect_pdf(out, doc_id, spec, sources, problems)
    ok = problems.report(f'{doc_id} 편집본')
    recorded = str((spec.get('output') or {}).get('sha256') or '')
    if recorded != actual_sha:
        log(f'참고: {doc_id} scripts/handout-redactions.yaml의 output.sha256({recorded or "없음"})과 달라요 — preview로 쪽마다 다시 보고 '
            f'output.sha256·bytes와 review를 고쳐요.')
    return ok


def check(doc_id: str, spec: dict, sources: dict) -> bool:
    problems = Problems()
    validate_plan(doc_id, spec, problems)
    out = ROOT / spec['output']['path']
    if not out.exists():
        problems.add(spec['output']['path'], '편집본 파일이 없어요(build를 먼저 해요).')
        return problems.report(f'{doc_id} 편집본')
    actual_sha = sha256_file(out)
    size = out.stat().st_size
    recorded_bytes = (spec.get('output') or {}).get('bytes')
    if recorded_bytes is not None and int(recorded_bytes) != size:
        problems.add(spec['output']['path'], f'크기 {size:,}바이트가 기록({int(recorded_bytes):,})과 달라요.')
    doc = pymupdf.open(out)
    check_blank(doc, spec, problems, labels_drawn=True)
    doc.close()
    inspect_pdf(out, doc_id, spec, sources, problems)
    check_reviews(doc_id, spec, actual_sha, problems)
    log(f'{doc_id}: {spec["output"]["path"]} {size:,}바이트, SHA-256 {actual_sha}')
    return problems.report(f'{doc_id} 편집본')


def preview(doc_id: str, spec: dict, zoom: float, pdf: Path | None) -> None:
    path = pdf or (ROOT / spec['output']['path'])
    doc = pymupdf.open(path)
    target = CACHE_DIR / doc_id
    target.mkdir(parents=True, exist_ok=True)
    for page in doc:
        page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(target / f'p{page.number + 1:02d}.png')
    log(f'{doc_id}: {doc.page_count}쪽 그림 → {target.relative_to(ROOT).as_posix()}/')


def compare(doc_id: str, spec: dict, baseline: Path, zoom: float) -> bool:
    """원본 쪽(1~source.pages)을 옛 편집본과 같은 배율로 그려 픽셀·쪽 글자가 같은지 대조한다(덧붙인 쪽만 바뀌었는지)."""
    current_path = ROOT / spec['output']['path']
    old_path = baseline / Path(spec['output']['path']).name
    if not old_path.exists():
        log(f'{doc_id}: 옛 편집본 {old_path}이(가) 없어요.')
        return False
    current = pymupdf.open(current_path)
    old = pymupdf.open(old_path)
    pages = int(spec['source']['pages'])
    if current.page_count < pages or old.page_count < pages:
        log(f'{doc_id}: 쪽 수가 모자라요(지금 {current.page_count}쪽, 옛 편집본 {old.page_count}쪽, 원본 {pages}쪽).')
        return False
    matrix = pymupdf.Matrix(zoom, zoom)
    differ: list[str] = []
    for pno in range(pages):
        new_pix = current[pno].get_pixmap(matrix=matrix, alpha=False)
        old_pix = old[pno].get_pixmap(matrix=matrix, alpha=False)
        same_pixels = (new_pix.width, new_pix.height) == (old_pix.width, old_pix.height) and new_pix.samples == old_pix.samples
        same_text = current[pno].get_text('text') == old[pno].get_text('text')
        if not (same_pixels and same_text):
            differ.append(f'{pno + 1}쪽({"픽셀" if not same_pixels else ""}{"·" if not same_pixels and not same_text else ""}{"글자" if not same_text else ""})')
    extra = current.page_count - pages
    current.close()
    old.close()
    if differ:
        log(f'{doc_id}: 원본 {pages}쪽 가운데 {len(differ)}쪽이 옛 편집본과 달라요 — {", ".join(differ[:20])}. 그 쪽들은 눈 확인을 다시 해요.')
        return False
    log(f'{doc_id}: 원본 1~{pages}쪽 모두 옛 편집본과 픽셀·쪽 글자가 같아요(배율 {zoom}). 덧붙인 쪽 {extra}장만 새로 보면 돼요.')
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description='가린 편집본 교안 PDF 만들기·검사(PD-31)')
    parser.add_argument('command', choices=('build', 'check', 'preview', 'compare'))
    parser.add_argument('docs', nargs='*', help='bt, ppt(비우면 모두)')
    parser.add_argument('--materials', help='원본 폴더(기본: 저장소 뿌리)')
    parser.add_argument('--fresh-export', action='store_true', help='PPTX를 PowerPoint로 다시 PDF로 바꾼다(편집본 바이트가 달라져 눈 확인을 다시 해야 해요)')
    parser.add_argument('--zoom', type=float, default=1.0, help='preview·compare 배율(1.0 = 1440×810 픽셀)')
    parser.add_argument('--pdf', help='preview할 다른 PDF(기본: 편집본)')
    parser.add_argument('--baseline', help='compare: 옛 편집본 PDF들이 있는 폴더(파일 이름은 output.path와 같게)')
    args = parser.parse_args()
    if args.command == 'compare' and not args.baseline:
        parser.error('compare에는 --baseline <옛 편집본 폴더>가 필요해요.')
    documents, sources = load_plan()
    wanted = args.docs or list(documents)
    unknown = [doc_id for doc_id in wanted if doc_id not in documents]
    if unknown:
        sys.exit(f'[편집본] 모르는 문서: {", ".join(unknown)} (있는 것: {", ".join(documents)})')
    materials = Path(args.materials).resolve() if args.materials else ROOT
    ok = True
    for doc_id in wanted:
        spec = documents[doc_id]
        if args.command == 'build':
            ok = build(doc_id, spec, sources, materials, args.fresh_export) and ok
        elif args.command == 'check':
            ok = check(doc_id, spec, sources) and ok
        elif args.command == 'compare':
            ok = compare(doc_id, spec, Path(args.baseline).resolve(), args.zoom) and ok
        else:
            preview(doc_id, spec, args.zoom, Path(args.pdf) if args.pdf else None)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
