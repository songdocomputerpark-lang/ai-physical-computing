// git archive가 만드는 모양의 .tar.gz(GitHub 소스 압축 흉내)를 테스트 안에서 만든다 — 대응 소스 도구의 "커밋 확인"(scripts/lib/offline-sources.mjs
// inspectGitArchive·scripts/release/fetch-sources.ps1 Get-ArchiveInfo, 1.1.0 안전 검토 지적 3) 검사용. 인터넷에서 받지 않는다.
// 모양: 맨 앞 512바이트 머리(이름 pax_global_header, 종류 'g') + "52 comment=<커밋 40자리>\n" 기록 블록(git 문서 git-archive:
// "the commit ID is stored in a global extended pax header") → 보통 파일 머리·내용 → 끝 표시(0으로 찬 512바이트 두 개) → 10,240바이트 단위로 0 채움.
import zlib from 'node:zlib';

const BLOCK = 512;

/** tar 머리 한 블록(ustar) */
function header(name: string, size: number, type: string): Buffer {
  const block = Buffer.alloc(BLOCK, 0);
  block.write(name, 0, 100, 'utf8');
  block.write('0000644\0', 100, 8, 'ascii');
  block.write('0000000\0', 108, 8, 'ascii');
  block.write('0000000\0', 116, 8, 'ascii');
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  block.write(`${(1_727_000_000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
  block.write('        ', 148, 8, 'ascii'); // 체크섬 칸은 빈칸으로 채운 채 더한다
  block.write(type, 156, 1, 'ascii');
  block.write('ustar\0', 257, 6, 'ascii');
  block.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of block) {
    sum += byte;
  }
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

/** 내용을 512바이트 단위로 0 채움 */
function padded(data: Buffer): Buffer {
  const rest = data.length % BLOCK;
  return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(BLOCK - rest, 0)]);
}

/** pax 기록 한 줄("<길이> <열쇠>=<값>\n" — 길이는 줄 전체 바이트 수) */
function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 2;
  while (`${length}${body}`.length !== length) {
    length += 1;
  }
  return `${length}${body}`;
}

/**
 * git archive 모양의 tar(압축 전). commit이 null이면 pax 머리 없이 보통 tar.
 * @param files 이름 → 내용(맨 위 폴더 이름을 붙여 넣는다)
 */
export function gitArchiveTar(commit: string | null, files: Record<string, string> = { 'README.md': 'hello\n' }): Buffer {
  const parts: Buffer[] = [];
  if (commit !== null) {
    const pax = Buffer.from(paxRecord('comment', commit), 'utf8');
    parts.push(header('pax_global_header', pax.length, 'g'), padded(pax));
  }
  parts.push(header('project-main/', 0, '5'));
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    parts.push(header(`project-main/${name}`, data.length, '0'), padded(data));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0));
  const tar = Buffer.concat(parts);
  const record = 20 * BLOCK;
  const rest = tar.length % record;
  return rest === 0 ? tar : Buffer.concat([tar, Buffer.alloc(record - rest, 0)]);
}

/** git archive 모양의 .tar.gz. truncate를 주면 gzip 끝을 그만큼 잘라 "받다 끊긴 파일"을 만든다 */
export function gitArchiveTarGz(commit: string | null, options: { files?: Record<string, string>; truncate?: number } = {}): Buffer {
  const gz = zlib.gzipSync(gitArchiveTar(commit, options.files));
  return options.truncate ? gz.subarray(0, Math.max(0, gz.length - options.truncate)) : gz;
}
