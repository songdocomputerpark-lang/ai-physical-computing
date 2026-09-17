/**
 * 러너 공통 모듈(P2-10)의 화면 쪽. 파이썬 apc_files.py와 짝이고, manifest.ts가 이름을 정한다(src/lab/README.md 4절).
 *
 * 하는 일
 * 1. 가상 파일: 실습실이 준비될 때마다(runtime 'ready' — 처음과 정지 2단계 뒤 다시 뜬 뒤) 자체 제작 mask.png(assets.ts가 SVG를 PNG로 그림)와
 *    학생이 [파일 넣기]로 넣은 파일을 Pyodide 작업 폴더(/home/pyodide)에 다시 쓴다. 넣는 파일은 브라우저 메모리에만 있다(서버 없음, PLAN §10).
 * 2. 글꼴: 파이썬이 request 'runtime-extras.font'로 부탁하면 같은 사이트의 Pretendard 정적 글꼴 파일을 받아(한 번) 가상 파일시스템에 쓰고 경로를 답한다.
 *    제한 모드(JSPI 없음)는 파이썬이 기다릴 수 없으므로 준비될 때 미리 넣는다.
 * 3. 저장 파일: 파이썬이 event 'runtime-extras.file_saved'로 보낸 바이트를 기억해 파일 패널에 [내려받기]로 보이고, 'runtime-extras.files' 목록으로 패널을 맞춘다.
 * 4. 이름 가림: 넣는 파일 이름이 라이브러리 이름(cv2.py 등)이면 넣지 않고 한국어로 알린다(shadow.ts). 파이썬 쪽의 경고는 콘솔에 온다.
 * 5. 콘솔 오래된 줄 접기(console-fold.ts).
 * 6. 파일 패널은 **파일을 쓸 때만** 연다(2026-09-17 Phase 2 검토 반영, 절대 원칙 4 "한 페이지 한 개념"): 코드에 파일을 읽고 쓰는 모양
 *    (files.ts의 WORK_FILE_USE_PATTERN — imread·open·save·truetype…)이 보이거나, 코드가 파일을 저장했거나, 학생이 [파일 넣기]를 썼거나,
 *    파이썬이 글꼴을 부탁하면 연다. 에지 검출 첫 실습에는 보이지 않는다. 가상 파일(mask.png)은 패널과 상관없이 늘 작업 폴더에 들어간다.
 * 브라우저 테스트 tests/e2e/lab-runner.spec.ts, 순수 논리 단위 테스트 tests/unit/runtime-extras/.
 */
import { showPanelWhenUsed } from '../panel-when-used.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { MASK_FILE_NAME, SITE_FONT_CANDIDATES, SITE_FONT_FILE, SITE_FONT_FS_PATH, SITE_FONT_LABEL, WORK_DIR } from './assets.ts';
import { buildMaskPng } from './mask.ts';
import { mountConsoleFold } from './console-fold.ts';
import {
  KIND_LABELS,
  WORK_FILE_USE_PATTERN,
  downloadBytes,
  formatBytes,
  isImageFile,
  mergeFileEntries,
  mimeTypeFor,
  type FileEntry,
  type ListedFile,
} from './files.ts';
import manifest from './manifest.ts';
import { reservedModuleNames, sanitizeUploadName, shadowRefusedMessage, shadowedName } from './shadow.ts';

/** 넣을 수 있는 파일 하나의 크기 상한(브라우저 메모리와 파이썬 파일시스템에 함께 남는다) */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

const REQUEST_FONT = 'runtime-extras.font';
const EVENT_FILE_SAVED = 'runtime-extras.file_saved';
const EVENT_FILES = 'runtime-extras.files';

interface PanelElements {
  readonly uploadButton: HTMLButtonElement | null;
  readonly fileInput: HTMLInputElement | null;
  readonly list: HTMLElement | null;
  readonly empty: HTMLElement | null;
  readonly status: HTMLElement | null;
  readonly hint: HTMLElement | null;
}

