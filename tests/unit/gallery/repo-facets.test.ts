/**
 * 저장소의 예제·사이드카·**차시 md까지** 읽어 만든 갤러리 카드의 태그(PROGRESS 미해결 140, 2026-09-28).
 *
 * 무엇을 지키나
 *   1. **모든 카드에 난이도(1~3)가 있다** — 갤러리의 "난이도" 거르기가 모든 예제에 듣고, 칸 이름에 "적어 둔 예제 N개만" 같은
 *      단서를 달 필요가 없다(src/lab/gallery/cards.ts). 새 예제를 더하고 난이도를 빠뜨리면 여기서 먼저 걸린다.
 *   2. 차례: 차시가 싣는 예제는 차시(그 예제 항목 → 차시) 값, 차시를 가리키기만 한 예제는 예제 쪽(사이드카) 값이 먼저다.
 *   3. 사이트가 만든 예제의 사이드카 title은 .py 머리말 첫 줄과 같다(두 곳에 적은 제목이 어긋나지 않게).
 *
 * 카드는 페이지(src/components/examples/ExampleGallery.astro)와 같은 방법으로 만든다(helpers/repo-gallery.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { readExampleMeta } from '../../../src/lab/controls/example-meta.ts';
import { buildRepoGallery, REPO_ROOT } from './helpers/repo-gallery.ts';

const { gallery, inputs, lessons } = buildRepoGallery();
const cardOf = (file: string) => {
  const card = gallery.cards.find((entry) => entry.file === file);
  if (!card) {
    throw new Error(`갤러리에 examples/${file} 카드가 없어요.`);
  }
  return card;
};

describe('저장소 갤러리 — 난이도(미해결 140)', () => {
  it('모든 카드에 난이도(1~3)가 있다 — 빠졌으면 차시에 싣거나, 머리말 # @lesson으로 차시를 가리키거나, 사이드카에 difficulty를 적는다', () => {
    expect(gallery.cards.length).toBeGreaterThan(150);
    const missing = gallery.cards.filter((card) => card.facets.difficulty === null).map((card) => `examples/${card.file}`);
    expect(missing, `난이도가 없는 예제: ${missing.join(', ')} — 기준은 src/lab/gallery/facets.ts의 EXAMPLE_DIFFICULTY_GUIDE 주석`).toEqual([]);
    for (const card of gallery.cards) {
      expect([1, 2, 3], card.file).toContain(card.facets.difficulty);
    }
  });

  it('난이도 거르기 칸은 이름에 단서 없이 "난이도"이고, 쉬움·보통·어려움 개수를 모두 더하면 카드 수와 같다', () => {
    const group = gallery.facetGroups.find((entry) => entry.key === 'difficulty');
    expect(group?.legend).toBe('난이도');
    expect(group?.options.map((option) => option.value)).toEqual(['1', '2', '3']);
    expect(group?.options.reduce((sum, option) => sum + option.count, 0)).toBe(gallery.cards.length);
    // 한쪽으로 몰리지 않았는지(모두 "보통"이면 거르기가 쓸모없다) — 칸마다 열 장 넘게
    for (const option of group?.options ?? []) {
      expect(option.count, `난이도 ${option.value}`).toBeGreaterThan(10);
    }
  });

  it('사이드카에 적은 difficulty는 모두 1·2·3 정수다(틀린 값은 읽는 쪽이 조용히 버리므로 여기서 잡는다)', () => {
    for (const input of inputs) {
      const file = input.example.file ?? '';
      const sidecarPath = path.join(REPO_ROOT, 'examples', file.replace(/\.py$/u, '.meta.yaml'));
      if (!fs.existsSync(sidecarPath)) {
        continue;
      }
      const raw = YAML.parse(fs.readFileSync(sidecarPath, 'utf8')) as Record<string, unknown> | null;
      if (raw && 'difficulty' in raw) {
        expect([1, 2, 3], `${sidecarPath}의 difficulty`).toContain(raw.difficulty);
      }
    }
  });

  it('차례: 차시가 싣는 예제는 차시 값(예제 항목이 먼저), 차시를 가리키기만 한 예제는 사이드카 값이 먼저', () => {
    // 3-1-2는 예제 항목마다 난이도를 적었다(미해결 180) — 차시가 싣는 예제라 차시 쪽 값
    expect(cardOf('vision/u3/3-1-2-adv-face-uart.py').facets.difficulty).toBe(3);
    expect(cardOf('vision/u3/3-1-2-uart-key-send.py').facets.difficulty).toBe(2);
    // 4-2-2(차시 난이도 3)가 싣지 않고 사이드카 lesson으로 가리키기만 한 조립 준비 코드(서보 두 개를 90도로) — 사이드카의 쉬움이 먼저
    expect(lessons.some((entry) => entry.data.examples.some((example) => example.file === 'esp32/u4/4-2-2-adv-servo-mount-90.py'))).toBe(false);
    expect(cardOf('esp32/u4/4-2-2-adv-servo-mount-90.py').facets.difficulty).toBe(1);
    expect(cardOf('esp32/u4/4-2-2-adv-servo-mount-90.py').facets.unit).toBe(4);
    // C3 블루투스판은 차시(통신 방식 tab·uart)가 싣지 않은 판 — 사이드카의 ble이 먼저(전에는 차시 값에 가려 "시리얼(UART)"로 보였다)
    expect(cardOf('esp32/u4/c3-neopixel-count-rx-ble.py').facets.comm).toEqual(['ble']);
    expect(cardOf('esp32/u4/c3-neopixel-count-rx.py').facets.comm).toEqual(['uart', 'tab']);
  });

  it('머리말 # @lesson만 있는 사이트 예제도 그 차시의 값으로 채운다(실습실 목록의 차시 링크와 같은 차례)', () => {
    // 진동 알림은 사이드카가 없고 머리말에 # @lesson 2-2-1 — 카드에 보이는 차시 링크와 난이도·단원이 같은 차시에서 온다
    const alert = cardOf('esp32/04-touch-vibration-alert.py');
    expect(alert.lesson?.label).toContain('2-2-1');
    expect(alert.facets).toMatchObject({ unit: 2, difficulty: 2 });
  });

  it('사이트가 만든 첫 예제들은 쉬움 — 시작하기의 첫 실습과 ESP32 실습실이 처음 여는 예제', () => {
    expect(cardOf('vision/first-edge.py').facets.difficulty).toBe(1);
    expect(cardOf('esp32/01-first-blink.py').facets.difficulty).toBe(1);
    expect(cardOf('esp32/02-boot-button-led.py').facets.difficulty).toBe(1);
    // 콜백(Timer)·삼각함수 각도 계산은 보통(기준 2)
    expect(cardOf('esp32/03-timer-blink.py').facets.difficulty).toBe(2);
    expect(cardOf('desktop/06-draw-star-site.py').facets.difficulty).toBe(2);
    expect(cardOf('desktop/05-draw-circle.py').facets.difficulty).toBe(2);
  });

  it('OpenCV·MediaPipe 계단(교안) 19개는 계단을 오를수록 어려워진다 — 첫 계단은 쉬움, 마지막(코로 마우스)은 어려움', () => {
    const steps = gallery.cards
      .filter((card) => card.file.startsWith('vision/opmp/'))
      .sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }));
    expect(steps).toHaveLength(19);
    expect(steps[0]?.facets.difficulty).toBe(1);
    expect(steps[18]?.facets.difficulty).toBe(3);
    expect(steps.map((card) => card.facets.difficulty)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 3]);
  });
});

describe('저장소 갤러리 — 머리말 낱말과 두 곳에 적은 제목', () => {
  it('사이트가 만든 예제의 머리말 # @tags가 카드 낱말과 찾기 글자에 들어간다', () => {
    const first = cardOf('vision/first-edge.py');
    expect(first.facets.tags).toEqual(expect.arrayContaining(['에지', 'Canny']));
    expect(first.keywords).toContain('canny');
    expect(cardOf('esp32/templates/uart-echo.py').facets.tags).toEqual(expect.arrayContaining(['UART', '템플릿']));
  });

  it('규약 머리말(# @tags)이 있는 예제에 사이드카가 있으면 사이드카 title은 머리말 첫 줄과 같다', () => {
    let checked = 0;
    for (const input of inputs) {
      const meta = readExampleMeta(input.example.code);
      if (meta.tags.length === 0 || !input.sidecar || input.sidecar.title === null) {
        continue;
      }
      expect(input.sidecar.title, `examples/${input.example.file ?? ''}: 사이드카 title과 .py 머리말 첫 줄`).toBe(meta.title);
      checked += 1;
    }
    // 통신 템플릿 4·C3 세 개·3-1-1 체험·이번에 더한 사이트 예제 다섯(첫 실습·ESP32 첫 세 예제·별 사이트판)
    expect(checked).toBeGreaterThanOrEqual(13);
  });
});
