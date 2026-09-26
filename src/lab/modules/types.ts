/**
 * 흉내 모듈 폴더 규약의 모양(PLAN §8.2 P2-08~P2-13 병렬 제작 준비, CODE_MAPPING §3). 규약 전체와 그림은 src/lab/README.md 4절.
 *
 * 모듈 하나 = src/lab/modules/<id>/ 폴더 하나
 *   manifest.ts   순수 데이터(LabModuleManifest). 워커·화면·빌드가 함께 읽으므로 DOM·다른 모듈을 import하지 않는다.
 *   index.ts      화면 쪽(LabModule). mount(ctx)에서 요청·이벤트·패널·프레임 훅을 잇는다. 실습실 페이지가 열릴 때 그 실습실(labs)에 맞으면 불러온다.
 *   *.py          파이썬 쪽. 워커가 시작할 때 Pyodide 파일시스템 /apc에 써서 import할 수 있게 한다(파일 이름 = 모듈 이름, 저장소 전체에서 유일).
 *   panel.astro   (선택) 화면 조각. LabShell이 그 실습실 페이지에 그려 두고(hidden) ctx.panel로 넘긴다.
 *   <id>.test.ts  (권장) tests/unit/lab/modules/ 아래 단위 테스트, tests/e2e/module-<id>.spec.ts 브라우저 테스트.
 * 등록 파일은 없다 — 폴더를 만들면 import.meta.glob이 찾는다(manifests.ts·host.ts·python/modules.ts·LabShell.astro).
 * index.ts는 보통 실습실이 열릴 때 받는다. 코드가 그 모듈을 쓸 때만 받게 하려면 manifest에 load 규칙을 적는다(아래 LabModuleLoadRule —
 * Phase 6 P6-02, 통신 모듈 여섯이 무리 'comm'으로 쓴다). panel.astro·*.py는 load와 상관없이 늘 페이지·워커에 있다.
 */
import type { LabController } from '../controls/lab-shell.ts';
import type { PythonRuntime, RuntimeRequest } from '../runtime/client.ts';
import type { VisionLab } from '../vision/vision-lab.ts';

/** panel.astro를 어디에 그릴지: panel = 오른쪽 아래(조절 패널 아래), wide = 전체 폭(입력·출력과 콘솔 사이) */
export type ModulePlacement = 'panel' | 'wide';

/** 모듈 id 모양(폴더 이름과 같아야 한다): 영문 소문자로 시작, 소문자·숫자·하이픈 */
export const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;

/** 요청·이벤트·채널 이름 모양: "<모듈 id>.<이름>" (이름은 영문 소문자·숫자·밑줄·점) */
export const MESSAGE_KIND_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_.]*$/u;

/** 쓸 때 받는 모듈 무리 이름 모양(영문 소문자로 시작, 소문자·숫자·하이픈) */
export const LOAD_GROUP_PATTERN = /^[a-z][a-z0-9-]*$/u;

/**
 * 화면 쪽(index.ts)을 **쓸 때만** 받는 규칙(Phase 6 P6-02, PROGRESS 미해결 157 — src/lab/README.md 4.2).
 * 적지 않으면 지금까지처럼 실습실이 열릴 때 바로 받는다. 적으면 그 실습실에서 아래 조건 가운데 하나가 맞을 때 받는다.
 *
 * - **무리(group) 단위로 받는다:** 한 모듈의 조건이 맞으면 **그 실습실에 붙는 같은 무리의 모듈을 모두** 받는다.
 *   통신 모듈처럼 서로 기대는 모듈(예: [보내기] 패널 vision-bridge가 블루투스·USB 데이터 포트·MQTT 통로 목록을 그림)을 한 무리로 두면,
 *   받는 차례가 달라져 목록에서 통로가 빠지는 일(Phase 4 검토 지적 1)이 생기지 않는다.
 * - **같은 무리는 모두 받은 뒤 order 차례로 mount한다**(작은 수 먼저, 같으면 폴더 이름 차례). 통로를 등록하는 모듈이 목록을 그리는 모듈보다
 *   먼저 붙게 order를 준다 — 망 사정과 상관없이 차례가 늘 같다.
 * - 받는 동안 [실행]은 기다린다(lab.holdRun). 파이썬이 아직 안 붙은 모듈에 요청(requestKinds)을 보내면 host가 그 무리를 받은 뒤 넘겨 준다.
 */
