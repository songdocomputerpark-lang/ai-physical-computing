/**
 * 빌드 전용: public/firmware/manifest.json을 디스크에서 읽고, 목록의 파일이 public/에 있는지 본다(PLAN §8.3 P3-09).
 * 브라우저 코드에서 import하지 않는다(node:fs). Astro 컴포넌트(src/components/lab/firmware/FirmwareFlasher.astro)의 머리(frontmatter)와
 * 단위 테스트가 쓴다. 경로는 LessonExamples.astro처럼 작업 폴더(저장소 뿌리) 기준이다 — npm run build·dev는 저장소 뿌리에서 돈다.
 * 파일이 없으면 빌드를 멈추지 않고 경고만 한 번 남긴다(PD-35 — 화면은 "펌웨어 파일 준비 중"을 보인다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { FIRMWARE_MANIFEST_PATH, parseFirmwareManifest, type FirmwareInfo, type FirmwareManifest } from './manifest.ts';

export interface FirmwareManifestFile {
  readonly manifest: FirmwareManifest;
  /** 목록 순서대로: 파일이 public/에 있는지, 고지 파일이 있는지 */
  readonly files: readonly { readonly info: FirmwareInfo; readonly present: boolean; readonly noticePresent: boolean }[];
}

const warned = new Set<string>();

/** public/firmware/manifest.json을 읽어 검사한다. 형식이 틀리면 FirmwareManifestError(빌드가 멈춘다) */
export function readFirmwareManifestFile(root: string = process.cwd(), options: { readonly warn?: (message: string) => void } = {}): FirmwareManifestFile {
  const publicDir = path.join(root, 'public');
  const manifestPath = path.join(publicDir, ...FIRMWARE_MANIFEST_PATH.split('/'));
  const manifest = parseFirmwareManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown);
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const files = manifest.firmware.map((info) => {
    const present = fs.existsSync(path.join(publicDir, ...info.path.split('/')));
    const noticePresent = info.noticePath === null ? false : fs.existsSync(path.join(publicDir, ...info.noticePath.split('/')));
    if (!present && !warned.has(info.path)) {
      warned.add(info.path);
      warn(`[펌웨어 굽기] public/${info.path}이(가) 아직 없어요. 굽기 화면은 "펌웨어 파일 준비 중"을 보여요(파일 배치는 .cache/phase3-requests/firmware.md).`);
    }
    if (info.noticePath !== null && !noticePresent && !warned.has(info.noticePath)) {
      warned.add(info.noticePath);
      warn(`[펌웨어 굽기] 고지 파일 public/${info.noticePath}이(가) 없어요. manifest.json의 notice를 고치거나 파일을 넣어요.`);
    }
    return { info, present, noticePresent };
  });
  return { manifest, files };
}
