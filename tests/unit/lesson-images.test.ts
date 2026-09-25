// 원고 이미지 목록(차시마다 따로인 허용 목록 + 눈 확인 기록)의 규칙 검사(PLAN §8.5 P5-01, §9.3, PD-18·PD-32).
// 원본 PDF 없이 도는 검사만 여기 둔다. 원본에서 실제로 꺼내는 흐름은 lesson-images-extract.test.ts(파이썬·PyMuPDF가 있을 때만).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeManifestFields } from '../../scripts/lib/lesson-images-extract.mjs';
import {
  SOURCES,
  checkExclusionPolicy,
  checkSourcesLink,
  collectImageRecords,
  exclusionFor,
  inspectImageMetadata,
  listManifestFiles,
  locatePage,
  outputPathFor,
  parseExclusions,
  parseImageManifest,
  printedPageAt,
  readImageRecords,
  rightsProblem,
  sha256Hex,
  validateLessonImages,
} from '../../scripts/lib/lesson-images.mjs';
import { parseRegistry } from '../../scripts/lib/sources-registry.mjs';

const realExclusions = parseExclusions(fs.readFileSync('scripts/image-exclusions.yaml', 'utf8'));

// ── 작은 그림 파일 만들기(메타데이터 검사용) ──
function riffChunk(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'latin1');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
function webp(...chunks: Buffer[]): Buffer {
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
/** 64×32 손실 WebP 프레임 머리(글자 조각 3 + 시작 부호 3 + 너비·높이) */
const VP8 = riffChunk('VP8 ', Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x00, 0x20, 0x00]));
function vp8x(flags: number): Buffer {
  const payload = Buffer.alloc(10);
  payload[0] = flags;
  payload.writeUIntLE(63, 4, 3);
  payload.writeUIntLE(31, 7, 3);
  return riffChunk('VP8X', payload);
}
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}
function png(...chunks: Buffer[]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(20, 0);
  ihdr.writeUInt32BE(10, 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...chunks,
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
const JPEG_SOF = jpegSegment(0xc0, Buffer.from([8, 0, 24, 0, 48, 1, 1, 0x11, 0]));
function jpeg(...segments: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments, JPEG_SOF, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
}

describe('원본 쪽 찾기(locatePage)', () => {
  it('교과서 인쇄 쪽을 펼침면의 왼쪽·오른쪽으로 찾는다(INVENTORY 표기 약속의 식)', () => {
    expect(locatePage('U1', 8)).toMatchObject({ pdfPage: 2, side: 'left' });
    expect(locatePage('U1', 14)).toMatchObject({ pdfPage: 5, side: 'left' });
    expect(locatePage('U1', 15)).toMatchObject({ pdfPage: 5, side: 'right' });
    expect(locatePage('U1', 113)).toMatchObject({ pdfPage: 24, side: 'right' });
    expect(locatePage('U1', 294)).toMatchObject({ pdfPage: 25, side: 'full' });
    expect(locatePage('U2A', 141)).toMatchObject({ pdfPage: 14, side: 'right' });
    expect(locatePage('U2C', 166)).toMatchObject({ pdfPage: 1, side: 'left' });
    expect(locatePage('U2B', 166)).toMatchObject({ pdfPage: 7, side: 'left' });
    expect(locatePage('U3', 209)).toMatchObject({ pdfPage: 14, side: 'right' });
  });

  it('원고가 없는 쪽·범위 밖 쪽은 찾지 않는다', () => {
    expect(locatePage('U1', 52)).toBeNull();
    expect(locatePage('U1', 14.5)).toBeNull();
    expect(locatePage('BT', 0)).toBeNull();
    expect(locatePage('BT', 92)).toBeNull();
    expect(locatePage('PPT', 24)).toBeNull();
    expect(locatePage('X', 1)).toBeNull();
    expect(locatePage('BT', 5)).toMatchObject({ pdfPage: 5, side: 'full', size: [1440, 810] });
  });

  it('PDF 쪽 안의 자리로 인쇄 쪽을 알아낸다(그림 번호가 놓인 쪽 확인)', () => {
    expect(printedPageAt('U1', 5, 100)).toBe(14);
    expect(printedPageAt('U1', 5, 900)).toBe(15);
    expect(printedPageAt('U1', 25, 100)).toBe(294);
    expect(printedPageAt('BT', 7, 900)).toBe(7);
  });

  it('원본 약칭은 INVENTORY 표기 약속의 일곱 가지다', () => {
    expect(Object.keys(SOURCES)).toEqual(['U1', 'U2A', 'U2B', 'U2C', 'U3', 'BT', 'PPT']);
  });
});

describe('제외 쪽(scripts/image-exclusions.yaml)', () => {
  it('파일이 형식에 맞다', () => {
    expect(realExclusions.errors).toEqual([]);
  });

  // PLAN §9.3 2번과 INVENTORY §6의 목록. 이 파일에서 줄을 빼려면 운영자 답(할 일 4·7번)이 있어야 하고, 그때 이 표도 함께 고친다.
  // 2026-09-25 운영자 답으로 뺀 것: 할 일 4번(본인 얼굴) U1 29·34·35·37·40, U3 194·200·202·204·206, BT 9·84·91 / 할 일 7번(학교명 공개) BT 1.
  const BASELINE: [string, number[], string][] = [
    ['U1', [13, 15, 16, 33], 'face'],
    ['BT', [5], 'face'],
    ['BT', [6, 51, 58, 72, 74, 75, 91], 'path'],
    ['U2B', [156], 'path'],
    ['U3', [197, 198], 'device-address'],
    ['BT', [72, 75, 76, 80, 84], 'device-address'], // p84: 편집본을 만들며 찾은 셸 속 주소(2026-09-25 Phase 5 통합에서 더함)
    ['BT', [71, 73, 79, 82, 86, 89], 'classroom'],
    ['U1', [21], 'content'],
  ];
  it.each(BASELINE)('%s %j 쪽은 %s 때문에 제외 쪽이다', (source, pages, kind) => {
    for (const page of pages) {
      const exclusion = exclusionFor(realExclusions.rules, source, page);
      expect(exclusion, `${source} ${page}`).not.toBeNull();
      expect(exclusion?.kinds, `${source} ${page}`).toContain(kind);
    }
  });

  it('BT p5(홍보 이미지 속 인물)·학급 게시물은 어떤 경우에도 꺼내지 않는다(never)', () => {
    for (const page of [5, 71, 89]) {
      expect(exclusionFor(realExclusions.rules, 'BT', page)?.override).toBe('never');
    }
    expect(exclusionFor(realExclusions.rules, 'U1', 21)?.override).toBe('never');
  });

  it('한 쪽이 여러 항목에 걸리면 합친다 — 얼굴이 하나라도 있으면 엄격 얼굴 검사', () => {
    // 실제 목록: BT p72는 경로 + 기기 주소(얼굴 없음)
    const p72 = exclusionFor(realExclusions.rules, 'BT', 72);
    expect(p72).toMatchObject({ override: 'region', strictFaces: false });
    expect(p72?.kinds.sort()).toEqual(['device-address', 'path']);
    // 운영자가 본인 얼굴이라고 답한 쪽은 얼굴 항목이 빠지고 경로만 남는다(할 일 4번, 2026-09-25)
    const p91 = exclusionFor(realExclusions.rules, 'BT', 91);
    expect(p91).toMatchObject({ override: 'region', strictFaces: false });
    expect(p91?.kinds).toEqual(['path']);
    expect(exclusionFor(realExclusions.rules, 'U1', 14)).toBeNull();
    expect(exclusionFor(realExclusions.rules, 'U1', 29)).toBeNull();
    // 얼굴 + 다른 항목이 한 쪽에 겹치면 엄격 얼굴 검사가 켜진다(합치기 규칙 자체)
    const { rules } = parseExclusions(
      [
        'exclusions:',
        '  - { source: U3, pages: [300], kind: face, override: region, reason: 까닭 }',
        '  - { source: U3, pages: [300], kind: path, override: region, reason: 까닭 }',
      ].join('\n'),
    );
    const merged = exclusionFor(rules, 'U3', 300);
    expect(merged).toMatchObject({ override: 'region', strictFaces: true });
    expect(merged?.kinds.sort()).toEqual(['face', 'path']);
  });

  it('형식이 틀린 항목을 알린다', () => {
    const { errors } = parseExclusions(
      [
        'exclusions:',
        '  - { source: U9, pages: [1], kind: face, override: region, reason: 까닭 }',
        '  - { source: U1, pages: [], kind: face, override: region, reason: 까닭 }',
        '  - { source: U1, pages: [3], kind: hair, override: region, reason: 까닭 }',
        '  - { source: U1, pages: [3], kind: face, override: maybe, reason: 까닭 }',
        '  - { source: U1, pages: [3], kind: face, override: never }',
      ].join('\n'),
    );
    expect(errors).toHaveLength(5);
  });
});

const GOOD_MANIFEST = `# 설명 주석
images:
  - name: cnn-stages
    use: 1-1-2 핵심 개념 그림
    alt: 고양이 그림이 단계별로 분석되는 CNN 그림
    from:
      source: U1
      page: 14
      region: [62, 476, 528, 712]
    third_party: example-author
  - name: feature-zebra
    use: 1-1-2 학습 활동 사진
    alt: 풀밭에 서 있는 얼룩말 사진
    from: { source: U1, page: 18, image: 697 }
  - name: opener
    use: 장식 그림
    decorative: true
    alt: ""
    from: { source: U1, page: 8, region: [0, 560, 336, 779], dpi: 150 }
    max_width: 800
    quality: 80
  - name: board-shot
    use: 사이트 실습실 화면
    alt: 가상 보드의 내장 LED가 켜진 화면
    origin: 사이트 ESP32 실습실 화면 찍기
    file: public/images/lessons/1-1-2/board-shot.webp
`;

describe('차시 그림 목록(parseImageManifest)', () => {
  it('맞게 적은 목록을 읽는다 — 결과 폴더는 차시 파일 이름', () => {
    const { manifest, errors } = parseImageManifest(GOOD_MANIFEST, 'content/lessons/u1/1-1-2.images.yaml');
    expect(errors).toEqual([]);
    expect(manifest?.folder).toBe('1-1-2');
    expect(manifest?.images.map((entry) => entry.name)).toEqual(['cnn-stages', 'feature-zebra', 'opener', 'board-shot']);
    const [cnn, zebra, opener] = manifest?.images ?? [];
    expect(cnn?.from).toMatchObject({ source: 'U1', page: 14, region: [62, 476, 528, 712], dpi: 220 });
    expect(cnn?.thirdParty).toBe('example-author');
    expect(zebra?.from).toMatchObject({ image: 697 });
    expect(opener).toMatchObject({ decorative: true, alt: '', maxWidth: 800, quality: 80 });
    expect(outputPathFor('1-1-2', cnn!)).toBe('public/images/lessons/1-1-2/third-party/example-author/cnn-stages.webp');
    // 출판 편집 삽화·컷은 운영자 결정 O10(2026-09-25)으로 운영자 자료 — third_party: publisher는 적지 않는다
    const publisherKey = parseImageManifest(GOOD_MANIFEST.replace('third_party: example-author', 'third_party: publisher'), 'content/lessons/u1/1-1-2.images.yaml');
    expect(publisherKey.errors.join('\n')).toContain('O10');
    expect(outputPathFor('1-1-2', zebra!)).toBe('public/images/lessons/1-1-2/feature-zebra.webp');
  });

  it('단원마다 이름이 같은 차시(review)는 folder: <단원 폴더>-<차시>만 된다', () => {
    const ok = parseImageManifest('folder: u1-review\nimages: []\n', 'content/lessons/u1/review.images.yaml');
    expect(ok.errors).toEqual([]);
    expect(ok.manifest?.folder).toBe('u1-review');
    const bad = parseImageManifest('folder: 1-1-2\nimages: []\n', 'content/lessons/u1/review.images.yaml');
    expect(bad.errors.join('\n')).toContain('folder');
  });

  it('칸이 틀리면 한국어로 알린다', () => {
    const cases: [string, string][] = [
      ['  - { name: Bad_Name, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, region: [0, 0, 10, 10] } }', 'name'],
      ['  - { name: a, use: 쓰는 곳, from: { source: U1, page: 14, region: [0, 0, 10, 10] } }', 'alt'],
      ['  - { name: a, use: 쓰는 곳, alt: 설명, decorative: true, from: { source: U1, page: 14, region: [0, 0, 10, 10] } }', '장식'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요 }', 'from'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, region: [0, 0, 700, 10] } }', '쪽 크기'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, region: [0, 0, 10, 10], image: 5 } }', 'region'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 52, image: 5 } }', '52쪽'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: PPT, page: 3, image: 5 } }', 'picture'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, image: 5 }, colour: red }', '모르는 칸'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, origin: 사이트가 그린 도해, file: public/images/lessons/1-1-2/a.svg }', '래스터 그림'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, image: 5 }, third_party: Stock Co }', 'third_party'],
      ['  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, image: 5 }, reviewed: { by: claude, date: 2026-09-25, result: 문제 있음 } }', '통과'],
    ];
    for (const [line, expected] of cases) {
      const { errors } = parseImageManifest(`images:\n${line}\n`, 'content/lessons/u1/1-1-2.images.yaml');
      expect(errors.join('\n'), line).toContain(expected);
    }
    const duplicate = parseImageManifest(
      'images:\n  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, image: 5 } }\n  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: { source: U1, page: 14, image: 6 } }\n',
      'content/lessons/u1/1-1-2.images.yaml',
    );
    expect(duplicate.errors.join('\n')).toContain('앞 항목과 같아요');
    expect(parseImageManifest('images: []\n', 'content/lessons/u1/1_1_2.images.yaml').errors[0]).toContain('파일 위치·이름');
  });
});

