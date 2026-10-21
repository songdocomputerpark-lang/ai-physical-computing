/**
 * 수업 화면(옛 이름 "발표 모드" — 판 1.6.0 DECISIONS C173에서 이름 하나로; SPEC §7.3 "차시 페이지를 큰 글씨·한 단계씩 넘기는 화면으로", PLAN §8.5 P5-02) — 수업 중 프로젝터용.
 *
 * 한 단계 = 차시 제목 한 장(학습 목표가 있으면 함께 — 제목만 있는 빈 첫 장을 두지 않는다, 판 1.6.0), 그다음 칸(##)마다, 칸 안의 ### 제목마다,
 * 도전 과제 상자·따라하기 예제마다, 확인 퀴즈는 문항마다. 교사용 칸은 수업 화면에 나오지 않는다(학생에게 비추지 않게).
 * 교과서 쪽의 머리 상자(학습 목표 앞의 성취 계획 등)는 제목 장 다음 한 장으로 따로 보인다(walk-a11y-keyboard 12 — 첫 장이 막대에 반쯤 걸렸다).
 *
 * 조작(키보드만으로 모두 된다)
 *   → 다음 단계 · ← 앞 단계         Home · End  처음·끝         Esc  수업 화면 끝내기(전체 화면이면 먼저 전체 화면이 풀린다)
 *   PageDown · Space(단추·입력칸 밖에서)  한 화면 아래로 — 이 단계가 화면보다 길어 아래가 남았으면 스크롤하고, 끝이면 다음 단계 (R1-074)
 *   PageUp  한 화면 위로 — 맨 위면 앞 단계           ↓ · ↑  조금씩 스크롤(남은 내용이 있을 때만 움직인다)
 *   아래쪽 막대의 [앞] [다음] [전체 화면] [끝내기(Esc)](이름은 "앞 단계"·"다음 단계" — 화살표 기호는 낭독기에서 숨김). 몇째 단계인지는 막대의 알림 칸(aria-live)이 읽어 준다.
 *   발표를 시작하면 초점이 막대의 [다음 단계]에 놓인다(보이는 조작에 초점이 있어 Enter·Space·→로 바로 넘긴다, R2-023).
 *   보기(라디오 단추)에 초점이 있을 때 ←→는 보기를 고르는 데 쓰인다(가로챈 키가 아님). 실습실 틀(iframe) 안의 키도 가로채지 않는다.
 *   용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫는다(발표는 그대로).
 *
 * 화면은 DOM을 옮기지 않고 보이지 않을 요소에 data-present-off만 붙였다 뗀다(퀴즈·실습실·툴팁의 동작이 그대로 남는다).
 * 단계 나누기(planPresentationSteps)는 DOM 없이 도는 순수 함수라 Vitest가 검사한다(tests/unit/lesson/present.test.ts).
 *
 * 한 화면에 맞추기(2026-09-25 Phase 5 검토 중요 5 — 1366×768에서 단계 대부분이 한 화면을 넘었다): 발표를 시작할 때(그리고 창 크기가
 * 바뀌거나 그림을 다 받았을 때) 단계마다 블록 높이를 재서, 화면(아래 막대 제외)보다 길면 블록 경계에서 더 잘게 나눈다(splitTallSteps).
 * 나뉜 뒤 단계에는 그 칸의 제목(##·###)을 다시 보이고 막대에 "(이어서)"를 붙인다. 블록 하나가 화면보다 크면(긴 표 등) 그 블록만 한 단계로
 * 두고 아래로 스크롤한다 — 그때 막대 위에 "▼ 아래에 더 있어요" 띠가 뜨고(R1-073), Space·PageDown이 한 화면씩 내려간다(R1-074).
 * 따라하기 예제·도전 과제 단계의 막대 글에는 예제·과제 제목을 함께 적는다(어느 예제인지 알 수 있게).
 *
 * 반대로 너무 잘게 나뉜 단계(제목 한 줄과 문장 하나뿐인 화면)는 이웃 단계와 합친다 — 합친 내용이 한 화면에 들어올 때만(mergeShort, R1-075).
 *
 * 주소로 바로 열기(판 1.4.0, DECISIONS C133): 쪽 주소에 ?view=slide가 있으면 수업 화면으로 연다(교과서 쪽·웹 차시 쪽 모두). 기본은 읽기 화면이다 —
 * 선생님이 "수업 화면" 링크를 학생에게 나눠 줄 때나 북마크에 쓴다. [수업 화면] 단추와 같은 enter()를 부르므로 동작은 같다.
 * 교과서 쪽의 단계는 ##·### 제목과 상자 단위이고 쪽 표지(::쪽)는 단계를 나누지 않는다(표지는 내용 블록일 뿐 제목·상자 나눔 규칙에 없다).
 *
 * 판 1.6.0 다듬기(걷기 조사 walk-teacher-new A3~A8·walk-a11y-keyboard 1~6·10~12, synthesis T6):
 * - 단계 주소 #slide=N: 단계를 넘길 때마다 주소 끝을 #slide=N으로 바꾼다(기록 칸은 새로 만들지 않는다 — replaceState). #slide=N으로 열면 그 단계로 열린다.
 *   끝내면 지운다. 같은 탭에서 실습실로 갔다가 [뒤로]로 돌아와도 그 단계로 다시 열린다.
 * - 총 단계 수 고정: 처음 나눈 뒤(글꼴을 다 받을 때까지 기다린 한 번) 그림을 늦게 받아도 다시 나누지 않는다 — 창 크기가 바뀔 때만 다시 나눈다.
 *   예전에는 켠 직후 "1 / 28"이 "1 / 33"으로, 넘기다 "9 / 36"이 "10 / 62"로 바뀌었다.
 * - 막대의 단계 이름은 가장 가까운 이름(예제·과제 이름 › ### 제목 › ## 제목)을 20글자 안으로 줄여 보이고 "(이어서)"는 늘 남긴다(shortStepLabel).
 *   낭독기에는 줄이지 않은 이름을 읽어 준다.
 * - 마지막 단계에서 [다음 단계]는 aria-disabled(초점이 남는다 — 예전에는 disabled라 초점이 BODY로 사라졌다)이고 막대에 "마지막 단계예요 · Esc로 끝내기".
 * - [실습실에서 크게 열기]는 수업 화면 중에는 새 탭으로 열고 주소에 ?from=slide&n=N을 붙인다 — 실습실 쪽이 "← 수업 화면으로"를 보인다(slide-return.ts).
 * - Esc로 끝낸 뒤 읽던 칸 제목이 화면에 보이도록 레이아웃이 자리 잡은 다음 프레임에 한 번 더 맞춘다(끝낸 뒤 쪽 높이가 바뀌어 제목이 화면 밖이었다).
 * - 한 화면 높이는 보이는 화면(visualViewport — 손가락으로 확대한 화면)과 막대 중 작은 쪽으로 잰다. 블록 하나가 화면보다 크면(긴 표 등)
 *   그 블록만 조금(최대 FIT_MIN_ZOOM까지) 줄여 한 화면에 넣는다 — 150% 확대에서 28장 중 8장이 막대 밑으로 들어갔다(walk-a11y-keyboard 4).
 * - 퀴즈 보기에 초점이 가면 문제 줄이 화면 위로 밀려나지 않게 문제 글부터 보이게 맞춘다(walk-a11y-keyboard 6).
 */

import { numberedExampleTitle } from '../../lab/controls/example-names.ts';

/** 주소 검색 글(?view=slide …)이 수업 화면으로 바로 열라는 뜻인지(별칭 view=present도 같다) */
export function wantsSlideView(search: string): boolean {
  const view = new URLSearchParams(search).get('view');
  return view === 'slide' || view === 'present';
}

/**
 * 발표 모드를 끝낼 때 주소에서 "발표로 열어 줘" 표시(view=slide·present)만 지운 검색 글 — 다른 값(?example=…)은 그대로 두고,
 * 지울 것이 없으면 받은 글 그대로다. 남겨 두면 새로 고침이 다시 발표 모드로 열려 Esc로 끝낸 학생이 읽기 화면으로 돌아오지 못한다(2026-10-16 화면 검수).
 */
export function searchWithoutSlideView(search: string): string {
  if (!wantsSlideView(search)) {
    return search;
  }
  const params = new URLSearchParams(search);
  params.delete('view');
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}

/** 단계 주소 #slide=N(판 1.6.0)의 N(1부터). 다른 #위치거나 숫자가 아니면 undefined */
export function slideNumberFromHash(hash: string): number | undefined {
  const match = /^#?slide=(\d{1,4})$/u.exec(hash.trim());
  const number = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(number) && number >= 1 ? number : undefined;
}

/** 지금 단계를 적은 #위치 글 — 단계를 넘길 때마다 주소 끝을 이것으로 바꾼다 */
export function slideHash(stepNumber: number): string {
  return `#slide=${Math.max(1, Math.floor(stepNumber))}`;
}

