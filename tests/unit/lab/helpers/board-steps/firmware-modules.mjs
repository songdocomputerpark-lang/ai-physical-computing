// 펌웨어에 굳힌 모듈(dht·ds18x20·onewire·…·requests)을 가상 보드에서 import할 때 — 판 1.1.1 최종 점검(LB-15).
// 판 1.1.3(최종 전수 점검 2바퀴): 펌웨어 모듈 빈틈(esp32·espnow·mip·urequests·ssl …, 점 이름 umqtt.robust — LB2-02)과
// 컴퓨터용 패키지(numpy·cv2·PIL … — 실물처럼 ImportError, LB2-01). 워커처럼 실행 때 패키지를 받지 않는다(이 도우미는 원래 받지 않는다).
// tests/unit/lab/pyodide-board-firmware-modules.test.ts가 공유 도우미(pyodide-board-run.mjs --steps=이 파일)로 돌린다(src/lab/README.md 7.9).
// 받는 도구: step(이름, 코드, { … }), bridge, pyodide, rootDir.

/**
 * 가상 보드가 "펌웨어에는 들어 있는 모듈"이라고 알릴 이름(판 1.1.1 + 판 1.1.3) — 테스트 파일이 이 목록을 그대로 읽는다
 * @type {readonly string[]}
 */
export const FIRMWARE_MODULE_NAMES = [
  'dht',
  'ds18x20',
  'onewire',
  'ntptime',
  'esp',
  'esp32',
  'espnow',
  'apa106',
  'mip',
  'urequests',
  'btree',
  'cryptolib',
  'deflate',
  'vfs',
  'tls',
  'websocket',
  'uctypes',
];

/**
 * 컴퓨터용 패키지(Pyodide 배포판 이름) — [단계 이름, 코드, 오류에 나와야 할 이름]
 * @type {ReadonlyArray<readonly [string, string, string]>}
 */
export const PC_PACKAGE_CASES = [
  ['pc_numpy', 'import numpy as np', 'numpy'],
  ['pc_cv2', 'import cv2', 'cv2'],
  ['pc_pil', 'from PIL import Image', 'PIL'],
  ['pc_pandas', 'import pandas', 'pandas'],
  // 점 이름은 실물 MicroPython처럼 없는 맨 앞 이름(py/builtinimport.c의 full_mod_name — 그 깊이까지의 이름)
  ['pc_matplotlib_pyplot', 'import matplotlib.pyplot as plt', 'matplotlib'],
  // 고정 목록 밖 — Pyodide 배포판 import 이름 표에서 읽은 이름도 막는다
  ['pc_sympy', 'import sympy', 'sympy'],
];

export default async function firmwareModuleSteps({ step, pyodide }) {
  // 전에는 `import dht`가 그냥 "No module named 'dht'"로 끝나 오류 풀이가 "PC 프로그램용 — pip install"로 갔다.
  // 판 1.1.3: esp32·espnow·mip·urequests …도 "오타이거나 설치되지 않았어요" 카드로 갔다.
  for (const name of FIRMWARE_MODULE_NAMES) {
    await step(`import_${name}`, `import ${name}`);
  }
  // requests·ssl은 Pyodide에 같은 이름의 PC용 모듈이 있어 따로 막는다 — Pyodide의 영어 덧말(micropip.install)이 붙지 않는다
  await step('import_requests', 'import requests');
  await step('import_ssl', 'import ssl');
  // 점 이름: 오류가 난 이름 그대로(umqtt.robust), 바로 다음 줄의 umqtt.simple은 그대로 된다
  await step('import_umqtt_robust', 'import umqtt.robust');
  // 흉내가 있는 것·Pyodide 표준 모듈은 그대로
  await step('import_asyncio', 'import asyncio\nasyncio.__name__');
  // 실물 펌웨어의 옛 이름 호환 모듈 uasyncio(extmod/asyncio/manifest.py)는 asyncio를 그대로 넘겨준다(판 1.1.3 통합)
  await step('import_uasyncio', 'import uasyncio as aio\nfrom uasyncio import sleep\n[aio.__name__, sleep.__name__]');
  await step('import_umqtt', 'from umqtt.simple import MQTTClient\nMQTTClient.__name__');
  // 학생이 같은 이름의 파일을 작업 폴더에 두면 그 파일을 쓴다(실물 보드도 보드 뿌리의 파일이 먼저)
  pyodide.FS.writeFile('/home/pyodide/requests.py', 'MINE = "내 requests.py"\n');
  await step('import_requests_user_file', 'import requests\nrequests.MINE');
  pyodide.FS.unlink('/home/pyodide/requests.py');

  // ── 컴퓨터용 패키지(판 1.1.3 LB2-01): 실물 MicroPython과 같은 ImportError: no module named '…' ──
  for (const [name, code] of PC_PACKAGE_CASES) {
    await step(name, code);
  }
  // 학생이 같은 이름의 파일을 두면 그 파일(컴퓨터용 이름도 — 보드 뿌리의 파일이 먼저)
  pyodide.FS.writeFile('/home/pyodide/numpy.py', 'MINE = "내 numpy.py"\n');
  await step('pc_numpy_user_file', 'import numpy\nnumpy.MINE');
  pyodide.FS.unlink('/home/pyodide/numpy.py');
  // 막는 이름 표: Pyodide 배포판 표를 읽었고(고정 목록보다 훨씬 많음), 표준 모듈·펌웨어 이름·u-이름은 빠졌다
  await step(
    'pc_names',
    [
      'import apc_board',
      'names = apc_board.pc_package_names()',
      "{'count': len(names), 'has': sorted(n for n in ['numpy', 'cv2', 'PIL', 'sympy', 'micropip'] if n in names),",
      " 'not': sorted(n for n in ['json', 'hashlib', 'ssl', 'requests', 'ujson', 'time', 'datetime', 'umqtt', 'esp32', 'machine'] if n in names)}",
    ].join('\n'),
  );

  // ── 그대로인 것(호환 약속 1): 목록 밖의 없는 이름은 지금 모양(ModuleNotFoundError) ──
  await step('typo_machin', 'import machin');
  await step('esp32ble_lib', 'import ESP32BLE_LIB');
  // 실물 펌웨어에도 있는 표준 모듈은 그대로 된다(실행 때 패키지를 받지 않아도)
  await step(
    'stdlib_ok',
    [
      'import json, struct, binascii, hashlib',
      "[json.dumps({'a': 1}), struct.pack('<H', 258).hex(), binascii.hexlify(b'AB').decode(), hashlib.sha256(b'abc').hexdigest()[:8]]",
    ].join('\n'),
  );
}
