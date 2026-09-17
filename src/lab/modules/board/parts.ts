/**
 * 가상 보드 부품 레지스트리(PLAN §8.3 P3-01, src/lab/README.md 7절). 등록 파일이 없다 — src/lab/modules/board/parts/<부품 id>/part.ts를
 * 만들면 import.meta.glob(eager)이 찾는다. 이 파일의 검사·배선 함수는 순수 함수라 단위 테스트가 가짜 묶음으로 검사한다.
 *
 * 왜 모듈 폴더(src/lab/modules/<id>/)가 아니라 보드 모듈 안의 부품 폴더인가(Claude 결정, PROGRESS 미해결 43번)
 * - 부품은 따로 도는 흉내 모듈이 아니라 보드 핀 상태를 읽고 입력을 보드에 넣는 "보드의 일부"다. 모듈 폴더로 두면 부품마다 manifest·index·
 *   메시지 이름(<id>.*)이 생기고, 모듈끼리 핀 상태를 나눌 통로가 없으며, 실습실이 부품 수만큼 청크를 따로 받는다.
 * - 부품 폴더는 보드 모듈 청크 하나에 함께 묶이고(보드 화면이 처음 붙을 때 한 번 받음), 메시지는 보드의 이름(board.state·board.input·
 *   board.wiring·board.device) 네 개로 모든 부품이 같이 쓰므로 부품을 더해도 manifest를 고치지 않는다.
 * - 파이썬 쪽 부품 흉내(.py)는 src/lab/python/modules.ts가 모듈 폴더의 하위 폴더까지 찾아 ESP32 실습실 워커의 /apc에 넣는다.
 */
import type { PartDefinition, PartInstance, WiringEntry } from './part-types.ts';
import { FIRST_INPUT_ONLY_GPIO, isValidGpio, type PinDrive } from './state.ts';

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
    if (!Array.isArray(definition.pins) || definition.pins.length === 0) {
      errors.push(`${where}: pins에 핀을 하나 이상 적어요.`);
    } else {
      const roles = new Set<string>();
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
  readonly instances: readonly PartInstance[];
  /** 배선에서 찾은 문제(한국어). 문제가 있는 줄은 빼거나 기본 핀으로 고쳐 쓴다. */
  readonly problems: readonly string[];
}

/**
 * 배선 표를 검사해 부품 목록으로 만든다. 보드에 붙은 부품은 적지 않아도 늘 들어가고 핀이 고정된다.
 * 없는 부품·겹치는 id·ESP32에 없는 핀·입력 전용 핀(34~39)에 출력 부품·두 입력 부품이 한 핀을 누름을 문제로 알린다.
 */
export function resolveWiring(entries: readonly WiringEntry[], definitions: ReadonlyMap<string, PartDefinition> = PART_DEFINITIONS): ResolvedWiring {
  const problems: string[] = [];
  const instances: PartInstance[] = [];
  const ids = new Set<string>();
  const inputOwners = new Map<number, string>();
  const onboardIds = new Set([...definitions.values()].filter((definition) => definition.onboard).map((definition) => definition.id));
  const all = [...entries];
  for (const id of onboardIds) {
    if (!all.some((entry) => entry.part === id)) {
      all.unshift({ part: id, id });
    }
  }
  for (const entry of all) {
    const definition = definitions.get(entry.part);
    if (!definition) {
      problems.push(`배선의 부품 "${entry.part}"을(를) 가상 보드가 아직 몰라요.`);
      continue;
    }
    if (!PART_ID_PATTERN.test(entry.id) || ids.has(entry.id)) {
      problems.push(`배선의 이름 "${entry.id}"이(가) 규칙에 맞지 않거나 겹쳐요(영문 소문자·숫자·하이픈, 배선 안에서 하나).`);
      continue;
    }
    const pins: Record<string, number> = {};
    let usable = true;
    for (const pin of definition.pins) {
      const fixed = definition.defaultPins?.[pin.role];
      const wanted = entry.pins?.[pin.role];
      let gpio = wanted ?? fixed;
      if (definition.onboard && fixed !== undefined && wanted !== undefined && wanted !== fixed) {
        problems.push(`${definition.title}은(는) 보드에 붙어 있어 ${pin.label} 핀이 GPIO${fixed}로 정해져 있어요(배선의 GPIO${wanted}는 쓰지 않아요).`);
        gpio = fixed;
      }
      if (!isValidGpio(gpio)) {
        problems.push(`${definition.title}(${entry.id})의 ${pin.label} 핀 번호 ${String(gpio)}은(는) ESP32에 없는 GPIO예요.`);
        usable = false;
        continue;
      }
      if (pin.direction === 'out' && gpio >= FIRST_INPUT_ONLY_GPIO) {
        problems.push(`${definition.title}(${entry.id})의 ${pin.label} 핀을 GPIO${gpio}에 이었는데, 34~39번은 입력 전용이라 부품을 움직일 수 없어요.`);
      }
      if (pin.direction === 'in') {
        const owner = inputOwners.get(gpio);
        if (owner !== undefined) {
          problems.push(`GPIO${gpio}에 입력 부품 두 개(${owner}, ${entry.id})가 함께 이어져 있어요. 한 핀에는 입력 부품을 하나만 이어요.`);
        } else {
          inputOwners.set(gpio, entry.id);
        }
      }
      pins[pin.role] = gpio;
    }
    if (!usable) {
      continue;
    }
    ids.add(entry.id);
    instances.push({ part: entry.part, id: entry.id, pins, label: entry.label ?? definition.title });
  }
  return { instances, problems };
}

/** 'board.wiring' 값 */
export function wiringValue(instances: readonly PartInstance[]): { parts: { part: string; id: string; pins: Record<string, number> }[] } {
  return { parts: instances.map((instance) => ({ part: instance.part, id: instance.id, pins: { ...instance.pins } })) };
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
