/**
 * 가상 보드 부품 레지스트리(PLAN §8.3 P3-01·P3-02, src/lab/README.md 7절). 등록 파일이 없다 — src/lab/modules/board/parts/<부품 id>/part.ts를
 * 만들면 import.meta.glob(eager)이 찾는다. 이 파일의 검사·배선 함수는 순수 함수라 단위 테스트가 가짜 묶음으로 검사한다.
 *
 * 왜 모듈 폴더(src/lab/modules/<id>/)가 아니라 보드 모듈 안의 부품 폴더인가(Claude 결정, PROGRESS 미해결 43번)
 * - 부품은 따로 도는 흉내 모듈이 아니라 보드 핀 상태를 읽고 입력을 보드에 넣는 "보드의 일부"다. 모듈 폴더로 두면 부품마다 manifest·index·
 *   메시지 이름(<id>.*)이 생기고, 모듈끼리 핀 상태를 나눌 통로가 없으며, 실습실이 부품 수만큼 청크를 따로 받는다.
 * - 부품 폴더는 보드 모듈 청크 하나에 함께 묶이고(보드 화면이 처음 붙을 때 한 번 받음), 메시지는 보드의 이름(board.state·board.input·
 *   board.wiring·board.device)으로 모든 부품이 같이 쓰므로 부품을 더해도 manifest를 고치지 않는다.
 * - 파이썬 쪽 부품 흉내(.py)는 src/lab/python/modules.ts가 모듈 폴더의 하위 폴더까지 찾아 ESP32 실습실 워커의 /apc에 넣는다.
 *
 * 배선 검사(resolveWiring, P3-02) — 찾은 것은 WiringIssue(수준·종류·한국어 문장)로 보드 그림 아래 목록에 보인다. 종류 표는 README 7.4.
 */
import { headerPinForGpio } from './layout.ts';
import type { PartDefinition, PartInstance, UnknownPartEntry, WiringEntry, WiringIssue } from './part-types.ts';
import { FIRST_INPUT_ONLY_GPIO, isStrappingGpio, isValidGpio, type PinDrive } from './state.ts';

/** 부품 id·배선 id 모양 */
export const PART_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
/** 부품 핀 역할 이름 모양 */
export const PART_ROLE_PATTERN = /^[a-z][a-z0-9_]*$/u;
/** 파이썬 부품 흉내 모듈 이름 모양 */
export const PART_PYTHON_PATTERN = /^apc_part_[a-z][a-z0-9_]*$/u;

const files = import.meta.glob<{ default: PartDefinition }>('./parts/*/part.ts', { eager: true });

/** glob 경로(./parts/builtin-led/part.ts) → 부품 폴더 이름(builtin-led) */
export function partFolderOf(globPath: string): string {
  const parts = globPath.replace(/\\/gu, '/').split('/');
  return parts[parts.length - 2] ?? '';
}

function isPoint(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y);
}

/**
 * 부품 묶음({ './parts/x/part.ts': { default: … } })을 검사해 문제 목록을 돌려준다(없으면 빈 목록).
 * pythonFiles를 주면(단위 테스트가 실제 폴더를 읽어 넘김) python에 적은 모듈 파일이 그 부품 폴더에 있는지도 본다.
 */