export interface LabModuleLoadRule {
  /** 함께 받는 무리 이름(예: 'comm'). 한 무리의 모듈은 모두 load 규칙을 가진다 */
  readonly group: string;
  /** 편집칸 코드에 이 모양이 보이면 받는다(g·y 깃발 없이 — test()가 상태를 남기지 않게). 모듈의 패널 조건보다 넓게(그 낱말이 보이기만 해도) 적는다 */
  readonly code: RegExp;
  /** 주소의 물음표 뒤에 이 이름이 있으면 열 때 바로 받는다(예: 'bridge' — 다른 화면이 선의 끝으로 연 실습실) */
  readonly query?: readonly string[];
  /** 이 창 이벤트가 오면 받는다. 받은 뒤 host가 같은 이벤트를 한 번 더 보내 모듈이 듣게 한다(예: 'apc:web-bluetooth-show') */
  readonly windowEvents?: readonly string[];
  /** 무리 안에서 mount하는 차례(기본 0, 작은 수 먼저) */
  readonly order?: number;
}

export interface LabModuleManifest {
  /** 폴더 이름과 같은 id. 요청·이벤트·채널 이름의 앞부분("<id>.")이 된다. */
  readonly id: string;
  /** 사람이 읽는 이름(콘솔 안내·문서용) */
  readonly title: string;
  /** 붙는 실습실 id 목록(LabShell의 labId: vision, esp32, iot, dev …) 또는 '*'(모든 실습실) */
  readonly labs: readonly string[] | '*';
  /** 학생이 import하는 파이썬 패키지 이름 → 그것을 덮어쓰는 이 폴더의 흉내 모듈 이름(apc_<이름>). 받아 둔 패키지가 있을 때만 install()이 불린다. */
  readonly shims?: Readonly<Record<string, string>>;
  /** 실습실이 준비될 때 미리 받을 Pyodide 패키지(pyodide-lock.json 이름). 실행 시 import 문 분석과 별개다. */
  readonly packages?: readonly string[];
  /** 파이썬 apc_runtime.request(kind)로 부탁하고 이 모듈의 index.ts가 답하는 요청 이름. 모두 "<id>."로 시작 */
  readonly requestKinds?: readonly string[];
  /** 파이썬 apc_runtime.emit(kind)로 보내고 index.ts가 받는 이벤트 이름. "<id>."로 시작 */
  readonly eventKinds?: readonly string[];
  /** 화면 → 파이썬 값 이름: pushEvent/poll 채널과 setValue/get 이름. "<id>."로 시작 */
  readonly channels?: readonly string[];
  /** panel.astro의 위치(기본 panel) */
  readonly placement?: ModulePlacement;
  /** 화면 쪽을 쓸 때만 받는 규칙(없으면 실습실이 열릴 때 받는다 — 위 LabModuleLoadRule) */
  readonly load?: LabModuleLoadRule;
}

export interface LabModuleHandle {
  /** 실습실이 사라질 때(페이지 떠남·테스트 정리). 등록한 훅은 ctx가 알아서 푼다. */
  dispose?(): void;
}

/** index.ts의 mount(ctx)가 받는 것 */
export interface LabModuleContext {
  readonly labId: string;
  readonly root: HTMLElement;
  readonly lab: LabController;
  readonly runtime: PythonRuntime;
  readonly manifest: LabModuleManifest;
  /** panel.astro가 그려진 요소([data-lab-module-panel="<id>"]). 없으면 null. 처음에는 hidden이라 showPanel()로 연다. */
  readonly panel: HTMLElement | null;
  showPanel(): void;
  hidePanel(): void;
  /** 파이썬 request(kind)의 처리기. kind는 manifest.requestKinds에 적은 것만(아니면 오류). 해제 함수를 돌려준다. */
  onRequest(kind: string, handler: (request: RuntimeRequest) => void): () => void;
  /** 파이썬 emit(kind) 이벤트. kind는 manifest.eventKinds에 적은 것만. */
  onEvent(kind: string, handler: (payload: unknown) => void): () => void;
  /** 화면 → 파이썬 쌓이는 값(apc_runtime.poll(channel)). channel은 manifest.channels에 적은 것만. */
  pushEvent(channel: string, value: unknown): void;
  /** 화면 → 파이썬 최신 값(apc_runtime.get(name)). name은 manifest.channels에 적은 것만. */
  setValue(name: string, value: unknown): void;
  /** 실습실 조작 이벤트(run·done·code·example …) — lab.on과 같지만 dispose 때 함께 풀린다. */
  onLab: LabController['on'];
  /** 영상처리 실습실이면 VisionLab(카메라 프레임 훅 onFrame·출력 창·grabFrame), 아니면 null */
  vision(): Promise<VisionLab | null>;
  /** 이 모듈의 브라우저 저장 이름(src/lib/storage.ts 규칙): module:<id>:<name> */
  storageName(name: string): string;
  /** 콘솔에 사이트 안내 줄을 쓴다([안내] 접두어는 알아서 붙인다) */
  notice(text: string): void;
}

/** index.ts의 default export */
export interface LabModule {
  readonly manifest: LabModuleManifest;
  mount(context: LabModuleContext): LabModuleHandle | void | Promise<LabModuleHandle | void>;
}