/**
 * 수업 화면 중 [실습실에서 크게 열기]가 열 주소: 실습실 주소에 from=slide·n=<단계 번호>를 붙인다(실습실 쪽 "← 수업 화면으로" — slide-return.ts).
 * 주소의 다른 값(?example=…)은 그대로 둔다. href는 base가 붙은 사이트 안 주소("/ai-physical-computing/labs/esp32/?example=…").
 */
export function slideLabHref(href: string, stepNumber: number): string {
  const [beforeHash = '', hash = ''] = href.split('#', 2);
  const [path = '', query = ''] = beforeHash.split('?', 2);
  const params = new URLSearchParams(query);
  params.set('from', 'slide');
  params.set('n', String(Math.max(1, Math.floor(stepNumber))));
  return `${path}?${params.toString()}${hash ? `#${hash}` : ''}`;
}

/** 막대에 보이는 단계 이름의 최대 글자 수(walk-teacher-new A5 — 두 줄에서 잘려 "(이어서)"가 안 보였다) */
export const STEP_LABEL_MAX = 20;

/**
 * 막대에 보일 짧은 단계 이름(순수 함수). 단계 이름(planPresentationSteps의 label — "칸 — ### 제목 · 예제 2: 이름 (이어서)" 꼴)에서
 * 가장 가까운 이름 하나(예제·과제 이름 › ### 제목 › 칸 제목)를 골라 max글자로 줄이고(넘치면 "…"), "(이어서)"·퀴즈 "(1/3)" 꼬리는 늘 남긴다.
 * 낭독용 글은 줄이지 않은 이름을 쓴다.
 */
export function shortStepLabel(label: string, max: number = STEP_LABEL_MAX): string {
  let rest = label.replace(/\s+/gu, ' ').trim();
  const tails: string[] = [];
  for (;;) {
    const tail = /\s*(\(이어서\)|\(\d+\/\d+\))$/u.exec(rest);
    if (!tail || tail.index === undefined) {
      break;
    }
    tails.unshift(tail[1] ?? '');
    rest = rest.slice(0, tail.index).trim();
  }
  const dot = rest.lastIndexOf(' · ');
  const dash = rest.lastIndexOf(' — ');
  const nearest = dot >= 0 ? rest.slice(dot + 3) : dash >= 0 ? rest.slice(dash + 3) : rest;
  const chars = Array.from(nearest.trim());
  const name = chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
  return [name, ...tails].filter((part) => part !== '').join(' ');
}

/** 마지막 단계에서 막대에 붙는 말(키보드·터치) */
export const LAST_STEP_NOTE = '마지막 단계예요 · Esc로 끝내기';
export const LAST_STEP_NOTE_TOUCH = '마지막 단계예요 · [끝내기]를 눌러요';

/** 칸 제목이 "학습 목표"인가(교과서 쪽 "학습목표"처럼 붙여 쓴 것도) — 제목 장에 함께 보인다 */
export function isGoalTitle(title: string): boolean {
  return title.replace(/\s+/gu, '') === '학습목표';
}

export type PresentBlockKind = 'h2' | 'h3' | 'break' | 'content' | 'split';

export interface PresentBlock {
  readonly kind: PresentBlockKind;
  /** 제목 글자(h2·h3), 따라하기 예제·도전 과제(break)의 이름 */
  readonly title?: string;
  /** split 블록의 항목 수(퀴즈 문항 수) */
  readonly items?: number;
}

export interface PresentSection {
  readonly title: string;
  readonly blocks: readonly PresentBlock[];
}

export interface PresentStep {
  /** 칸 번호. -1이면 칸 밖(차시 제목 장 또는 머리 상자 장) */
  readonly section: number;
  /** 이 단계에서 보일 블록 번호(그 칸 안의 차례) */
  readonly blocks: readonly number[];
  /** split 블록에서 보일 항목 번호 */
  readonly item?: number;
  /** 막대·낭독에 쓰는 이름 */
  readonly label: string;
  /** 차시 머리(제목·한 줄 소개)를 함께 보이는 제목 장인가 */
  readonly title?: boolean;
  /** 칸 앞의 머리 상자(본문 맨 앞, 첫 ## 앞 — 교과서 쪽의 성취 계획 등)를 보이는가 */
  readonly intro?: boolean;
  /** 한 화면보다 큰 블록 하나를 줄여 넣을 때 그 블록(칸 안 차례)과 비율(fitZoomFor) — 화면이 그려 본 뒤 정한다 */
  readonly fit?: { readonly block: number; readonly zoom: number };
}

export interface PlanOptions {
  /**
   * 첫 칸 앞에 머리 상자가 있으면 그 장의 이름(교과서 쪽 "성취 계획" 등). 주면 학습 목표를 제목 장에 합칠 때 머리 상자는 제목 장 다음 한 장으로 따로 보인다.
   * 없으면(웹 차시 대부분) 머리 상자 장을 만들지 않는다.
   */
  readonly introLabel?: string;
}

/** 학습 목표 칸을 제목 장에 합칠 수 있는가: 짧은 칸(제목 + 블록 넷 이하)이고 나눌 상자·퀴즈가 없을 때 */
function canJoinTitle(section: PresentSection | undefined): section is PresentSection {
  return (
    section !== undefined &&
    isGoalTitle(section.title) &&
    section.blocks.length <= 5 &&
    section.blocks.every((block) => block.kind === 'h2' || block.kind === 'content')
  );
}

/**
 * 차시 제목 한 장 + 칸마다 단계를 나눈다.
 * 첫 칸이 학습 목표면 제목 장에 합친다(제목만 있는 빈 첫 장을 두지 않는다 — 판 1.6.0, walk-teacher-new A8). 그때 칸 앞의 머리 상자(introLabel)는
 * 제목 장 바로 다음 한 장이다. 학습 목표가 없으면 예전처럼 제목 장이 머리 상자까지 보인다.
 */
export function planPresentationSteps(title: string, sections: readonly PresentSection[], options: PlanOptions = {}): PresentStep[] {
  const goal = sections[0];
  const joinGoal = canJoinTitle(goal);
  const steps: PresentStep[] = joinGoal
    ? [
        { section: 0, blocks: goal.blocks.map((_, index) => index), label: title, title: true },
        ...(options.introLabel ? [{ section: -1, blocks: [], label: options.introLabel, intro: true }] : []),
      ]
    : [{ section: -1, blocks: [], label: title, title: true, intro: true }];

  sections.forEach((section, sectionIndex) => {
    if (joinGoal && sectionIndex === 0) {
      return;
    }
    let current: number[] = [];
    let hasContent = false;
    let subTitle: string | undefined;
    let breakTitle: string | undefined;
    const headingBlocks: number[] = [];
    const labelNow = () => (subTitle ? `${section.title} — ${subTitle}` : section.title);
    const flush = () => {
      if (current.length > 0) {
        steps.push({ section: sectionIndex, blocks: current, label: breakTitle ? `${labelNow()} · ${breakTitle}` : labelNow() });
      }
      current = [];
      hasContent = false;
      breakTitle = undefined;
    };

    section.blocks.forEach((block, blockIndex) => {
      switch (block.kind) {
        case 'h2':
          flush();
          subTitle = undefined;
          headingBlocks.push(blockIndex);
          current.push(blockIndex);
          break;
        case 'h3':
          if (hasContent) {
            flush();
          }
          subTitle = block.title;
          current.push(blockIndex);
          break;
        case 'break':
          if (hasContent) {
            flush();
          }
          current.push(blockIndex);
          hasContent = true;
          breakTitle = block.title;
          break;
        case 'split': {
          const items = block.items ?? 0;
          if (items <= 1) {
            current.push(blockIndex);
            hasContent = true;
            break;
          }
          steps.push({ section: sectionIndex, blocks: [...current, blockIndex], item: 0, label: `${labelNow()} (1/${items})` });
          for (let item = 1; item < items; item += 1) {
            steps.push({ section: sectionIndex, blocks: [...headingBlocks, blockIndex], item, label: `${labelNow()} (${item + 1}/${items})` });
          }
          current = [];
          hasContent = false;
          break;
        }
        default:
          current.push(blockIndex);
          hasContent = true;
      }
    });
    flush();
  });
  return steps;
}

/** 나뉜 뒤 단계의 막대 글 끝에 붙는 말 */
export const CONTINUED_LABEL = '(이어서)';

/** 이웃한 두 단계를 합칠 수 있는가: 같은 칸이고 둘 다 제목 장·퀴즈 문항 단계가 아닐 때(순수 함수, R1-075) */
export function isMergeable(first: PresentStep, second: PresentStep): boolean {
  return (
    first.section >= 0 &&
    first.section === second.section &&
    first.item === undefined &&
    second.item === undefined &&
    !first.title &&
    !second.title
  );
}

