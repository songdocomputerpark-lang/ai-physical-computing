// Node.js에서 실제 Pyodide 314.0.7로 음성 인식 흉내(src/lab/modules/speech/speech_recognition.py)를 검사하는 도우미 스크립트.
// tests/unit/speech/pyodide-speech.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
// tests/unit/lab/helpers/pyodide-hello-run.mjs(모듈 규약 본보기, src/lab/README.md 4.6)를 복사해 요청 처리와 단계를 음성용으로 바꿨다.
//
// 화면 흉내: 'speech.listen' 요청이 오면 미리 넣어 둔 답 목록에서 하나를 꺼내 준다(글자 입력 방식과 같은 모양).
// 교과서 예제 f044(examples/vision/u1/1-4-3-speech-once.py)·f045(…-adv-speech-keywords.py)를 **파일 그대로** 돌려 본다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

const out = { steps: {}, notices: [], requests: [], files: [] };
/** 다음 'speech.listen' 요청에 줄 답(앞에서부터 꺼내 쓴다). 비면 "못 알아들음"으로 답한다. */
let replies = [];

function isRethrownRunError(error) {
  return Boolean(error) && typeof error.type === 'string' && (error.type === 'SystemExit' || error.type === 'KeyboardInterrupt');
}
process.on('uncaughtException', (error) => {
  if (isRethrownRunError(error)) return;
  console.error(error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isRethrownRunError(reason)) return;
  console.error(reason);
  process.exit(1);
});

function finish() {
  process.stdout.write(`\n${JSON.stringify(out)}\n`);
  process.exit(0);
}

const pyodide = await loadPyodide();
let jspi = false;
let stdout = '';

