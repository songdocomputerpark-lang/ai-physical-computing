// 원고 이미지 추출 도구를 실제로 돌려 보는 검사(PLAN §8.5 P5-01) — 파이썬 3 + PyMuPDF·Pillow·numpy가 있을 때만 돈다(CI는 건너뜀).
// 원본 PDF 대신 코드로 만든 가짜 원고(같은 쪽 크기·같은 파일 경로)를 임시 폴더에 두고 도구(scripts/extract-lesson-images.mjs)를 돌린다.
// 확인하는 것: 목록에 적은 그림만 나온다 / 원본 JPEG에 넣어 둔 EXIF·XMP가 결과에 없다 / 제외 쪽(U1 013쪽, BT p5)은 목록에 적어도
// 나오지 않는다 / 같은 설정으로 다시 꺼내면 같은 바이트가 나와 눈 확인 기록이 남는다 / 쪽 미리 보기가 그려진다.
// 얼굴 검사는 Pyodide 휠 캐시가 필요해 여기서는 --skip-face-check로 끈다(얼굴 검사는 실제 원고로 따로 확인 — .cache/phase5-notes/core-p5-01.md).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { findImagePython } from '../../scripts/lib/lesson-images-extract.mjs';
import { SOURCES, inspectImageMetadata, parseImageManifest, sha256Hex } from '../../scripts/lib/lesson-images.mjs';
import { makeTempDir, removeDir, writeFiles } from './helpers/fixture.ts';

const CLI = fileURLToPath(new URL('../../scripts/extract-lesson-images.mjs', import.meta.url));
const python = findImagePython();

// 가짜 원고 만들기: U1 = 펼침면 1190.55×779.53pt 7쪽(PDF 5쪽 왼쪽 = 인쇄 14쪽에 메타데이터 든 JPEG와 도형, PDF 4쪽 오른쪽 = 13쪽에 그림),
// BT = 1440×810pt 6쪽(p5에 그림). 결과로 넣은 그림 번호(xref)와 원본 JPEG에 EXIF·XMP가 있었는지 알려 준다.
const MAKE_FIXTURE = [
  'import io, json, sys',
  'import pymupdf',
  'from PIL import Image',
  'u1_path, bt_path = sys.argv[1], sys.argv[2]',
  'exif = Image.Exif()',
  'exif[0x013B] = "fixture artist"',
  'exif[0x0110] = "fixture camera"',
  'image = Image.new("RGB", (160, 120), (40, 160, 90))',
  'for x in range(160):',
  '    image.putpixel((x, x % 120), (250, 250, 250))',
  'buffer = io.BytesIO()',
  'image.save(buffer, "JPEG", quality=90, exif=exif.tobytes(), xmp=b"<x:xmpmeta xmlns:x=\'adobe:ns:meta/\'>fixture path</x:xmpmeta>")',
  'jpeg = buffer.getvalue()',
  'doc = pymupdf.open()',
  'for _ in range(7):',
  '    doc.new_page(width=1190.55, height=779.53)',
  'page = doc[4]',
  'xref_left = page.insert_image(pymupdf.Rect(100, 100, 300, 250), stream=jpeg)',
  'page.draw_rect(pymupdf.Rect(350, 300, 500, 420), color=(0.9, 0.2, 0.2), fill=(1, 0.8, 0))',
  'xref_right = doc[3].insert_image(pymupdf.Rect(700, 100, 900, 250), stream=jpeg)',
  'doc.save(u1_path)',
  'bt = pymupdf.open()',
  'for _ in range(6):',
  '    bt.new_page(width=1440, height=810)',
  'bt[4].insert_image(pymupdf.Rect(100, 100, 400, 300), stream=jpeg)',
  'bt.save(bt_path)',
  'check = pymupdf.open(u1_path)',
  'raw = check.extract_image(xref_left)["image"]',
  'print(json.dumps({"xref_left": xref_left, "xref_right": xref_right, "source_has_exif": b"Exif" in raw, "source_has_xmp": b"xmpmeta" in raw}))',
].join('\n');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir);
});

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 180_000 });
}