export function validatePartDefinitions(
  modules: Readonly<Record<string, { default?: PartDefinition } | PartDefinition>>,
  pythonFiles?: Readonly<Record<string, readonly string[]>>,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [globPath, loaded] of Object.entries(modules)) {
    const folder = partFolderOf(globPath);
    const where = `src/lab/modules/board/parts/${folder}/part.ts`;
    const definition = loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : (loaded as PartDefinition | undefined);
    if (!definition || typeof definition !== 'object') {
      errors.push(`${where}: default export로 부품 정의(PartDefinition)를 내보내요.`);
      continue;
    }
    if (typeof definition.id !== 'string' || !PART_ID_PATTERN.test(definition.id)) {
      errors.push(`${where}: id는 영문 소문자로 시작하고 소문자·숫자·하이픈만 써요(지금: ${String(definition.id)}).`);
    } else if (definition.id !== folder) {
      errors.push(`${where}: id "${definition.id}"이(가) 폴더 이름 "${folder}"과(와) 달라요.`);
    } else if (seen.has(definition.id)) {
      errors.push(`${where}: id "${definition.id}"이(가) 다른 부품과 겹쳐요.`);
    } else {
      seen.add(definition.id);
    }
    if (typeof definition.title !== 'string' || definition.title.trim() === '' || typeof definition.description !== 'string' || definition.description.trim() === '') {
      errors.push(`${where}: title(이름)과 description(한 줄 설명)을 한국어로 적어요.`);
    }
    const roles = new Set<string>();
    if (!Array.isArray(definition.pins) || definition.pins.length === 0) {
      errors.push(`${where}: pins에 핀을 하나 이상 적어요.`);
    } else {
      for (const pin of definition.pins) {
        if (!pin || !PART_ROLE_PATTERN.test(pin.role ?? '')) {
          errors.push(`${where}: 핀 역할 이름 "${String(pin?.role)}"은(는) 영문 소문자·숫자·밑줄이에요.`);
          continue;
        }
        if (roles.has(pin.role)) {
          errors.push(`${where}: 핀 역할 "${pin.role}"이(가) 겹쳐요.`);
        }
        roles.add(pin.role);
        if (pin.direction !== 'in' && pin.direction !== 'out') {
          errors.push(`${where}: 핀 "${pin.role}"의 direction은 'in' 또는 'out'이에요.`);
        }
        if (typeof pin.label !== 'string' || pin.label.trim() === '') {
          errors.push(`${where}: 핀 "${pin.role}"의 label(사람이 읽는 이름)을 적어요.`);
        }
        const fixed = definition.defaultPins?.[pin.role];
        if (definition.onboard && !isValidGpio(fixed)) {
          errors.push(`${where}: 보드에 붙은 부품(onboard)은 핀 "${pin.role}"의 defaultPins를 ESP32 GPIO 번호로 적어요.`);
        }
        if (fixed !== undefined && !isValidGpio(fixed)) {
          errors.push(`${where}: defaultPins의 "${pin.role}": ${String(fixed)}은(는) ESP32에 없는 GPIO 번호예요.`);
        }
      }
      for (const role of Object.keys(definition.defaultPins ?? {})) {
        if (!roles.has(role)) {
          errors.push(`${where}: defaultPins의 "${role}"이(가) pins에 없어요.`);
        }
      }
    }
    if (!definition.size || !(definition.size.width > 0) || !(definition.size.height > 0)) {
      errors.push(`${where}: size(그림 크기 width·height)를 0보다 크게 적어요.`);
    }
    if (definition.anchors !== undefined) {
      for (const [role, point] of Object.entries(definition.anchors)) {
        if (!roles.has(role)) {
          errors.push(`${where}: anchors의 "${role}"이(가) pins에 없어요.`);
        } else if (!isPoint(point)) {
          errors.push(`${where}: anchors의 "${role}"은(는) { x, y } 숫자로 적어요.`);
        } else if (point.x % 18 !== 9) {
          errors.push(`${where}: anchors의 "${role}" x(${point.x})는 18의 배수 + 9로 적어요(배선도 선이 핀 머리와 겹치지 않게 — layout.ts).`);
        }
      }
    }
    if (definition.power !== undefined && definition.power !== false && !(isPoint(definition.power?.gnd) && isPoint(definition.power?.vcc))) {
      errors.push(`${where}: power는 { gnd: { x, y }, vcc: { x, y } } 또는 false로 적어요.`);
    }
    if (definition.defaultPinsNotice !== undefined && (typeof definition.defaultPinsNotice !== 'string' || definition.defaultPinsNotice.trim() === '')) {
      errors.push(`${where}: defaultPinsNotice는 안내 한 문장(글)으로 적어요.`);
    }
    if (typeof definition.visual !== 'function' || typeof definition.render !== 'function') {
      errors.push(`${where}: visual(상태 → 모습)과 render(그림) 함수를 둬요.`);
    }
    if (definition.interaction !== undefined) {
      const { kind, label, drive } = definition.interaction;
      if ((kind !== 'momentary' && kind !== 'toggle') || typeof label !== 'string' || typeof drive !== 'function') {
        errors.push(`${where}: interaction은 { kind: 'momentary' | 'toggle', label, drive(active, role) }예요.`);
      }
      if (!definition.pins?.some((pin) => pin.direction === 'in')) {
        errors.push(`${where}: interaction이 있는 부품은 direction 'in' 핀이 하나 이상 있어야 해요.`);
      }
    }
    if (definition.python !== undefined) {
      if (!PART_PYTHON_PATTERN.test(definition.python)) {
        errors.push(`${where}: python은 apc_part_로 시작하는 파이썬 모듈 이름이에요(지금: ${definition.python}).`);
      } else if (pythonFiles && !(pythonFiles[folder] ?? []).includes(`${definition.python}.py`)) {
        errors.push(`${where}: python에 적은 ${definition.python}.py가 그 부품 폴더에 없어요.`);
      }
    }
  }
  return errors;
}