/** 두 단계의 블록 번호를 중복 없이 칸 안 차례대로 합친다(나뉜 단계가 다시 보이는 제목 블록은 한 번만) */
export function unionBlocks(first: readonly number[], second: readonly number[]): number[] {
  return Array.from(new Set([...first, ...second])).sort((a, b) => a - b);
}

/** 합친 단계의 막대 글: 뒤 단계가 앞 단계 글에 예제·과제 이름을 더한 꼴이면 그 글, 아니면 앞 단계 글 */
export function mergedLabel(first: string, second: string): string {
  return second !== first && second.startsWith(`${first} `) ? second : first;
}

/** 이 비율 이하로 화면을 쓰는 단계를 "짧다"고 본다(제목 한 줄 + 문장 하나는 대개 20% 안팎) */
export const SHORT_STEP_RATIO = 0.45;

/**
 * 단계가 아래로 넘친 만큼(px). 내용 맨 아래(contentBottom, 문서 좌표)가 막대 윗선(scrollY + barTop)보다 4px 이상 위에 있으면 0 이하다.
 * 0보다 크면 막대 밑으로 들어간 내용이 있다. 수치가 작은 값(≤ 6)은 넘친 것으로 치지 않는다 — 한 화면에 맞춘 단계(fitToBar는 막대 4px 위까지 허용)가 늘 "더 있음"으로 보이지 않게.
 */
export function hiddenBelow(contentBottom: number, scrollY: number, barTop: number): number {
  return contentBottom - (scrollY + barTop) + 4;
}

/** 아래에 더 볼 내용이 있다고 알릴 만큼 넘쳤는가 */
export function hasMoreBelow(contentBottom: number, scrollY: number, barTop: number): boolean {
  return hiddenBelow(contentBottom, scrollY, barTop) > 6;
}

export interface ScrollRequest {
  /** 1 아래로 · -1 위로 */
  readonly direction: 1 | -1;
  readonly scrollY: number;
  /** 아래쪽 막대의 윗선(화면 좌표) */
  readonly barTop: number;
  /** 이 단계 내용의 맨 아래(문서 좌표) */
  readonly contentBottom: number;
  /** 문서를 가장 많이 내릴 수 있는 값(scrollHeight − 화면 높이) */
  readonly maxScroll: number;
  /** 한 번에 움직일 크기(px) */
  readonly amount: number;
}

/**
 * Space·PageDown·PageUp·↓·↑가 쪽을 스크롤할 자리. 움직일 수 없으면(내려갈 내용이 없거나 이미 맨 위) null — 그때 Space·PageDown·PageUp은 단계를 넘긴다.
 * 아래로는 막대 위에 남은 내용이 다 보일 만큼까지만, 마지막에는 12px 여유를 더 내려 글이 막대에 바짝 붙지 않게 한다.
 */
export function scrollTargetFor(request: ScrollRequest): number | null {
  const { direction, scrollY, barTop, contentBottom, maxScroll, amount } = request;
  if (direction < 0) {
    return scrollY > 1 ? Math.max(0, scrollY - amount) : null;
  }
  const hidden = hiddenBelow(contentBottom, scrollY, barTop);
  if (hidden <= 6) {
    return null;
  }
  const top = Math.min(maxScroll, scrollY + Math.min(amount, hidden + 12));
  return top > scrollY + 0.5 ? top : null;
}

/**
 * 화면보다 긴 단계를 블록 경계에서 더 나눈다(순수 함수). heightOf(칸, 블록)는 그 블록의 높이(바깥 여백 포함),
 * available은 한 화면에 쓸 수 있는 높이다. 단계 맨 앞의 제목 블록(##·###)은 나뉜 단계마다 다시 보인다(무엇의 이어서인지 알게).
 * 제목 장·퀴즈 문항 단계·블록이 하나뿐인 단계는 그대로 둔다. 블록 하나가 화면보다 크면 그 블록 하나(와 제목)로 한 단계.
 */
export function splitTallSteps(
  steps: readonly PresentStep[],
  sections: readonly PresentSection[],
  heightOf: (section: number, block: number) => number,
  available: number,
): PresentStep[] {
  const result: PresentStep[] = [];
  for (const step of steps) {
    const section = sections[step.section];
    // 제목 장(학습 목표를 합친 장)은 높이 합으로 나누지 않는다 — 넘치면 화면이 그려 본 뒤 제목 장과 학습 목표 장으로 되돌린다(fitToBar)
    if (!section || step.item !== undefined || step.blocks.length < 2 || available <= 0 || step.title) {
      result.push(step);
      continue;
    }
    const total = step.blocks.reduce((sum, block) => sum + heightOf(step.section, block), 0);
    if (total <= available) {
      result.push(step);
      continue;
    }
    const isHeading = (block: number) => {
      const kind = section.blocks[block]?.kind;
      return kind === 'h2' || kind === 'h3';
    };
    let headingCount = 0;
    while (headingCount < step.blocks.length - 1 && isHeading(step.blocks[headingCount] ?? -1)) {
      headingCount += 1;
    }
    const headings = step.blocks.slice(0, headingCount);
    const headingHeight = headings.reduce((sum, block) => sum + heightOf(step.section, block), 0);
    const chunks: number[][] = [];
    let chunk: number[] = [...headings];
    let used = headingHeight;
    let hasContent = false;
    for (const block of step.blocks.slice(headingCount)) {
      const height = heightOf(step.section, block);
      if (hasContent && used + height > available) {
        chunks.push(chunk);
        chunk = [...headings];
        used = headingHeight;
      }
      chunk.push(block);
      used += height;
      hasContent = true;
    }
    chunks.push(chunk);
    chunks.forEach((blocks, position) => {
      result.push({ ...step, blocks, label: position === 0 ? step.label : `${step.label} ${CONTINUED_LABEL}` });
    });
  }
  return result;
}

/** 발표 모드에서 가로채는 키 → 할 일. 가로채지 않으면 undefined */
export type PresentCommand = 'next' | 'previous' | 'first' | 'last' | 'exit' | 'lineDown' | 'lineUp';

export interface PresentKeyContext {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  /**
   * 초점이 있는 요소 종류 — 'arrows'(←→를 스스로 쓰는 요소: 퀴즈 보기·옆으로 미는 코드 상자), 'text'(글 입력칸),
   * 'control'(단추·링크·접기 제목 등), 'none'(본문)
   */
  readonly target: 'arrows' | 'text' | 'control' | 'none';
}

/** 키 하나를 발표 모드 명령으로 바꾼다(순수 함수 — 단위 테스트). */
export function presentCommandFor(event: PresentKeyContext): PresentCommand | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  if (event.key === 'Escape') {
    return 'exit';
  }
  if (event.target === 'text') {
    return undefined;
  }
  switch (event.key) {
    case 'PageDown':
      return 'next';
    case 'PageUp':
      return 'previous';
    case 'ArrowRight':
      return event.target === 'arrows' ? undefined : 'next';
    case 'ArrowLeft':
      return event.target === 'arrows' ? undefined : 'previous';
    case ' ':
      return event.target === 'none' ? 'next' : undefined;
    case 'ArrowDown':
      // 보기(라디오)·코드 상자(←→↑↓로 스스로 움직이는 곳)에서는 가로채지 않는다. 본문·단추·링크에서는 조금씩 스크롤한다(R1-074).
      return event.target === 'none' || event.target === 'control' ? 'lineDown' : undefined;
    case 'ArrowUp':
      return event.target === 'none' || event.target === 'control' ? 'lineUp' : undefined;
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return undefined;
  }
}

/** 블록 하나가 한 화면보다 클 때 이 비율보다 작게는 줄이지 않는다(그보다 크면 줄인 채 남은 만큼 스크롤 — "▼ 아래에 더 있어요") */
export const FIT_MIN_ZOOM = 0.72;

/**
 * 블록 하나(긴 표·그림·코드)가 쓸 수 있는 높이보다 클 때 줄일 비율(순수 함수). 들어가면 1, 아니면 넣을 수 있는 비율(0.01 단위로 내림),
 * 너무 작으면 FIT_MIN_ZOOM. 150% 확대처럼 화면이 낮을 때 막대 밑으로 들어가던 단계(walk-a11y-keyboard 4)를 한 화면에 넣는다.
 */
export function fitZoomFor(blockHeight: number, available: number, min: number = FIT_MIN_ZOOM): number {
  if (!(blockHeight > 0) || !(available > 0) || blockHeight <= available) {
    return 1;
  }
  return Math.max(min, Math.floor((available / blockHeight) * 100) / 100);
}

/**
 * 한 화면의 아래 끝(화면 좌표) — 막대 위 끝과 보이는 화면(visualViewport)의 아래 끝 가운데 작은 쪽(순수 함수).
 * 손가락으로 확대하면(visualViewport.scale > 1) 보이는 높이가 layout 화면보다 작아 막대 위라도 화면 밖일 수 있다. 확대가 없으면 막대 위 끝 그대로.
 */