describe.skipIf(!python)('원고 이미지 추출 도구(가짜 원고로 실제 실행)', () => {
  const root = makeTempDir('apc-images-root-');
  const materials = makeTempDir('apc-images-materials-');
  tempDirs.push(root, materials);
  const u1 = path.join(materials, ...SOURCES.U1.file.split('/'));
  const bt = path.join(materials, ...SOURCES.BT.file.split('/'));
  fs.mkdirSync(path.dirname(u1), { recursive: true });
  fs.mkdirSync(path.dirname(bt), { recursive: true });
  let fixture = { xref_left: 0, xref_right: 0, source_has_exif: false, source_has_xmp: false };
  const manifestPath = 'content/lessons/u1/t-001.images.yaml';
  const manifestFile = path.join(root, manifestPath);
  /** photo 항목(첫째)을 고친다 — 사람이 눈 확인 기록을 적거나 설정을 바꾸는 것처럼 */
  const editPhoto = (edit: (item: any, document: ReturnType<typeof parseDocument>) => void) => {
    const document = parseDocument(fs.readFileSync(manifestFile, 'utf8'));
    edit((document.get('images', true) as any).items[0], document);
    fs.writeFileSync(manifestFile, document.toString());
  };

  it(
    '목록에 적은 그림만 꺼내 메타데이터 없는 WebP로 쓰고, 제외 쪽은 목록에 적어도 꺼내지 않는다',
    () => {
      const made = spawnSync(python![0]!, [...python!.slice(1), '-X', 'utf8', '-c', MAKE_FIXTURE, u1, bt], { encoding: 'utf8' });
      expect(made.status, made.stderr).toBe(0);
      fixture = JSON.parse(made.stdout);
      expect(fixture.source_has_exif).toBe(true);
      expect(fixture.source_has_xmp).toBe(true);

      writeFiles(root, {
        'sources.yaml': fs.readFileSync('sources.yaml'),
        'scripts/image-exclusions.yaml': fs.readFileSync('scripts/image-exclusions.yaml'),
        [manifestPath]: [
          '# 시험용 목록',
          'images:',
          '  - name: photo',
          '    use: 시험',
          '    alt: 초록 바탕에 흰 대각선이 있는 시험 사진',
          `    from: { source: U1, page: 14, image: ${fixture.xref_left} }`,
          '  - name: shape',
          '    use: 시험',
          '    alt: 노란 네모 도형이 그려진 시험 그림',
          '    from: { source: U1, page: 14, region: [340, 290, 510, 430], dpi: 144 }',
          '  - name: face-page',
          '    use: 시험',
          '    alt: 제외 쪽에서 꺼내려는 시험 그림',
          `    from: { source: U1, page: 13, image: ${fixture.xref_right} }`,
          '  - name: face-page-region',
          '    use: 시험',
          '    alt: 제외 쪽에서 꺼내려는 시험 그림',
          '    from: { source: U1, page: 13, region: [100, 100, 310, 260] }',
          '  - name: promo',
          '    use: 시험',
          '    alt: 교안 홍보 쪽에서 꺼내려는 시험 그림',
          '    from: { source: BT, page: 5, region: [90, 90, 410, 310] }',
          '    privacy_override: 인물이 없는 부분만 잘라 꺼낸다고 적어도 안 되는 쪽',
          '',
        ].join('\n'),
      });
      const result = runCli(['t-001', '--root', root, '--materials', materials, '--skip-face-check']);
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stderr).toContain('face-page');
      expect(result.stderr).toContain('promo');
      expect(result.stderr).toContain('꺼내지 않는 쪽');

      const folder = path.join(root, 'public/images/lessons/t-001');
      expect(fs.readdirSync(folder).sort()).toEqual(['photo.webp', 'shape.webp']);
      const { manifest, errors } = parseImageManifest(fs.readFileSync(manifestFile, 'utf8'), manifestPath);
      expect(errors).toEqual([]);
      for (const name of ['photo', 'shape']) {
        const entry = manifest!.images.find((image) => image.name === name)!;
        const bytes = fs.readFileSync(path.join(root, entry.file!));
        const inspected = inspectImageMetadata(bytes);
        expect(inspected.problems, name).toEqual([]);
        expect(bytes.includes(Buffer.from('Exif')), name).toBe(false);
        expect(bytes.includes(Buffer.from('fixture')), name).toBe(false);
        expect(entry.sha256).toBe(sha256Hex(bytes));
        expect(entry.checks).toMatchObject({ faces: '검사 안 함' });
      }
      const photo = manifest!.images.find((image) => image.name === 'photo')!;
      expect(photo.file).toBe('public/images/lessons/t-001/photo.webp');
      expect(inspectImageMetadata(fs.readFileSync(path.join(root, photo.file!)))).toMatchObject({ width: 160, height: 120 });
      expect(manifest!.images.find((image) => image.name === 'face-page')!.file).toBeUndefined();
      expect(fs.readFileSync(manifestFile, 'utf8')).toContain('# 시험용 목록');
    },
    180_000,
  );

  it(
    '같은 설정으로 다시 꺼내면 같은 바이트가 나와 눈 확인 기록이 남고, 설정을 바꾸면 기록을 지운다',
    () => {
      editPhoto((item, document) => item.set('reviewed', document.createNode({ by: 'claude', date: '2026-09-25', result: '통과 — 시험 그림' })));
      const again = runCli(['t-001', '--only', 'photo', '--root', root, '--materials', materials, '--skip-face-check']);
      expect(again.status, again.stderr).toBe(0);
      let manifest = parseImageManifest(fs.readFileSync(manifestFile, 'utf8'), manifestPath).manifest!;
      expect(manifest.images.find((image) => image.name === 'photo')!.reviewed?.result).toContain('통과');

      editPhoto((item) => item.set('max_width', 160));
      editPhoto((item) => item.get('from', true).set('crop', [0, 0, 80, 60]));
      const changed = runCli(['t-001', '--only', 'photo', '--root', root, '--materials', materials, '--skip-face-check']);
      expect(changed.status, changed.stderr).toBe(0);
      expect(changed.stderr).toContain('눈 확인 기록(reviewed)을 지웠어요');
      manifest = parseImageManifest(fs.readFileSync(manifestFile, 'utf8'), manifestPath).manifest!;
      const photo = manifest.images.find((image) => image.name === 'photo')!;
      expect(photo.reviewed).toBeUndefined();
      expect(inspectImageMetadata(fs.readFileSync(path.join(root, photo.file!)))).toMatchObject({ width: 80, height: 60 });
    },
    180_000,
  );

  it(
    '원본에서 꺼내지 않은 그림(origin)은 고치지 않고 크기·sha256만 기록하고, 메타데이터가 남은 파일은 알린다',
    () => {
      const made = spawnSync(
        python![0]!,
        [
          ...python!.slice(1),
          '-X',
          'utf8',
          '-c',
          [
            'import sys',
            'from PIL import Image, PngImagePlugin',
            'Image.new("RGB", (40, 30), (10, 120, 200)).save(sys.argv[1], "PNG")',
            'info = PngImagePlugin.PngInfo()',
            'info.add_text("Comment", "fixture note")',
            'Image.new("RGB", (40, 30), (200, 120, 10)).save(sys.argv[2], "PNG", pnginfo=info)',
          ].join('\n'),
          path.join(root, 'public/images/lessons/t-001/own.png'),
          path.join(root, 'public/images/lessons/t-001/noted.png'),
        ],
        { encoding: 'utf8' },
      );
      expect(made.status, made.stderr).toBe(0);
      const document = parseDocument(fs.readFileSync(manifestFile, 'utf8'));
      const images = document.get('images', true) as any;
      images.add(document.createNode({ name: 'own', use: '시험', alt: '파란 네모만 있는 시험 그림', origin: '시험에서 코드로 만든 그림', file: 'public/images/lessons/t-001/own.png' }));
      images.add(document.createNode({ name: 'noted', use: '시험', alt: '주황 네모만 있는 시험 그림', origin: '시험에서 코드로 만든 그림', file: 'public/images/lessons/t-001/noted.png' }));
      fs.writeFileSync(manifestFile, document.toString());

      const result = runCli(['t-001', '--only', 'own,noted', '--root', root, '--materials', materials, '--skip-face-check']);
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stderr).toContain('noted');
      expect(result.stderr).toContain('PNG tEXt');
      const manifest = parseImageManifest(fs.readFileSync(manifestFile, 'utf8'), manifestPath).manifest!;
      const own = manifest.images.find((image) => image.name === 'own')!;
      const ownBytes = fs.readFileSync(path.join(root, own.file!));
      expect(own.sha256).toBe(sha256Hex(ownBytes));
      expect(manifest.images.find((image) => image.name === 'noted')!.sha256).toBeUndefined();
      // 손으로 넣은 파일은 도구가 지우지 않는다(고치는 것은 사람 몫)
      expect(fs.existsSync(path.join(root, 'public/images/lessons/t-001/noted.png'))).toBe(true);
    },
    180_000,
  );

  it(
    '쪽 미리 보기(--show)는 .cache/ 아래에만 그리고, 제외 쪽이면 알린다',
    () => {
      const shown = runCli(['--show', 'U1', '13', '--root', root, '--materials', materials]);
      expect(shown.status, shown.stderr).toBe(0);
      expect(shown.stdout).toContain('제외 쪽');
      expect(shown.stdout).toContain(`image ${fixture.xref_right}`);
      expect(fs.existsSync(path.join(root, '.cache/lesson-images/show/U1-013-excluded.png'))).toBe(true);
    },
    180_000,
  );
});