function readElements(panel: HTMLElement | null): PanelElements {
  const q = <T extends Element>(selector: string) => panel?.querySelector<T>(selector) ?? null;
  return {
    uploadButton: q<HTMLButtonElement>('[data-runtime-extras-upload]'),
    fileInput: q<HTMLInputElement>('[data-runtime-extras-file-input]'),
    list: q<HTMLElement>('[data-runtime-extras-list]'),
    empty: q<HTMLElement>('[data-runtime-extras-empty]'),
    status: q<HTMLElement>('[data-runtime-extras-status]'),
    hint: q<HTMLElement>('[data-runtime-extras-hint]'),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 같은 사이트의 글꼴 파일을 받는다(후보 주소를 앞에서부터, 처음 되는 것). 어느 것도 없으면 한국어 Error —
 * 파이썬 쪽이 그 말을 받아 Pillow 기본 글꼴로 그리고 학생에게 알린다.
 */
async function fetchSiteFont(): Promise<Uint8Array> {
  const reasons: string[] = [];
  for (const url of SITE_FONT_CANDIDATES) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }
      reasons.push(`HTTP ${response.status}`);
    } catch (error) {
      reasons.push(describe(error));
    }
  }
  throw new Error(`사이트 한글 글꼴 파일(${SITE_FONT_FILE})이 아직 없어요(${reasons.join(', ')}).`);
}

