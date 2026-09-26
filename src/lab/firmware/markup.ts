/**
 * 펌웨어 굽기 화면의 HTML — PLAN §8.3 P3-09. 보드 준비 페이지(src/pages/start/board/)가 컴포넌트(src/components/lab/firmware/FirmwareFlasher.astro)로
 * 빌드할 때 그리고, 화면 논리(controller.ts)가 data-* 자리를 찾아 움직인다.
 *
 * 왜 Astro 태그가 아니라 글자로 만드나: 같은 HTML을 ① Astro 컴포넌트(빌드) ② 개발 서버 시험 입구(src/components/lab/firmware/dev-harness.ts —
 * 페이지에 컴포넌트를 넣기 전 브라우저 테스트용) ③ 단위 테스트(tests/unit/firmware/markup.test.ts)가 함께 쓰려고.
 * 글에 들어가는 값은 모두 escapeHtml을 거친다. .astro의 띄어쓰기 지우기 문제(CLAUDE.md)도 생기지 않는다.
 *
 * 화면 순서: 제목·한 줄 안내 → 브라우저·펌웨어·파일 상태 → (안 될 때 안내) → 지우기 선택 → [펌웨어 굽기 시작] → 단계 7개(진행률) → 끝/오류 상자
 * → 선생님용 접힘(수동으로 굽는 방법 — 교과서의 Thonny 방법·esptool 명령, 파일 정보, 칩만 확인하기, 자세한 기록).
 * 학생 글은 고1이 처음 읽어도 되게 "~해요"로 쓴다. 색만으로 상태를 알리지 않는다(단계마다 "끝·진행 중" 글자).
 */
import { formatMegabytes, formatOffset, formatWithCommas, type FirmwareInfo } from './manifest.ts';

export type FlashStageKey = 'port' | 'chip' | 'file' | 'erase' | 'write' | 'verify' | 'restart';

/** 단계 이름과 기다릴 때의 설명(화면 논리도 같은 표를 쓴다) */
export const FLASH_STAGES: readonly { readonly key: FlashStageKey; readonly name: string; readonly waiting: string }[] = Object.freeze([
  { key: 'port', name: '포트 고르기', waiting: '브라우저 창에서 보드가 꽂힌 포트(이름에 USB·CH340 같은 글자가 있는 것)를 골라요.' },
  { key: 'chip', name: '보드 칩 확인', waiting: '보드를 굽기 모드로 바꾸고 ESP32 칩인지 확인해요.' },
  { key: 'file', name: '펌웨어 파일 확인', waiting: '파일을 받아 크기와 지문(SHA-256)이 맞는지 확인해요.' },
  { key: 'erase', name: '보드 지우기', waiting: '"굽기 전에 보드를 모두 지우기"를 켰을 때만 해요.' },
  { key: 'write', name: '펌웨어 쓰기', waiting: '보드에 펌웨어를 보내요. 가장 오래 걸려요.' },
  { key: 'verify', name: '쓴 내용 확인', waiting: '보드에 들어간 내용이 파일과 같은지 확인해요.' },
  { key: 'restart', name: '보드 다시 시작', waiting: '보드를 다시 켜고 MicroPython이 시작하는지 봐요.' },
]);

export const STAGE_STATE_TEXT = Object.freeze({
  waiting: '기다림',
  active: '진행 중',
  done: '끝',
  skipped: '건너뜀',
  failed: '멈춤',
} as const);