describe('제외 쪽 규칙을 목록에 비추기(checkExclusionPolicy)', () => {
  const entry = (from: Record<string, unknown>, extra = '') =>
    parseImageManifest(
      `images:\n  - { name: a, use: 쓰는 곳, alt: 여덟 글자 넘는 설명이에요, from: ${JSON.stringify(from)}${extra} }\n`,
      'content/lessons/u1/1-1-2.images.yaml',
    ).manifest!.images[0]!;

  it('제외 쪽이 아니면 통과', () => {
    expect(checkExclusionPolicy(entry({ source: 'U1', page: 18, image: 697 }), realExclusions.rules)).toEqual({ problem: null, exclusion: null });
  });

  it('제외 쪽은 목록에 적어도 막는다 — 그림 번호로도, privacy_override 없는 영역으로도', () => {
    expect(checkExclusionPolicy(entry({ source: 'U1', page: 13, image: 573 }), realExclusions.rules).problem).toContain('region');
    expect(checkExclusionPolicy(entry({ source: 'U1', page: 13, region: [0, 0, 100, 100] }), realExclusions.rules).problem).toContain('privacy_override');
  });

  it('BT p5는 privacy_override가 있어도 막는다', () => {
    const override = ', privacy_override: "인물이 없는 부분만 잘라 꺼냈다고 적어도 안 돼요"';
    expect(checkExclusionPolicy(entry({ source: 'BT', page: 5, region: [0, 0, 100, 100] }, override), realExclusions.rules).problem).toContain('꺼내지 않는 쪽');
  });

  it('region + privacy_override면 꺼내되, 얼굴 쪽은 엄격 얼굴 검사를 표시한다', () => {
    const result = checkExclusionPolicy(
      entry({ source: 'U1', page: 16, region: [116, 595, 201, 683] }, ', privacy_override: "윗부분 얼굴 사진 카드를 빼고 손 선 그림만 잘라 냄"'),
      realExclusions.rules,
    );
    expect(result.problem).toBeNull();
    expect(result.exclusion?.strictFaces).toBe(true);
  });
});

