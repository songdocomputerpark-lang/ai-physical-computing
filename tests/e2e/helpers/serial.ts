/**
 * 모의 시리얼을 Playwright 페이지에 끼우는 도구(병렬 제작 준비 2026-09-17, 쓰는 법 전체는 src/lab/README.md 8절).
 * 실제 보드 연결(P3-07·P3-08)·펌웨어 굽기(P3-09)·보드 준비·점검 페이지·통합 테스트가 함께 쓴다 — 고칠 일은 요청으로(공유 도구).
 *
 *   import { installSerialMock, serialMock } from './helpers/serial.ts';
 *   await installSerialMock(page, { ports: [{ id: 'board', micropython: { files: { 'main.py': "print('hi')\n" } } }] });
 *   await page.goto(withBase('labs/esp32/'));                 // installSerialMock은 goto 전에
 *   await page.getByRole('button', { name: '보드 연결' }).click(); // requestPort는 클릭(사용자 조작) 안에서만 된다
 *   const board = serialMock(page);                             // 기본 포트 id 'board'
 *   await expect.poll(() => board.mode()).toBe('raw');
 *   expect(await board.writtenText()).toContain('\x05A\x01');
 *
 * 어떻게: src/lab/serial/mock/browser-entry.ts(+ 플러그인 파일)를 esbuild로 한 덩어리(IIFE)로 묶어 page.addInitScript로 넣는다.
 * 페이지 스크립트보다 먼저 돌고, 문서가 새로 열릴 때마다(새로 고침·이동·iframe) 새 보드가 생긴다 — 이전 문서의 보드 상태는 이어지지 않는다.
 * 플러그인: 기본 내보내기가 (context: SerialMockPluginContext) => void인 .ts 파일 경로(저장소 뿌리 기준).
 *   예) tests/e2e/helpers/serial-plugins/bootloader-echo.ts — 구역마다 이 폴더에 새 파일을 더한다(남의 파일은 고치지 않음).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { build } from 'esbuild';
import type { MockScript, SerialLineSignals, SerialMockConfig } from '../../../src/lab/serial/mock/index.ts';
import { USB_IDS } from '../../../src/lab/serial/mock/mock-port.ts';

export { USB_IDS };
export type { SerialMockConfig, SerialMockPortConfig } from '../../../src/lab/serial/mock/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ENTRY = path.join(ROOT, 'src/lab/serial/mock/browser-entry.ts');

/** 사이트가 requestPort에 넘길 필터 모양(CH340·CP2102) */
export const ESP32_USB_FILTERS: SerialPortFilter[] = [{ ...USB_IDS.ch340 }, { ...USB_IDS.cp2102 }];

/** JSON으로 브라우저에 보낼 수 있는 응답(match는 정규식 글자) */
export type JsonMockScript = Omit<MockScript, 'match' | 'run'> & { readonly match: string };

const bundles = new Map<string, Promise<string>>();

