// 비공개 이름(학교명 등, PD-37)을 scripts/privacy-needles.json에 넣을 해시 항목으로 바꾼다.
//
//   node scripts/privacy-needle.mjs <이름> [<이름> …]
//
// 이름 자체는 어디에도 저장하지 않는다. 나온 줄을 privacy-needles.json의 needles 목록에 붙여 넣고 label만 알맞게 고친다.
// 파일이 없으면 새 salt를 함께 만들어 보여 준다. 저장소 검사(scripts/check-repo.mjs)가 이 파일을 읽어
// 추적 텍스트 파일에 그 이름이 있으면 커밋·배포를 막는다. 검사 규칙은 scripts/lib/repo-check.mjs 머리말에 있다.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY_NEEDLES_FILE, hashPrivacyNeedle } from './lib/repo-check.mjs';

const words = process.argv.slice(2).filter((word) => word.trim() !== '');
if (words.length === 0) {
  console.error('쓰는 법: node scripts/privacy-needle.mjs <이름> [<이름> …]');
  process.exitCode = 1;
} else {
  const rootDir = fileURLToPath(new URL('..', import.meta.url));
  const needlesPath = path.join(rootDir, PRIVACY_NEEDLES_FILE);
  let salt = '';
  if (fs.existsSync(needlesPath)) {
    const data = JSON.parse(fs.readFileSync(needlesPath, 'utf8'));
    salt = typeof data.salt === 'string' ? data.salt : '';
  }
  if (salt === '') {
    salt = randomBytes(16).toString('hex');
    console.log(`${PRIVACY_NEEDLES_FILE}이(가) 없거나 salt가 없어 새로 만들었어요. 파일의 "salt"에 이 값을 적어요: ${salt}`);
  }
  for (const word of words) {
    try {
      const needle = hashPrivacyNeedle(word, salt);
      console.log(JSON.stringify({ label: '무엇인지 적어요(이름은 적지 않아요)', ...needle }));
    } catch (error) {
      console.error(`"${'*'.repeat([...word].length)}": ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