describe('sources.yaml과 잇기(checkSourcesLink)·권리 표기(rightsProblem)', () => {
  const registry = parseRegistry(`sources:
  - name: 원고
    category: operator
    author: 박상진·김석전
    license: 운영자 자체 자료
    used_in: 차시 그림
    paths: [public/images/lessons/**]
    exclude_paths: [public/images/lessons/**/third-party/**, public/images/lessons/supplement/**]
  - name: 제3자 그림
    category: third_party
    author: 다른 저작자
    license: 원 권리자 보유
    used_in: 그림
    rights: 권리 문구
    paths: [public/images/lessons/*/third-party/example-author/**]
    fetched: 2026-09-25
  - name: 사이트 그림
    category: self
    author: 박상진·김석전
    license: CC BY-NC-SA 4.0
    used_in: 그림
    paths: [public/images/lessons/supplement/**]
`);

  it('원고 그림은 운영자 항목, 제3자 그림은 그 키 폴더를 덮는 third_party 항목에 이어져야 한다', () => {
    expect(registry.errors).toEqual([]);
    expect(checkSourcesLink('public/images/lessons/1-1-2/feature-zebra.webp', registry.entries)).toBeNull();
    expect(checkSourcesLink('public/images/lessons/1-1-2/third-party/example-author/cnn.webp', registry.entries)).toBeNull();
    const missing = checkSourcesLink('public/images/lessons/2-2-1/third-party/firuz-mukhtarov/clock.webp', registry.entries);
    expect(missing).toContain('category: third_party');
    expect(missing).toContain('public/images/lessons/*/third-party/firuz-mukhtarov/**');
    expect(checkSourcesLink('public/images/lessons/supplement/a.webp', registry.entries)).toContain('operator');
  });

  it('출판 편집 삽화는 운영자 자료(O10)라 제3자로 세지 않고, 스톡 그림은 결정 C11대로 쓰지 않는다', () => {
    const publisher = { id: 'placed MC0', publisher: true, info: { title: '인피컴_고1-1-1-05(삽)' } };
    const stock = { id: 'image 696', publisher: false, info: { creator: 'Visual Generation Inc.', rights: 'Copyright' } };
    const operator = { id: 'image 9', publisher: false, info: { creator: 'seok jeon kim' } };
    expect(rightsProblem([], undefined)).toBeNull();
    expect(rightsProblem([publisher], undefined)).toBeNull();
    // 스톡(출판사가 아닌 권리자)은 third_party를 적어도 쓰지 않는다(C11)
    expect(rightsProblem([stock], undefined)).toContain('C11');
    expect(rightsProblem([stock], 'visual-generation')).toContain('C11');
    expect(rightsProblem([publisher, stock], 'publisher')).toContain('C11');
    // 제작자가 운영자 자신이면 제3자가 아니다
    expect(rightsProblem([operator], undefined)).toBeNull();
    expect(rightsProblem([{ ...operator, info: { creator: 'Seok Jeon Kim', rights: 'Other Agency' } }], undefined)).toContain('C11');
  });
});

