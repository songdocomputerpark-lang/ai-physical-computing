/**
 * 사이트가 직접 그린 가면 그림을 브라우저에서 PNG로 만드는 곳(P2-10).
 *
 * 1-3-3 심화 실습(f039)은 `cv2.imread("mask.png", cv2.IMREAD_UNCHANGED)`로 **투명 배경이 있는 가면 그림**을 읽는데,
 * 원본 자료에는 그 그림 파일이 없다(PLAN §9: 없는 그림은 사이트가 직접 그린다). 그래서 저장소에는 직접 그린 SVG 한 장(assets/mask.svg)만 두고,
 * 실습실이 준비될 때 브라우저가 그것을 400×500 PNG(RGBA)로 그려 파이썬 작업 폴더에 넣는다.
 * 래스터 파일을 커밋하지 않으므로 눈 확인 기록(scripts/image-allowlist.yaml)도, 사진 출처 등록도 필요 없다.
 *
 * 이 파일은 브라우저 API(Image·canvas·Blob)를 쓰므로 워커·Node에서는 부르지 않는다. 이름·크기 상수는 assets.ts에 있다
 * (assets.ts는 Playwright 테스트도 읽으므로 ?raw 불러오기를 넣지 않는다 — Playwright의 변환기는 .svg를 다루지 못한다).
 */
import { MASK_HEIGHT, MASK_WIDTH } from './assets.ts';
import maskSvg from './assets/mask.svg?raw';

/** 가면 그림의 SVG 원본(글자) */
export function maskSvgSource(): string {
  return maskSvg;
}

/**
 * SVG 글자를 브라우저에서 PNG(RGBA) 바이트로 바꾼다(canvas.toBlob). 화면에서만 된다(Image·canvas가 필요).
 * 실패하면 한국어 Error.
 */
export async function rasterizeSvgToPng(svg: string, width: number, height: number): Promise<Uint8Array> {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    throw new Error('이 환경에서는 SVG를 PNG로 바꿀 수 없어요(화면이 없어요).');
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(width, height);
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG 그림을 읽지 못했어요.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('canvas를 쓸 수 없어요.');
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) {
      throw new Error('PNG로 저장하지 못했어요.');
    }
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** mask.png 바이트(RGBA PNG)를 만든다. 한 번 만든 뒤에는 부르는 쪽이 기억해 두고 다시 쓴다. */
export function buildMaskPng(): Promise<Uint8Array> {
  return rasterizeSvgToPng(maskSvg, MASK_WIDTH, MASK_HEIGHT);
}