export interface FirmwareFlasherMarkupOptions {
  readonly firmware: FirmwareInfo;
  /** 펌웨어 파일 주소(base 포함, 예: /ai-physical-computing/firmware/v1.29.0/…bin) */
  readonly fileUrl: string;
  /** 고지 파일 주소(없으면 null) */
  readonly noticeUrl: string | null;
  /** 빌드할 때 파일이 public/에 있었는지(모르면 null). 있을 때만 [파일 내려받기] 링크를 그린다(없는 파일 링크는 링크 검사가 막는다) */
  readonly fileAtBuild: boolean | null;
  /** ESP32 실습실 주소 */
  readonly labHref: string;
  /** 포트·케이블·드라이버 도움말 주소(보드 준비 페이지의 "포트 선택 창에 보드가 안 보여요" 안내) */
  readonly portHelpHref: string;
  /** (선택) 끝난 뒤 연결을 다시 확인할 곳(보드 준비 페이지의 [보드 연결] 자리 #connect). 없으면 링크를 그리지 않는다 */
  readonly checkHref?: string | null;
  /** 제목(없으면 그리지 않고 aria-label로) */
  readonly title?: string | null;
  readonly headingLevel?: 2 | 3 | 4;
  /** 한 페이지에 둘 이상 넣을 때 id 앞머리 */
  readonly idPrefix?: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

/** <script type="application/json"> 안에 넣어도 태그가 닫히지 않게 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, '\\u003c').replace(/>/gu, '\\u003e').replace(/&/gu, '\\u0026');
}

function stageItem(stage: (typeof FLASH_STAGES)[number]): string {
  // 진행률 막대는 쓰기에만(ROM은 지우는 동안 대답이 없어 진행률을 알 수 없다 — 지우기는 지난 시간을 글로만 알린다)
  const progress =
    stage.key === 'write'
      ? `<div class="fw-stage__progress" data-stage-progress hidden><progress class="fw-progress" max="100" value="0" aria-label="${escapeHtml(stage.name)} 진행률" data-progress-bar></progress><span class="fw-stage__progress-text" data-progress-text></span></div>`
      : '';
  return [
    `<li class="fw-stage" data-stage="${stage.key}" data-stage-state="waiting">`,
    '<span class="fw-stage__mark" aria-hidden="true"></span>',
    '<span class="fw-stage__body">',
    `<span class="fw-stage__head"><span class="fw-stage__name">${escapeHtml(stage.name)}</span>`,
    `<span class="fw-stage__state" data-stage-state-text>${STAGE_STATE_TEXT.waiting}</span></span>`,
    `<span class="fw-stage__detail" data-stage-detail>${escapeHtml(stage.waiting)}</span>`,
    progress,
    '</span>',
    '</li>',
  ].join('');
}

/** 펌웨어 굽기 화면 전체 HTML */
export function renderFirmwareFlasherHtml(options: FirmwareFlasherMarkupOptions): string {
  const info = options.firmware;
  const prefix = options.idPrefix ?? 'firmware';
  const level = options.headingLevel ?? 3;
  const title = options.title === undefined ? '펌웨어 굽기' : options.title;
  const titleId = `${prefix}-flasher-title`;
  const manualId = `${prefix}-manual`;
  const eraseHintId = `${prefix}-erase-hint`;
  const versionLabel = `MicroPython v${info.version}`;
  const sizeLabel = formatMegabytes(info.size);
  const offsetLabel = formatOffset(info.offset);
  const e = escapeHtml;
  const subLevel = Math.min(6, level + 1);
  const heading = title ? `<h${level} class="fw__title" id="${titleId}">${e(title)}</h${level}>` : '';
  const labelling = title ? `aria-labelledby="${titleId}"` : `aria-label="펌웨어 굽기"`;
  const downloadLink =
    options.fileAtBuild === true ? `<li><a href="${e(options.fileUrl)}" download>${e(info.fileName)} 내려받기(${e(sizeLabel)})</a></li>` : '';
  const noticeLink = options.noticeUrl ? `<li><a href="${e(options.noticeUrl)}">펌웨어 라이선스 고지(${e(info.license)})</a></li>` : '';

  return [
    `<section class="fw" data-firmware-flasher data-state="idle" data-support="checking" data-file-state="checking" data-file-url="${e(options.fileUrl)}" data-file-at-build="${options.fileAtBuild === null ? 'unknown' : options.fileAtBuild ? 'present' : 'missing'}" ${labelling}>`,
    `<script type="application/json" data-firmware-info>${jsonForScript(info)}</script>`,
    heading,
    `<p class="fw__lead">보드에 ${e(versionLabel)}을 넣어요(굽기). 보드를 USB 케이블로 컴퓨터에 꽂고 [펌웨어 굽기 시작]을 누르면 1~2분쯤 걸려요.</p>`,
    '<noscript><p class="fw__notice fw__notice--warning">펌웨어 굽기는 자바스크립트가 켜진 컴퓨터용 Chrome이나 Edge에서 돼요. 아래 "선생님용: 수동으로 굽는 방법"을 볼 수도 있어요.</p></noscript>',
    '<dl class="fw__facts">',
    `<div class="fw__fact"><dt>브라우저</dt><dd data-firmware-support-text>확인하고 있어요…</dd></div>`,
    `<div class="fw__fact"><dt>펌웨어</dt><dd>${e(versionLabel)}(${e(info.releaseDate)}) · ${e(info.chip)}용 · ${e(sizeLabel)}</dd></div>`,
    `<div class="fw__fact"><dt>파일</dt><dd data-firmware-file-text>확인하고 있어요…</dd></div>`,
    '</dl>',
    '<div class="fw__notice fw__notice--warning" data-firmware-unsupported hidden>',
    '<p class="fw__notice-title" data-unsupported-title></p>',
    '<p data-unsupported-detail></p>',
    '</div>',
    '<div class="fw__notice fw__notice--info" data-firmware-missing hidden>',
    '<p class="fw__notice-title">펌웨어 파일 준비 중이에요</p>',
    `<p>이 사이트에 펌웨어 파일이 아직 올라오지 않아서 이 화면에서는 구울 수 없어요. 선생님은 <a href="#${manualId}" data-firmware-manual-link>수동으로 굽는 방법</a>을 따라 해 주세요. 학생은 선생님께 알려 주세요.</p>`,
    '</div>',
    '<div class="fw__run" data-firmware-run>',
    '<div class="fw__options">',
    `<label class="fw__check"><input type="checkbox" data-firmware-erase aria-describedby="${eraseHintId}"><span>굽기 전에 보드를 모두 지우기</span></label>`,
    `<p class="fw__hint" id="${eraseHintId}">처음 MicroPython을 넣는 보드이거나, 굽고 나서도 보드가 이상하게 움직이면 켜요. 보드에 저장한 파일(main.py 등)도 지워지고 시간이 더 걸려요.</p>`,
    '</div>',
    '<div class="fw__actions">',
    '<button type="button" class="button button--primary button--large" data-firmware-start disabled>펌웨어 굽기 시작</button>',
    '<button type="button" class="button button--secondary" data-firmware-stop hidden>멈추기</button>',
    '</div>',
    '<p class="fw__warning" data-firmware-running-note hidden>굽는 동안 USB 케이블을 뽑거나 이 탭을 닫지 마세요.</p>',
    `<ol class="fw__stages" aria-label="굽기 단계" data-firmware-stages>${FLASH_STAGES.map(stageItem).join('')}</ol>`,
    '</div>',
    '<p class="visually-hidden" aria-live="polite" data-firmware-live></p>',
    '<div class="fw__result fw__result--done" data-firmware-done tabindex="-1" hidden>',
    `<p class="fw__result-title" data-done-title>끝났어요! 보드에 ${e(versionLabel)}이 들어갔어요.</p>`,
    '<p data-done-boot></p>',
    '<ol class="fw__next" data-done-next>',
    '<li>USB 케이블은 꽂아 둔 채로 두어요. 보드가 저절로 다시 시작하지 않은 것 같으면 보드의 EN(또는 RST) 버튼을 한 번 눌러요.</li>',
    '<li>ESP32 실습실의 [실제 보드] 탭에서 [보드 연결]로 이 보드를 고르고 첫 예제를 [실행]해요. 보드의 초록색 내장 LED(IO2)가 깜빡이면 준비 끝이에요.</li>',
    '</ol>',
    `<p class="fw__done-links"><a class="button button--secondary" href="${e(options.labHref)}">ESP32 실습실로 가기</a>${
      options.checkHref ? `<a class="fw__help-link" href="${e(options.checkHref)}" data-done-check>이 페이지에서 보드 연결 다시 확인하기</a>` : ''
    }</p>`,
    '</div>',
    '<div class="fw__result fw__result--error" data-firmware-error tabindex="-1" hidden>',
    '<p class="fw__result-title" data-error-title></p>',
    '<p data-error-summary></p>',
    '<ol class="fw__error-steps" data-error-steps></ol>',
    '<div class="fw__actions">',
    '<button type="button" class="button button--primary" data-firmware-retry-slow hidden>느린 속도로 다시 굽기</button>',
    '<button type="button" class="button button--secondary" data-firmware-retry hidden>다시 시도</button>',
    `<a class="fw__help-link" href="${e(options.portHelpHref)}" data-error-port-help hidden>포트·케이블·드라이버 도움말 보기</a>`,
    '</div>',
    '<details class="fw__raw"><summary>선생님께 보여 줄 오류 원문</summary><pre data-error-raw></pre></details>',
    '</div>',
    `<details class="fw__manual" id="${manualId}" data-firmware-manual>`,
    '<summary>선생님용: 수동으로 굽는 방법과 파일 정보</summary>',
    '<div class="fw__manual-body">',
    `<h${subLevel} class="fw__manual-title">방법 1. Thonny로 굽기(교과서 방법)</h${subLevel}>`,
    '<ol>',
    '<li>보드를 USB 케이블로 꽂고 Thonny를 열어요.</li>',
    '<li>도구 → 옵션 → 인터프리터에서 MicroPython (ESP32)와 보드의 포트를 골라요.</li>',
    '<li>install or update MicroPython을 누르고 MicroPython family는 ESP32, variant는 Espressif · ESP32 / WROOM을 골라요.</li>',
    `<li>version은 ${e(info.version)}을 고르고 [설치]를 눌러요. 끝나면 [확인]을 눌러요.</li>`,
    '</ol>',
    `<h${subLevel} class="fw__manual-title">방법 2. esptool로 굽기(MicroPython 공식 안내)</h${subLevel}>`,
    `<p>공식 페이지에서 <code>${e(info.fileName)}</code>을 받은 폴더에서 차례로 실행해요. 처음 넣는 보드는 첫 줄(전체 지우기)부터 해요.</p>`,
    `<pre class="fw__code" data-scroll-focus="직접 굽는 명령"><code>esptool.py erase_flash\nesptool.py --baud 460800 write_flash ${e(offsetLabel)} ${e(info.fileName)}</code></pre>`,
    '<p>중간에 실패하면 <code>--baud 460800</code>을 빼고 느린 속도로 다시 해요. 연결이 안 되면 BOOT 버튼을 누른 채로 다시 실행해요.</p>',
    `<h${subLevel} class="fw__manual-title">펌웨어 파일 정보</h${subLevel}>`,
    '<dl class="fw__file-info">',
    `<div><dt>파일 이름</dt><dd><code>${e(info.fileName)}</code></dd></div>`,
    `<div><dt>크기</dt><dd>${e(formatWithCommas(info.size))}바이트</dd></div>`,
    `<div><dt>SHA-256</dt><dd><code class="fw__hash">${e(info.sha256)}</code></dd></div>`,
    `<div><dt>굽는 위치</dt><dd><code>${e(offsetLabel)}</code></dd></div>`,
    `<div><dt>라이선스</dt><dd>${e(info.license)}</dd></div>`,
    '</dl>',
    '<ul class="fw__links">',
    `<li><a href="${e(info.downloadPage)}" rel="noopener">MicroPython ESP32_GENERIC 공식 내려받기 페이지</a></li>`,
    downloadLink,
    noticeLink,
    '</ul>',
    `<h${subLevel} class="fw__manual-title">보드 확인 도구</h${subLevel}>`,
    '<p>굽지 않고 보드가 굽기 모드로 바뀌는지, 어떤 칩인지만 확인해요. 끝나면 보드를 다시 시작해요.</p>',
    '<p><button type="button" class="button button--secondary" data-firmware-check-chip disabled>칩만 확인하기</button></p>',
    '<details class="fw__log-box"><summary>자세한 기록</summary><pre class="fw__log" data-firmware-log data-scroll-focus="굽기 자세한 기록"></pre></details>',
    '</div>',
    '</details>',
    '</section>',
  ].join('');
}