/** 묶은 스크립트(플러그인 조합마다 한 번만 만든다) */
export function serialMockBundle(plugins: readonly string[] = []): Promise<string> {
  const files = plugins.map((file) => path.resolve(ROOT, file));
  const key = files.join('|');
  let pending = bundles.get(key);
  if (!pending) {
    const contents = [
      `import { bootSerialMock } from ${JSON.stringify(ENTRY)};`,
      ...files.map((file, index) => `import plugin${index} from ${JSON.stringify(file)};`),
      `bootSerialMock([${files.map((_, index) => `plugin${index}`).join(', ')}]);`,
    ].join('\n');
    pending = build({
      stdin: { contents, resolveDir: ROOT, sourcefile: 'apc-serial-mock-entry.ts', loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      charset: 'utf8',
      legalComments: 'none',
      logLevel: 'silent',
    }).then((result) => {
      const output = result.outputFiles[0];
      if (!output) {
        throw new Error('모의 시리얼 스크립트를 묶지 못했어요.');
      }
      return output.text;
    });
    bundles.set(key, pending);
  }
  return pending;
}

/**
 * 페이지에 모의 navigator.serial을 끼운다. page.goto 전에 부른다.
 * config를 비우면 MicroPython이 든 CH340 보드 하나(id 'board', 허락 전 — requestPort로 고른다).
 */
export async function installSerialMock(page: Page, config: SerialMockConfig = {}, options: { readonly plugins?: readonly string[] } = {}): Promise<void> {
  const bundle = await serialMockBundle(options.plugins ?? []);
  await page.addInitScript({ content: `globalThis.__APC_SERIAL_MOCK_CONFIG__ = ${JSON.stringify(config)};\n${bundle}` });
}

/** window.__apcSerialMock을 테스트 쪽에서 부르는 얇은 도구(포트 id를 빼면 defaultId) */
export interface SerialMockHandle {
  readonly page: Page;
  portIds(): Promise<string[]>;
  /** 사이트가 보드에 쓴 바이트(0~255 글자 — '\x03' 같은 제어 글자 그대로) */
  writtenText(id?: string): Promise<string>;
  /** 보드가 사이트에 보낸 바이트(0~255 글자). 한글은 utf8Text()로 풀어 본다 */
  deliveredText(id?: string): Promise<string>;
  files(id?: string): Promise<Record<string, string>>;
  setFile(filePath: string, text: string, id?: string): Promise<void>;
  /** off·reset-held·booting·friendly·paste·raw·raw-paste·running·bootloader */
  mode(id?: string): Promise<string>;
  executed(id?: string): Promise<{ via: string; code: string }[]>;
  pins(id?: string): Promise<Record<string, number>>;
  signals(id?: string): Promise<SerialLineSignals[]>;
  openLog(id?: string): Promise<SerialOptions[]>;
  isOpen(id?: string): Promise<boolean>;
  requests(): Promise<SerialPortRequestOptions[]>;
  /** 다음 선택 창에서 고를 포트(null이면 학생이 창을 닫음) */
  chooseNext(id: string | null): Promise<void>;
  plug(id?: string): Promise<void>;
  unplug(id?: string): Promise<void>;
  /** 보드 → 사이트로 글을 바로 보낸다 */
  send(text: string, id?: string): Promise<void>;
  reset(kind: 'hard' | 'soft', id?: string): Promise<void>;
  addScript(script: JsonMockScript, id?: string): Promise<void>;
  flowControlOverrun(id?: string): Promise<number>;
  hardResets(id?: string): Promise<number>;
  softResets(id?: string): Promise<number>;
}

type ControllerMethod = Exclude<keyof SerialMockHandle, 'page'>;

async function call<T>(page: Page, method: ControllerMethod, args: unknown[]): Promise<T> {
  return page.evaluate(
    async ([name, values]) => {
      const mock = (globalThis as unknown as { __apcSerialMock?: Record<string, (...items: unknown[]) => unknown> }).__apcSerialMock;
      if (!mock) {
        throw new Error('모의 시리얼이 없어요 — page.goto 전에 installSerialMock(page)을 불렀는지 확인해요.');
      }
      return (await mock[name]!(...values)) as never;
    },
    [method, args] as const,
  ) as Promise<T>;
}

export function serialMock(page: Page, defaultId = 'board'): SerialMockHandle {
  const id = (value?: string) => value ?? defaultId;
  return {
    page,
    portIds: () => call(page, 'portIds', []),
    writtenText: (port) => call(page, 'writtenText', [id(port)]),
    deliveredText: (port) => call(page, 'deliveredText', [id(port)]),
    files: (port) => call(page, 'files', [id(port)]),
    setFile: (filePath, text, port) => call(page, 'setFile', [id(port), filePath, text]),
    mode: (port) => call(page, 'mode', [id(port)]),
    executed: (port) => call(page, 'executed', [id(port)]),
    pins: (port) => call(page, 'pins', [id(port)]),
    signals: (port) => call(page, 'signals', [id(port)]),
    openLog: (port) => call(page, 'openLog', [id(port)]),
    isOpen: (port) => call(page, 'isOpen', [id(port)]),
    requests: () => call(page, 'requests', []),
    chooseNext: (port) => call(page, 'chooseNext', [port]),
    plug: (port) => call(page, 'plug', [id(port)]),
    unplug: (port) => call(page, 'unplug', [id(port)]),
    send: (text, port) => call(page, 'send', [id(port), text]),
    reset: (kind, port) => call(page, 'reset', [id(port), kind]),
    addScript: (script, port) => call(page, 'addScript', [id(port), script]),
    flowControlOverrun: (port) => call(page, 'flowControlOverrun', [id(port)]),
    hardResets: (port) => call(page, 'hardResets', [id(port)]),
    softResets: (port) => call(page, 'softResets', [id(port)]),
  };
}

/** 0~255 글자(deliveredText 등)를 UTF-8로 풀어 한글을 읽을 수 있게 */
export function utf8Text(binary: string): string {
  return Buffer.from(binary, 'latin1').toString('utf8');
}

/** 실패 메시지용: 제어 글자를 \x04처럼 보이게 */
export function describeControl(binary: string): string {
  return binary.replace(/[\x00-\x08\x0b-\x1f\x7f]/gu, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`);
}