export function visibleBottom(
  barTop: number,
  viewport?: { readonly offsetTop: number; readonly height: number; readonly scale?: number } | null,
): number {
  if (!viewport || !(viewport.height > 0) || (viewport.scale ?? 1) <= 1.001) {
    return barTop;
  }
  return Math.min(barTop, viewport.offsetTop + viewport.height);
}

/**
 * 화면 좌표의 반올림 여유(px) — 기기 화소 비율(devicePixelRatio)이 1이 아니면(브라우저 150% 확대 등) 자리 값이 1/화소비 단위로 떨어져
 * 4px 여유가 한두 픽셀 모자랐다. 기기 화소 두 칸만큼(최소 4px).
 */
export function pixelSlack(devicePixelRatio: number | undefined): number {
  const ratio = devicePixelRatio && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(4, Math.ceil(2 * ratio));
}

/* ───────────── 화면(브라우저에서만) ───────────── */

const OFF = 'data-present-off';
const BREAK_SELECTOR = '.box--challenge, .lesson-example-block';
/** 칸 앞 머리 상자 가운데 단계를 만들지 않는 것(교과서 쪽 쪽 표지 "교과서 124쪽") */
const INTRO_SKIP_SELECTOR = '.book-page-mark';
/** 수업 화면 중 새 탭으로 여는 [실습실에서 크게 열기](LessonExamples.astro) */
const BIG_OPEN_SELECTOR = 'a[data-lab-big-open]';

interface DomSection {
  readonly element: HTMLElement;
  readonly children: HTMLElement[];
  readonly model: PresentSection;
}

function focusTarget(element: Element | null): PresentKeyContext['target'] {
  if (!element || !(element instanceof HTMLElement)) {
    return 'none';
  }
  if (element instanceof HTMLInputElement) {
    return element.type === 'radio' || element.type === 'checkbox' || element.type === 'range' ? 'arrows' : 'text';
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element.isContentEditable) {
    return 'text';
  }
  // 옆으로 미는 코드 상자(<pre tabindex="0" role="region">)는 ←→로 스스로 움직인다.
  if (element.closest('pre, [role="region"], [role="slider"], [role="radio"]')) {
    return 'arrows';
  }
  if (element.closest('button, a[href], summary, iframe, [role="button"], [tabindex]:not([tabindex="-1"])')) {
    return 'control';
  }
  return 'none';
}

/** 화면에 보이지 않는 자식(컴포넌트가 제자리에 두는 <script>·<style>, 숨긴 요소)은 단계를 만들지 않는다 */
function isPresentable(child: Element): child is HTMLElement {
  return child instanceof HTMLElement && !['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META'].includes(child.tagName) && !child.hidden;
}

/**
 * 따라하기 예제("예제 2: 보드 쪽 …")·도전 과제 상자의 이름(막대 글에 쓴다). 예제 번호는 짝 차시 frontmatter의 번호 한 벌이다 —
 * 교과서 쪽도 같은 번호를 data-example-number에 싣는다(LessonExamples.astro·example-names.ts lessonExampleNumbers, 판 1.6.0 C173).
 */
function breakTitleOf(element: HTMLElement): string | undefined {
  const clean = (text: string | null | undefined) => text?.replace(/\s+/gu, ' ').trim() ?? '';
  if (element.matches('.lesson-example-block')) {
    const number = Number(element.dataset.exampleNumber);
    const title = clean(element.querySelector('.lesson-example__title')?.textContent);
    return title ? numberedExampleTitle(Number.isInteger(number) && number > 0 ? number : undefined, title) : undefined;
  }
  const title = clean(element.querySelector(':scope > .box__title')?.textContent);
  return title || undefined;
}

/**
 * 발표를 끝낸 자리에 초점을 둔다. 초점을 받지 않는 요소(제목·문단)는 잠깐 tabindex="-1"을 붙였다가 초점이 떠나면 뗀다
 * (Tab 차례에는 들어가지 않고, 다음 Tab은 그 자리 다음 조작으로 간다).
 */
function focusReadingPlace(element: HTMLElement): void {
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1');
    element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
  }
  element.focus({ preventScroll: true });
}

/** 요소 높이 + 위아래 바깥 여백(이웃 여백이 겹치는 만큼 조금 넉넉하게 잰다) */
function outerHeight(element: HTMLElement): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const margin = style ? Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom) : 0;
  return element.getBoundingClientRect().height + (Number.isFinite(margin) ? margin : 0);
}

/**
 * 핵심 개념 칸의 접힌 상자(details[data-concepts-fold] — lesson-html.ts foldConceptHtml, 판 1.6.0 C174)는 발표 중에 펼쳐 둔 채 투명하게 취급한다:
 * 안의 ###·표·그림이 바깥 블록과 같은 줄에서 한 단계씩 나뉘어야 ###마다 한 장씩 보인다. 제목 줄(summary)은 블록이 아니다(CSS가 숨긴다).
 */
export const CONCEPT_FOLD_SELECTOR = 'details[data-concepts-fold]';

export function flattenConceptFolds(children: readonly Element[]): Element[] {
  return children.flatMap((child) =>
    child.matches(CONCEPT_FOLD_SELECTOR) ? Array.from(child.children).filter((inner) => inner.tagName !== 'SUMMARY') : [child],
  );
}

function readSections(body: HTMLElement): DomSection[] {
  return Array.from(body.querySelectorAll<HTMLElement>(':scope > section.lesson-section'))
    .filter((section) => section.dataset.section !== 'teacher')
    .map((element) => {
      const children = flattenConceptFolds(Array.from(element.children)).filter(isPresentable);
      const blocks: PresentBlock[] = children.map((child) => {
        if (child.tagName === 'H2') {
          return { kind: 'h2', title: child.textContent?.trim() ?? '' };
        }
        if (child.tagName === 'H3') {
          return { kind: 'h3', title: child.textContent?.trim() ?? '' };
        }
        if (child.hasAttribute('data-present-split')) {
          return { kind: 'split', items: child.querySelectorAll('[data-present-item]').length };
        }
        if (child.matches(BREAK_SELECTOR)) {
          return { kind: 'break', title: breakTitleOf(child) };
        }
        return { kind: 'content' };
      });
      const heading = children.find((child) => child.tagName === 'H2');
      return { element, children, model: { title: heading?.textContent?.trim() ?? '', blocks } };
    });
}

