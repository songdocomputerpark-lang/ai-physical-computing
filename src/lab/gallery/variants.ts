/**
 * 예제 갤러리(P4-11)의 **"비교해 보기"** — 거의 같은 예제를 한 묶음으로 이어 준다(PLAN §2.5 "사본은 하나만 싣고, 거의 같은 변형은 비교해 보기 링크로 묶는다").
 *
 * 두 가지 묶음이 있다.
 *
 * 1. **자료에 있던 변형**(docs/INVENTORY.md §7.2 "거의 같은 파일"): 원본 자료에 비슷한 코드가 여러 개 있어 사이트가 전부 싣는 것들.
 *    무엇이 다른지는 사람이 읽고 적은 값이라 아래 표에 둔다. 표의 열쇠는 **코드 id**(`f001` 같은 이관 기록 id, 사이드카 `source_id`)다 —
 *    파일 이름이나 경로가 바뀌어도 이어진 채로 남는다. 표에 있지만 아직 옮기지 않은 id는 저절로 빠진다(묶음에 하나만 남으면 묶음이 사라진다).
 * 2. **원본과 사이트판**(PD-10 ②): `…-site.py`는 원본에 줄을 더해 고친 사이트판이고 옆에 원본 파일이 함께 있다.
 *    파일 이름 규칙이 확실해서 표 없이 저절로 묶는다(`siteVersionPairs`) — 새 사이트판을 만들어도 이 파일을 고칠 일이 없다.
 *
 * "사본"(§7.1 내용이 똑같은 파일)은 애초에 하나만 옮겼고(scripts/examples-manifest.yaml 주석), 그래도 남아 있으면
 * `cards.ts`가 코드가 같은 카드를 하나로 합쳐 한 장만 싣는다.
 *
 * 순수 데이터·순수 함수만 둔다(브라우저 번들에 들어가도 괜찮게).
 */

export interface VariantGroup {
  /** 영문 소문자·숫자·하이픈(카드의 data 속성·앵커에 들어간다) */
  readonly id: string;
  /** 묶음 이름(카드에 보이는 제목) */
  readonly label: string;
  /** 무엇이 다른지 한 줄(고1이 읽는 문장) */
  readonly note: string;
  /** 이 묶음에 드는 코드 id(docs/CODE_MAPPING.md) */
  readonly sourceIds: readonly string[];
}

/**
 * 자료에 있던 변형 묶음(docs/INVENTORY.md §7.2 표 그대로).
 *
 * §7.2의 열 줄 가운데 **f003 ↔ f012(서보 클래스 이름만 다름)만 여기 없다** — 둘 다 보드에 올리는 라이브러리 파일이라
 * 실습실에서 여는 예제가 아니고(examples/esp32/lib/), 애초에 카드가 되지 않기 때문이다. 나머지 아홉 줄은 모두 아래에 있다.
 */
export const VARIANT_GROUPS: readonly VariantGroup[] = Object.freeze([
  {
    id: 'uart-rgb',
    label: '시리얼로 받은 값으로 RGB LED 켜기',
    note: '받은 값을 문자 코드(“1”~“4”)로 견주는 판과 원시 바이트(1~4)로 견주는 판이에요.',
    sourceIds: ['f001', 'f007'],
  },
  {
    id: 'lcd-text',
    label: '문자 LCD에 글자 쓰기',
    note: '출력하는 글자와 줄 바꿈만 달라요. 교과서 실습과 블루투스 교안 실습을 나란히 봐요.',
    sourceIds: ['f047', 'f144'],
  },
  {
    id: 'touch4-range',
    label: '4채널 아날로그 터치 값 판정',
    note: '누름을 판정하는 값 구간이 자료마다 달라요. 어떤 구간이 내 보드에 맞는지 견주어 봐요.',
    sourceIds: ['f058', 'f059', 'f066', 'f072'],
  },
  {
    // PD-05: 핀이 자료마다 다른 같은 예제는 하나로 합치지 않고 예제별 배선으로 싣는다 → 카드는 따로, 잇기만 한다.
    // 2026-09-18 기준 옮긴 것은 f061 하나뿐이라 이 묶음은 아직 화면에 안 보인다. 나머지를 옮기면 저절로 이어진다.
    id: 'led-sequence',
    label: 'LED 3개를 차례로 켜기',
    note: '쓰는 핀(25·26·27 ↔ 27·32·33 ↔ 12·5·4)과 기다리는 시간이 자료마다 달라요.',
    sourceIds: ['f014', 'f061', 'f143'],
  },
  {
    id: 'ble-xy-rgb',
    label: '좌표 “x,y”를 받아 RGB LED 켜기',
    note: '쓰는 핀이 다르고(25·26·27 ↔ 27·32·33) 교과서판에는 줄마다 주석이 붙어 있어요.',
    sourceIds: ['f086', 'f157'],
  },
  {
    id: 'ble-finger-xy',
    label: '검지 좌표를 블루투스로 보내기',
    note: '보내는 내용은 같고 연결할 기기 주소와 주석만 달라요.',
    sourceIds: ['f089', 'f158'],
  },
  {
    id: 'hand-desktop',
    label: '손으로 컴퓨터 조작하기',
    note: '코드의 8할이 같고, 손을 알아본 뒤에 하는 일이 화면 찍기와 마우스 옮기기로 갈려요.',
    sourceIds: ['f090', 'f091'],
  },
  {
    id: 'face-mouse-ble',
    label: '얼굴로 마우스를 옮기고 블루투스로 보내기',
    note: '부르는 블루투스 모듈 이름만 달라요(bluetooth ↔ bluetooth_lib).',
    sourceIds: ['f104', 'f114'],
  },
  {
    id: 'ble-servo-rgb-laser-buzzer',
    label: '블루투스로 받은 값으로 서보·RGB·레이저·부저 움직이기',
    note: '서보 각도를 줄인 판, 좌우를 뒤집은 판, 라이브러리 이름이 다른 판이에요.',
    sourceIds: ['f110', 'f111', 'f115'],
  },
]);

/** 원본과 사이트판을 묶을 때 쓰는 값(PD-10 ②) */
export const SITE_VERSION_GROUP = Object.freeze({
  label: '원본과 사이트판',
  note: '원본 코드에 줄을 더해 고친 사이트판이에요. 어디가 달라졌는지 견주어 봐요.',
  /** 사이트판 파일 이름 끝 */
  suffix: '-site.py',
});

/** 코드 id → 변형 묶음(표에 없는 id는 없음) */
export function variantGroupsBySourceId(groups: readonly VariantGroup[] = VARIANT_GROUPS): Map<string, VariantGroup> {
  const map = new Map<string, VariantGroup>();
  for (const group of groups) {
    for (const sourceId of group.sourceIds) {
      map.set(sourceId, group);
    }
  }
  return map;
}

/**
 * `…-site.py`와 짝이 되는 원본 파일을 찾는다. 있는 파일 목록(examples/ 뒤 경로)을 주면
 * { 사이트판 경로 → 원본 경로 } 를 돌려준다(짝이 없는 사이트판은 넣지 않는다).
 */
export function siteVersionPairs(files: readonly string[]): Map<string, string> {
  const present = new Set(files);
  const pairs = new Map<string, string>();
  for (const file of files) {
    if (!file.endsWith(SITE_VERSION_GROUP.suffix)) {
      continue;
    }
    const original = `${file.slice(0, -SITE_VERSION_GROUP.suffix.length)}.py`;
    if (present.has(original)) {
      pairs.set(file, original);
    }
  }
  return pairs;
}
