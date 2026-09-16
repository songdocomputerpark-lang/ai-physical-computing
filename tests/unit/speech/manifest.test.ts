// 음성 인식 흉내 모듈이 폴더 규약(src/lab/README.md 4절)에 맞는지 검사한다(P2-13).
// 모듈 폴더 전체를 보는 검사는 tests/unit/lab/modules.test.ts에 있고, 여기서는 speech 폴더만 자세히 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifests } from '../../../src/lab/modules/manifests.ts';
import speechManifest from '../../../src/lab/modules/speech/manifest.ts';
import { SERVER_RECOGNITION_NAME, SPEECH_MODE_NAME } from '../../../src/lab/modules/speech/settings.ts';

const ROOT = process.cwd();
const MODULE_DIR = path.join(ROOT, 'src', 'lab', 'modules', 'speech');

describe('speech 모듈 manifest', () => {
  it('규약 검사를 통과한다(이름 겹침·접두어·shims)', () => {
    expect(validateManifests({ './speech/manifest.ts': { default: speechManifest } })).toEqual([]);
  });

  it('영상처리 실습실에 붙고, 요청·채널 이름이 문서와 같다', () => {
    expect(speechManifest).toMatchObject({
      id: 'speech',
      labs: ['vision'],
      requestKinds: ['speech.listen'],
      channels: ['speech.mode', 'speech.text'],
      placement: 'panel',
    });
    // 진짜 패키지를 덮어쓰지 않는다(speech_recognition은 Pyodide에 없는 패키지라 파일을 바로 넣는다).
    expect(speechManifest.shims).toEqual({});
    expect(speechManifest.packages).toEqual([]);
  });

  it('폴더에 manifest.ts·index.ts·panel.astro와 파이썬 모듈이 있다', () => {
    for (const file of ['manifest.ts', 'index.ts', 'panel.astro', 'speech_recognition.py', 'settings.ts', 'web-speech.ts']) {
      expect(fs.existsSync(path.join(MODULE_DIR, file)), file).toBe(true);
    }
  });

  it('파이썬 파일 이름이 학생 코드의 import 이름과 같다(import speech_recognition as sr)', () => {
    const pythonFiles = fs.readdirSync(MODULE_DIR).filter((file) => file.endsWith('.py'));
    expect(pythonFiles).toEqual(['speech_recognition.py']);
    const source = fs.readFileSync(path.join(MODULE_DIR, 'speech_recognition.py'), 'utf8');
    // 규약(4.4): apc_runtime의 함수만 쓰고 js·_apc_bridge를 직접 만지지 않는다.
    expect(source).not.toMatch(/^import js$/mu);
    expect(source).not.toMatch(/_apc_bridge/u);
    expect(source).toContain('apc_runtime.register_reset_hook');
    // 요청 이름은 manifest와 같아야 한다.
    expect(source).toContain('REQUEST_LISTEN = "speech.listen"');
    for (const name of ['UnknownValueError', 'RequestError', 'Recognizer', 'Microphone', 'recognize_google']) {
      expect(source, name).toContain(name);
    }
  });

  it('저장 이름은 모듈 머리말(module:speech:)을 쓴다 — [기록 지우기]가 함께 지운다', () => {
    expect(SERVER_RECOGNITION_NAME.startsWith(`module:${speechManifest.id}:`)).toBe(true);
    expect(SPEECH_MODE_NAME.startsWith(`module:${speechManifest.id}:`)).toBe(true);
  });
});

describe('교과서 예제(f044·f045)', () => {
  const exampleDir = path.join(ROOT, 'examples', 'vision', 'u1');

  it('두 예제가 있고 speech_recognition을 그대로 쓴다(원본 코드는 고치지 않는다 — PD-10)', () => {
    for (const name of ['1-4-3-speech-once.py', '1-4-3-adv-speech-keywords.py']) {
      const source = fs.readFileSync(path.join(exampleDir, name), 'utf8');
      expect(source, name).toContain('import speech_recognition as sr');
      expect(source, name).toContain('recognize_google');
    }
  });

  it('사이드카에 차시·설명이 있고 내려받을 패키지가 없다', () => {
    for (const name of ['1-4-3-speech-once.meta.yaml', '1-4-3-adv-speech-keywords.meta.yaml']) {
      const text = fs.readFileSync(path.join(exampleDir, name), 'utf8');
      expect(text, name).toContain('lesson: 1-4-3');
      expect(text, name).toMatch(/packages: \[\]/u);
      expect(text, name).toContain('말');
    }
  });
});
