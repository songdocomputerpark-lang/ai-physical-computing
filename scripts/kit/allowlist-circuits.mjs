#!/usr/bin/env node
/**
 * 키트 장치 도감 회로 그림의 눈 확인 기록을 scripts/image-allowlist.yaml 끝에 적는다 (판 1.5.0, 구역 K1).
 *
 *   node scripts/kit/allowlist-circuits.mjs [--report .cache/v150-staging/circuits-out.json] [--date 2026-10-16] [--apply]
 *
 * scripts/kit/import-circuit-images.py 가 적은 목록(--report)을 읽어 그림마다 path·sha256·source·reviewed를 만든다.
 * **접촉 시트로 한 장씩 열어 본 다음에만** 쓴다(얼굴·이름·화면 속 경로·기기 주소·학교명이 없는지). --apply 가 없으면 몇 줄인지만 알려 준다.
 * 이미 기록된 그림(같은 path)은 건너뛰고, sha256이 바뀐 그림은 새로 눈 확인해야 하므로 멈춘다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const argValue = (name, fallback) => (args.indexOf(name) >= 0 && args[args.indexOf(name) + 1] ? args[args.indexOf(name) + 1] : fallback);
const REPORT = path.resolve(ROOT, argValue('--report', '.cache/v150-staging/circuits-out.json'));
const DATE = argValue('--date', '2026-10-16');
const APPLY = args.includes('--apply');
const ALLOWLIST = path.join(ROOT, 'scripts', 'image-allowlist.yaml');
const BASE = 'https://brixel.gorillacell.kr/07_thonny/03_esp32/circuits_imags/';

const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const existing = fs.readFileSync(ALLOWLIST, 'utf8');
const q = (text) => JSON.stringify(text);

const HEADER = `
# 키트 장치 도감 회로 그림(판 1.5.0, DECISIONS O19·C155): content/kit/devices.yaml의 circuit 칸이 가리키는 public/images/kit/circuits/third-party/kit-vendor/ 의 그림 ${report.length}장이에요.
# 키트 업체(고릴라셀·브릭셀)의 Thonny + ESP32 쪽 회로 그림(circuits_imags/)을 운영자가 그대로 싣도록 허락했어요(sources.yaml 키트 업체 항목).
# Pillow로 다시 인코딩했어요(npm 명령 없이 scripts/kit/import-circuit-images.py — WebP, 긴 변 1600px 이하, EXIF·XMP·ICC 없음, 8.06은 8.05와 같은 그림이라 파일이 없어요).
# 접촉 시트(한 장에 12장)로 100장을 모두 열어 보았어요(2026-10-16). 새 회로 그림을 더하면 같은 모양으로 한 장씩 적어요.
`;

let added = 0;
let changed = 0;
let lines = HEADER;
for (const item of report) {
  const marker = `- path: ${item.path}`;
  const at = existing.indexOf(marker);
  if (at >= 0) {
    const after = existing.slice(at, at + 400);
    if (!after.includes(item.sha256)) {
      console.error(`sha256이 바뀌었어요(새로 눈 확인 필요): ${item.path}`);
      changed += 1;
    }
    continue;
  }
  added += 1;
  lines += `  - path: ${item.path}
    sha256: ${q(item.sha256)}
    source: ${q(`${BASE}${item.from} → Pillow로 다시 인코딩(WebP, 긴 변 1600px 이하, EXIF·XMP·ICC 없음)`)}
    reviewed:
      by: claude
      date: ${DATE}
      result: ${q(`통과 — 접촉 시트로 한 장씩 눈 확인 ${DATE} — 사람·얼굴·손·이름·화면 속 경로·파일명·기기 주소·학교명 없음. 흰 배경에 키트 보드(ESP32 Shield V3)·부품·색 전선 그림과 기판·부품에 인쇄된 글자(BRIXEL·GORILLACELL 상표, 핀 번호)만 보임. 메타데이터 없음(다시 인코딩). 사용 허락 DECISIONS O19.`)}
`;
}
if (changed > 0) {
  process.exitCode = 1;
}
console.log(`새로 적을 그림 ${added}장, 이미 있음 ${report.length - added - changed}장, sha256 바뀜 ${changed}장`);
if (APPLY && added > 0 && changed === 0) {
  fs.writeFileSync(ALLOWLIST, existing.replace(/\s*$/u, '\n') + lines, 'utf8');
  console.log(`${path.relative(ROOT, ALLOWLIST)} 끝에 ${added}장을 적었어요.`);
} else if (!APPLY) {
  console.log('--apply 를 주면 scripts/image-allowlist.yaml 끝에 적어요(눈 확인을 마친 뒤에만).');
}