const partErrors = validatePartDefinitions(files);
if (partErrors.length > 0) {
  throw new Error(`가상 보드 부품 정의에 문제가 있어요.\n${partErrors.map((error) => `- ${error}`).join('\n')}`);
}

/** 발견한 모든 부품(id → 정의, 폴더 이름 순) */
export const PART_DEFINITIONS: ReadonlyMap<string, PartDefinition> = new Map(
  Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([, loaded]) => [loaded.default.id, loaded.default]),
);

/** 보드에 붙은 부품(onboard)만으로 된 기본 배선 */
export function onboardWiring(definitions: ReadonlyMap<string, PartDefinition> = PART_DEFINITIONS): WiringEntry[] {
  return [...definitions.values()].filter((definition) => definition.onboard).map((definition) => ({ part: definition.id, id: definition.id, pins: { ...definition.defaultPins } }));
}

export interface ResolvedWiring {
  /** 가상 보드가 아는 부품(그림·입력·파이썬 배선) */
  readonly instances: readonly PartInstance[];
  /** 가상 보드가 아직 모르는 부품(그림 없음 — 적힌 핀만 파이썬에 알린다) */
  readonly unknown: readonly UnknownPartEntry[];
  /** 찾은 것(오류 → 주의 → 참고 순서) */
  readonly issues: readonly WiringIssue[];
}

const LEVEL_ORDER: Readonly<Record<WiringIssue['level'], number>> = { error: 0, warning: 1, info: 2 };

/** 핀 머리가 없는 GPIO를 이었을 때의 까닭(없으면 null) */
function missingHeaderReason(gpio: number): { level: WiringIssue['level']; reason: string } | null {
  if (headerPinForGpio(gpio)) {
    return null;
  }
  if (gpio === 0) {
    return { level: 'warning', reason: 'GPIO0은 보드의 BOOT 버튼이 쓰는 핀이라 핀 머리가 없어요' };
  }
  if (gpio >= 6 && gpio <= 11) {
    return { level: 'error', reason: '6~11번은 보드 안의 플래시 메모리가 쓰는 핀이라, 부품을 이으면 실물 보드가 멈추거나 다시 켜질 수 있어요' };
  }
  if (gpio === 20) {
    return { level: 'warning', reason: 'GPIO20은 이 보드(ESP32-WROOM-32 모듈)의 핀으로 나와 있지 않아요' };
  }
  return { level: 'warning', reason: `GPIO${gpio}은(는) 30핀 개발 보드의 핀 머리에 나와 있지 않아요` };
}

/** 한국어 목록 이음: "터치 센서, 진동 모터" */
function joinNames(names: readonly string[]): string {
  return names.join(', ');
}

