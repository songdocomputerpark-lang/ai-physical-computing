// 서비스 워커 등록 도우미(src/lab/loader/sw-client.ts)의 순수 부분 단위 테스트 — P2-05.
// 브라우저 API가 필요한 부분(register·message)은 브라우저 테스트(tests/e2e/lab-loading.spec.ts)가 확인한다.
import { describe, expect, it } from 'vitest';
import { SW_QUERY_NAME, SW_QUERY_OFF, SW_SCRIPT_NAME } from '../../../src/lab/loader/constants.ts';
import { serviceWorkerScope, serviceWorkerUrl, swQuery, tellServiceWorker } from '../../../src/lab/loader/sw-client.ts';
import { BASE_PATH } from '../../../src/lib/url.ts';

describe('서비스 워커 주소', () => {
  it('사이트 뿌리에 둔다(범위가 사이트 전체가 되려면 이 위치여야 한다)', () => {
    expect(serviceWorkerUrl()).toBe(`${BASE_PATH}${SW_SCRIPT_NAME}`);
    expect(serviceWorkerScope()).toBe(BASE_PATH);
  });
});

describe('?sw= 비상구', () => {
  it('주소에서 값을 읽는다', () => {
    expect(swQuery(`?${SW_QUERY_NAME}=${SW_QUERY_OFF}`)).toBe('off');
    expect(swQuery('?a=1')).toBeNull();
    expect(swQuery('')).toBeNull();
  });
});

describe('tellServiceWorker', () => {
  it('등록이 없으면 아무 일도 하지 않는다', () => {
    expect(tellServiceWorker(null, { type: 'apc:cdn-down' })).toBe(false);
  });

  it('등록된 워커에 보낸다(맡고 있지 않아도)', () => {
    const sent: unknown[] = [];
    const registration = { active: { postMessage: (message: unknown) => sent.push(message) } } as unknown as ServiceWorkerRegistration;
    expect(tellServiceWorker(registration, { type: 'apc:cdn-down' })).toBe(true);
    expect(sent).toEqual([{ type: 'apc:cdn-down' }]);
  });

  it('보내다 오류가 나도 예외를 던지지 않는다', () => {
    const registration = {
      active: {
        postMessage: () => {
          throw new Error('닫힘');
        },
      },
    } as unknown as ServiceWorkerRegistration;
    expect(tellServiceWorker(registration, { type: 'apc:cdn-down' })).toBe(false);
  });
});
