// 펌웨어 굽기 테스트용 가짜 ESP32 이미지(단위 테스트·브라우저 테스트가 함께 쓴다). 실제 펌웨어가 아니고 저장소에 파일로 두지 않는다.
import { createHash } from 'node:crypto';

/** 크기가 size인 가짜 ESP32 이미지: 머리 0xE9·세그먼트 3·DIO·4MB·ESP32 칩 id 0, 나머지는 조금 압축되는 무늬 */
export function syntheticImage(size: number, seed = 7): Uint8Array {
  const image = new Uint8Array(size);
  let state = seed >>> 0;
  for (let index = 0; index < size; index += 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    image[index] = index % 3 === 0 ? (state >>> 16) & 0xff : index & 0x3f;
  }
  image.set([0xe9, 0x03, 0x02, 0x20], 0);
  image[12] = 0;
  image[13] = 0;
  return image;
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