/**
 * 배선 표를 검사해 부품 목록으로 만든다. 보드에 붙은 부품은 적지 않아도 늘 들어가고 핀이 고정된다.
 * 찾아 알리는 것(README 7.4 표): 모르는 부품(unknown-part)·이름 규칙(bad-id)·줄임 표기 pin을 핀 여러 개 부품에 씀(pin-shorthand)·
 * 핀 번호 없음(missing-pin)·ESP32에 없는 핀(invalid-gpio)·부품에 없는 역할(unknown-role)·보드 부품 핀 고정(onboard-fixed)·
 * 입력 전용 핀(34~39)의 출력 부품(input-only-output)·핀 머리가 없는 핀(not-on-header)·스트래핑 핀의 바깥 부품(strapping)·
 * 한 핀의 입력 부품 둘(shared-input)·한 핀의 입력·출력 부품(input-output-same-pin)·한 핀의 출력 부품 여럿(shared-output)·
 * 사이트가 정한 기본 핀(site-assigned, 부품의 defaultPinsNotice).
 */
export function resolveWiring(entries: readonly WiringEntry[], definitions: ReadonlyMap<string, PartDefinition> = PART_DEFINITIONS): ResolvedWiring {
  const issues: WiringIssue[] = [];
  const instances: PartInstance[] = [];
  const unknown: UnknownPartEntry[] = [];
  const ids = new Set<string>();
  const onboardIds = new Set([...definitions.values()].filter((definition) => definition.onboard).map((definition) => definition.id));
  const all = [...entries];
  for (const id of onboardIds) {
    if (!all.some((entry) => entry.part === id)) {
      all.unshift({ part: id, id });
    }
  }
  const takeId = (entry: WiringEntry): string | null => {
    if (entry.id !== undefined) {
      if (!PART_ID_PATTERN.test(entry.id) || ids.has(entry.id)) {
        issues.push({
          level: 'error',
          code: 'bad-id',
          text: `배선의 이름 "${entry.id}"이(가) 규칙에 맞지 않거나 겹쳐요(영문 소문자·숫자·하이픈, 배선 안에서 하나).`,
        });
        return null;
      }
      ids.add(entry.id);
      return entry.id;
    }
    let candidate = entry.part;
    for (let number = 2; ids.has(candidate); number += 1) {
      candidate = `${entry.part}-${number}`;
    }
    ids.add(candidate);
    return candidate;
  };

  for (const entry of all) {
    const definition = definitions.get(entry.part);
    if (!definition) {
      const label = entry.label ?? entry.part;
      issues.push({
        level: 'warning',
        code: 'unknown-part',
        text: `이 예제에 쓰는 부품 "${label}"은(는) 가상 보드에 아직 없어서 그림에 그리지 못했어요. 이 부품을 쓰는 코드는 부품이 더해진 뒤에 끝까지 돌아요.`,
      });
      const id = takeId(entry);
      const pins: Record<string, number> = { ...(entry.pins ?? {}) };
      if (entry.pin !== undefined && Object.keys(pins).length === 0) {
        pins.sig = entry.pin;
      }
      if (id !== null) {
        unknown.push({ part: entry.part, id, label, pins: Object.fromEntries(Object.entries(pins).filter(([, gpio]) => isValidGpio(gpio))) });
      }
      continue;
    }
    const id = takeId(entry);
    if (id === null) {
      continue;
    }
    const pins: Record<string, number> = {};
    let usable = true;
    if (entry.pin !== undefined && definition.pins.length > 1) {
      issues.push({
        level: 'error',
        code: 'pin-shorthand',
        text: `${definition.title}(${id})은(는) 핀이 여러 개(${definition.pins.map((pin) => pin.role).join('·')})라 pin 하나로 적을 수 없어요. pins: { ${definition.pins[0]?.role}: 번호, … }처럼 역할마다 적어요.`,
      });
      continue;
    }
    for (const role of Object.keys(entry.pins ?? {})) {
      if (!definition.pins.some((pin) => pin.role === role)) {
        issues.push({
          level: 'warning',
          code: 'unknown-role',
          text: `${definition.title}(${id})에는 "${role}" 핀이 없어서 그 줄은 쓰지 않았어요(있는 핀: ${definition.pins.map((pin) => pin.role).join(', ')}).`,
        });
      }
    }
    for (const pin of definition.pins) {
      const fixed = definition.defaultPins?.[pin.role];
      const wanted = entry.pins?.[pin.role] ?? (definition.pins.length === 1 ? entry.pin : undefined);
      let gpio = wanted ?? fixed;
      if (definition.onboard && fixed !== undefined && wanted !== undefined && wanted !== fixed) {
        issues.push({
          level: 'info',
          code: 'onboard-fixed',
          text: `${definition.title}은(는) 보드에 붙어 있어 ${pin.label} 핀이 GPIO${fixed}로 정해져 있어요(배선의 GPIO${wanted}는 쓰지 않아요).`,
          gpio: fixed,
        });
        gpio = fixed;
      }
      if (gpio === undefined) {
        issues.push({ level: 'error', code: 'missing-pin', text: `${definition.title}(${id})의 ${pin.label} 핀 번호가 배선에 없어요. pin이나 pins로 적어요.` });
        usable = false;
        continue;
      }
      if (!isValidGpio(gpio)) {
        issues.push({ level: 'error', code: 'invalid-gpio', text: `${definition.title}(${id})의 ${pin.label} 핀 번호 ${String(gpio)}은(는) ESP32에 없는 GPIO예요.` });
        usable = false;
        continue;
      }
      if (pin.direction === 'out' && gpio >= FIRST_INPUT_ONLY_GPIO) {
        issues.push({
          level: 'error',
          code: 'input-only-output',
          text: `${definition.title}(${id})의 ${pin.label} 핀을 GPIO${gpio}에 이었는데, 34~39번은 입력 전용이라 부품을 움직일 수 없어요.`,
          gpio,
        });
      }
      if (!definition.onboard) {
        const missing = missingHeaderReason(gpio);
        if (missing) {
          issues.push({
            level: missing.level,
            code: 'not-on-header',
            text: `${definition.title}(${id})의 ${pin.label} 핀(GPIO${gpio})은 선을 그리지 못했어요. ${missing.reason}.`,
            gpio,
          });
        }
      }
      pins[pin.role] = gpio;
    }
    if (!usable) {
      continue;
    }
    const usesDefaultPins = definition.pins.every((pin) => definition.defaultPins?.[pin.role] !== undefined && pins[pin.role] === definition.defaultPins[pin.role]);
    instances.push({ part: entry.part, id, pins, label: entry.label ?? definition.title, usesDefaultPins });
  }

  // 핀마다 이은 부품을 모아 겹침·스트래핑 핀을 본다
  const byGpio = new Map<number, { instance: PartInstance; definition: PartDefinition; direction: 'in' | 'out' }[]>();
  for (const instance of instances) {
    const definition = definitions.get(instance.part) as PartDefinition;
    for (const pin of definition.pins) {
      const gpio = instance.pins[pin.role];
      if (gpio === undefined) {
        continue;
      }
      const list = byGpio.get(gpio) ?? [];
      list.push({ instance, definition, direction: pin.direction });
      byGpio.set(gpio, list);
    }
  }
  for (const [gpio, list] of [...byGpio.entries()].sort(([a], [b]) => a - b)) {
    const inputs = list.filter((item) => item.direction === 'in');
    const outputs = list.filter((item) => item.direction === 'out');
    const names = (items: typeof list) => joinNames(items.map((item) => item.instance.label));
    if (inputs.length > 1) {
      issues.push({
        level: 'error',
        code: 'shared-input',
        text: `GPIO${gpio}에 입력 부품 두 개(${inputs.map((item) => item.instance.id).join(', ')})가 함께 이어져 있어요. 한 핀에는 입력 부품을 하나만 이어요.`,
        gpio,
      });
    }
    if (inputs.length > 0 && outputs.length > 0) {
      issues.push({
        level: 'error',
        code: 'input-output-same-pin',
        text: `GPIO${gpio}에 값을 보내는 부품(${names(inputs)})과 보드가 움직이는 부품(${names(outputs)})이 함께 이어져 있어요. 한 핀은 입력이나 출력 가운데 하나로만 써요. 부품 하나를 다른 핀으로 옮겨요.`,
        gpio,
      });
    }
    if (inputs.length === 0 && outputs.length > 1) {
      issues.push({
        level: 'info',
        code: 'shared-output',
        text: `GPIO${gpio}에 부품 ${outputs.length}개(${names(outputs)})가 함께 이어져 있어요. 같은 신호를 받아 함께 움직여요.`,
        gpio,
      });
    }
    const external = list.filter((item) => !item.definition.onboard);
    if (external.length > 0 && isStrappingGpio(gpio)) {
      issues.push({
        level: 'warning',
        code: 'strapping',
        text: `GPIO${gpio}은(는) 전원을 켤 때 부팅 방식을 정하는 스트래핑 핀이에요. 여기에 ${names(external)}을(를) 이으면 실물 보드가 켜지지 않거나 코드를 올리지 못할 수 있어요(가상 보드는 그대로 돌아요). 가능하면 다른 핀을 써요.`,
        gpio,
      });
    }
  }
  for (const instance of instances) {
    const definition = definitions.get(instance.part) as PartDefinition;
    if (definition.defaultPinsNotice && instance.usesDefaultPins) {
      issues.push({ level: 'info', code: 'site-assigned', text: definition.defaultPinsNotice });
    }
  }
  issues.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return { instances, unknown, issues };
}