function mount(context: LabModuleContext): LabModuleHandle {
  const { runtime, lab, panel } = context;
  const elements = readElements(panel);
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement | null, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  // 화면이 아는 바이트(정지 2단계 뒤 다시 넣고, [내려받기]에 쓴다)
  const provided = new Map<string, Uint8Array>();
  const uploaded = new Map<string, Uint8Array>();
  const saved = new Map<string, Uint8Array>();
  let listing: ListedFile[] = [];
  let noticedSaved = new Set<string>();
  const thumbUrls = new Map<string, string>();
  let maskBytes: Uint8Array | null = null;
  let fontBytes: Promise<Uint8Array> | null = null;
  let fontInWorker = false;
  let busy = false;

  const setStatus = (text: string) => {
    if (elements.status) {
      elements.status.textContent = text;
    }
  };

  const revokeThumbs = () => {
    for (const url of thumbUrls.values()) {
      URL.revokeObjectURL(url);
    }
    thumbUrls.clear();
  };

  const bytesOf = (name: string): Uint8Array | undefined => saved.get(name) ?? uploaded.get(name) ?? provided.get(name);

  const render = () => {
    const { list, empty } = elements;
    if (!list) {
      return;
    }
    const entries: FileEntry[] = mergeFileEntries(listing, { provided, uploaded, saved });
    revokeThumbs();
    list.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        item.className = `file file--${entry.kind}`;
        item.dataset.runtimeExtrasFile = entry.name;
        item.dataset.kind = entry.kind;
        const bytes = bytesOf(entry.name);
        if (bytes && isImageFile(entry.name)) {
          const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeTypeFor(entry.name) }));
          thumbUrls.set(entry.name, url);
          const img = document.createElement('img');
          img.className = 'file__thumb';
          img.src = url;
          img.alt = '';
          img.width = 44;
          img.height = 44;
          item.append(img);
        } else {
          const icon = document.createElement('span');
          icon.className = 'file__icon';
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = (entry.name.split('.').pop() ?? '').slice(0, 4).toUpperCase() || '파일';
          item.append(icon);
        }
        const body = document.createElement('span');
        body.className = 'file__body';
        const nameText = document.createElement('span');
        nameText.className = 'file__name';
        nameText.textContent = entry.name;
        const meta = document.createElement('span');
        meta.className = 'file__meta';
        const kind = document.createElement('span');
        kind.className = 'file__kind';
        kind.textContent = KIND_LABELS[entry.kind];
        meta.append(kind, ` ${formatBytes(entry.size)}`);
        body.append(nameText, meta);
        item.append(body);
        if (entry.downloadable) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'lab-button lab-button--small';
          button.dataset.runtimeExtrasDownload = entry.name;
          button.textContent = '내려받기';
          button.setAttribute('aria-label', `${entry.name} 내려받기`);
          button.addEventListener('click', () => {
            const data = bytesOf(entry.name);
            if (!data) {
              return;
            }
            const ok = downloadBytes(entry.name, data);
            setStatus(ok ? `${entry.name} 파일로 내려받아요.` : '이 브라우저에서는 파일 내려받기를 시작하지 못했어요.');
          });
          item.append(button);
        } else {
          const note = document.createElement('span');
          note.className = 'file__meta';
          note.textContent = '내려받기 없음';
          item.append(note);
        }
        return item;
      }),
    );
    if (empty) {
      empty.hidden = entries.length > 0;
    }
    if (panel) {
      panel.dataset.fileCount = String(entries.length);
    }
  };

  const setBusy = (value: boolean) => {
    busy = value;
    if (elements.uploadButton) {
      elements.uploadButton.disabled = value;
    }
    if (elements.hint) {
      elements.hint.textContent = value ? '실행이 끝난 뒤에 파일을 넣을 수 있어요.' : '그림·글자 파일을 골라 작업 폴더에 넣어요.';
    }
  };

  /** 사이트 글꼴을 한 번 받아 파이썬 파일시스템에 넣고 그 경로를 돌려준다. */
  const ensureSiteFont = async (): Promise<string> => {
    fontBytes ??= fetchSiteFont();
    let bytes: Uint8Array;
    try {
      bytes = await fontBytes;
    } catch (error) {
      fontBytes = null;
      throw error;
    }
    if (!fontInWorker) {
      await runtime.writeFile(SITE_FONT_FS_PATH, bytes);
      fontInWorker = true;
    }
    return SITE_FONT_FS_PATH;
  };

  /** 준비될 때마다: 사이트 파일과 넣어 둔 파일을 작업 폴더에 (다시) 쓴다. */
  const ensureAssets = async (): Promise<void> => {
    fontInWorker = false;
    try {
      maskBytes ??= await buildMaskPng();
      await runtime.writeFile(`${WORK_DIR}/${MASK_FILE_NAME}`, maskBytes);
      provided.set(MASK_FILE_NAME, maskBytes);
    } catch (error) {
      context.notice(`사이트 파일 ${MASK_FILE_NAME}을(를) 준비하지 못했어요: ${describe(error)}`);
    }
    for (const [name, bytes] of uploaded) {
      try {
        await runtime.writeFile(`${WORK_DIR}/${name}`, bytes);
      } catch (error) {
        context.notice(`넣어 둔 파일 ${name}을(를) 다시 넣지 못했어요: ${describe(error)}`);
      }
    }
    if (runtime.info?.limited) {
      // 제한 모드에서는 파이썬이 글꼴을 부탁하며 기다릴 수 없어 미리 넣어 둔다(실패해도 실습은 계속).
      await ensureSiteFont().catch(() => undefined);
    }
    if (panel) {
      panel.dataset.assetsReady = 'yes';
    }
    render();
  };

  // 0. 파일 패널은 파일을 쓸 때만 연다(머리말 6번). 한 번 쓰였으면(저장·넣기·글꼴) 그 뒤로는 닫지 않는다.
  const panelGate = showPanelWhenUsed(context, WORK_FILE_USE_PATTERN);

  // 1. 준비될 때마다 파일 넣기(처음 + 정지 2단계 뒤 다시 뜰 때)
  cleanups.push(runtime.on('ready', () => void ensureAssets()));
  if (runtime.info) {
    void ensureAssets();
  }

  // 2. 글꼴 부탁
  context.onRequest(REQUEST_FONT, (request) => {
    panelGate.show();
    ensureSiteFont().then(
      (path) => request.reply({ path, label: SITE_FONT_LABEL, file: SITE_FONT_FILE }),
      (error: unknown) => request.fail(describe(error)),
    );
  });

  // 3. 저장 파일·목록
  context.onEvent(EVENT_FILE_SAVED, (payload) => {
    const data = (payload ?? {}) as { name?: unknown; size?: unknown; data?: unknown };
    if (typeof data.name !== 'string' || !(data.data instanceof Uint8Array)) {
      return;
    }
    saved.set(data.name, data.data);
    panelGate.show();
    render();
    if (!noticedSaved.has(data.name)) {
      noticedSaved.add(data.name);
      context.notice(`코드가 '${data.name}'(${formatBytes(data.data.length)})을(를) 저장했어요. 파일 패널에서 내려받을 수 있어요.`);
    }
  });
  context.onEvent(EVENT_FILES, (payload) => {
    const data = (payload ?? {}) as { files?: unknown };
    if (Array.isArray(data.files)) {
      listing = data.files
        .filter((file): file is { name: string; size: number } => typeof (file as { name?: unknown }).name === 'string')
        .map((file) => ({ name: file.name, size: typeof file.size === 'number' ? file.size : 0 }));
      render();
    }
  });
  context.onLab('run', () => {
    noticedSaved = new Set();
  });
  context.onLab('state', ({ state }) => setBusy(state === 'running' || state === 'stopping'));

  // 4. 파일 넣기(이름 가림 검사)
  const reserved = reservedModuleNames();
  listen(elements.uploadButton, 'click', () => {
    if (!busy) {
      elements.fileInput?.click();
    }
  });
  listen(elements.fileInput, 'change', () => {
    const input = elements.fileInput;
    const files = input?.files ? Array.from(input.files) : [];
    if (input) {
      input.value = '';
    }
    void (async () => {
      const added: string[] = [];
      // 넣지 못한 파일의 이유. 여러 개를 한 번에 고르면 넣은 파일 안내보다 이것을 먼저 보여 준다(학생이 놓치지 않게).
      const refused: string[] = [];
      for (const file of files) {
        const name = sanitizeUploadName(file.name);
        if (!name) {
          const message = `'${file.name}'은(는) 파일 이름으로 쓸 수 없어서 넣지 않았어요(빈 이름·숨김 파일·특수 문자).`;
          context.notice(message);
          refused.push(message);
          continue;
        }
        const shadow = shadowedName(name, reserved);
        if (shadow) {
          const message = shadowRefusedMessage(name, shadow);
          context.notice(message);
          refused.push(message);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          const message = `'${name}'은(는) ${formatBytes(file.size)}라 너무 커서 넣지 않았어요(한 파일 최대 ${formatBytes(MAX_UPLOAD_BYTES)}).`;
          context.notice(message);
          refused.push(message);
          continue;
        }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          await runtime.writeFile(`${WORK_DIR}/${name}`, bytes);
          uploaded.set(name, bytes);
          saved.delete(name);
          added.push(name);
          context.notice(`'${name}'(${formatBytes(bytes.length)})을(를) 작업 폴더에 넣었어요. 코드에서 '${name}'으로 읽어요(예: open('${name}') 또는 cv2.imread('${name}')).`);
        } catch (error) {
          const message = `'${name}'을(를) 작업 폴더에 넣지 못했어요: ${describe(error)}`;
          context.notice(message);
          refused.push(message);
        }
      }
      if (added.length > 0 || refused.length > 0) {
        // 넣은 파일(또는 넣지 못한 까닭)을 학생이 바로 볼 수 있게 패널을 연다.
        panelGate.show();
      }
      const addedText = added.length > 0 ? `${added.join(', ')} 파일을 작업 폴더에 넣었어요.` : '';
      setStatus([addedText, ...refused].filter((text) => text !== '').join(' '));
      render();
    })();
  });

  // 5. 콘솔 오래된 줄 접기
  const fold = mountConsoleFold(lab.root.querySelector<HTMLElement>('[data-lab-console]'));

  setBusy(runtime.state === 'running' || runtime.state === 'stopping');
  render();
  // 패널 열기는 맨 위의 panelGate(showPanelWhenUsed)가 맡는다 — 여기서 무조건 열지 않는다.

  return {
    dispose() {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      fold?.dispose();
      revokeThumbs();
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
