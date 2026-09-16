/**
 * 흉내 모듈 폴더의 manifest.ts를 모두 모은 곳(자동 발견, src/lab/README.md 4절). 등록 파일을 고칠 필요가 없다 —
 * src/lab/modules/<id>/manifest.ts를 만들면 import.meta.glob(eager)이 찾는다.
 *
 * 워커(src/lab/python/modules.ts — 흉내 모듈 표 SHIM_TABLE)와 화면(host.ts)·빌드(LabShell.astro의 panel.astro 배치)가 함께 읽으므로
 * 이 파일과 manifest.ts에는 DOM·모듈 화면 코드를 넣지 않는다.
 *
 * 검사(빌드·테스트 때 오류로 알린다): id가 폴더 이름과 같은지, 요청·이벤트·채널 이름이 "<id>."로 시작하는지,
 * 다른 모듈과 이름이 겹치지 않는지(요청·이벤트·채널·흉내 모듈 이름·shims 대상 패키지). 붙박이 cv2 흉내(src/lab/python/apc_cv2.py)의
 * 이름(camera.*·window.*·cv2.*)과도 겹치면 안 된다.
 */
import { MESSAGE_KIND_PATTERN, MODULE_ID_PATTERN, type LabModuleManifest } from './types.ts';

/** 붙박이(폴더 규약 이전) 모듈이 쓰는 이름 — 새 모듈이 쓰면 안 된다(src/lab/runtime/protocol.ts 머리말) */
export const BUILTIN_REQUEST_KINDS: readonly string[] = Object.freeze(['input', 'camera.open', 'camera.read', 'camera.set', 'camera.release']);
export const BUILTIN_EVENT_KINDS: readonly string[] = Object.freeze(['window.show', 'window.open', 'window.close']);
export const BUILTIN_CHANNELS: readonly string[] = Object.freeze(['cv2.keys', 'cv2.window', 'camera.info', 'camera.frame', 'lab.params']);
export const BUILTIN_SHIMS: Readonly<Record<string, string>> = Object.freeze({ cv2: 'apc_cv2' });
/** 붙박이 파이썬 모듈 이름(src/lab/python/*.py) — 폴더 모듈의 .py와 겹치면 안 된다 */
export const BUILTIN_PYTHON_MODULES: readonly string[] = Object.freeze(['apc_runtime', 'apc_shims', 'apc_cv2']);

const files = import.meta.glob<{ default: LabModuleManifest }>('./*/manifest.ts', { eager: true });

/** glob 경로(./hello/manifest.ts) → 폴더 이름(hello) */
export function folderNameOf(globPath: string): string {
  const parts = globPath.replace(/\\/gu, '/').split('/');
  return parts[parts.length - 2] ?? '';
}

/**
 * manifest 묶음({ './hello/manifest.ts': { default: … } })을 검사해 문제 목록을 돌려준다(없으면 빈 목록).
 * 순수 함수라 단위 테스트가 가짜 묶음으로 검사한다.
 */