/** 'board.wiring' 값: 아는 부품은 핀 방향까지, 모르는 부품은 known: false와 적힌 핀만(README 7.3) */
export function wiringValue(
  instances: readonly PartInstance[],
  unknown: readonly UnknownPartEntry[] = [],
  definitions: ReadonlyMap<string, PartDefinition> = PART_DEFINITIONS,
): { parts: { part: string; id: string; label: string; pins: Record<string, number>; directions?: Record<string, 'in' | 'out'>; known: boolean }[] } {
  return {
    parts: [
      ...instances.map((instance) => {
        const definition = definitions.get(instance.part);
        const directions: Record<string, 'in' | 'out'> = {};
        for (const pin of definition?.pins ?? []) {
          if (instance.pins[pin.role] !== undefined) {
            directions[pin.role] = pin.direction;
          }
        }
        return { part: instance.part, id: instance.id, label: instance.label, pins: { ...instance.pins }, directions, known: true };
      }),
      ...unknown.map((entry) => ({ part: entry.part, id: entry.id, label: entry.label, pins: { ...entry.pins }, known: false })),
    ],
  };
}

function strength(drive: PinDrive): number {
  return drive === 0 || drive === 1 ? 2 : drive === null ? 0 : 1;
}

/** 입력 부품들이 지금 핀을 어떻게 누르는지(GPIO → drive). 한 핀에 여럿이면 센 값(0·1)이 약한 값(풀업·풀다운)을 이긴다. */
export function inputDrives(
  instances: readonly PartInstance[],
  activeIds: ReadonlySet<string>,
  definitions: ReadonlyMap<string, PartDefinition> = PART_DEFINITIONS,
): Map<number, PinDrive> {
  const drives = new Map<number, PinDrive>();
  for (const instance of instances) {
    const definition = definitions.get(instance.part);
    if (!definition?.interaction) {
      continue;
    }
    for (const pin of definition.pins) {
      if (pin.direction !== 'in') {
        continue;
      }
      const gpio = instance.pins[pin.role];
      if (gpio === undefined) {
        continue;
      }
      const drive = definition.interaction.drive(activeIds.has(instance.id), pin.role);
      const current = drives.get(gpio) ?? null;
      if (strength(drive) >= strength(current)) {
        drives.set(gpio, drive);
      }
    }
  }
  return drives;
}

/** GPIO → 그 핀에 이어진 부품 이름들(핀 표의 "연결" 칸) */
export function partsByGpio(instances: readonly PartInstance[], definitions: ReadonlyMap<string, PartDefinition> = PART_DEFINITIONS): Map<number, string[]> {
  const result = new Map<number, string[]>();
  for (const instance of instances) {
    const definition = definitions.get(instance.part);
    for (const [role, gpio] of Object.entries(instance.pins)) {
      const pinLabel = definition?.pins.find((pin) => pin.role === role)?.label ?? role;
      const names = result.get(gpio) ?? [];
      names.push(definition && definition.pins.length > 1 ? `${instance.label}(${pinLabel})` : instance.label);
      result.set(gpio, names);
    }
  }
  return result;
}