describe('그림 파일의 메타데이터(inspectImageMetadata)', () => {
  it('WebP의 EXIF·XMP·ICC 조각과 VP8X 표시를 찾고, 깨끗한 파일의 크기를 읽는다', () => {
    expect(inspectImageMetadata(webp(VP8))).toEqual({ format: 'webp', width: 64, height: 32, problems: [] });
    expect(inspectImageMetadata(webp(vp8x(0x08), VP8, riffChunk('EXIF', Buffer.from('Exif..')))).problems).toEqual([
      'WebP VP8X에 EXIF 표시',
      'WebP EXIF 조각',
    ]);
    expect(inspectImageMetadata(webp(vp8x(0x24), VP8, riffChunk('ICCP', Buffer.alloc(4)), riffChunk('XMP ', Buffer.alloc(4)))).problems).toEqual([
      'WebP VP8X에 ICC 표시',
      'WebP VP8X에 XMP 표시',
      'WebP ICCP 조각',
      'WebP XMP 조각',
    ]);
    expect(inspectImageMetadata(webp(VP8, riffChunk('ABCD', Buffer.alloc(2)))).problems).toEqual(['WebP의 알 수 없는 조각 "ABCD"']);
  });

  it('PNG 글 조각·JPEG APP1·GIF 주석을 찾는다', () => {
    expect(inspectImageMetadata(png())).toEqual({ format: 'png', width: 20, height: 10, problems: [] });
    expect(inspectImageMetadata(png(pngChunk('tEXt', Buffer.from('Software\0tool')))).problems).toEqual(['PNG tEXt 조각']);
    expect(inspectImageMetadata(jpeg(jpegSegment(0xe0, Buffer.from('JFIF\0'))))).toEqual({ format: 'jpeg', width: 48, height: 24, problems: [] });
    expect(inspectImageMetadata(jpeg(jpegSegment(0xe1, Buffer.from('Exif\0\0')))).problems).toEqual(['JPEG APP1(EXIF·XMP)']);
    expect(inspectImageMetadata(jpeg(jpegSegment(0xfe, Buffer.from('comment')))).problems).toEqual(['JPEG 주석(COM)']);
    const gif = Buffer.concat([
      Buffer.from('GIF89a', 'latin1'),
      Buffer.from([4, 0, 2, 0, 0, 0, 0]),
      Buffer.from([0x21, 0xfe, 3]),
      Buffer.from('abc', 'latin1'),
      Buffer.from([0, 0x3b]),
    ]);
    expect(inspectImageMetadata(gif)).toEqual({ format: 'gif', width: 4, height: 2, problems: ['GIF 주석'] });
    expect(inspectImageMetadata(Buffer.from('not an image')).format).toBe('unknown');
  });

  it('도구가 꺼낸 저장소의 차시 그림은 메타데이터가 없고 sha256이 목록과 같다(모든 차시 목록)', () => {
    const { records } = readImageRecords('.');
    for (const manifestFile of listManifestFiles('.')) {
      const { manifest } = parseImageManifest(fs.readFileSync(manifestFile, 'utf8'), manifestFile);
      for (const entry of manifest?.images ?? []) {
        if (!entry.file || !fs.existsSync(entry.file)) continue;
        const bytes = fs.readFileSync(entry.file);
        const inspected = inspectImageMetadata(bytes);
        expect(inspected.problems, entry.file).toEqual([]);
        if (entry.from) expect(inspected.format, entry.file).toBe('webp');
        expect(sha256Hex(bytes), entry.file).toBe(entry.sha256);
        expect(records.get(entry.file)?.recordFile).toBe(manifestFile);
      }
    }
  });
});

