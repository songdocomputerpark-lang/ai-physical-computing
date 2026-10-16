/**
 * 키트 장치 도감 데이터를 빌드 때 한 번 읽는 곳 — **빌드 전용**(.astro 프런트매터에서만 import, 판 1.5.0 C155).
 * content/kit/devices.yaml을 Vite의 ?raw로 글자로 가져와 kit-schema.ts로 검사한다(부품 사전 parts-data.ts와 같은 방법).
 * 형식이 틀리면 여기서 오류가 나서 빌드가 멈춘다. yaml 패키지가 브라우저 번들에 들어가면 출처 검사가 실패하므로 <script>에서는 쓰지 않는다.
 *
 * 코드(.py)는 kit-code.ts에서 따로 읽는다 — 도감 첫 쪽은 코드가 필요 없어서, 코드 212개를 모듈 그래프에 끌어오지 않게 나눴다.
 *
 * 쓰는 곳: src/pages/labs/esp32/kit/index.astro(첫 쪽), [id].astro(장치 쪽), 부품 사전 쪽 src/pages/start/parts/index.astro(예제 보기 링크).
 */
import fs from 'node:fs';
import path from 'node:path';
import { allParts, partPhotoSize } from '../parts/parts-data.ts';
import type { PartEntry } from '../parts/parts-schema.ts';
import { readWebpInfo } from '../parts/webp-info.ts';
import { KIT_CIRCUIT_DIR, KIT_FILE, parseKitYaml, type KitData, type KitDevice } from './kit-schema.ts';
import { deviceIndexByPart } from './kit-view.ts';

const files = import.meta.glob<string>('/content/kit/*.yaml', { query: '?raw', eager: true, import: 'default' });
const source = files[`/${KIT_FILE}`];

if (source === undefined) {
  throw new Error(`키트 장치 도감 데이터 파일 ${KIT_FILE}을(를) 찾지 못했어요.`);
}

/** 검사를 마친 도감 데이터(장 이름표·1장 시작하기 코드·장치 전부) */
export const kitData: KitData = parseKitYaml(source);

const partsById = new Map<string, PartEntry>(allParts.map((part) => [part.id, part]));

/** 부품 사진 id → 사진 부품. 없으면 한국어 오류로 빌드를 멈춘다(장치마다 사진이 있어야 해요) */
export function kitPart(device: KitDevice, partId: string = device.part): PartEntry {
  const part = partsById.get(partId);
  if (!part) {
    throw new Error(`장치 ${device.id}의 부품 사진 "${partId}"을(를) content/parts/parts.yaml에서 찾지 못했어요.`);
  }
  return part;
}

/** 부품 사전 카드 한 장이 가리킬 장치들(부품 사진 id → 장치 목록) */
export const kitDevicesByPart: ReadonlyMap<string, readonly KitDevice[]> = deviceIndexByPart(kitData.devices);

/** 부품 사진의 가로·세로(부품 사전과 같은 읽기) */
export { partPhotoSize };

const circuitSizes = new Map<string, { readonly width: number; readonly height: number }>();

/** 회로 그림의 가로·세로(px) — 파일 머리에서 읽는다. 파일이 없거나 WebP가 아니면 한국어 오류로 빌드를 멈춘다. */
export function kitCircuitSize(device: Pick<KitDevice, 'id' | 'circuit'>): { readonly width: number; readonly height: number } {
  const cached = circuitSizes.get(device.circuit);
  if (cached) {
    return cached;
  }
  const file = path.join(process.cwd(), KIT_CIRCUIT_DIR, device.circuit);
  let info = null;
  try {
    info = readWebpInfo(new Uint8Array(fs.readFileSync(file)));
  } catch {
    info = null;
  }
  if (!info) {
    throw new Error(`장치 ${device.id}의 회로 그림 ${KIT_CIRCUIT_DIR}/${device.circuit}을(를) 읽지 못했어요(파일이 없거나 WebP가 아니에요).`);
  }
  const size = { width: info.width, height: info.height };
  circuitSizes.set(device.circuit, size);
  return size;
}
