// 펌웨어에 굳힌 모듈(dht·ds18x20·onewire·…·requests)을 가상 보드에서 import할 때 — 판 1.1.1 최종 점검(LB-15).
// tests/unit/lab/pyodide-board-firmware-modules.test.ts가 공유 도우미(pyodide-board-run.mjs --steps=이 파일)로 돌린다(src/lab/README.md 7.9).
// 받는 도구: step(이름, 코드, { … }), bridge, pyodide, rootDir.

export default async function firmwareModuleSteps({ step, pyodide }) {
  // 전에는 `import dht`가 그냥 "No module named 'dht'"로 끝나 오류 풀이가 "PC 프로그램용 — pip install"로 갔다
  for (const name of ['dht', 'ds18x20', 'onewire', 'ntptime']) {
    await step(`import_${name}`, `import ${name}`);
  }
  // requests는 Pyodide에 같은 이름의 PC용 패키지가 있어 따로 막는다 — Pyodide의 영어 덧말(micropip.install)이 붙지 않는다
  await step('import_requests', 'import requests');
  // 흉내가 있는 것·Pyodide 표준 모듈은 그대로
  await step('import_asyncio', 'import asyncio\nasyncio.__name__');
  await step('import_umqtt', 'from umqtt.simple import MQTTClient\nMQTTClient.__name__');
  // 학생이 같은 이름의 파일을 작업 폴더에 두면 그 파일을 쓴다(실물 보드도 보드 뿌리의 파일이 먼저)
  pyodide.FS.writeFile('/home/pyodide/requests.py', 'MINE = "내 requests.py"\n');
  await step('import_requests_user_file', 'import requests\nrequests.MINE');
  pyodide.FS.unlink('/home/pyodide/requests.py');
}
