// 원고 이미지 얼굴 검사(PLAN §9.3, P5-01) — 사이트가 학생에게 보내는 것과 같은 OpenCV 4.11.0.86(Pyodide 휠)의 Haar 얼굴 검출기.
//
// 왜 Pyodide인가: 이 PC의 파이썬 OpenCV는 5.0이라 CascadeClassifier가 빠졌다(5.0에서 contrib로 옮겨짐, 2026-09-25 확인).
// Pyodide의 opencv-python 휠에는 검출기와 haarcascade_*.xml이 함께 들어 있고, npm test의 Pyodide 테스트가 이미
// .cache/pyodide-packages/(git 제외)에 받아 둔다. 이 모듈은 그 캐시만 읽고 스스로 내려받지 않는다(캐시가 없으면 한국어로 멈춘다).
//
// 검출은 경고용이다 — 사람이 한 장씩 눈으로 보는 확인(PD-32)을 대신하지 않는다. 다만 제외 쪽(얼굴)에서 잘라 낸 그림은
// strict(더 예민한 설정)로 보고, 하나라도 나오면 도구가 그 그림을 지우고 멈춘다.
// Node는 JSPI 설정 없이도 이 검사를 돌릴 수 있다(runPython만 쓴다).

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACKAGE_CACHE_DIR = '.cache/pyodide-packages';

export class FaceCheckUnavailableError extends Error {}

const DETECT_SOURCE = `
import json, os
import cv2
import numpy as np

_CASCADES = {}

def _cascade(name):
    if name not in _CASCADES:
        classifier = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, name))
        if classifier.empty():
            raise RuntimeError('haar cascade missing: ' + name)
        _CASCADES[name] = classifier
    return _CASCADES[name]

def _iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    return inter / float(aw * ah + bw * bh - inter)

def apc_detect_faces(raw, width, height, strict):
    image = np.frombuffer(bytes(raw), dtype=np.uint8).reshape(int(height), int(width))
    image = cv2.equalizeHist(image)
    neighbors = 3 if strict else 5
    found = []
    plans = [
        ('haarcascade_frontalface_default.xml', neighbors, False),
        ('haarcascade_frontalface_alt2.xml', max(2, neighbors - 1), False),
        ('haarcascade_profileface.xml', max(2, neighbors - 1), False),
        ('haarcascade_profileface.xml', max(2, neighbors - 1), True),
    ]
    for name, min_neighbors, mirrored in plans:
        source = cv2.flip(image, 1) if mirrored else image
        boxes = _cascade(name).detectMultiScale(source, scaleFactor=1.1, minNeighbors=min_neighbors, minSize=(20, 20))
        for (x, y, w, h) in boxes:
            x, y, w, h = int(x), int(y), int(w), int(h)
            if mirrored:
                x = int(width) - x - w
            box = [x, y, w, h]
            if all(_iou(box, other['box']) < 0.3 for other in found):
                found.append({'box': box, 'detector': name.replace('haarcascade_', '').replace('.xml', '') + (' (mirrored)' if mirrored else '')})
    return json.dumps(found)

json.dumps({'cv2': cv2.__version__})
`;

/**
 * 캐시에 opencv-python·numpy 휠이 있는지 본다.
 * @param {string} rootDir
 */
export function cachedWheels(rootDir) {
  const cacheDir = path.join(rootDir, PACKAGE_CACHE_DIR);
  const names = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];
  return {
    cacheDir,
    opencv: names.find((name) => /^opencv_python-.*\.whl$/u.test(name)) ?? null,
    numpy: names.find((name) => /^numpy-.*\.whl$/u.test(name)) ?? null,
  };
}

/**
 * @typedef {object} FaceBox
 * @property {[number, number, number, number]} box 검사 그림 픽셀 좌표 [x, y, 너비, 높이]
 * @property {string} detector 어느 검출기가 찾았는지
 */

/**
 * 얼굴 검사기를 만든다(Pyodide와 OpenCV를 한 번만 불러 여러 그림에 쓴다).
 * @param {{ rootDir: string }} options
 * @returns {Promise<{ version: string, detect: (raw: Uint8Array, width: number, height: number, strict: boolean) => FaceBox[] }>}
 */
export async function createFaceChecker({ rootDir }) {
  const wheels = cachedWheels(rootDir);
  if (!wheels.opencv || !wheels.numpy) {
    throw new FaceCheckUnavailableError(
      `얼굴 검사에 쓸 OpenCV 휠이 ${PACKAGE_CACHE_DIR}/에 없어요. 먼저 npm test를 한 번 돌리면 Pyodide 테스트가 받아 둬요` +
        '(이 도구는 스스로 내려받지 않아요).',
    );
  }
  const require = createRequire(path.join(rootDir, 'package.json'));
  let loadPyodide;
  try {
    ({ loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href));
  } catch (error) {
    throw new FaceCheckUnavailableError(`pyodide 패키지를 찾지 못했어요(npm ci를 먼저 해요): ${error instanceof Error ? error.message : String(error)}`);
  }
  const quiet = () => {};
  const pyodide = await loadPyodide({ packageCacheDir: wheels.cacheDir, stdout: quiet, stderr: quiet });
  await pyodide.loadPackage('opencv-python', { messageCallback: quiet, errorCallback: quiet });
  const version = JSON.parse(pyodide.runPython(DETECT_SOURCE)).cv2;
  const detectFaces = pyodide.globals.get('apc_detect_faces');
  return {
    version,
    detect(raw, width, height, strict) {
      const buffer = pyodide.toPy(raw);
      try {
        return JSON.parse(detectFaces(buffer, width, height, strict));
      } finally {
        if (typeof buffer?.destroy === 'function') buffer.destroy();
      }
    },
  };
}