describe('눈 확인 기록 모으기(collectImageRecords)', () => {
  const reviewed = 'reviewed: { by: claude, date: 2026-09-25, result: "통과 — 얼굴 없음" }';

  it('옛 공용 기록과 차시 그림 목록을 함께 읽고, 아직 꺼내지 않은 항목(file 없음)은 건너뛴다', () => {
    const { records, errors } = collectImageRecords([
      { path: 'scripts/image-allowlist.yaml', content: `images:\n  - { path: public/images/site/a.png, ${reviewed} }\n` },
      {
        path: 'content/lessons/u1/1-1-2.images.yaml',
        content: `images:\n  - { name: b, file: public/images/lessons/1-1-2/b.webp, sha256: ${'a'.repeat(64)}, ${reviewed} }\n  - { name: c }\n`,
      },
      { path: 'content/lessons/u1/1-1-2.md', content: 'images: [1]' },
    ]);
    expect(errors).toEqual([]);
    expect([...records.keys()]).toEqual(['public/images/site/a.png', 'public/images/lessons/1-1-2/b.webp']);
    expect(records.get('public/images/lessons/1-1-2/b.webp')).toMatchObject({ sha256: 'a'.repeat(64), recordFile: 'content/lessons/u1/1-1-2.images.yaml' });
  });

  it('같은 그림의 기록이 두 곳에 있거나, 옛 기록에 패턴을 적으면 알린다', () => {
    const { errors } = collectImageRecords([
      { path: 'scripts/image-allowlist.yaml', content: `images:\n  - { path: public/images/lessons/1-1-2/b.webp, ${reviewed} }\n  - { path: public/images/*.png, ${reviewed} }\n` },
      { path: 'content/lessons/u1/1-1-2.images.yaml', content: `images:\n  - { name: b, file: public/images/lessons/1-1-2/b.webp, ${reviewed} }\n` },
    ]);
    expect(errors.map((error) => error.message).join('\n')).toContain('패턴 없이');
    expect(errors.map((error) => error.message).join('\n')).toContain('기록은 한 곳에만');
  });

  it('차시 그림 목록은 차시 그림 폴더(public/images/lessons/) 밖의 그림을 기록하지 못한다', () => {
    const { records, errors } = collectImageRecords([
      { path: 'content/lessons/u1/1-1-2.images.yaml', content: `images:\n  - { name: x, file: tests/e2e/shot.png, ${reviewed} }\n` },
    ]);
    expect(records.size).toBe(0);
    expect(errors[0]?.message).toContain('public/images/lessons/');
  });
});

