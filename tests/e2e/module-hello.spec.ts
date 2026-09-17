// 흉내 모듈 폴더 규약(src/lab/modules/<id>/)의 화면 쪽 브라우저 테스트 — 예시 모듈 hello(개발용 시험 페이지 /labs/dev/runtime/, labId 'dev').
// 확인하는 것: 폴더를 두기만 해도 ① 워커가 apc_hello.py를 /apc에 넣어 import되고 ② index.ts가 실습실에 붙어(data-lab-modules)
// ③ panel.astro가 그려져 mount 때 열리고 ④ 요청(hello.greet)·이벤트(hello.wave)·최신 값(hello.name)·쌓이는 값(hello.clicks)이 오간다.
// 새 모듈의 spec은 이 파일을 복사해 자기 페이지·모듈 id로 바꾼다(병렬 제작: PW_BASE_URL로 자기 개발 서버에 대고 이 파일만 돌린다).
import { expect, test } from '@playwright/test';
import { labRoot, openLabAndWaitReady, runCode, waitDone } from './helpers/lab.ts';

test.describe('흉내 모듈 뼈대(hello)', () => {
  test('모듈이 붙고 패널이 열리며 요청·이벤트·값이 파이썬과 오간다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openLabAndWaitReady(page);

    // ② 모듈이 붙었다(host.ts가 data-lab-modules에 적음) ③ 패널이 열렸다
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bhello\b/u);
    const panel = page.locator('[data-lab-module-panel="hello"]');
    await expect(panel).toBeVisible();

    // 패널 입력칸 → setValue('hello.name'), [누르기] → pushEvent('hello.clicks')
    await panel.locator('[data-hello-name]').fill('세계');
    await panel.locator('[data-hello-click]').click();
    await panel.locator('[data-hello-click]').click();

    // ①④ 파이썬: greet(요청) → 답, wave(이벤트) → 패널 횟수, name(최신 값), clicks(실행 전에 쌓인 것은 버려지고 실행 중 것만)
    // 실행 중 누르기는 파이썬이 받을 때까지(0.1초마다 확인, 최대 15초) 기다린다. 예전에는 time.sleep(0.8) 한 번 안에 눌러야 해서,
    // 화면이 느린 CI 모바일에서 'before []'를 알아채고 단추를 누르기까지 0.8초를 넘겨 'after []'로 실패했다(2026-09-17 테스트 실행
    // 35187309907·35194558689, 재시도까지 네 번 — 로컬에서 화면 CPU를 10배 느리게 하면 같은 실패가 3번에 1번 난다).
    // 새 모듈 spec도 "정해진 시간 창 안에 누르기" 대신 이렇게 파이썬이 기다리게 쓴다.
    await runCode(
      page,
      [
        'import apc_hello',
        "print(apc_hello.greet('세계'))",
        'apc_hello.wave(3)',
        'print(apc_hello.name())',
        "print('before', apc_hello.clicks())",
        'import time',
        'during = []',
        'for _ in range(150):',
        '    during = apc_hello.clicks()',
        '    if during:',
        '        break',
        '    time.sleep(0.1)',
        "print('after', during)",
      ].join('\n'),
    );
    // 실행 중에 [누르기]를 한 번 더 누른다(파이썬이 누르기를 기다리는 동안) — 실행 전 두 번은 버려졌으니 세 번째 번호만 온다
    await expect(page.locator('[data-lab-console]')).toContainText('before []');
    await panel.locator('[data-hello-click]').click();
    expect(await waitDone(page, 30_000)).toBe('ok');

    const consoleText = (await page.locator('[data-lab-console]').textContent()) ?? '';
    expect(consoleText).toContain('안녕, 세계!');
    expect(consoleText).toContain('\n세계\n');
    expect(consoleText).toContain('after [3]');
    await expect(panel.locator('[data-hello-waves]')).toHaveAttribute('data-count', '3');
    await expect(panel.locator('[data-hello-last]')).toHaveText('안녕, 세계!');
    expect(errors).toEqual([]);
  });

  test('영상처리 실습실에는 hello 모듈이 붙지 않는다(labs 목록대로)', async ({ page }) => {
    const response = await page.goto('labs/vision/');
    expect(response?.status()).toBe(200);
    await expect(labRoot(page)).toHaveAttribute('data-state', /idle|loading|unloaded/u);
    await expect(page.locator('[data-lab-module-panel="hello"]')).toHaveCount(0);
    // 영상처리 실습실에는 다른 흉내 모듈(loading·errors·mediapipe·runtime-extras·desktop·speech)이 붙는다.
    // 여기서 보는 것은 "hello는 붙지 않는다"뿐이다.
    await expect
      .poll(async () => await labRoot(page).getAttribute('data-lab-modules'), { timeout: 30_000 })
      .not.toBeNull();
    expect((await labRoot(page).getAttribute('data-lab-modules')) ?? '').not.toMatch(/hello/u);
  });
});