export function validateManifests(
  modules: Readonly<Record<string, { default?: LabModuleManifest } | LabModuleManifest>>,
  options: { builtinRequestKinds?: readonly string[]; builtinEventKinds?: readonly string[]; builtinChannels?: readonly string[]; builtinShims?: Readonly<Record<string, string>>; builtinPythonModules?: readonly string[] } = {},
): string[] {
  const errors: string[] = [];
  const seenKinds = new Map<string, string>();
  const seenShimTargets = new Map<string, string>();
  const seenShimModules = new Map<string, string>();
  const builtinKinds = [
    ...(options.builtinRequestKinds ?? BUILTIN_REQUEST_KINDS),
    ...(options.builtinEventKinds ?? BUILTIN_EVENT_KINDS),
    ...(options.builtinChannels ?? BUILTIN_CHANNELS),
  ];
  for (const kind of builtinKinds) {
    seenKinds.set(kind, '붙박이(cv2·실습실 틀)');
  }
  for (const [pkg, shim] of Object.entries(options.builtinShims ?? BUILTIN_SHIMS)) {
    seenShimTargets.set(pkg, '붙박이');
    seenShimModules.set(shim, '붙박이');
  }
  for (const name of options.builtinPythonModules ?? BUILTIN_PYTHON_MODULES) {
    seenShimModules.set(name, '붙박이');
  }

  for (const [globPath, loaded] of Object.entries(modules)) {
    const folder = folderNameOf(globPath);
    const manifest = loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : (loaded as LabModuleManifest | undefined);
    const where = `src/lab/modules/${folder}/manifest.ts`;
    if (!manifest || typeof manifest !== 'object') {
      errors.push(`${where}: default export로 manifest 객체를 내보내요.`);
      continue;
    }
    if (typeof manifest.id !== 'string' || !MODULE_ID_PATTERN.test(manifest.id)) {
      errors.push(`${where}: id는 영문 소문자로 시작하고 소문자·숫자·하이픈만 써요(지금: ${String(manifest.id)}).`);
    } else if (manifest.id !== folder) {
      errors.push(`${where}: id "${manifest.id}"이(가) 폴더 이름 "${folder}"과(와) 달라요.`);
    }
    if (typeof manifest.title !== 'string' || manifest.title.trim() === '') {
      errors.push(`${where}: title(사람이 읽는 이름)을 적어요.`);
    }
    if (manifest.labs !== '*' && (!Array.isArray(manifest.labs) || manifest.labs.length === 0 || manifest.labs.some((lab) => typeof lab !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(lab)))) {
      errors.push(`${where}: labs는 실습실 id 목록(예: ['vision'])이거나 '*'예요.`);
    }
    if (manifest.placement !== undefined && manifest.placement !== 'panel' && manifest.placement !== 'wide') {
      errors.push(`${where}: placement는 'panel' 또는 'wide'예요.`);
    }
    const prefix = `${manifest.id}.`;
    const checkKinds = (field: 'requestKinds' | 'eventKinds' | 'channels') => {
      const list = manifest[field];
      if (list === undefined) {
        return;
      }
      if (!Array.isArray(list)) {
        errors.push(`${where}: ${field}는 이름 목록이에요.`);
        return;
      }
      for (const kind of list) {
        if (typeof kind !== 'string' || !MESSAGE_KIND_PATTERN.test(kind) || !kind.startsWith(prefix)) {
          errors.push(`${where}: ${field}의 "${String(kind)}"은(는) "${prefix}<이름>" 모양이어야 해요(영문 소문자·숫자·밑줄·점).`);
          continue;
        }
        const owner = seenKinds.get(kind);
        if (owner !== undefined && owner !== manifest.id) {
          errors.push(`${where}: ${field}의 "${kind}"이(가) ${owner}과(와) 겹쳐요.`);
        }
        seenKinds.set(kind, manifest.id);
      }
    };
    checkKinds('requestKinds');
    checkKinds('eventKinds');
    checkKinds('channels');
    if (manifest.shims !== undefined) {
      if (!manifest.shims || typeof manifest.shims !== 'object' || Array.isArray(manifest.shims)) {
        errors.push(`${where}: shims는 { '패키지 import 이름': 'apc_<이름>' } 사전이에요.`);
      } else {
        for (const [pkg, shim] of Object.entries(manifest.shims)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(pkg)) {
            errors.push(`${where}: shims의 패키지 이름 "${pkg}"이(가) 파이썬 모듈 이름이 아니에요.`);
          }
          if (typeof shim !== 'string' || !/^apc_[a-z][a-z0-9_]*$/u.test(shim)) {
            errors.push(`${where}: shims의 흉내 모듈 이름 "${String(shim)}"은(는) apc_로 시작하는 영문 소문자·숫자·밑줄이어야 해요.`);
            continue;
          }
          const pkgOwner = seenShimTargets.get(pkg);
          if (pkgOwner !== undefined && pkgOwner !== manifest.id) {
            errors.push(`${where}: 패키지 "${pkg}"의 흉내 모듈이 ${pkgOwner}과(와) 겹쳐요(한 패키지는 한 모듈만 덮어써요).`);
          }
          seenShimTargets.set(pkg, manifest.id);
          const shimOwner = seenShimModules.get(shim);
          if (shimOwner !== undefined && shimOwner !== manifest.id) {
            errors.push(`${where}: 흉내 모듈 이름 "${shim}"이(가) ${shimOwner}과(와) 겹쳐요.`);
          }
          seenShimModules.set(shim, manifest.id);
        }
      }
    }
    if (manifest.packages !== undefined && (!Array.isArray(manifest.packages) || manifest.packages.some((name) => typeof name !== 'string' || name.trim() === ''))) {
      errors.push(`${where}: packages는 Pyodide 패키지 이름 목록이에요(예: ['opencv-python']).`);
    }
  }
  return errors;
}

const manifestErrors = validateManifests(files);
if (manifestErrors.length > 0) {
  throw new Error(`흉내 모듈 manifest에 문제가 있어요.\n${manifestErrors.map((error) => `- ${error}`).join('\n')}`);
}

/** 발견한 모든 모듈의 manifest(폴더 이름 순) */
export const MODULE_MANIFESTS: readonly LabModuleManifest[] = Object.freeze(
  Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([, loaded]) => loaded.default),
);

/** 어느 실습실에 붙는 모듈인지 */
export function moduleAppliesTo(manifest: LabModuleManifest, labId: string): boolean {
  return manifest.labs === '*' || manifest.labs.includes(labId);
}

/** 그 실습실에 붙는 모듈 목록 */
export function modulesForLab(labId: string, manifests: readonly LabModuleManifest[] = MODULE_MANIFESTS): LabModuleManifest[] {
  return manifests.filter((manifest) => moduleAppliesTo(manifest, labId));
}

/** 모든 모듈의 흉내 모듈 표({ 패키지 이름: 'apc_<이름>' }) — 워커가 apc_shims.register_shims에 넘긴다 */
export function shimTableOf(manifests: readonly LabModuleManifest[] = MODULE_MANIFESTS): Record<string, string> {
  const table: Record<string, string> = {};
  for (const manifest of manifests) {
    for (const [pkg, shim] of Object.entries(manifest.shims ?? {})) {
      table[pkg] = shim;
    }
  }
  return table;
}