describe('도구가 목록에 칸 쓰기(writeManifestFields)', () => {
  const text = `# 머리 주석
images:
  - name: a # 이름 옆 주석
    use: 쓰는 곳
    from: { source: U1, page: 14, region: [62, 476, 528, 712] }
    reviewed: { by: claude, date: 2026-09-25, result: 통과 }
    sha256: "${'1'.repeat(64)}"
`;
  const update = (sha: string) => ({ file: 'public/images/lessons/x/a.webp', width: 10, height: 5, bytes: 99, sha256: sha, checks: { faces: 1, face_boxes: [[1, 2, 3, 4]] } });

  it('주석과 [..] 모양을 지키고, 같은 그림이면 눈 확인 기록을 맨 뒤로 옮긴다', () => {
    const { text: out, droppedReviews } = writeManifestFields(text, new Map([[0, update('1'.repeat(64))]]));
    expect(droppedReviews).toEqual([]);
    // 숫자만으로 된 sha256도 문자열로 남게 따옴표로 적는다(따옴표가 없으면 YAML이 큰 수로 읽는다)
    expect(out).toContain(`sha256: "${'1'.repeat(64)}"`);
    expect(out).toContain('# 머리 주석');
    expect(out).toContain('# 이름 옆 주석');
    expect(out).toContain('region: [62, 476, 528, 712]');
    expect(out).toContain('face_boxes: [[1, 2, 3, 4]]');
    expect(out.indexOf('reviewed:')).toBeGreaterThan(out.indexOf('checks:'));
  });

  it('그림이 바뀌면(sha256이 다르면) 눈 확인 기록을 지우고, null이면 도구 칸까지 지운다', () => {
    const changed = writeManifestFields(text, new Map([[0, update('2'.repeat(64))]]));
    expect(changed.droppedReviews).toEqual([0]);
    expect(changed.text).not.toContain('reviewed');
    const cleared = writeManifestFields(text, new Map([[0, null]]));
    expect(cleared.text).not.toContain('sha256');
    expect(cleared.text).not.toContain('reviewed');
    expect(cleared.text).toContain('region: [62, 476, 528, 712]');
  });
});

describe('저장소의 차시 그림 목록 전체(원본 없이, npm test)', () => {
  it('모든 목록이 규칙을 지키고 그림 파일·sha256·메타데이터·sources.yaml 연결이 맞다', () => {
    const registry = parseRegistry(fs.readFileSync('sources.yaml', 'utf8'));
    expect(registry.errors).toEqual([]);
    const result = validateLessonImages({ rootDir: '.', registryEntries: registry.entries, exclusionRules: realExclusions.rules });
    expect(result.errors).toEqual([]);
    expect(result.manifests.length).toBe(listManifestFiles('.').length);
  });
});
