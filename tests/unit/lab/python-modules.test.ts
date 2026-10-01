// 워커에 넣는 파이썬 모듈 묶음(src/lab/python/modules.ts)의 실습실별 고르기 — P3-01(PD-04: 가상 보드의 machine·time 흉내는 ESP32 실습실에만).
// import.meta.glob은 Vitest(Vite)가 처리하므로 실제 폴더의 묶음을 그대로 읽고, 순수 함수는 가짜 경로로도 검사한다.
import { describe, expect, it } from 'vitest';
import { MODULE_MANIFESTS } from '../../../src/lab/modules/manifests.ts';
import type { LabModuleManifest } from '../../../src/lab/modules/types.ts';
import {
  PYTHON_MODULES,
  PYTHON_MODULE_OWNERS,
  collectPythonModules,
  moduleOwnerOf,
  packagesFromImportsForLab,
  pythonModulesForLab,
  shimTableForLab,
} from '../../../src/lab/python/modules.ts';

describe('모은 파이썬 파일과 주인 모듈', () => {
  it('모듈 폴더 바로 아래와 그 하위 폴더(부품 폴더)의 .py를 찾고, 경로의 첫 칸이 주인이다', () => {
    expect(moduleOwnerOf('../modules/board/machine.py')).toBe('board');
    expect(moduleOwnerOf('../modules/board/parts/neo-ring/apc_part_neo.py')).toBe('board');
    expect(moduleOwnerOf('./apc_runtime.py')).toBeNull();
    const merged = collectPythonModules(
      { './apc_runtime.py': 'r' },
      { '../modules/board/machine.py': 'm', '../modules/board/parts/neo-ring/apc_part_neo.py': 'n', '../modules/hello/apc_hello.py': 'h' },
    );
    expect([...merged.entries()].map(([name, file]) => [name, file.owner])).toEqual([
      ['apc_runtime.py', null],
      ['machine.py', 'board'],
      ['apc_part_neo.py', 'board'],
      ['apc_hello.py', 'hello'],
    ]);
  });

  it('파일 이름이 저장소 전체에서 겹치거나 규칙에 어긋나면 오류', () => {
    expect(() => collectPythonModules({ './machine.py': 'a' }, { '../modules/board/machine.py': 'b' })).toThrow(/겹쳐요/u);
    expect(() => collectPythonModules({}, { '../modules/board/parts/x/Neo.py': 'b' })).toThrow(/영문 소문자/u);
  });

  it('실제 묶음: 보드 모듈의 파일은 주인이 board다', () => {
    for (const name of ['machine.py', 'micropython.py', 'apc_board.py', 'apc_board_time.py']) {
      expect(PYTHON_MODULE_OWNERS[name], name).toBe('board');
    }
    expect(PYTHON_MODULE_OWNERS['apc_runtime.py']).toBeNull();
  });
});

describe('실습실별로 넣는 파일·흉내 표(pythonModulesForLab·shimTableForLab)', () => {
  it('ESP32 실습실: 붙박이 + 보드 + 모든 실습실 모듈(러너 공통), 영상처리 전용(mediapipe·pyautogui·음성)은 없다', () => {
    const files = Object.keys(pythonModulesForLab('esp32'));
    expect(files).toEqual(expect.arrayContaining(['apc_runtime.py', 'apc_shims.py', 'apc_cv2.py', 'machine.py', 'apc_board.py', 'apc_files.py']));
    for (const name of ['pyautogui.py', 'mediapipe.py', 'speech_recognition.py', 'apc_hello.py']) {
      expect(files, name).not.toContain(name);
    }
    expect(shimTableForLab('esp32')).toEqual({ time: 'apc_board', builtins: 'apc_files' });
  });

  it('영상처리 실습실: 가상 보드의 machine·time 흉내가 들어가지 않는다(영상처리 실습실 동작 그대로)', () => {
    const files = Object.keys(pythonModulesForLab('vision'));
    expect(files).toEqual(expect.arrayContaining(['pyautogui.py', 'mediapipe.py', 'speech_recognition.py', 'apc_files.py']));
    for (const name of ['machine.py', 'micropython.py', 'apc_board.py', 'apc_board_time.py']) {
      expect(files, name).not.toContain(name);
    }
    expect(shimTableForLab('vision')).not.toHaveProperty('time');
    expect(shimTableForLab('vision')).toMatchObject({ mediapipe: 'apc_mediapipe', builtins: 'apc_files' });
  });

  it('labId가 없으면 예전처럼 모든 파일·모든 표', () => {
    expect(pythonModulesForLab()).toEqual(PYTHON_MODULES);
    expect(shimTableForLab()).toMatchObject({ time: 'apc_board', mediapipe: 'apc_mediapipe' });
  });

  it('manifest가 없는 폴더의 파일은 모든 실습실에 넣는다', () => {
    const manifests: LabModuleManifest[] = [{ id: 'board', title: '보드', labs: ['esp32'] }];
    const owners = { 'apc_runtime.py': null, 'machine.py': 'board', 'apc_orphan.py': 'orphan' };
    const modules = { 'apc_runtime.py': 'r', 'machine.py': 'm', 'apc_orphan.py': 'o' };
    expect(Object.keys(pythonModulesForLab('vision', manifests, owners, modules))).toEqual(['apc_runtime.py', 'apc_orphan.py']);
    expect(Object.keys(pythonModulesForLab('esp32', manifests, owners, modules))).toEqual(['apc_runtime.py', 'machine.py', 'apc_orphan.py']);
    expect(MODULE_MANIFESTS.find((manifest) => manifest.id === 'board')?.labs).toEqual(['esp32']);
  });
});

describe('실행 때 import 문을 보고 패키지를 받는지(packagesFromImportsForLab — 판 1.1.3 LB2-01)', () => {
  it('가상 보드가 붙는 ESP32 실습실(4단원 보드 칸·한 화면 보드 틀도 labId esp32)은 받지 않고, 영상처리·시험 실습실은 받는다', () => {
    expect(packagesFromImportsForLab('esp32')).toBe(false);
    expect(packagesFromImportsForLab('vision')).toBe(true);
    expect(packagesFromImportsForLab('dev')).toBe(true);
    // labId가 없으면(단위 테스트·옛 호출) 예전처럼 받는다
    expect(packagesFromImportsForLab()).toBe(true);
    expect(MODULE_MANIFESTS.find((manifest) => manifest.id === 'board')?.packagesFromImports).toBe(false);
  });

  it('실습실 이름이 아니라 붙는 모듈의 manifest로 정한다 — 깃발을 적은 모듈이 붙는 새 실습실도 받지 않는다', () => {
    const manifests: LabModuleManifest[] = [
      { id: 'board', title: '보드', labs: ['esp32', 'new-board-lab'], packagesFromImports: false },
      { id: 'common', title: '공통', labs: '*' },
      { id: 'other', title: '다른 것', labs: ['vision'], packagesFromImports: true },
    ];
    expect(packagesFromImportsForLab('new-board-lab', manifests)).toBe(false);
    expect(packagesFromImportsForLab('esp32', manifests)).toBe(false);
    expect(packagesFromImportsForLab('vision', manifests)).toBe(true);
    expect(packagesFromImportsForLab('dev', manifests)).toBe(true);
  });
});
