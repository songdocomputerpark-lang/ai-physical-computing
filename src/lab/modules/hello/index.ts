/**
 * 모듈 뼈대 예시 "hello"의 화면 쪽(src/lab/README.md 4절). 파이썬 apc_hello.py와 짝이다.
 *
 * 보여 주는 것
 * - 요청 처리: 파이썬 apc_hello.greet(name) → request 'hello.greet' {name} → 여기서 reply('안녕, name!')
 * - 이벤트 받기: 파이썬 apc_hello.wave() → emit 'hello.wave' {count} → 패널의 횟수 표시
 * - 화면 → 파이썬 최신 값: 패널 입력칸 → setValue('hello.name') → 파이썬 apc_hello.name()
 * - 화면 → 파이썬 쌓이는 값: 패널 [누르기] 버튼 → pushEvent('hello.clicks') → 파이썬 apc_hello.clicks()
 * - 패널: panel.astro가 그린 [data-lab-module-panel="hello"]를 showPanel()로 연다.
 * 브라우저 테스트 tests/e2e/module-hello.spec.ts가 이 흐름을 확인한다.
 */
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

export function greeting(name: unknown): string {
  const text = typeof name === 'string' && name.trim() !== '' ? name.trim() : '친구';
  return `안녕, ${text}!`;
}

function mount(context: LabModuleContext): LabModuleHandle {
  const { panel } = context;
  const nameInput = panel?.querySelector<HTMLInputElement>('[data-hello-name]') ?? null;
  const clickButton = panel?.querySelector<HTMLButtonElement>('[data-hello-click]') ?? null;
  const waveText = panel?.querySelector<HTMLElement>('[data-hello-waves]') ?? null;
  const lastText = panel?.querySelector<HTMLElement>('[data-hello-last]') ?? null;
  let waves = 0;
  let clicks = 0;

  context.onRequest('hello.greet', (request) => {
    const payload = (request.payload ?? {}) as { name?: unknown };
    const text = greeting(payload.name);
    if (lastText) {
      lastText.textContent = text;
    }
    request.reply(text);
  });

  context.onEvent('hello.wave', (payload) => {
    const count = typeof (payload as { count?: unknown })?.count === 'number' ? (payload as { count: number }).count : 1;
    waves += count;
    if (waveText) {
      waveText.textContent = String(waves);
      waveText.dataset.count = String(waves);
    }
  });

  const onName = () => context.setValue('hello.name', nameInput?.value ?? '');
  nameInput?.addEventListener('input', onName);
  const onClick = () => {
    clicks += 1;
    context.pushEvent('hello.clicks', clicks);
  };
  clickButton?.addEventListener('click', onClick);

  // 실행이 시작될 때 지금 입력칸 값을 다시 보낸다(정지 2단계로 워커가 다시 뜨면 값이 사라지므로).
  context.onLab('run', () => {
    onName();
  });

  context.showPanel();
  return {
    dispose() {
      nameInput?.removeEventListener('input', onName);
      clickButton?.removeEventListener('click', onClick);
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