const bridge = createBridge({
  post: (message) => {
    if (message.type === 'request') {
      out.requests.push({ kind: message.kind, payload: message.payload });
      setTimeout(() => {
        if (message.kind === 'speech.listen') {
          const reply = replies.shift() ?? { ok: false, failure: 'unknown', message: '말소리가 들리지 않았어요.', mode: 'text' };
          bridge.resolveRequest(message.requestId, reply);
        } else {
          bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`);
        }
      }, 5);
    } else if (message.type === 'notice') {
      out.notices.push(message.text);
    }
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
});
pyodide.setStdout({
  write: (buffer) => {
    stdout += new TextDecoder().decode(buffer);
    return buffer.length;
  },
});
pyodide.registerJsModule('_apc_bridge', bridge.api);
pyodide.FS.mkdirTree('/apc');

// 붙박이 + 모듈 폴더의 .py (src/lab/python/modules.ts와 같은 규칙: 이름은 저장소 전체에서 하나)
const pythonFiles = new Map();
for (const file of fs.readdirSync(path.join(rootDir, 'src', 'lab', 'python'))) {
  if (file.endsWith('.py')) pythonFiles.set(file, path.join(rootDir, 'src', 'lab', 'python', file));
}
const modulesDir = path.join(rootDir, 'src', 'lab', 'modules');
for (const folder of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(modulesDir, folder.name))) {
    if (!file.endsWith('.py')) continue;
    if (pythonFiles.has(file)) {
      out.duplicate = file;
      finish();
    }
    pythonFiles.set(file, path.join(modulesDir, folder.name, file));
  }
}
for (const [file, fullPath] of pythonFiles) {
  pyodide.FS.writeFile(`/apc/${file}`, fs.readFileSync(fullPath, 'utf8'));
  out.files.push(file);
}
out.files.sort();

jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(!jspi);
out.jspi = jspi;

async function step(name, code, { setup, answers = [] } = {}) {
  stdout = '';
  replies = [...answers];
  const record = { ms: 0, stdout: '' };
  const startedAt = performance.now();
  bridge.beginRun();
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  if (setup) setup();
  try {
    const globals = pyodide.toPy({ __name__: '__main__' });
    try {
      const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py' });
      record.value = value && typeof value.toJs === 'function' ? value.toJs({ dict_converter: Object.fromEntries }) : value;
    } finally {
      globals.destroy();
    }
  } catch (error) {
    record.errorType = error && error.type ? error.type : 'JsError';
    record.errorMessage = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
  } finally {
    bridge.endRun();
  }
  record.ms = Math.round(performance.now() - startedAt);
  record.stdout = stdout;
  record.leftoverReplies = replies.length;
  out.steps[name] = record;
}

const exampleDir = path.join(rootDir, 'examples', 'vision', 'u1');
const f044 = fs.readFileSync(path.join(exampleDir, '1-4-3-speech-once.py'), 'utf8');
const f045 = fs.readFileSync(path.join(exampleDir, '1-4-3-adv-speech-keywords.py'), 'utf8');

if (jspi) {
  // ① 교과서 기본 실습(f044)을 파일 그대로: 글자 입력 방식의 답이 recognize_google 결과가 된다.
  await step('f044_ok', f044, { answers: [{ ok: true, text: '안녕하세요', mode: 'text' }] });
  // ② 못 알아들었을 때 → UnknownValueError(원본 코드의 except 자리)
  await step('f044_unknown', f044, { answers: [{ ok: false, failure: 'unknown', message: '말소리가 들리지 않았어요.', mode: 'text' }] });
  // ③ 권한·네트워크 문제 → RequestError
  await step('f044_request', f044, {
    answers: [{ ok: false, failure: 'request', message: '마이크 사용을 허용하지 않았어요.', mode: 'server' }],
  });
  // ④ 교과서 심화 실습(f045): 시작 → 정지 → 종료로 반복이 끝난다.
  await step('f045_keywords', f045, {
    answers: [
      { ok: true, text: '시작', mode: 'text' },
      { ok: true, text: '정지', mode: 'text' },
      { ok: true, text: '종료', mode: 'text' },
    ],
  });
  // ⑤ 요청에 담기는 값(phrase_time_limit)과 timeout → WaitTimeoutError
  await step('timeout', 'import speech_recognition as sr\nr = sr.Recognizer()\nwith sr.Microphone() as source:\n    r.listen(source, timeout=3)\n', {
    answers: [{ ok: false, failure: 'timeout', message: '말이 시작되지 않았어요.', mode: 'text' }],
  });
  // ⑥ 그 밖의 API: 마이크 이름 목록, 다른 인식기, show_all
  await step(
    'extras',
    [
      'import speech_recognition as sr',
      'r = sr.Recognizer()',
      'names = sr.Microphone.list_microphone_names()',
      'with sr.Microphone() as source:',
      '    r.adjust_for_ambient_noise(source)',
      '    audio = r.listen(source)',
      'detail = r.recognize_google(audio, language="ko-KR", show_all=True)',
      'try:',
      '    r.recognize_sphinx(audio)',
      '    other = "no-error"',
      'except sr.RequestError as error:',
      '    other = str(error)',
      '[len(names), detail["alternative"][0]["transcript"], other, audio.mode]',
    ].join('\n'),
    { answers: [{ ok: true, text: '테스트 문장', mode: 'text' }] },
  );
  // ⑦ 영어로 부르면 한국어로만 된다고 알려 주고(한 번만), 글자는 그대로 돌려준다
  await step(
    'language_notice',
    [
      'import speech_recognition as sr',
      'r = sr.Recognizer()',
      'with sr.Microphone() as source:',
      '    audio = r.listen(source)',
      'first = r.recognize_google(audio, language="en-US")',
      'second = r.recognize_google(audio, language="en-US")',
      '[first, second]',
    ].join('\n'),
    { answers: [{ ok: true, text: 'hello', mode: 'text' }] },
  );
}

// ⑧ 제한 모드(JSPI 없음): 기다릴 수 없으므로 실행 전에 넣어 둔 글자(speech.text)를 쓴다.
bridge.setLimited(true);
bridge.setValue('speech.text', '  미리 적어 둔 문장  ');
await step('limited', f044, {});
bridge.setValue('speech.text', '');
await step('limited_empty', f044, {});
bridge.setLimited(!jspi);

// ⑨ 동기 진입점 규칙: 마지막 양보 뒤 16ms가 지난 뒤 reset_for_run을 동기로 불러도 스택 전환 오류가 없어야 한다.
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  out.syncEntrypointReset = 'ok';
} catch (error) {
  out.syncEntrypointReset = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}

finish();