/** 차시 페이지에 수업 화면을 붙인다(LessonPresent.astro가 부른다). 여러 번 불러도 한 번만 붙는다. */
export function installLessonPresentation(doc: Document = document): void {
  const root = doc.querySelector<HTMLElement>('[data-lesson-present]');
  const article = doc.querySelector<HTMLElement>('article.lesson');
  const body = article?.querySelector<HTMLElement>('.lesson-body');
  const openButton = doc.querySelector<HTMLButtonElement>('[data-present-open]');
  if (!root || !article || !body || !openButton || root.dataset.presentReady === 'true') {
    return;
  }
  root.dataset.presentReady = 'true';
  const html = doc.documentElement;
  const win = doc.defaultView;
  const main = doc.getElementById('main-content');
  const header = article.querySelector<HTMLElement>('.lesson__header');
  const status = root.querySelector<HTMLElement>('[data-present-status]');
  const announce = root.querySelector<HTMLElement>('[data-present-announce]');
  const endNote = root.querySelector<HTMLElement>('[data-present-end]');
  const previousButton = root.querySelector<HTMLButtonElement>('[data-present-previous]');
  const nextButton = root.querySelector<HTMLButtonElement>('[data-present-next]');
  const fullscreenButton = root.querySelector<HTMLButtonElement>('[data-present-fullscreen]');
  const exitButton = root.querySelector<HTMLButtonElement>('[data-present-exit]');
  const more = root.querySelector<HTMLElement>('[data-present-more]');
  const lessonTitle = article.querySelector('h1')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';

  let sections: DomSection[] = [];
  let steps: PresentStep[] = [];
  let index = 0;
  let enteredFullscreen = false;
  /** 처음 나누기가 끝났는가(글꼴·크기 모르는 그림을 기다리는 동안 false). 끝난 뒤에는 창 크기가 바뀔 때만 다시 나눈다 — 총 단계 수 고정(판 1.6.0) */
  let settled = false;
  let settleToken = 0;

  const markedElements = new Set<Element>();
  const hide = (element: Element) => {
    element.setAttribute(OFF, '');
    markedElements.add(element);
  };
  /** 한 화면에 넣으려고 줄인 블록(fit) — 단계를 바꿀 때마다 되돌린다 */
  const zoomedElements = new Set<HTMLElement>();
  const clearMarks = () => {
    for (const element of markedElements) {
      element.removeAttribute(OFF);
    }
    markedElements.clear();
    for (const element of zoomedElements) {
      element.style.removeProperty('zoom');
    }
    zoomedElements.clear();
  };

  const intro = () => Array.from(body.children).filter((child) => isPresentable(child) && !child.matches('section.lesson-section'));
  /** 머리 상자 가운데 단계를 만들 내용(교과서 쪽 쪽 표지는 빼고) */
  const introContent = () => intro().filter((child) => !child.matches(INTRO_SKIP_SELECTOR));
  /** 머리 상자 장의 이름: 첫 상자의 제목(교과서 쪽 "성취 계획") 또는 "들어가며" */
  const introLabel = (): string | undefined => {
    const first = introContent()[0];
    if (!first) {
      return undefined;
    }
    const title = first.querySelector(':scope > .box__title, :scope > h2, :scope > h3')?.textContent?.replace(/\s+/gu, ' ').trim();
    return title || '들어가며';
  };

  /** 단계 하나를 보이게 표시만 바꾼다(막대·초점·스크롤은 render가) */
  const applyStep = (step: PresentStep) => {
    clearMarks();
    // 교사용 칸은 늘 숨긴다.
    for (const teacher of body.querySelectorAll(':scope > section.lesson-section[data-section="teacher"]')) {
      hide(teacher);
    }
    if (header && !step.title) {
      hide(header);
    }
    if (!step.intro) {
      for (const child of intro()) {
        hide(child);
      }
    }
    sections.forEach((section, sectionIndex) => {
      if (sectionIndex !== step.section) {
        hide(section.element);
        return;
      }
      section.children.forEach((child, childIndex) => {
        if (!step.blocks.includes(childIndex)) {
          hide(child);
          return;
        }
        if (step.item !== undefined && child.hasAttribute('data-present-split')) {
          child.querySelectorAll('[data-present-item]').forEach((item, itemIndex) => {
            if (itemIndex !== step.item) {
              hide(item);
            }
          });
        }
      });
    });
    // 한 화면보다 큰 블록 하나는 정해 둔 비율로 줄인다(CSS zoom — 자리까지 함께 줄어 막대 위에서 끝난다)
    const fitted = step.fit ? sections[step.section]?.children[step.fit.block] : undefined;
    if (fitted && step.fit && step.fit.zoom < 1) {
      fitted.style.setProperty('zoom', String(step.fit.zoom));
      zoomedElements.add(fitted);
    }
    // 제목 장 모양(LessonPresent.astro): plain = 제목만(가운데), goals = 제목 + 학습 목표(머리를 위로 붙여 둘이 한 화면에)
    if (step.title) {
      html.setAttribute('data-present-title', step.section >= 0 ? 'goals' : 'plain');
    } else {
      html.removeAttribute('data-present-title');
    }
  };

  /** 아래 막대의 위 끝(화면 좌표). 단계 내용은 이 위에서 끝나야 가려지지 않는다. */
  const barTop = () => {
    const viewport = win?.innerHeight ?? 768;
    const bar = root.querySelector<HTMLElement>('.lesson-present__bar');
    const top = bar?.getBoundingClientRect().top;
    return top !== undefined && top > 0 && top <= viewport ? top : viewport - 64;
  };

  /** 한 화면의 아래 끝 — 막대 위 끝과 보이는 화면(손가락 확대) 가운데 작은 쪽, 기기 화소 비율만큼 여유를 뺀 값(판 1.6.0 C177, walk-a11y-keyboard 4) */
  const screenLimit = () => visibleBottom(barTop(), win?.visualViewport ?? null) - pixelSlack(win?.devicePixelRatio);

  /**
   * 한 단계에 쓸 수 있는 높이 = 막대 위 끝 − 단계 내용이 시작하는 자리(쪽 위 여백·머리글) − 여유.
   * 예전에는 화면 높이에서 막대만 뺐는데, 단계 내용이 화면 맨 위가 아니라 60~100px 아래에서 시작해 "들어간다"고 본 단계의 끝이
   * 막대 밑으로 들어갔다(1366×768에서 1-1-1 31단계 가운데 10 — 2026-09-26 Phase 6 사용성 검토 지적 2).
   */
  const availableHeight = (contentTop: number) => screenLimit() - contentTop - 12;

  /** 단계 하나를 그려 첫 블록(바깥 여백 포함)이 화면 위에서 어디서 시작하는지 잰다 */
  const contentTopOf = (step: PresentStep): number => {
    applyStep(step);
    win?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const element = sections[step.section]?.children[step.blocks[0] ?? -1];
    if (!element) {
      return 0;
    }
    const style = win?.getComputedStyle(element);
    const margin = style ? Number.parseFloat(style.marginTop) : 0;
    return Math.max(0, element.getBoundingClientRect().top - (Number.isFinite(margin) ? margin : 0));
  };

  /** 지금 그려 둔 단계의 블록 가운데 맨 아래(화면 좌표, 스크롤 0) — 제목 장이면 머리도 */
  const drawnBottom = (step: PresentStep): number => {
    const section = sections[step.section];
    let bottom = step.title && header ? header.getBoundingClientRect().bottom : 0;
    for (const block of step.blocks) {
      const element = section?.children[block];
      if (element) {
        bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
      }
    }
    return bottom;
  };

  /**
   * 나눈 단계를 실제로 그려 보아, 첫 내용 블록 뒤의 블록이 막대 밑으로 들어가면 그 블록부터 "(이어서)" 단계로 넘긴다
   * (여백 겹침·다시 보이는 제목까지 실제 자리로 잰다 — 높이 합으로만 나누면 조금씩 어긋났다, 2026-09-26 Phase 6 사용성 검토 지적 2).
   * 첫 내용 블록 하나가 화면보다 크면 그 블록을 조금(FIT_MIN_ZOOM까지) 줄여 넣는다 — 그래도 남으면 스크롤한다(판 1.6.0, 150% 확대).
   * 학습 목표를 합친 제목 장이 넘치면 제목 장과 학습 목표 장 둘로 되돌린다.
   */
  const fitToBar = (planned: readonly PresentStep[]): PresentStep[] => {
    const fitted: PresentStep[] = [];
    const queue = [...planned];
    const limit = screenLimit();
    while (queue.length > 0) {
      const step = queue.shift()!;
      const section = sections[step.section];
      if (step.title && section) {
        applyStep(step);
        win?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        if (drawnBottom(step) > limit) {
          fitted.push({ section: -1, blocks: [], label: step.label, title: true });
          queue.unshift({ section: step.section, blocks: step.blocks, label: section.model.title });
          continue;
        }
        fitted.push(step);
        continue;
      }
      if (section && step.item !== undefined && step.blocks.length > 2) {
        // 퀴즈 첫 문항 단계(제목 + 안내 문단 + 문항): 문항이 막대 밑으로 들어가면 안내 문단을 앞 단계로 뺀다 — 채점 결과가 문항 바로 아래에
        // 나오므로 문항은 막대 위에서 끝나야 한다(2026-09-26 Phase 6 사용성 검토 지적 2).
        applyStep(step);
        win?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        const kinds = section.model.blocks;
        const splitBlock = step.blocks[step.blocks.length - 1] ?? -1;
        const splitElement = section.children[splitBlock];
        const leading = step.blocks.slice(0, -1);
        const headings = leading.filter((block) => kinds[block]?.kind === 'h2' || kinds[block]?.kind === 'h3');
        if (splitElement && splitElement.getBoundingClientRect().bottom > limit && headings.length < leading.length) {
          fitted.push({ section: step.section, blocks: leading, label: step.label.replace(/\s*\(\d+\/\d+\)$/u, '') });
          fitted.push({ ...step, blocks: [...headings, splitBlock] });
          continue;
        }
      }
      if (!section || step.item !== undefined || step.blocks.length < 1) {
        fitted.push(step);
        continue;
      }
      applyStep(step);
      win?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      const kinds = section.model.blocks;
      const isHeading = (block: number) => kinds[block]?.kind === 'h2' || kinds[block]?.kind === 'h3';
      let headingCount = 0;
      while (headingCount < step.blocks.length - 1 && isHeading(step.blocks[headingCount] ?? -1)) {
        headingCount += 1;
      }
      let cut = -1;
      for (let position = headingCount + 1; position < step.blocks.length; position += 1) {
        const element = section.children[step.blocks[position] ?? -1];
        if (element && element.getBoundingClientRect().bottom > limit) {
          cut = position;
          break;
        }
      }
      const chunk: PresentStep = cut < 0 ? step : { ...step, blocks: step.blocks.slice(0, cut) };
      // 제목 뒤 내용 블록이 하나뿐인데 그 블록이 막대 밑으로 들어가면(긴 표·그림·상자) 그 블록만 줄여 넣는다(판 1.6.0 — 150% 확대).
      // 퀴즈 문항(split)·따라 하기 예제(break)는 줄이지 않는다 — 실습실 틀·보기 단추 크기가 바뀌면 안 된다.
      const first = chunk.blocks[headingCount];
      const firstElement = first === undefined ? undefined : section.children[first];
      if (firstElement && first !== undefined && kinds[first]?.kind === 'content' && chunk.blocks.length === headingCount + 1) {
        const box = firstElement.getBoundingClientRect();
        const zoom = box.bottom > limit ? fitZoomFor(box.height, limit - box.top) : 1;
        fitted.push(zoom < 1 ? { ...chunk, fit: { block: first, zoom } } : chunk);
      } else {
        fitted.push(chunk);
      }
      if (cut >= 0) {
        const label = step.label.endsWith(` ${CONTINUED_LABEL}`) ? step.label : `${step.label} ${CONTINUED_LABEL}`;
        queue.unshift({ ...step, blocks: [...step.blocks.slice(0, headingCount), ...step.blocks.slice(cut)], label });
      }
    }
    return fitted;
  };

  /** 단계를 그려 보여 그 단계 블록들의 맨 위·맨 아래(화면 좌표, 스크롤 0)를 잰다 */
  const extentOf = (step: PresentStep): { top: number; bottom: number } | null => {
    const section = sections[step.section];
    if (!section) {
      return null;
    }
    applyStep(step);
    win?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    let top = Number.POSITIVE_INFINITY;
    let bottom = 0;
    for (const block of step.blocks) {
      const element = section.children[block];
      if (element) {
        const box = element.getBoundingClientRect();
        top = Math.min(top, box.top);
        bottom = Math.max(bottom, box.bottom);
      }
    }
    return Number.isFinite(top) ? { top, bottom } : null;
  };

  /**
   * 너무 잘게 나뉜 단계를 이웃 단계와 합친다(R1-075 — 제목 한 줄과 문장 하나뿐인 빈 화면 단계, "(이어서)"가 줄줄이 이어지는 단계).
   * 앞 단계가 화면의 SHORT_STEP_RATIO 이하만 쓰고, 합친 내용이 막대 위에서 끝날 때만 합친다 — 합쳐서 넘치면 그대로 둔다.
   * 합친 단계가 또 짧으면 다음 단계와 이어서 시도한다. 퀴즈 문항 단계·제목 장·다른 칸과는 합치지 않는다(isMergeable).
   * 줄여 넣은 블록(fit)이 있는 단계도 합치지 않는다.
   */
  const mergeShort = (planned: readonly PresentStep[]): PresentStep[] => {
    const limit = screenLimit();
    const merged: PresentStep[] = [];
    for (const step of planned) {
      const previous = merged[merged.length - 1];
      if (previous && isMergeable(previous, step) && !previous.fit && !step.fit) {
        const before = extentOf(previous);
        if (before && before.bottom - before.top <= SHORT_STEP_RATIO * (limit - before.top)) {
          const candidate: PresentStep = {
            ...previous,
            blocks: unionBlocks(previous.blocks, step.blocks),
            label: mergedLabel(previous.label, step.label),
          };
          const after = extentOf(candidate);
          if (after && after.bottom <= limit) {
            merged[merged.length - 1] = candidate;
            continue;
          }
        }
      }
      merged.push(step);
    }
    return merged;
  };

  /**
   * 단계를 다시 나눈다: 기본 단계(planPresentationSteps)를 하나씩 보여 블록 높이를 잰 뒤 화면보다 긴 단계를 쪼개고(splitTallSteps),
   * 그린 자리로 한 번 더 맞춘다(fitToBar). keep이 있으면 보고 있던 자리(칸·첫 내용 블록)가 든 단계로 돌아온다.
   */
  const replan = (keep?: PresentStep) => {
    const models = sections.map((section) => section.model);
    const base = planPresentationSteps(lessonTitle, models, { introLabel: introLabel() });
    const heights = new Map<string, number>();
    let contentTop: number | null = null;
    for (const step of base) {
      // 제목 장(머리가 함께 보여 내용이 아래에서 시작한다)은 "내용이 시작하는 자리"를 재는 데 쓰지 않는다
      if (step.section < 0 || step.item !== undefined || step.blocks.length < 2 || step.title) {
        continue;
      }
      if (contentTop === null) {
        contentTop = contentTopOf(step);
      } else {
        applyStep(step);
      }
      const children = sections[step.section]?.children ?? [];
      for (const block of step.blocks) {
        const element = children[block];
        if (element) {
          heights.set(`${step.section}:${block}`, outerHeight(element));
        }
      }
    }
    steps = mergeShort(fitToBar(splitTallSteps(base, models, (section, block) => heights.get(`${section}:${block}`) ?? 0, availableHeight(contentTop ?? 0))));
    if (keep) {
      const kinds = models[keep.section]?.blocks ?? [];
      const anchor = keep.blocks.find((block) => kinds[block]?.kind !== 'h2' && kinds[block]?.kind !== 'h3') ?? keep.blocks[0];
      const found = steps.findIndex(
        (step) =>
          step.section === keep.section &&
          step.item === keep.item &&
          Boolean(step.intro) === Boolean(keep.intro) &&
          (anchor === undefined || step.blocks.includes(anchor)),
      );
      index = found >= 0 ? found : Math.min(index, steps.length - 1);
    }
  };

  let replanTimer: number | undefined;
  /** 창 크기가 바뀌면 다시 나눈다(보고 있던 자리는 그대로). 처음 나누기를 기다리는 동안에는 그쪽이 맡는다 */
  const scheduleReplan = () => {
    if (!html.hasAttribute('data-presenting') || !settled) {
      return;
    }
    if (replanTimer !== undefined) {
      win?.clearTimeout(replanTimer);
    }
    replanTimer = win?.setTimeout(() => {
      replanTimer = undefined;
      if (html.hasAttribute('data-presenting') && settled) {
        replan(steps[index]);
        render();
      }
    }, 200);
  };

  /** 지금 단계를 주소 끝 #slide=N으로 적는다(기록 칸은 새로 만들지 않는다 — [뒤로]가 수업 화면 단계마다 멈추지 않게) */
  const writeHash = () => {
    if (!win || !settled) {
      return;
    }
    const hash = slideHash(index + 1);
    if (win.location.hash === hash) {
      return;
    }
    try {
      win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}${hash}`);
    } catch {
      // 주소를 바꾸지 못해도(샌드박스 iframe 등) 수업 화면은 그대로
    }
  };

  /** [실습실에서 크게 열기]를 수업 화면 중에는 새 탭 + ?from=slide&n=N으로(끝내면 되돌린다 — restoreBigOpen) */
  const markBigOpen = (link: HTMLAnchorElement) => {
    const original = link.dataset.hrefOriginal ?? link.getAttribute('href') ?? '';
    if (!original) {
      return;
    }
    link.dataset.hrefOriginal = original;
    link.setAttribute('href', slideLabHref(original, index + 1));
    link.target = '_blank';
    link.rel = 'noopener';
    const label = link.dataset.labelOriginal ?? link.getAttribute('aria-label') ?? link.textContent?.trim() ?? '';
    link.dataset.labelOriginal = label;
    link.setAttribute('aria-label', `${label} (새 탭에서 열려요)`);
  };
  const restoreBigOpen = () => {
    for (const link of body.querySelectorAll<HTMLAnchorElement>(BIG_OPEN_SELECTOR)) {
      if (link.dataset.hrefOriginal !== undefined) {
        link.setAttribute('href', link.dataset.hrefOriginal);
        delete link.dataset.hrefOriginal;
      }
      if (link.dataset.labelOriginal !== undefined) {
        link.setAttribute('aria-label', link.dataset.labelOriginal);
        delete link.dataset.labelOriginal;
      }
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
  };

  const render = () => {
    const step = steps[index];
    if (!step) {
      return;
    }
    applyStep(step);
    const last = index === steps.length - 1;
    if (settled) {
      if (status) {
        status.textContent = `${index + 1} / ${steps.length} · ${shortStepLabel(step.label)}`;
      }
      if (announce) {
        announce.textContent = `${steps.length}단계 가운데 ${index + 1}단계 · ${step.label}${last ? ` · ${LAST_STEP_NOTE}` : ''}`;
      }
    }
    if (endNote) {
      endNote.hidden = !(settled && last);
    }
    // 끝 단계의 단추는 disabled가 아니라 aria-disabled — 초점이 그 단추에 남는다(disabled면 초점이 BODY로 사라졌다, walk-a11y-keyboard 5)
    previousButton?.setAttribute('aria-disabled', !settled || index === 0 ? 'true' : 'false');
    nextButton?.setAttribute('aria-disabled', !settled || last ? 'true' : 'false');
    root.dataset.presentStep = String(index + 1);
    root.dataset.presentTotal = String(steps.length);
    root.toggleAttribute('data-present-settling', !settled);
    // 초점이 숨긴 곳에 남아 있으면 본문으로 옮긴다(키보드 사용자가 길을 잃지 않게).
    const active = doc.activeElement;
    if (active instanceof HTMLElement && active !== doc.body && active.closest(`[${OFF}]`)) {
      main?.focus({ preventScroll: true });
    }
    for (const link of body.querySelectorAll<HTMLAnchorElement>(BIG_OPEN_SELECTOR)) {
      markBigOpen(link);
    }
    win?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    syncBarHeight();
    updateMore();
    writeHash();
  };

  /** 막대 높이를 쪽 아래 여백과 "더 있어요" 띠 자리에 쓰도록 CSS 변수로 알린다(막대 높이는 단계마다 같지만 창 크기에 따라 다르다) */
  const syncBarHeight = () => {
    const height = root.querySelector<HTMLElement>('.lesson-present__bar')?.offsetHeight ?? 0;
    if (height > 0) {
      html.style.setProperty('--present-bar-h', `${height}px`);
    }
  };

  /** 이 단계 내용의 맨 아래(문서 좌표). 보이는 블록만 잰다 — 머리글·쪽 아래 여백은 빼고 막대에 가려질 내용만 본다 */
  const contentBottom = (): number => {
    const scrollY = win?.scrollY ?? 0;
    const step = steps[index];
    if (!step) {
      return 0;
    }
    const targets: Element[] = [
      ...(step.title && header ? [header] : []),
      ...(step.intro ? intro() : []),
      ...step.blocks.flatMap((block) => {
        const element = sections[step.section]?.children[block];
        return element ? [element] : [];
      }),
    ];
    let bottom = 0;
    for (const element of targets) {
      if (!element.closest(`[${OFF}]`)) {
        bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
      }
    }
    return bottom + scrollY;
  };

  /** 아래에 더 있으면 "▼ 아래에 더 있어요" 띠를 보인다 */
  const updateMore = () => {
    if (!more) {
      return;
    }
    more.hidden = !(html.hasAttribute('data-presenting') && win && hasMoreBelow(contentBottom(), win.scrollY, barTop()));
  };

  /** Space·PageDown·PageUp(한 화면)·↓·↑(조금씩)로 쪽을 스크롤한다. 움직였으면 true, 움직일 수 없으면 false */
  const scrollBy = (direction: 1 | -1, amount: number): boolean => {
    if (!win) {
      return false;
    }
    const target = scrollTargetFor({
      direction,
      scrollY: win.scrollY,
      barTop: barTop(),
      contentBottom: contentBottom(),
      maxScroll: Math.max(0, html.scrollHeight - win.innerHeight),
      amount,
    });
    if (target === null) {
      return false;
    }
    win.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
    updateMore();
    return true;
  };

  const go = (next: number) => {
    if (!settled) {
      return;
    }
    const clamped = Math.max(0, Math.min(steps.length - 1, next));
    if (clamped !== index) {
      index = clamped;
      render();
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }
    // 시작 초점이 [다음 단계]에 있으므로(R2-023) 그 단추 위의 Space도 본문 Space처럼 다룬다 — 이 단계 아래가 남았으면 한 화면 스크롤,
    // 끝이면 다음 단계(통합 확인: 단추가 눌려 긴 단계의 아래쪽을 건너뛰었다). Enter는 단추 그대로 다음 단계.
    const spaceOnNext = event.key === ' ' && nextButton !== null && doc.activeElement === nextButton;
    const command = presentCommandFor({
      key: event.key,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      target: spaceOnNext ? 'none' : focusTarget(doc.activeElement),
    });
    if (!command) {
      return;
    }
    // 용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫는다(툴팁보다 먼저 듣도록 캡처 단계에 걸어 둔 까닭).
    if (command === 'exit' && doc.querySelector('.glossary-term__link[data-tooltip="open"]')) {
      return;
    }
    if (command === 'lineDown' || command === 'lineUp') {
      // 쪽 스크롤은 우리가 맡는다(남은 내용이 없을 때 쪽이 빈 여백으로 밀려 내려가지 않게 늘 막는다)
      event.preventDefault();
      scrollBy(command === 'lineDown' ? 1 : -1, Math.max(48, Math.round(barTop() * 0.2)));
      return;
    }
    // PageDown·Space는 이 단계가 아래로 더 있으면 한 화면 스크롤, 끝이면 다음 단계. PageUp은 위로 더 있으면 스크롤, 맨 위면 앞 단계(R1-074)
    const pageKey = (command === 'next' && (event.key === 'PageDown' || event.key === ' ')) || (command === 'previous' && event.key === 'PageUp');
    if (pageKey && scrollBy(command === 'next' ? 1 : -1, Math.max(80, Math.round(barTop() - 72)))) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (command === 'next') {
      go(index + 1);
    } else if (command === 'previous') {
      go(index - 1);
    } else if (command === 'first') {
      go(0);
    } else if (command === 'last') {
      go(steps.length - 1);
    } else {
      exit();
    }
  };

  const updateFullscreenButton = () => {
    if (fullscreenButton) {
      const on = Boolean(doc.fullscreenElement);
      fullscreenButton.setAttribute('aria-pressed', on ? 'true' : 'false');
      fullscreenButton.textContent = on ? '전체 화면 끄기' : '전체 화면';
    }
  };

  /** 크기를 모르는 그림(width·height 없음)이 아직 다 안 받아졌거나 글꼴을 받는 중이면, 처음 나누기를 그 뒤로 미룬다 */
  const pendingLoads = (): Promise<unknown>[] => {
    const loads: Promise<unknown>[] = [];
    if (doc.fonts && doc.fonts.status !== 'loaded') {
      loads.push(doc.fonts.ready.catch(() => undefined));
    }
    for (const image of body.querySelectorAll<HTMLImageElement>('img')) {
      if (!image.complete && !(image.getAttribute('width') && image.getAttribute('height'))) {
        loads.push(image.decode().catch(() => undefined));
      }
    }
    return loads;
  };

  /** 발표를 시작할 때 우리가 펼친 핵심 개념 접기 — 끝낼 때 다시 닫는다(읽던 자리가 안에 있으면 그 접기는 연 채로 둔다) */
  let openedFolds: HTMLDetailsElement[] = [];
  /** 수업 화면을 열 때 주소에 있던 #위치(#p124 등 — #slide=N이 아니면). 단계마다 #slide=N으로 바꿔 쓰므로 끝낼 때 되돌린다 */
  let hashBeforeEnter = '';

  /** 수업 화면을 연다. startStep(1부터)을 주면 처음 나누기가 끝난 뒤 그 단계로 간다(#slide=N) */
  const enter = (startStep?: number) => {
    hashBeforeEnter = win && slideNumberFromHash(win.location.hash) === undefined ? win.location.hash : '';
    openedFolds = Array.from(body.querySelectorAll<HTMLDetailsElement>(CONCEPT_FOLD_SELECTOR)).filter((fold) => !fold.open);
    for (const fold of openedFolds) {
      fold.open = true;
    }
    sections = readSections(body);
    html.dataset.presenting = '';
    root.hidden = false;
    // 늦게 받는(lazy) 그림은 그 단계를 보여 줄 때에야 받아져, 발표 도중에 높이가 바뀌고 단계 수가 달라졌다(휴대폰 23 → 25단계).
    // 수업 화면을 시작하면 이 차시의 그림을 모두 받는다.
    for (const image of body.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
      image.loading = 'eager';
    }
    const loads = pendingLoads();
    settled = loads.length === 0;
    const token = (settleToken += 1);
    // 큰 글씨(수업 화면 스타일)가 걸린 뒤에 재야 한 화면에 맞게 나뉜다.
    replan();
    index = settled && startStep !== undefined ? Math.max(0, Math.min(steps.length - 1, startStep - 1)) : 0;
    doc.addEventListener('keydown', onKeydown, true);
    win?.addEventListener('resize', scheduleReplan);
    win?.addEventListener('scroll', updateMore, { passive: true });
    if (!settled && status) {
      // 글꼴·크기 모르는 그림을 받는 동안(느린 망)은 단계 수를 보이지 않는다 — 다 받고 한 번에 나눈 수가 끝까지 그대로다
      status.textContent = '수업 화면을 준비하고 있어요…';
      if (announce) {
        announce.textContent = '수업 화면을 준비하고 있어요.';
      }
    }
    render();
    // 시작 초점: 막대의 [다음 단계](마지막 단계면 [끝내기]). 보이는 조작에 초점이 있어야 키보드·낭독기 사용자가 어디 있는지 안다 —
    // 예전에는 보이지 않는 main에 놓였다(R2-023). 쪽을 움직이지 않는다(preventScroll).
    (nextButton && (index < steps.length - 1 || !settled) ? nextButton : (exitButton ?? main))?.focus({ preventScroll: true });
    if (!settled) {
      const timeout = new Promise((resolve) => win?.setTimeout(resolve, 2500));
      void Promise.race([Promise.all(loads), timeout]).then(() => {
        win?.requestAnimationFrame(() =>
          win.requestAnimationFrame(() => {
            if (token !== settleToken || !html.hasAttribute('data-presenting')) {
              return;
            }
            settled = true;
            replan();
            index = startStep !== undefined ? Math.max(0, Math.min(steps.length - 1, startStep - 1)) : 0;
            render();
          }),
        );
      });
    }
  };

  /**
   * 끝낸 뒤 읽던 자리가 화면 위쪽에 보이게 맞춘다 — 끝내면 큰 글씨가 풀리고 접기가 닫혀 쪽 높이가 바뀌는데, 그 일이 다음 프레임까지 이어져
   * 맞춰 둔 제목이 화면 밖(위 1,524px 등)으로 밀려났다(walk-a11y-keyboard 1). 바로 한 번, 다음 두 프레임과 0.3초 뒤에 다시 본다.
   */
  const keepInView = (target: HTMLElement, block: ScrollLogicalPosition) => {
    target.scrollIntoView({ block });
    const check = () => {
      const viewport = win?.innerHeight ?? 0;
      const box = target.getBoundingClientRect();
      if (box.bottom < 0 || box.top < -1 || box.top > viewport * 0.6) {
        target.scrollIntoView({ block });
      }
    };
    win?.requestAnimationFrame(() => {
      check();
      win.requestAnimationFrame(check);
    });
    win?.setTimeout(check, 300);
  };

  const exit = () => {
    const step = steps[index];
    const anchor = step && step.section >= 0 && !step.title ? sections[step.section]?.children[step.blocks[0] ?? 0] : undefined;
    settleToken += 1;
    doc.removeEventListener('keydown', onKeydown, true);
    win?.removeEventListener('resize', scheduleReplan);
    win?.removeEventListener('scroll', updateMore);
    // 슬라이드 안을 내려 둔 채 끝내면 그 스크롤 값이 읽기 화면에 남아 엉뚱한 곳이 보였다 — 맨 위로 되돌린 뒤 끝낸다
    win?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    clearMarks();
    restoreBigOpen();
    delete html.dataset.presenting;
    html.removeAttribute('data-present-title');
    html.style.removeProperty('--present-bar-h');
    if (more) {
      more.hidden = true;
    }
    if (endNote) {
      endNote.hidden = true;
    }
    root.hidden = true;
    delete root.dataset.presentStep;
    delete root.dataset.presentTotal;
    root.removeAttribute('data-present-settling');
    if (enteredFullscreen && doc.fullscreenElement) {
      void doc.exitFullscreen().catch(() => undefined);
    }
    enteredFullscreen = false;
    // 주소의 ?view=slide와 #slide=N을 지운다 — 새로 고치거나 주소를 복사해도 읽기 화면으로 열리게(주소가 바뀔 뿐 기록 칸은 새로 만들지 않는다).
    // 열 때 있던 다른 #위치(#p124 등)는 되돌린다.
    if (win && (wantsSlideView(win.location.search) || slideNumberFromHash(win.location.hash) !== undefined)) {
      const hash = slideNumberFromHash(win.location.hash) !== undefined ? hashBeforeEnter : win.location.hash;
      try {
        win.history.replaceState(win.history.state, '', `${win.location.pathname}${searchWithoutSlideView(win.location.search)}${hash}`);
      } catch {
        // 주소를 바꾸지 못해도(샌드박스 iframe 등) 수업 화면 끝내기는 그대로
      }
    }
    // 처음에 닫혀 있던 핵심 개념 접기를 다시 닫는다. 읽던 자리(anchor)가 그 안에 있으면 닫지 않는다 — 닫으면 그 자리로 스크롤·초점을 못 준다.
    for (const fold of openedFolds) {
      if (!anchor || !fold.contains(anchor)) {
        fold.open = false;
      }
    }
    openedFolds = [];
    // 수업 화면을 끝낸 자리(마지막으로 본 칸)에서 이어 읽게 한다. 초점도 그 자리(첫 블록 — 보통 칸 제목)에 둔다: 쪽 맨 위 [수업 화면]으로 돌리면
    // 초점이 화면 밖에 있어 보이지 않고 다음 Tab이 쪽 위 "이 차시의 차례"로 뛰어 읽던 자리를 잃었다(2026-09-26 Phase 6 사용성 검토 지적 10).
    if (anchor) {
      focusReadingPlace(anchor);
      keepInView(anchor, 'start');
    } else {
      openButton.focus({ preventScroll: true });
      keepInView(openButton, 'center');
    }
  };

  openButton.addEventListener('click', () => enter());
  // 수업 화면 중 퀴즈를 채점하면 결과 글이 문항 바로 아래에 나온다 — 아래 막대에 가리지 않게 보이는 곳으로 옮긴다
  // (html의 scroll-padding-block-end 6rem을 따른다, 2026-09-26 Phase 6 사용성 검토 지적 2).
  body.addEventListener('click', (event) => {
    if (!html.hasAttribute('data-presenting') || !(event.target instanceof Element)) {
      return;
    }
    // [실습실에서 크게 열기]는 누르는 순간에도 새 탭 + 지금 단계 번호로 맞춘다(실습실 틀을 연 뒤에 생긴 아래 줄 링크도)
    const bigOpen = event.target.closest<HTMLAnchorElement>(BIG_OPEN_SELECTOR);
    if (bigOpen) {
      markBigOpen(bigOpen);
      return;
    }
    const feedback = event.target.closest('[data-quiz-check]')?.closest('[data-quiz-item]')?.querySelector<HTMLElement>('[data-quiz-feedback]');
    if (feedback) {
      win?.requestAnimationFrame(() => feedback.scrollIntoView({ block: 'nearest' }));
    }
  }, true);
  // 퀴즈 보기(라디오)·단추에 키보드 초점이 가면 브라우저가 그 보기만 보이게 옮겨 문제 줄이 화면 위로 밀려났다(walk-a11y-keyboard 6) —
  // 초점이 간 조작이 막대 위에 그대로 보이는 한, 문제 글(legend)부터 보이게 맞춘다.
  body.addEventListener('focusin', (event) => {
    if (!html.hasAttribute('data-presenting') || !(event.target instanceof HTMLElement) || !win) {
      return;
    }
    const item = event.target.closest<HTMLElement>('[data-quiz-item]');
    const question = item?.querySelector<HTMLElement>('.quiz__question');
    if (!item || !question || question.contains(event.target)) {
      return;
    }
    const focused = event.target;
    win.requestAnimationFrame(() => {
      const top = question.getBoundingClientRect().top;
      const margin = 12;
      if (top >= margin) {
        return;
      }
      const delta = top - margin;
      if (focused.getBoundingClientRect().bottom - delta <= barTop() - margin) {
        win.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
        updateMore();
      }
    });
  });
  // 크기를 모르는 그림을 늦게 받은 경우는 처음 나누기(enter의 기다림)가 맡는다. 그 뒤에는 단계 수를 바꾸지 않는다(총 단계 수 고정).
  previousButton?.addEventListener('click', () => go(index - 1));
  nextButton?.addEventListener('click', () => go(index + 1));
  exitButton?.addEventListener('click', () => exit());
  if (fullscreenButton) {
    if (!doc.fullscreenEnabled) {
      fullscreenButton.hidden = true;
    } else {
      fullscreenButton.addEventListener('click', () => {
        if (doc.fullscreenElement) {
          void doc.exitFullscreen().catch(() => undefined);
        } else {
          void html
            .requestFullscreen()
            .then(() => {
              enteredFullscreen = true;
            })
            .catch(() => undefined);
        }
      });
      doc.addEventListener('fullscreenchange', updateFullscreenButton);
    }
  }
  openButton.hidden = false;
  // ?view=slide·#slide=N — 쪽을 그린 다음 한 프레임 뒤에 연다(첫 그리기 전에 재면 높이가 0이라 단계 나누기가 어긋난다)
  const openFromAddress = () => {
    if (!win) {
      return;
    }
    const start = slideNumberFromHash(win.location.hash);
    if (html.hasAttribute('data-presenting')) {
      // 수업 화면 중에 주소의 #slide=N을 손으로 바꾸면 그 단계로 간다
      if (start !== undefined && start !== index + 1) {
        go(start - 1);
      }
      return;
    }
    if (wantsSlideView(win.location.search) || start !== undefined) {
      enter(start);
    }
  };
  if (win && (wantsSlideView(win.location.search) || slideNumberFromHash(win.location.hash) !== undefined)) {
    win.requestAnimationFrame(openFromAddress);
  }
  win?.addEventListener('hashchange', openFromAddress);
}
