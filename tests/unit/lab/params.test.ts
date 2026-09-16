// 조절 값 규약 파서(src/lab/params/parse.ts) 단위 테스트(PLAN §8.2 P2-04 "Vitest(파서: 한글 주석·공백·잘못된 형식)").
// 화면(조절 패널)·실행 중 반영은 브라우저 테스트(tests/e2e/lab-params.spec.ts·scenario-a.spec.ts)와
// Node 실제 Pyodide 테스트(tests/unit/lab/pyodide-node.test.ts의 params_* 단계)가 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PARAMS_CHANNEL,
  formatParamValue,
  paramSpecKey,
  paramUpdate,
  paramValueFromText,
  paramValueType,
  parseParams,
  sliderValueText,
  snapSliderValue,
  type SelectParam,
  type SliderParam,
  type ToggleParam,
} from '../../../src/lab/params/parse.ts';

const ROOT = process.cwd();

function slider(code: string): SliderParam {
  const { params, warnings } = parseParams(code);
  expect(warnings).toEqual([]);
  expect(params).toHaveLength(1);
  expect(params[0]?.kind).toBe('slider');
  return params[0] as SliderParam;
}

describe('조절 값 규약 파서: 규약대로 쓴 줄', () => {
  it('SPEC §6.1의 네 가지 예를 모두 읽는다', () => {
    const code = ['threshold = 100     # @slider 0 255 1', 'blur_size = 5       # @slider 1 31 2', 'mode = "edge"       # @select edge blur gray', 'show_fps = True     # @toggle', ''].join('\n');
    const { params, warnings } = parseParams(code);
    expect(warnings).toEqual([]);
    expect(params.map((param) => [param.kind, param.name, param.line])).toEqual([
      ['slider', 'threshold', 1],
      ['slider', 'blur_size', 2],
      ['select', 'mode', 3],
      ['toggle', 'show_fps', 4],
    ]);
    const threshold = params[0] as SliderParam;
    expect(threshold).toMatchObject({ min: 0, max: 255, step: 1, value: 100, valueType: 'int', decimals: 0, label: '' });
    expect(code.slice(threshold.valueFrom, threshold.valueTo)).toBe('100');
    const blur = params[1] as SliderParam;
    expect(blur).toMatchObject({ min: 1, max: 31, step: 2, value: 5 });
    expect(code.slice(blur.valueFrom, blur.valueTo)).toBe('5');
    const mode = params[2] as SelectParam;
    expect(mode).toMatchObject({ options: ['edge', 'blur', 'gray'], value: 'edge', quote: '"' });
    expect(code.slice(mode.valueFrom, mode.valueTo)).toBe('"edge"');
    const toggle = params[3] as ToggleParam;
    expect(toggle.value).toBe(true);
    expect(code.slice(toggle.valueFrom, toggle.valueTo)).toBe('True');
  });

  it('띄어쓰기가 없거나 탭·쉼표·여러 칸이 섞여도 같은 결과다', () => {
    expect(slider('threshold=100#@slider 0 255 1')).toMatchObject({ name: 'threshold', min: 0, max: 255, step: 1, value: 100 });
    expect(slider('threshold\t=\t100\t#\t@slider\t0,\t255,\t1')).toMatchObject({ min: 0, max: 255, step: 1 });
    expect(slider('threshold   =   100     #    @slider   0   255   1   ')).toMatchObject({ value: 100 });
  });

  it('한글 설명이 규약 앞이나 뒤에 있으면 패널 설명(label)이 된다', () => {
    expect(slider('threshold = 100  # 테두리로 볼 밝기 차이 @slider 0 255 1').label).toBe('테두리로 볼 밝기 차이');
    expect(slider('threshold = 100  # @slider 0 255 1 테두리로 볼 밝기 차이').label).toBe('테두리로 볼 밝기 차이');
    expect(slider('threshold = 100  # 기준 @slider 0 255 1 (테두리)').label).toBe('기준 (테두리)');
    const { params } = parseParams('show_fps = True  # @toggle fps 보이기');
    expect(params[0]?.label).toBe('fps 보이기');
  });

  it('간격을 빼면 1이고, 값·범위·간격 가운데 소수점이 하나라도 있으면 float이다', () => {
    expect(slider('gain = 3  # @slider 0 10')).toMatchObject({ step: 1, valueType: 'int', decimals: 0 });
    expect(slider('ratio = 0.5  # @slider 0 1 0.1')).toMatchObject({ valueType: 'float', decimals: 1, value: 0.5 });
    expect(slider('alpha = 1  # @slider 0 1 0.25')).toMatchObject({ valueType: 'float', decimals: 2 });
    expect(slider('x = 2.0  # @slider 0 4 1')).toMatchObject({ valueType: 'float', decimals: 1 });
    expect(slider('t = -5  # @slider -10 10 1')).toMatchObject({ valueType: 'int', value: -5, min: -10 });
  });

  it('CRLF 줄 끝과 앞뒤 빈 줄이 있어도 값 위치가 맞는다', () => {
    const code = '\r\nimport cv2\r\n\r\nthreshold = 100  # @slider 0 255 1\r\nx = 1\r\n';
    const param = slider(code);
    expect(param.line).toBe(4);
    expect(code.slice(param.valueFrom, param.valueTo)).toBe('100');
  });

  it('@select는 작은따옴표도 되고, 선택지의 따옴표는 벗기며, 겹치는 선택지는 하나로 줄인다', () => {
    const { params, warnings } = parseParams("mode = 'blur'  # @select \"edge\" 'blur' gray gray");
    expect(warnings).toEqual([]);
    expect(params[0]).toMatchObject({ kind: 'select', value: 'blur', quote: "'", options: ['edge', 'blur', 'gray'] });
  });

  it('규약이 없는 주석과 주석 없는 줄, 값이 없는 줄, 설명 문장 속의 "@slider" 낱말은 조용히 지나간다', () => {
    const { params, warnings } = parseParams(
      ['import cv2', 'x = 1  # 그냥 주석', '# @lesson v4', '# @tags 에지, 회색', 'print("@slider")', '# 줄 끝의 "# @slider 최소 최대 간격"은 조절 막대가 돼요.', 'y = 2', ''].join('\n'),
    );
    expect(params).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('조절 값 규약 파서: 잘못된 형식은 한국어 경고를 내고 그 줄만 건너뛴다', () => {
  function onlyWarning(code: string): string {
    const { params, warnings } = parseParams(code);
    expect(params).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(1);
    return warnings[0]?.message ?? '';
  }

  it('숫자가 아닌 값, 범위 숫자 부족, 최소 > 최대, 간격 0', () => {
    expect(onlyWarning('threshold = "a"  # @slider 0 255 1')).toContain('숫자');
    expect(onlyWarning('threshold = 100  # @slider 0')).toContain('최소 최대 간격');
    expect(onlyWarning('threshold = 100  # @slider 255 0 1')).toContain('작아야');
    expect(onlyWarning('threshold = 100  # @slider 0 255 0')).toContain('0보다 커야');
    expect(onlyWarning('threshold = 100  # @slider abc 255 1')).toContain('최소 최대 간격');
  });

  it('값이 범위 밖이거나 선택지에 없으면 경고', () => {
    expect(onlyWarning('threshold = 300  # @slider 0 255 1')).toContain('벗어나요');
    expect(onlyWarning('mode = "sharp"  # @select edge blur gray')).toContain('선택지');
  });

  it('@select의 값이 따옴표 글자가 아니거나 선택지가 하나면 경고', () => {
    expect(onlyWarning('mode = 3  # @select edge blur')).toContain('따옴표');
    expect(onlyWarning('mode = "edge"  # @select edge')).toContain('2개 이상');
  });

  it('@toggle의 값이 True·False가 아니면 경고', () => {
    expect(onlyWarning('show = 1  # @toggle')).toContain('True 또는 False');
    expect(onlyWarning('show = None  # @toggle')).toContain('True 또는 False');
  });

  it('모르는 규약 이름, 들여쓰기한 줄, 예약어 이름', () => {
    expect(onlyWarning('x = 1  # @silder 0 10 1')).toContain('모르는 규약');
    expect(onlyWarning('    threshold = 100  # @slider 0 255 1')).toContain('들여쓰기');
    expect(onlyWarning('while = 1  # @slider 0 10 1')).toContain('예약어');
  });

  it('값이 식이거나 주석만 있는 줄에 규약을 쓰면 모양 안내', () => {
    expect(onlyWarning('threshold = 100 + 1  # @slider 0 255 1')).toContain('모양');
    expect(onlyWarning('threshold = get()  # @slider 0 255 1')).toContain('모양');
    expect(onlyWarning('# @slider 0 255 1')).toContain('주석만 있는 줄');
  });

  it('같은 이름을 두 번 쓰면 먼저 것만 남기고 뒤 줄에 경고한다', () => {
    const { params, warnings } = parseParams('a = 1  # @slider 0 5 1\na = 2  # @slider 0 9 1\n');
    expect(params).toHaveLength(1);
    expect(params[0]).toMatchObject({ value: 1, max: 5 });
    expect(warnings).toEqual([{ line: 2, message: expect.stringContaining('1번 줄') }]);
  });

  it('잘못된 줄이 있어도 다른 줄의 조절 값은 그대로 읽는다', () => {
    const { params, warnings } = parseParams(['a = 1  # @slider 0 5 1', 'b = "x"  # @slider 0 5 1', 'c = False  # @toggle', ''].join('\n'));
    expect(params.map((param) => param.name)).toEqual(['a', 'c']);
    expect(warnings.map((warning) => warning.line)).toEqual([2]);
  });
});

describe('값 글자 만들기·다시 읽기·간격 맞추기', () => {
  const int = slider('threshold = 100  # @slider 0 255 1');
  const odd = slider('blur_size = 5  # @slider 1 31 2');
  const float = slider('ratio = 0.5  # @slider 0 1 0.1');
  const mode = parseParams('mode = "edge"  # @select edge blur gray').params[0] as SelectParam;
  const single = parseParams("mode = 'edge'  # @select edge blur").params[0] as SelectParam;
  const toggle = parseParams('show = True  # @toggle').params[0] as ToggleParam;

  it('슬라이더 값은 간격에 맞추고 범위 안으로 넣는다', () => {
    expect(snapSliderValue(int, 120.4)).toBe(120);
    expect(snapSliderValue(int, -3)).toBe(0);
    expect(snapSliderValue(int, 999)).toBe(255);
    expect(snapSliderValue(odd, 6)).toBe(7);
    expect(snapSliderValue(odd, 4)).toBe(5);
    expect(snapSliderValue(float, 0.30000000000000004)).toBe(0.3);
    expect(snapSliderValue(float, 0.34)).toBe(0.3);
    expect(snapSliderValue(int, Number.NaN)).toBe(100);
  });

  it('코드에 적을 글자: int는 정수, float는 자릿수대로, 글자는 원래 따옴표, 토글은 True/False', () => {
    expect(formatParamValue(int, 120)).toBe('120');
    expect(formatParamValue(float, 0.7)).toBe('0.7');
    expect(formatParamValue(float, 1)).toBe('1.0');
    expect(formatParamValue(mode, 'blur')).toBe('"blur"');
    expect(formatParamValue(single, 'blur')).toBe("'blur'");
    expect(formatParamValue(toggle, false)).toBe('False');
    // 규약에 맞지 않는 값은 만들지 않는다.
    expect(formatParamValue(mode, 'sharp')).toBeNull();
    expect(formatParamValue(int, 'x')).toBeNull();
    expect(formatParamValue(toggle, 1)).toBeNull();
  });

  it('코드 글자에서 값을 다시 읽는다', () => {
    expect(paramValueFromText(int, '120')).toBe(120);
    expect(paramValueFromText(int, 'abc')).toBeNull();
    expect(paramValueFromText(mode, '"blur"')).toBe('blur');
    expect(paramValueFromText(toggle, 'False')).toBe(false);
  });

  it('파이썬에 보낼 값과 형 이름, 화면 낭독기용 글', () => {
    expect(paramValueType(int)).toBe('int');
    expect(paramValueType(float)).toBe('float');
    expect(paramValueType(mode)).toBe('str');
    expect(paramValueType(toggle)).toBe('bool');
    expect(paramUpdate(int, 120)).toEqual({ name: 'threshold', value: 120, type: 'int' });
    expect(paramUpdate(mode, 'gray')).toEqual({ name: 'mode', value: 'gray', type: 'str' });
    expect(sliderValueText(int, 120)).toBe('120 (0부터 255까지)');
    expect(sliderValueText(float, 0.3)).toBe('0.3 (0부터 1까지)');
    expect(PARAMS_CHANNEL).toBe('lab.params');
  });

  it('요소 열쇠는 값을 빼고 이름·종류·범위·설명으로 만든다(값만 바뀌면 같은 요소)', () => {
    const later = slider('threshold = 200  # @slider 0 255 1');
    expect(paramSpecKey(later)).toBe(paramSpecKey(int));
    expect(paramSpecKey(slider('threshold = 100  # @slider 0 100 1'))).not.toBe(paramSpecKey(int));
    expect(paramSpecKey(slider('threshold = 100  # @slider 0 255 1 설명'))).not.toBe(paramSpecKey(int));
  });
});

describe('저장소의 영상처리 예제', () => {
  it('첫 실습(examples/vision/first-edge.py)은 threshold·blur_size 슬라이더 두 개를 경고 없이 만든다', () => {
    const code = fs.readFileSync(path.join(ROOT, 'examples', 'vision', 'first-edge.py'), 'utf8');
    const { params, warnings } = parseParams(code);
    expect(warnings).toEqual([]);
    expect(params.map((param) => param.name)).toEqual(['threshold', 'blur_size']);
    expect(params[0]).toMatchObject({ kind: 'slider', min: 0, max: 255, step: 1, value: 100 });
    expect(params[1]).toMatchObject({ kind: 'slider', min: 1, max: 31, step: 2, value: 5 });
  });

  it('파이썬 도우미의 채널 이름이 화면과 같다', () => {
    const helper = fs.readFileSync(path.join(ROOT, 'src', 'lab', 'python', 'apc_runtime.py'), 'utf8');
    expect(helper).toContain(`PARAMS_CHANNEL = "${PARAMS_CHANNEL}"`);
  });
});
