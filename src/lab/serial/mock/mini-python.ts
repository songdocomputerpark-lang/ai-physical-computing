/**
 * 모의 MicroPython 보드가 "실행"하는 아주 작은 파이썬 부분집합(병렬 제작 준비 2026-09-17, src/lab/README.md 8절).
 *
 * 왜: 실제 보드 연결(P3-07·P3-08)·실물 점검 도우미(P3-11) 테스트는 보드가 코드를 받아 출력·오류·입력 대기·파일 저장을 돌려주는 흐름이 필요하지만,
 * 테스트마다 진짜 MicroPython을 띄울 수는 없다(P3-00: 브라우저 빌드는 입력·정지를 못 받음). 그래서 도구·수업 코드에 흔한 모양만 흉내 낸다.
 * 이것은 테스트 대역(test double)이다 — 결과가 실물과 같다는 증거가 아니다(실물은 부록 B-2, 운영자 할 일 2번).
 *
 * 되는 것(이 목록 밖은 NotImplementedError — 옵션 unknownStatement: 'ignore'면 건너뜀)
 *   문장: 식, 대입(a = b = 식, a, b = 식, a += 식, 속성·첨자 대입), import·from import(아는 모듈 또는 보드 파일), if/elif/else, while, for(range·목록·글자·바이트),
 *        with open(...) as f, try/except(이름·as)/finally, raise(이름(글자)·다시 던지기), pass·break·continue, 한 줄 몸통(if x: print(1))
 *   식: 수(정수·소수·0x·0b), 글자('…'·"…"·'''…'''·b'…'·r'…'), True/False/None, 목록·튜플, 이름, 속성, 호출(키워드 인자), 첨자, 단항 -·not,
 *       + - * / // % **, 비교(== != < <= > >= in, not in, is, is not), and/or
 *   내장: print(sep·end), input, range, len, str, int, float, bool, repr, abs, min, max, round, chr, ord, hex, list, open, isinstance(이름만)
 *   모듈: time·utime(sleep·sleep_ms·sleep_us·ticks_ms·ticks_diff·time), os·uos(listdir·remove·mkdir·rmdir·rename·stat·getcwd·uname),
 *         sys(platform·implementation·exit), machine(reset·soft_reset·Pin(on·off·value)·unique_id·freq), gc(collect·mem_free·mem_alloc),
 *         micropython(const), ubinascii·binascii(a2b_base64·b2a_base64·hexlify), esp·esp32(아무 일 없음)
 *   파일 객체: write(글자·바이트)·read()·readline()·close(), mpremote 모양(f=open('main.py','wb'); w=f.write; w(b'…'); f.close())
 * 오류 글은 MicroPython 모양으로 낸다: NameError "name 'x' isn't defined", ZeroDivisionError "divide by zero", ImportError "no module named 'x'",
 *   OSError "[Errno 2] ENOENT", SyntaxError "invalid syntax". 트레이스백은 `File "<stdin>", line N, in <module>`.
 * 테스트 도구다(배포 번들에 들어가지 않음).
 */
import { toBytes, utf8 } from './bytes.ts';
import type { MockFileSystem } from './mock-fs.ts';

// ───────────────────────── 값 ─────────────────────────

export class PyFloat {
  constructor(readonly value: number) {}
}

export class PyBytes {
  constructor(readonly data: Uint8Array) {}
}

export class PyTuple {
  constructor(readonly items: PyValue[]) {}
}

export class PyRange {
  constructor(
    readonly start: number,
    readonly stop: number,
    readonly step: number,
  ) {}
}

export class PyObject {
  readonly attrs = new Map<string, PyValue>();
  constructor(readonly typeName: string) {}
}

export class PyModule {
  readonly attrs = new Map<string, PyValue>();
  constructor(readonly name: string) {}
}

export type Builtin = (args: PyValue[], kwargs: Map<string, PyValue>, runtime: Interpreter) => PyValue | Promise<PyValue>;

export class PyFunction {
  /** 함수에 붙은 이름(클래스처럼 쓰는 machine.Pin의 Pin.OUT 같은 상수) */
  readonly attrs = new Map<string, PyValue>();
  constructor(
    readonly name: string,
    readonly call: Builtin,
  ) {}
}

export class PyFile {
  private readonly chunks: Uint8Array[] = [];
  private position = 0;
  closed = false;
  constructor(
    readonly path: string,
    readonly mode: string,
    private readonly fs: MockFileSystem,
    initial: Uint8Array | null,
  ) {
    if (initial) {
      this.chunks.push(initial);
    }
  }

  get binary(): boolean {
    return this.mode.includes('b');
  }

  get writable(): boolean {
    return /[wa+]/u.test(this.mode);
  }

  content(): Uint8Array {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  write(data: Uint8Array): number {
    this.chunks.push(data);
    // 실물처럼 닫기 전이라도 쓴 내용이 보이게 바로 반영한다(테스트가 중간 상태를 볼 수 있게)
    this.fs.write(this.path, this.content());
    return data.length;
  }

  read(size?: number): Uint8Array {
    const all = this.content();
    const end = size === undefined || size < 0 ? all.length : Math.min(all.length, this.position + size);
    const part = all.slice(this.position, end);
    this.position = end;
    return part;
  }

  readline(): Uint8Array {
    const all = this.content();
    let end = this.position;
    while (end < all.length && all[end] !== 0x0a) {
      end += 1;
    }
    end = Math.min(all.length, end + 1);
    const part = all.slice(this.position, end);
    this.position = end;
    return part;
  }
}

export type PyValue = null | boolean | number | string | PyFloat | PyBytes | PyTuple | PyRange | PyValue[] | PyObject | PyModule | PyFunction | PyFile;

/** 파이썬 예외(모의 보드 안) */
export class PyException extends Error {
  line = 0;
  constructor(
    readonly type: string,
    readonly detail: string,
  ) {
    super(`${type}: ${detail}`);
  }
}

class BreakSignal {}
class ContinueSignal {}

/** machine.reset()·soft_reset()이 프로그램을 끝낼 때 */
export class ResetSignal {
  constructor(readonly kind: 'hard' | 'soft') {}
}

// ───────────────────────── 글자 나누기 ─────────────────────────

type TokenKind = 'num' | 'str' | 'name' | 'op';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly value?: PyValue;
}

class SyntaxProblem extends Error {
  constructor(
    readonly line: number,
    readonly unsupported: boolean,
    message: string,
  ) {
    super(message);
  }
}

const OPERATORS = ['**=', '//=', '...', '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '->', '<<', '>>', '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '&', '|', '^', '~', '@'];
const UNSUPPORTED_KEYWORDS = new Set(['def', 'class', 'lambda', 'yield', 'async', 'await', 'global', 'nonlocal', 'del', 'assert']);
const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_]/u;

function decodeEscapes(body: string, bytesMode: boolean, line: number): string | number[] {
  const out: number[] = [];
  let text = '';
  const push = (code: number) => {
    if (bytesMode) {
      out.push(code & 0xff);
    } else {
      text += String.fromCodePoint(code);
    }
  };
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (char !== '\\') {
      if (bytesMode) {
        const code = char.codePointAt(0)!;
        if (code > 0x7f) {
          throw new SyntaxProblem(line, false, 'bytes can only contain ASCII literal characters');
        }
        out.push(code);
      } else {
        text += char;
      }
      continue;
    }
    const next = body[index + 1];
    index += 1;
    switch (next) {
      case 'n':
        push(0x0a);
        break;
      case 'r':
        push(0x0d);
        break;
      case 't':
        push(0x09);
        break;
      case '0':
        push(0);
        break;
      case '\\':
        push(0x5c);
        break;
      case "'":
        push(0x27);
        break;
      case '"':
        push(0x22);
        break;
      case 'x': {
        const hex = body.slice(index + 1, index + 3);
        if (!/^[0-9a-fA-F]{2}$/u.test(hex)) {
          throw new SyntaxProblem(line, false, 'invalid \\x escape');
        }
        push(Number.parseInt(hex, 16));
        index += 2;
        break;
      }
      case '\n':
        break;
      default:
        push(0x5c);
        if (next !== undefined) {
          push(next.codePointAt(0)!);
        }
    }
  }
  return bytesMode ? out : text;
}

function tokenize(source: string, line: number): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n' || char === '\\') {
      index += 1;
      continue;
    }
    if (char === '#') {
      break;
    }
    // 글자(접두어 b·r·u·f 포함)
    const prefixMatch = /^([bBrRuUfF]{0,2})(['"])/u.exec(source.slice(index));
    if (prefixMatch && (prefixMatch[1] === '' || /^[bBrRuUfF]{1,2}$/u.test(prefixMatch[1]!))) {
      const prefix = prefixMatch[1]!.toLowerCase();
      if (prefix.includes('f')) {
        throw new SyntaxProblem(line, true, 'f-string');
      }
      const quote = prefixMatch[2]!;
      const start = index + prefix.length;
      const triple = source.startsWith(quote.repeat(3), start);
      const delimiter = triple ? quote.repeat(3) : quote;
      let cursor = start + delimiter.length;
      let body = '';
      let closed = false;
      while (cursor < source.length) {
        if (source.startsWith(delimiter, cursor)) {
          closed = true;
          cursor += delimiter.length;
          break;
        }
        const current = source[cursor]!;
        if (current === '\\' && !prefix.includes('r')) {
          body += current + (source[cursor + 1] ?? '');
          cursor += 2;
          continue;
        }
        if (current === '\n' && !triple) {
          break;
        }
        body += current;
        cursor += 1;
      }
      if (!closed) {
        throw new SyntaxProblem(line, false, 'unterminated string');
      }
      const bytesMode = prefix.includes('b');
      const decoded = prefix.includes('r') ? (bytesMode ? [...body].map((c) => c.charCodeAt(0) & 0xff) : body) : decodeEscapes(body, bytesMode, line);
      const value: PyValue = bytesMode ? new PyBytes(Uint8Array.from(decoded as number[])) : (decoded as string);
      // 붙어 있는 글자끼리 이어 붙이기('a' 'b')
      const last = tokens[tokens.length - 1];
      if (last?.kind === 'str' && typeof last.value === 'string' && typeof value === 'string') {
        tokens[tokens.length - 1] = { kind: 'str', text: last.text + source.slice(index, cursor), value: last.value + value };
      } else {
        tokens.push({ kind: 'str', text: source.slice(index, cursor), value });
      }
      index = cursor;
      continue;
    }
    // 수
    const numberMatch = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)/u.exec(source.slice(index));
    if (numberMatch && numberMatch[0] !== '' && /[\d.]/u.test(char)) {
      const text = numberMatch[0];
      if (text === '.') {
        // 점 하나는 연산자
      } else {
        const clean = text.replace(/_/gu, '');
        let value: PyValue;
        if (/^0[xX]/u.test(clean)) {
          value = Number.parseInt(clean.slice(2), 16);
        } else if (/^0[bB]/u.test(clean)) {
          value = Number.parseInt(clean.slice(2), 2);
        } else if (/^0[oO]/u.test(clean)) {
          value = Number.parseInt(clean.slice(2), 8);
        } else if (/[.eE]/u.test(clean)) {
          value = new PyFloat(Number.parseFloat(clean));
        } else {
          value = Number.parseInt(clean, 10);
        }
        tokens.push({ kind: 'num', text, value });
        index += text.length;
        continue;
      }
    }
    if (IDENT_START.test(char)) {
      let cursor = index + 1;
      while (cursor < source.length && IDENT_PART.test(source[cursor]!)) {
        cursor += 1;
      }
      tokens.push({ kind: 'name', text: source.slice(index, cursor) });
      index = cursor;
      continue;
    }
    const operator = OPERATORS.find((op) => source.startsWith(op, index));
    if (!operator) {
      throw new SyntaxProblem(line, false, `invalid character ${JSON.stringify(char)}`);
    }
    tokens.push({ kind: 'op', text: operator });
    index += operator.length;
  }
  return tokens;
}

// ───────────────────────── 줄·문장 ─────────────────────────

interface LogicalLine {
  readonly line: number;
  readonly indent: number;
  readonly text: string;
}

function logicalLines(source: string): LogicalLine[] {
  const physical = source.replace(/\r\n?/gu, '\n').split('\n');
  const result: LogicalLine[] = [];
  let buffer = '';
  let startLine = 0;
  let indent = 0;
  let depth = 0;
  let tripleQuote: string | null = null;
  for (let index = 0; index < physical.length; index += 1) {
    const raw = physical[index]!;
    if (buffer === '') {
      if (tripleQuote === null && /^\s*(#.*)?$/u.test(raw)) {
        continue;
      }
      startLine = index + 1;
      const leading = /^[ \t]*/u.exec(raw)![0];
      indent = [...leading].reduce((width, char) => (char === '\t' ? width + 8 - (width % 8) : width + 1), 0);
    }
    buffer += (buffer === '' ? raw : `\n${raw}`);
    // 괄호 깊이·세 따옴표·줄 끝 \ 이어짐을 센다(글자·주석 안은 빼고)
    let quote: string | null = null;
    depth = 0;
    tripleQuote = null;
    for (let cursor = 0; cursor < buffer.length; cursor += 1) {
      const char = buffer[cursor]!;
      if (tripleQuote) {
        if (buffer.startsWith(tripleQuote, cursor)) {
          cursor += 2;
          tripleQuote = null;
        } else if (char === '\\') {
          cursor += 1;
        }
        continue;
      }
      if (quote) {
        if (char === '\\') {
          cursor += 1;
        } else if (char === quote || char === '\n') {
          quote = null;
        }
        continue;
      }
      if (char === '#') {
        const newline = buffer.indexOf('\n', cursor);
        if (newline < 0) {
          break;
        }
        cursor = newline;
        continue;
      }
      if (char === '"' || char === "'") {
        if (buffer.startsWith(char.repeat(3), cursor)) {
          tripleQuote = char.repeat(3);
          cursor += 2;
        } else {
          quote = char;
        }
        continue;
      }
      if ('([{'.includes(char)) {
        depth += 1;
      } else if (')]}'.includes(char)) {
        depth -= 1;
      }
    }
    const continued = /\\\s*$/u.test(raw) && !raw.trimStart().startsWith('#');
    if (depth > 0 || tripleQuote !== null || continued) {
      continue;
    }
    result.push({ line: startLine, indent, text: buffer.trim() });
    buffer = '';
  }
  if (buffer !== '') {
    throw new SyntaxProblem(startLine, false, depth > 0 ? 'unexpected EOF (bracket not closed)' : 'unterminated string');
  }
  return result;
}

export type Expr =
  | { readonly kind: 'const'; readonly value: PyValue }
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'attr'; readonly object: Expr; readonly name: string }
  | { readonly kind: 'call'; readonly func: Expr; readonly args: Expr[]; readonly kwargs: [string, Expr][] }
  | { readonly kind: 'index'; readonly object: Expr; readonly index: Expr }
  | { readonly kind: 'unary'; readonly op: string; readonly operand: Expr }
  | { readonly kind: 'binary'; readonly op: string; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'list'; readonly items: Expr[] }
  | { readonly kind: 'tuple'; readonly items: Expr[] };

export type Stmt =
  | { readonly kind: 'expr'; readonly line: number; readonly expr: Expr }
  | { readonly kind: 'assign'; readonly line: number; readonly targets: Expr[]; readonly value: Expr }
  | { readonly kind: 'augassign'; readonly line: number; readonly target: Expr; readonly op: string; readonly value: Expr }
  | { readonly kind: 'import'; readonly line: number; readonly names: { module: string; alias: string | null }[] }
  | { readonly kind: 'from'; readonly line: number; readonly module: string; readonly names: { name: string; alias: string | null }[] }
  | { readonly kind: 'if'; readonly line: number; readonly branches: { test: Expr; body: Stmt[] }[]; readonly orelse: Stmt[] }
  | { readonly kind: 'while'; readonly line: number; readonly test: Expr; readonly body: Stmt[] }
  | { readonly kind: 'for'; readonly line: number; readonly targets: string[]; readonly iter: Expr; readonly body: Stmt[] }
  | { readonly kind: 'with'; readonly line: number; readonly expr: Expr; readonly alias: string | null; readonly body: Stmt[] }
  | { readonly kind: 'try'; readonly line: number; readonly body: Stmt[]; readonly handlers: { types: string[]; alias: string | null; body: Stmt[] }[]; readonly final: Stmt[] }
  | { readonly kind: 'raise'; readonly line: number; readonly expr: Expr | null }
  | { readonly kind: 'pass' | 'break' | 'continue'; readonly line: number }
  | { readonly kind: 'unsupported'; readonly line: number; readonly text: string };

class ExprParser {
  private position = 0;
  constructor(
    private readonly tokens: readonly Token[],
    private readonly line: number,
  ) {}

  get done(): boolean {
    return this.position >= this.tokens.length;
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  private isOp(text: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === 'op' && token.text === text;
  }

  private isName(text: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === 'name' && token.text === text;
  }

  private expectOp(text: string): void {
    if (!this.isOp(text)) {
      throw new SyntaxProblem(this.line, false, `expected '${text}'`);
    }
    this.position += 1;
  }

  parseExpressionList(): Expr {
    const first = this.parseExpression();
    if (!this.isOp(',')) {
      return first;
    }
    const items = [first];
    while (this.isOp(',')) {
      this.position += 1;
      if (this.done || this.isOp('=') || this.isOp(')')) {
        break;
      }
      items.push(this.parseExpression());
    }
    return { kind: 'tuple', items };
  }

  parseExpression(): Expr {
    const value = this.parseOr();
    if (this.isName('if')) {
      throw new SyntaxProblem(this.line, true, 'conditional expression');
    }
    return value;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isName('or')) {
      this.position += 1;
      left = { kind: 'binary', op: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isName('and')) {
      this.position += 1;
      left = { kind: 'binary', op: 'and', left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isName('not')) {
      this.position += 1;
      return { kind: 'unary', op: 'not', operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    let left = this.parseArith();
    for (;;) {
      let op: string | null = null;
      if (['==', '!=', '<', '<=', '>', '>='].some((text) => this.isOp(text))) {
        op = this.peek()!.text;
        this.position += 1;
      } else if (this.isName('in')) {
        op = 'in';
        this.position += 1;
      } else if (this.isName('not') && this.isName('in', 1)) {
        op = 'not in';
        this.position += 2;
      } else if (this.isName('is')) {
        this.position += 1;
        if (this.isName('not')) {
          this.position += 1;
          op = 'is not';
        } else {
          op = 'is';
        }
      }
      if (op === null) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.parseArith() };
    }
  }

  private parseArith(): Expr {
    let left = this.parseTerm();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.peek()!.text;
      this.position += 1;
      left = { kind: 'binary', op, left, right: this.parseTerm() };
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
      const op = this.peek()!.text;
      this.position += 1;
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isOp('-') || this.isOp('+')) {
      const op = this.peek()!.text;
      this.position += 1;
      return { kind: 'unary', op, operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parsePrimary();
    if (this.isOp('**')) {
      this.position += 1;
      return { kind: 'binary', op: '**', left: base, right: this.parseUnary() };
    }
    return base;
  }

  private parseArguments(): { args: Expr[]; kwargs: [string, Expr][] } {
    const args: Expr[] = [];
    const kwargs: [string, Expr][] = [];
    while (!this.isOp(')')) {
      if (this.done) {
        throw new SyntaxProblem(this.line, false, 'unclosed call');
      }
      if (this.isOp('*') || this.isOp('**')) {
        throw new SyntaxProblem(this.line, true, 'argument unpacking');
      }
      if (this.peek()?.kind === 'name' && this.isOp('=', 1)) {
        const name = this.peek()!.text;
        this.position += 2;
        kwargs.push([name, this.parseExpression()]);
      } else {
        if (kwargs.length > 0) {
          throw new SyntaxProblem(this.line, false, 'positional argument follows keyword argument');
        }
        args.push(this.parseExpression());
      }
      if (this.isOp(',')) {
        this.position += 1;
      } else if (!this.isOp(')')) {
        throw new SyntaxProblem(this.line, false, "expected ',' or ')'");
      }
    }
    this.position += 1;
    return { args, kwargs };
  }

  private parsePrimary(): Expr {
    let expr = this.parseAtom();
    for (;;) {
      if (this.isOp('.')) {
        this.position += 1;
        const name = this.peek();
        if (name?.kind !== 'name') {
          throw new SyntaxProblem(this.line, false, 'expected attribute name');
        }
        this.position += 1;
        expr = { kind: 'attr', object: expr, name: name.text };
      } else if (this.isOp('(')) {
        this.position += 1;
        const { args, kwargs } = this.parseArguments();
        expr = { kind: 'call', func: expr, args, kwargs };
      } else if (this.isOp('[')) {
        this.position += 1;
        if (this.isOp(':') || this.tokens.slice(this.position).some((token) => token.kind === 'op' && token.text === ':')) {
          // 자르기(a[1:3])는 흉내 내지 않는다
          const closing = this.tokens.findIndex((token, index) => index >= this.position && token.kind === 'op' && token.text === ']');
          if (closing >= 0 && this.tokens.slice(this.position, closing).some((token) => token.kind === 'op' && token.text === ':')) {
            throw new SyntaxProblem(this.line, true, 'slice');
          }
        }
        const index = this.parseExpressionList();
        this.expectOp(']');
        expr = { kind: 'index', object: expr, index };
      } else {
        return expr;
      }
    }
  }

  private parseAtom(): Expr {
    const token = this.peek();
    if (!token) {
      throw new SyntaxProblem(this.line, false, 'unexpected end of line');
    }
    if (token.kind === 'num' || token.kind === 'str') {
      this.position += 1;
      return { kind: 'const', value: token.value ?? null };
    }
    if (token.kind === 'name') {
      if (UNSUPPORTED_KEYWORDS.has(token.text)) {
        throw new SyntaxProblem(this.line, true, token.text);
      }
      this.position += 1;
      if (token.text === 'True') {
        return { kind: 'const', value: true };
      }
      if (token.text === 'False') {
        return { kind: 'const', value: false };
      }
      if (token.text === 'None') {
        return { kind: 'const', value: null };
      }
      return { kind: 'name', name: token.text };
    }
    if (token.text === '(') {
      this.position += 1;
      if (this.isOp(')')) {
        this.position += 1;
        return { kind: 'tuple', items: [] };
      }
      const inner = this.parseExpressionList();
      this.expectOp(')');
      return inner;
    }
    if (token.text === '[') {
      this.position += 1;
      const items: Expr[] = [];
      while (!this.isOp(']')) {
        if (this.done) {
          throw new SyntaxProblem(this.line, false, 'unclosed list');
        }
        items.push(this.parseExpression());
        if (this.isName('for')) {
          throw new SyntaxProblem(this.line, true, 'list comprehension');
        }
        if (this.isOp(',')) {
          this.position += 1;
        } else if (!this.isOp(']')) {
          throw new SyntaxProblem(this.line, false, "expected ',' or ']'");
        }
      }
      this.position += 1;
      return { kind: 'list', items };
    }
    if (token.text === '{') {
      throw new SyntaxProblem(this.line, true, 'dict or set literal');
    }
    throw new SyntaxProblem(this.line, false, `unexpected '${token.text}'`);
  }
}

function parseExpr(tokens: readonly Token[], line: number, list = false): Expr {
  const parser = new ExprParser(tokens, line);
  const expr = list ? parser.parseExpressionList() : parser.parseExpression();
  if (!parser.done) {
    const rest = parser.peek()!;
    if (rest.kind === 'name' && UNSUPPORTED_KEYWORDS.has(rest.text)) {
      throw new SyntaxProblem(line, true, rest.text);
    }
    throw new SyntaxProblem(line, false, `unexpected '${rest.text}'`);
  }
  return expr;
}

/** 줄 맨 바깥(괄호 밖)의 연산자 위치 */
function topLevelIndex(tokens: readonly Token[], texts: readonly string[], from = 0): number {
  let depth = 0;
  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind !== 'op') {
      continue;
    }
    if ('([{'.includes(token.text)) {
      depth += 1;
    } else if (')]}'.includes(token.text)) {
      depth -= 1;
    } else if (depth === 0 && texts.includes(token.text)) {
      return index;
    }
  }
  return -1;
}

function splitTopLevel(tokens: readonly Token[], separator: string): Token[][] {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === 'op' && '([{'.includes(token.text)) {
      depth += 1;
    } else if (token.kind === 'op' && ')]}'.includes(token.text)) {
      depth -= 1;
    }
    if (depth === 0 && token.kind === 'op' && token.text === separator) {
      parts.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  parts.push(current);
  return parts;
}

interface Parsed {
  readonly statements: Stmt[];
}

class BlockParser {
  private index = 0;
  constructor(private readonly lines: readonly LogicalLine[]) {}

  parseProgram(): Parsed {
    const statements = this.parseBlock(0);
    if (this.index < this.lines.length) {
      throw new SyntaxProblem(this.lines[this.index]!.line, false, 'unexpected indent');
    }
    return { statements };
  }

  private parseBlock(indent: number): Stmt[] {
    const statements: Stmt[] = [];
    while (this.index < this.lines.length) {
      const current = this.lines[this.index]!;
      if (current.indent < indent) {
        break;
      }
      if (current.indent > indent) {
        throw new SyntaxProblem(current.line, false, 'unexpected indent');
      }
      statements.push(...this.parseStatementLine());
    }
    return statements;
  }

  /** 한 줄 몸통(if x: a) 또는 다음 줄들(들여쓴 덩어리) */
  private parseBody(header: LogicalLine, rest: readonly Token[]): Stmt[] {
    if (rest.length > 0) {
      return splitTopLevel(rest, ';')
        .filter((part) => part.length > 0)
        .map((part) => this.parseSimple(part, header.line, header.text));
    }
    const next = this.lines[this.index];
    if (!next || next.indent <= header.indent) {
      throw new SyntaxProblem(header.line, false, 'expected an indented block');
    }
    return this.parseBlock(next.indent);
  }

  /** 줄 하나(복합문이면 몸통까지)를 읽는다 */
  private parseStatementLine(): Stmt[] {
    const current = this.lines[this.index]!;
    this.index += 1;
    let tokens: Token[];
    try {
      tokens = tokenize(current.text, current.line);
    } catch (error) {
      if (error instanceof SyntaxProblem && error.unsupported) {
        this.skipBlockAfter(current);
        return [{ kind: 'unsupported', line: current.line, text: current.text }];
      }
      throw error;
    }
    const head = tokens[0];
    const keyword = head?.kind === 'name' ? head.text : '';
    try {
      if (['if', 'while', 'for', 'with', 'try', 'else', 'elif', 'except', 'finally'].includes(keyword) || UNSUPPORTED_KEYWORDS.has(keyword)) {
        return [this.parseCompound(current, tokens, keyword)];
      }
      return splitTopLevel(tokens, ';')
        .filter((part) => part.length > 0)
        .map((part) => this.parseSimple(part, current.line, current.text));
    } catch (error) {
      if (error instanceof SyntaxProblem && error.unsupported) {
        this.skipBlockAfter(current);
        return [{ kind: 'unsupported', line: current.line, text: current.text }];
      }
      throw error;
    }
  }

  private skipBlockAfter(header: LogicalLine): void {
    while (this.index < this.lines.length && this.lines[this.index]!.indent > header.indent) {
      this.index += 1;
    }
  }

  private colonSplit(tokens: readonly Token[], line: number): { head: Token[]; rest: Token[] } {
    const at = topLevelIndex(tokens, [':']);
    if (at < 0) {
      throw new SyntaxProblem(line, false, "expected ':'");
    }
    return { head: tokens.slice(1, at), rest: tokens.slice(at + 1) };
  }

  private parseCompound(current: LogicalLine, tokens: Token[], keyword: string): Stmt {
    if (UNSUPPORTED_KEYWORDS.has(keyword)) {
      throw new SyntaxProblem(current.line, true, keyword);
    }
    if (keyword === 'else' || keyword === 'elif' || keyword === 'except' || keyword === 'finally') {
      throw new SyntaxProblem(current.line, false, `unexpected '${keyword}'`);
    }
    if (keyword === 'if') {
      const branches: { test: Expr; body: Stmt[] }[] = [];
      let orelse: Stmt[] = [];
      const first = this.colonSplit(tokens, current.line);
      branches.push({ test: parseExpr(first.head, current.line), body: this.parseBody(current, first.rest) });
      while (this.index < this.lines.length) {
        const next = this.lines[this.index]!;
        if (next.indent !== current.indent) {
          break;
        }
        const nextTokens = tokenize(next.text, next.line);
        const nextKeyword = nextTokens[0]?.kind === 'name' ? nextTokens[0].text : '';
        if (nextKeyword === 'elif') {
          this.index += 1;
          const split = this.colonSplit(nextTokens, next.line);
          branches.push({ test: parseExpr(split.head, next.line), body: this.parseBody(next, split.rest) });
        } else if (nextKeyword === 'else') {
          this.index += 1;
          const split = this.colonSplit(nextTokens, next.line);
          orelse = this.parseBody(next, split.rest);
          break;
        } else {
          break;
        }
      }
      return { kind: 'if', line: current.line, branches, orelse };
    }
    if (keyword === 'while') {
      const split = this.colonSplit(tokens, current.line);
      return { kind: 'while', line: current.line, test: parseExpr(split.head, current.line), body: this.parseBody(current, split.rest) };
    }
    if (keyword === 'for') {
      const split = this.colonSplit(tokens, current.line);
      const inAt = split.head.findIndex((token) => token.kind === 'name' && token.text === 'in');
      if (inAt < 1) {
        throw new SyntaxProblem(current.line, false, 'invalid for');
      }
      const targets = splitTopLevel(split.head.slice(0, inAt), ',')
        .filter((part) => part.length > 0)
        .map((part) => {
          const cleaned = part.filter((token) => !(token.kind === 'op' && (token.text === '(' || token.text === ')')));
          if (cleaned.length !== 1 || cleaned[0]!.kind !== 'name') {
            throw new SyntaxProblem(current.line, true, 'complex for target');
          }
          return cleaned[0]!.text;
        });
      return { kind: 'for', line: current.line, targets, iter: parseExpr(split.head.slice(inAt + 1), current.line, true), body: this.parseBody(current, split.rest) };
    }
    if (keyword === 'with') {
      const split = this.colonSplit(tokens, current.line);
      const asAt = split.head.findIndex((token) => token.kind === 'name' && token.text === 'as');
      const exprTokens = asAt >= 0 ? split.head.slice(0, asAt) : split.head;
      const alias = asAt >= 0 ? split.head[asAt + 1]?.text ?? null : null;
      return { kind: 'with', line: current.line, expr: parseExpr(exprTokens, current.line), alias, body: this.parseBody(current, split.rest) };
    }
    // try
    const split = this.colonSplit(tokens, current.line);
    const body = this.parseBody(current, split.rest);
    const handlers: { types: string[]; alias: string | null; body: Stmt[] }[] = [];
    let final: Stmt[] = [];
    while (this.index < this.lines.length) {
      const next = this.lines[this.index]!;
      if (next.indent !== current.indent) {
        break;
      }
      const nextTokens = tokenize(next.text, next.line);
      const nextKeyword = nextTokens[0]?.kind === 'name' ? nextTokens[0].text : '';
      if (nextKeyword === 'except') {
        this.index += 1;
        const handler = this.colonSplit(nextTokens, next.line);
        const asAt = handler.head.findIndex((token) => token.kind === 'name' && token.text === 'as');
        const typeTokens = asAt >= 0 ? handler.head.slice(0, asAt) : handler.head;
        const types = typeTokens.filter((token) => token.kind === 'name').map((token) => token.text);
        handlers.push({ types, alias: asAt >= 0 ? handler.head[asAt + 1]?.text ?? null : null, body: this.parseBody(next, handler.rest) });
      } else if (nextKeyword === 'finally') {
        this.index += 1;
        const handler = this.colonSplit(nextTokens, next.line);
        final = this.parseBody(next, handler.rest);
        break;
      } else if (nextKeyword === 'else') {
        throw new SyntaxProblem(next.line, true, 'try-else');
      } else {
        break;
      }
    }
    if (handlers.length === 0 && final.length === 0) {
      throw new SyntaxProblem(current.line, false, "expected 'except' or 'finally'");
    }
    return { kind: 'try', line: current.line, body, handlers, final };
  }

  private parseSimple(tokens: readonly Token[], line: number, text: string): Stmt {
    const head = tokens[0]!;
    const keyword = head.kind === 'name' ? head.text : '';
    if (keyword === 'pass' || keyword === 'break' || keyword === 'continue') {
      if (tokens.length !== 1) {
        throw new SyntaxProblem(line, false, 'invalid syntax');
      }
      return { kind: keyword, line };
    }
    if (UNSUPPORTED_KEYWORDS.has(keyword)) {
      throw new SyntaxProblem(line, true, keyword);
    }
    if (keyword === 'import') {
      const names = splitTopLevel(tokens.slice(1), ',').map((part) => {
        const asAt = part.findIndex((token) => token.kind === 'name' && token.text === 'as');
        const moduleTokens = asAt >= 0 ? part.slice(0, asAt) : part;
        const module = moduleTokens.map((token) => token.text).join('');
        if (!/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(module)) {
          throw new SyntaxProblem(line, false, 'invalid import');
        }
        return { module, alias: asAt >= 0 ? part[asAt + 1]?.text ?? null : null };
      });
      return { kind: 'import', line, names };
    }
    if (keyword === 'from') {
      const importAt = tokens.findIndex((token) => token.kind === 'name' && token.text === 'import');
      if (importAt < 2) {
        throw new SyntaxProblem(line, false, 'invalid import');
      }
      const module = tokens
        .slice(1, importAt)
        .map((token) => token.text)
        .join('');
      if (module.startsWith('.')) {
        throw new SyntaxProblem(line, true, 'relative import');
      }
      const rest = tokens.slice(importAt + 1).filter((token) => !(token.kind === 'op' && (token.text === '(' || token.text === ')')));
      if (rest.length === 1 && rest[0]!.text === '*') {
        return { kind: 'from', line, module, names: [{ name: '*', alias: null }] };
      }
      const names = splitTopLevel(rest, ',')
        .filter((part) => part.length > 0)
        .map((part) => ({ name: part[0]!.text, alias: part[1]?.text === 'as' ? part[2]?.text ?? null : null }));
      return { kind: 'from', line, module, names };
    }
    if (keyword === 'raise') {
      return { kind: 'raise', line, expr: tokens.length > 1 ? parseExpr(tokens.slice(1), line) : null };
    }
    const augAt = topLevelIndex(tokens, ['+=', '-=', '*=', '/=', '//=', '%=']);
    if (augAt > 0) {
      return {
        kind: 'augassign',
        line,
        target: parseExpr(tokens.slice(0, augAt), line),
        op: tokens[augAt]!.text.slice(0, -1),
        value: parseExpr(tokens.slice(augAt + 1), line, true),
      };
    }
    const parts = splitTopLevel(tokens, '=');
    if (parts.length > 1) {
      if (parts.some((part) => part.length === 0)) {
        throw new SyntaxProblem(line, false, 'invalid syntax');
      }
      const targets = parts.slice(0, -1).map((part) => parseExpr(part, line, true));
      for (const target of targets) {
        const names = target.kind === 'tuple' ? target.items : [target];
        if (!names.every((item) => item.kind === 'name' || item.kind === 'attr' || item.kind === 'index')) {
          throw new SyntaxProblem(line, false, "can't assign to expression");
        }
      }
      return { kind: 'assign', line, targets, value: parseExpr(parts[parts.length - 1]!, line, true) };
    }
    void text;
    return { kind: 'expr', line, expr: parseExpr(tokens, line, true) };
  }
}

/** 코드를 읽어 문장 목록으로. 구문 오류면 PyException('SyntaxError'), 흉내 못 내는 모양은 unsupported 문장으로 남긴다. */
export function parseMiniPython(source: string): Stmt[] {
  try {
    return new BlockParser(logicalLines(source)).parseProgram().statements;
  } catch (error) {
    if (error instanceof SyntaxProblem) {
      const exception = new PyException('SyntaxError', 'invalid syntax');
      exception.line = error.line;
      throw exception;
    }
    throw error;
  }
}

// ───────────────────────── 실행 ─────────────────────────

export interface MiniPythonHost {
  /** print 같은 출력(글자 그대로 — \n을 \r\n으로 바꾸는 것은 보드 쪽) */
  write(text: string): void;
  /** input(prompt): 호스트가 한 줄을 보낼 때까지 기다린다. Ctrl-C면 KeyboardInterrupt를 던진다 */
  input(prompt: string): Promise<string>;
  /** 기다리기(밀리초). Ctrl-C면 KeyboardInterrupt를 던진다 */
  sleepMs(ms: number): Promise<void>;
  /** 계산만 하는 반복에서도 Ctrl-C를 받게 가끔 부른다(양보). Ctrl-C면 던진다 */
  poll(): Promise<void>;
  /** 보드가 켜진 뒤 흐른 밀리초 */
  ticksMs(): number;
  readonly files: MockFileSystem;
  /** 핀 값을 적는다(machine.Pin — 테스트가 볼 수 있게) */
  pinWrite?(gpio: number, value: number): void;
  /** 이 목록 밖의 문장: 'error'(기본, NotImplementedError) | 'ignore'(건너뜀) */
  readonly unknownStatement?: 'error' | 'ignore';
  /** os.uname()의 release·machine, sys.implementation 판 */
  readonly version?: string;
  readonly machine?: string;
}

export class Interpreter {
  readonly globals = new Map<string, PyValue>();
  private steps = 0;

  constructor(readonly host: MiniPythonHost) {
    for (const [name, value] of createBuiltins()) {
      this.globals.set(name, value);
    }
  }

  async run(statements: readonly Stmt[]): Promise<void> {
    await this.block(statements);
  }

  private async tick(): Promise<void> {
    this.steps += 1;
    if (this.steps % 64 === 0) {
      await this.host.poll();
    }
  }

  private async block(statements: readonly Stmt[]): Promise<void> {
    for (const statement of statements) {
      try {
        await this.statement(statement);
      } catch (error) {
        if (error instanceof PyException && error.line === 0) {
          error.line = statement.line;
        }
        throw error;
      }
    }
  }

  private async statement(statement: Stmt): Promise<void> {
    await this.tick();
    switch (statement.kind) {
      case 'expr':
        await this.evaluate(statement.expr);
        return;
      case 'assign': {
        const value = await this.evaluate(statement.value);
        for (const target of statement.targets) {
          await this.assign(target, value);
        }
        return;
      }
      case 'augassign': {
        const current = await this.evaluate(statement.target);
        const value = await this.evaluate(statement.value);
        await this.assign(statement.target, binaryOp(statement.op, current, value));
        return;
      }
      case 'import':
        for (const { module, alias } of statement.names) {
          const loaded = this.importModule(module);
          this.globals.set(alias ?? module.split('.')[0]!, alias ? loaded : this.importModule(module.split('.')[0]!));
        }
        return;
      case 'from': {
        const module = this.importModule(statement.module);
        for (const { name, alias } of statement.names) {
          if (name === '*') {
            for (const [key, value] of module.attrs) {
              this.globals.set(key, value);
            }
            continue;
          }
          const value = module.attrs.get(name);
          if (value === undefined) {
            throw new PyException('ImportError', `can't import name ${name}`);
          }
          this.globals.set(alias ?? name, value);
        }
        return;
      }
      case 'if':
        for (const branch of statement.branches) {
          if (truthy(await this.evaluate(branch.test))) {
            await this.block(branch.body);
            return;
          }
        }
        await this.block(statement.orelse);
        return;
      case 'while':
        while (truthy(await this.evaluate(statement.test))) {
          try {
            await this.block(statement.body);
          } catch (signal) {
            if (signal instanceof BreakSignal) {
              break;
            }
            if (!(signal instanceof ContinueSignal)) {
              throw signal;
            }
          }
          // 몸통 문장마다 tick이 돌므로 여기서는 셈만 한다(반복마다 양보하면 Ctrl-C가 sleep 줄 대신 while 줄에 걸리기 쉽다)
          await this.tick();
        }
        return;
      case 'for': {
        const items = iterate(await this.evaluate(statement.iter));
        for (const item of items) {
          if (statement.targets.length === 1) {
            this.globals.set(statement.targets[0]!, item);
          } else {
            const parts = iterate(item);
            statement.targets.forEach((name, index) => this.globals.set(name, parts[index] ?? null));
          }
          try {
            await this.block(statement.body);
          } catch (signal) {
            if (signal instanceof BreakSignal) {
              break;
            }
            if (!(signal instanceof ContinueSignal)) {
              throw signal;
            }
          }
          await this.tick();
        }
        return;
      }
      case 'with': {
        const value = await this.evaluate(statement.expr);
        if (statement.alias) {
          this.globals.set(statement.alias, value);
        }
        try {
          await this.block(statement.body);
        } finally {
          if (value instanceof PyFile) {
            value.closed = true;
          }
        }
        return;
      }
      case 'try':
        try {
          await this.block(statement.body);
        } catch (error) {
          if (!(error instanceof PyException)) {
            throw error;
          }
          const handler = statement.handlers.find((item) => item.types.length === 0 || item.types.some((type) => exceptionMatches(error.type, type)));
          if (!handler) {
            throw error;
          }
          if (handler.alias) {
            const object = new PyObject(error.type);
            // str(e)는 오류 글, OSError는 MicroPython처럼 args[0]·errno가 번호("[Errno 2] ENOENT" → 2)
            const errno = error.type === 'OSError' ? /^\[Errno (\d+)\]/u.exec(error.detail) : null;
            object.attrs.set('args', new PyTuple(errno ? [Number(errno[1])] : error.detail === '' ? [] : [error.detail]));
            if (errno) {
              object.attrs.set('errno', Number(errno[1]));
            }
            object.attrs.set('__str__', error.detail);
            this.globals.set(handler.alias, object);
          }
          this.currentException.push(error);
          try {
            await this.block(handler.body);
          } finally {
            this.currentException.pop();
          }
        } finally {
          if (statement.final.length > 0) {
            await this.block(statement.final);
          }
        }
        return;
      case 'raise': {
        if (!statement.expr) {
          const active = this.currentException[this.currentException.length - 1];
          if (!active) {
            throw new PyException('RuntimeError', 'no active exception to reraise');
          }
          throw active;
        }
        const target = statement.expr;
        if (target.kind === 'name') {
          throw new PyException(target.name, '');
        }
        if (target.kind === 'call' && target.func.kind === 'name') {
          const message = target.args.length > 0 ? pyStr(await this.evaluate(target.args[0]!)) : '';
          throw new PyException(target.func.name, message);
        }
        throw new PyException('TypeError', 'exceptions must derive from BaseException');
      }
      case 'pass':
        return;
      case 'break':
        throw new BreakSignal();
      case 'continue':
        throw new ContinueSignal();
      case 'unsupported':
        if (this.host.unknownStatement === 'ignore') {
          return;
        }
        throw new PyException('NotImplementedError', `mock board can't run: ${statement.text.split('\n')[0]}`);
    }
  }

  private readonly currentException: PyException[] = [];

  private async assign(target: Expr, value: PyValue): Promise<void> {
    if (target.kind === 'name') {
      this.globals.set(target.name, value);
      return;
    }
    if (target.kind === 'tuple') {
      const parts = iterate(value);
      if (parts.length !== target.items.length) {
        throw new PyException('ValueError', `need more than ${parts.length} values to unpack`);
      }
      for (let index = 0; index < target.items.length; index += 1) {
        await this.assign(target.items[index]!, parts[index]!);
      }
      return;
    }
    if (target.kind === 'attr') {
      const object = await this.evaluate(target.object);
      if (object instanceof PyObject || object instanceof PyModule) {
        object.attrs.set(target.name, value);
        return;
      }
      throw new PyException('AttributeError', `'${typeName(object)}' object has no attribute '${target.name}'`);
    }
    if (target.kind === 'index') {
      const object = await this.evaluate(target.object);
      const index = await this.evaluate(target.index);
      if (Array.isArray(object) && typeof index === 'number') {
        const at = index < 0 ? object.length + index : index;
        if (at < 0 || at >= object.length) {
          throw new PyException('IndexError', 'list index out of range');
        }
        object[at] = value;
        return;
      }
      throw new PyException('TypeError', `'${typeName(object)}' object doesn't support item assignment`);
    }
    throw new PyException('SyntaxError', "can't assign to expression");
  }

  importModule(name: string): PyModule {
    const cached = this.modules.get(name);
    if (cached) {
      return cached;
    }
    const factory = MODULE_FACTORIES[name];
    let module: PyModule;
    if (factory) {
      module = factory(this);
    } else if (this.host.files.exists(`${name}.py`) || this.host.files.exists(`lib/${name}.py`) || this.host.files.isDir(name)) {
      // 보드에 올린 파일은 이름만 있는 모듈로 둔다(내용은 실행하지 않는다 — 테스트 대역)
      module = new PyModule(name);
    } else {
      throw new PyException('ImportError', `no module named '${name}'`);
    }
    this.modules.set(name, module);
    return module;
  }

  private readonly modules = new Map<string, PyModule>();

  async evaluate(expr: Expr): Promise<PyValue> {
    switch (expr.kind) {
      case 'const':
        return expr.value;
      case 'name': {
        const value = this.globals.get(expr.name);
        if (value === undefined) {
          throw new PyException('NameError', `name '${expr.name}' isn't defined`);
        }
        return value;
      }
      case 'attr':
        return getAttribute(await this.evaluate(expr.object), expr.name, this);
      case 'index': {
        const object = await this.evaluate(expr.object);
        const index = await this.evaluate(expr.index);
        return getItem(object, index);
      }
      case 'call': {
        const func = await this.evaluate(expr.func);
        const args: PyValue[] = [];
        for (const arg of expr.args) {
          args.push(await this.evaluate(arg));
        }
        const kwargs = new Map<string, PyValue>();
        for (const [name, value] of expr.kwargs) {
          kwargs.set(name, await this.evaluate(value));
        }
        if (!(func instanceof PyFunction)) {
          throw new PyException('TypeError', `'${typeName(func)}' object isn't callable`);
        }
        const result = await func.call(args, kwargs, this);
        return result === undefined ? null : result;
      }
      case 'unary': {
        const operand = await this.evaluate(expr.operand);
        if (expr.op === 'not') {
          return !truthy(operand);
        }
        const number = numberOf(operand, expr.op === '-' ? '__neg__' : '__pos__');
        const value = expr.op === '-' ? -number : number;
        return operand instanceof PyFloat ? new PyFloat(value) : value;
      }
      case 'binary': {
        if (expr.op === 'and') {
          const left = await this.evaluate(expr.left);
          return truthy(left) ? this.evaluate(expr.right) : left;
        }
        if (expr.op === 'or') {
          const left = await this.evaluate(expr.left);
          return truthy(left) ? left : this.evaluate(expr.right);
        }
        return binaryOp(expr.op, await this.evaluate(expr.left), await this.evaluate(expr.right));
      }
      case 'list': {
        const items: PyValue[] = [];
        for (const item of expr.items) {
          items.push(await this.evaluate(item));
        }
        return items;
      }
      case 'tuple': {
        const items: PyValue[] = [];
        for (const item of expr.items) {
          items.push(await this.evaluate(item));
        }
        return new PyTuple(items);
      }
    }
  }
}

function exceptionMatches(actual: string, wanted: string): boolean {
  if (wanted === 'BaseException' || actual === wanted) {
    return true;
  }
  if (wanted === 'Exception') {
    return actual !== 'KeyboardInterrupt' && actual !== 'SystemExit';
  }
  const parents: Record<string, string[]> = {
    ImportError: ['ModuleNotFoundError'],
    OSError: ['FileNotFoundError'],
    ArithmeticError: ['ZeroDivisionError', 'OverflowError'],
    LookupError: ['IndexError', 'KeyError'],
  };
  return parents[wanted]?.includes(actual) ?? false;
}

// ───────────────────────── 값 다루기 ─────────────────────────

export function truthy(value: PyValue): boolean {
  if (value === null || value === false) {
    return false;
  }
  if (value === true) {
    return true;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (value instanceof PyFloat) {
    return value.value !== 0;
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (value instanceof PyBytes) {
    return value.data.length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value instanceof PyTuple) {
    return value.items.length > 0;
  }
  if (value instanceof PyRange) {
    return rangeItems(value).length > 0;
  }
  return true;
}

export function typeName(value: PyValue): string {
  if (value === null) {
    return 'NoneType';
  }
  if (typeof value === 'boolean') {
    return 'bool';
  }
  if (typeof value === 'number') {
    return 'int';
  }
  if (value instanceof PyFloat) {
    return 'float';
  }
  if (typeof value === 'string') {
    return 'str';
  }
  if (value instanceof PyBytes) {
    return 'bytes';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  if (value instanceof PyTuple) {
    return 'tuple';
  }
  if (value instanceof PyRange) {
    return 'range';
  }
  if (value instanceof PyModule) {
    return 'module';
  }
  if (value instanceof PyFunction) {
    return 'function';
  }
  if (value instanceof PyFile) {
    return value.binary ? 'FileIO' : 'TextIOWrapper';
  }
  return value.typeName;
}

function numberOf(value: PyValue, operation: string): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value instanceof PyFloat) {
    return value.value;
  }
  throw new PyException('TypeError', `unsupported type for ${operation}: '${typeName(value)}'`);
}

function isNumeric(value: PyValue): boolean {
  return typeof value === 'number' || typeof value === 'boolean' || value instanceof PyFloat;
}

function formatFloat(value: number): string {
  if (Number.isNaN(value)) {
    return 'nan';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'inf' : '-inf';
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e16) {
    return `${value}.0`;
  }
  return String(value);
}

function reprString(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  const body = [...text]
    .map((char) => {
      if (char === '\\') {
        return '\\\\';
      }
      if (char === quote) {
        return `\\${quote}`;
      }
      if (char === '\n') {
        return '\\n';
      }
      if (char === '\r') {
        return '\\r';
      }
      if (char === '\t') {
        return '\\t';
      }
      const code = char.codePointAt(0)!;
      return code < 0x20 || code === 0x7f ? `\\x${code.toString(16).padStart(2, '0')}` : char;
    })
    .join('');
  return `${quote}${body}${quote}`;
}

export function reprBytes(data: Uint8Array): string {
  let body = '';
  for (const byte of data) {
    if (byte === 0x5c) {
      body += '\\\\';
    } else if (byte === 0x27) {
      body += "\\'";
    } else if (byte === 0x0a) {
      body += '\\n';
    } else if (byte === 0x0d) {
      body += '\\r';
    } else if (byte === 0x09) {
      body += '\\t';
    } else if (byte >= 0x20 && byte < 0x7f) {
      body += String.fromCharCode(byte);
    } else {
      body += `\\x${byte.toString(16).padStart(2, '0')}`;
    }
  }
  return `b'${body}'`;
}

export function pyRepr(value: PyValue): string {
  if (typeof value === 'string') {
    return reprString(value);
  }
  if (value instanceof PyBytes) {
    return reprBytes(value.data);
  }
  if (Array.isArray(value)) {
    return `[${value.map(pyRepr).join(', ')}]`;
  }
  if (value instanceof PyTuple) {
    return value.items.length === 1 ? `(${pyRepr(value.items[0]!)},)` : `(${value.items.map(pyRepr).join(', ')})`;
  }
  return pyStr(value);
}

export function pyStr(value: PyValue): string {
  if (value === null) {
    return 'None';
  }
  if (value === true) {
    return 'True';
  }
  if (value === false) {
    return 'False';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value instanceof PyFloat) {
    return formatFloat(value.value);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof PyBytes || Array.isArray(value) || value instanceof PyTuple) {
    return pyRepr(value);
  }
  if (value instanceof PyRange) {
    return value.step === 1 ? `range(${value.start}, ${value.stop})` : `range(${value.start}, ${value.stop}, ${value.step})`;
  }
  if (value instanceof PyModule) {
    return `<module '${value.name}'>`;
  }
  if (value instanceof PyFunction) {
    return `<function ${value.name}>`;
  }
  if (value instanceof PyFile) {
    return `<io.${typeName(value)} 3>`;
  }
  const custom = value.attrs.get('__str__');
  return typeof custom === 'string' ? custom : `<${value.typeName}>`;
}

function rangeItems(range: PyRange): number[] {
  const items: number[] = [];
  if (range.step === 0) {
    throw new PyException('ValueError', 'zero step');
  }
  for (let value = range.start; range.step > 0 ? value < range.stop : value > range.stop; value += range.step) {
    items.push(value);
    if (items.length > 1_000_000) {
      throw new PyException('MemoryError', 'mock board range too big');
    }
  }
  return items;
}

export function iterate(value: PyValue): PyValue[] {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value instanceof PyTuple) {
    return [...value.items];
  }
  if (value instanceof PyRange) {
    return rangeItems(value);
  }
  if (typeof value === 'string') {
    return [...value];
  }
  if (value instanceof PyBytes) {
    return [...value.data];
  }
  throw new PyException('TypeError', `'${typeName(value)}' object isn't iterable`);
}

function equals(left: PyValue, right: PyValue): boolean {
  if (isNumeric(left) && isNumeric(right)) {
    return numberOf(left, '__eq__') === numberOf(right, '__eq__');
  }
  if (left instanceof PyBytes && right instanceof PyBytes) {
    return left.data.length === right.data.length && left.data.every((byte, index) => byte === right.data[index]);
  }
  if ((Array.isArray(left) && Array.isArray(right)) || (left instanceof PyTuple && right instanceof PyTuple)) {
    const a = iterate(left);
    const b = iterate(right);
    return a.length === b.length && a.every((item, index) => equals(item, b[index]!));
  }
  return left === right;
}

function compare(op: string, left: PyValue, right: PyValue): boolean {
  let a: number | string;
  let b: number | string;
  if (isNumeric(left) && isNumeric(right)) {
    a = numberOf(left, op);
    b = numberOf(right, op);
  } else if (typeof left === 'string' && typeof right === 'string') {
    a = left;
    b = right;
  } else {
    throw new PyException('TypeError', `unsupported types for ${op}: '${typeName(left)}', '${typeName(right)}'`);
  }
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    default:
      return a >= b;
  }
}

const OP_NAMES: Record<string, string> = { '+': '__add__', '-': '__sub__', '*': '__mul__', '/': '__truediv__', '//': '__floordiv__', '%': '__mod__', '**': '__pow__' };

export function binaryOp(op: string, left: PyValue, right: PyValue): PyValue {
  switch (op) {
    case '==':
      return equals(left, right);
    case '!=':
      return !equals(left, right);
    case 'is':
      return left === right || (left === null && right === null);
    case 'is not':
      return !(left === right || (left === null && right === null));
    case '<':
    case '<=':
    case '>':
    case '>=':
      return compare(op, left, right);
    case 'in':
    case 'not in': {
      let found: boolean;
      if (typeof right === 'string' && typeof left === 'string') {
        found = right.includes(left);
      } else if (right instanceof PyBytes && typeof left === 'number') {
        found = right.data.includes(left);
      } else {
        found = iterate(right).some((item) => equals(item, left));
      }
      return op === 'in' ? found : !found;
    }
    default:
      break;
  }
  if (isNumeric(left) && isNumeric(right)) {
    const a = numberOf(left, OP_NAMES[op]!);
    const b = numberOf(right, OP_NAMES[op]!);
    const floatMode = left instanceof PyFloat || right instanceof PyFloat;
    const wrap = (value: number): PyValue => (floatMode ? new PyFloat(value) : value);
    switch (op) {
      case '+':
        return wrap(a + b);
      case '-':
        return wrap(a - b);
      case '*':
        return wrap(a * b);
      case '/':
        if (b === 0) {
          throw new PyException('ZeroDivisionError', 'divide by zero');
        }
        return new PyFloat(a / b);
      case '//':
        if (b === 0) {
          throw new PyException('ZeroDivisionError', 'divide by zero');
        }
        return wrap(Math.floor(a / b));
      case '%':
        if (b === 0) {
          throw new PyException('ZeroDivisionError', 'divide by zero');
        }
        return wrap(((a % b) + b) % b);
      case '**':
        return !floatMode && b < 0 ? new PyFloat(a ** b) : wrap(a ** b);
      default:
        break;
    }
  }
  if (op === '+') {
    if (typeof left === 'string' && typeof right === 'string') {
      return left + right;
    }
    if (left instanceof PyBytes && right instanceof PyBytes) {
      const out = new Uint8Array(left.data.length + right.data.length);
      out.set(left.data, 0);
      out.set(right.data, left.data.length);
      return new PyBytes(out);
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      return [...left, ...right];
    }
  }
  if (op === '*') {
    if (typeof left === 'string' && typeof right === 'number') {
      return left.repeat(Math.max(0, right));
    }
    if (Array.isArray(left) && typeof right === 'number') {
      return Array.from({ length: Math.max(0, right) }, () => left).flat();
    }
  }
  if (op === '%' && typeof left === 'string') {
    const values = right instanceof PyTuple ? right.items : [right];
    let at = 0;
    return left.replace(/%[sdrf%]/gu, (spec) => (spec === '%%' ? '%' : spec === '%r' ? pyRepr(values[at++] ?? null) : pyStr(values[at++] ?? null)));
  }
  throw new PyException('TypeError', `unsupported types for ${OP_NAMES[op] ?? op}: '${typeName(left)}', '${typeName(right)}'`);
}

function getItem(object: PyValue, index: PyValue): PyValue {
  if (typeof index !== 'number' && typeof index !== 'boolean') {
    throw new PyException('TypeError', `indices must be integers, not ${typeName(index)}`);
  }
  const items = object instanceof PyBytes ? [...object.data] : Array.isArray(object) || object instanceof PyTuple || typeof object === 'string' ? iterate(object) : null;
  if (!items) {
    throw new PyException('TypeError', `'${typeName(object)}' object isn't subscriptable`);
  }
  const numeric = Number(index);
  const at = numeric < 0 ? items.length + numeric : numeric;
  if (at < 0 || at >= items.length) {
    throw new PyException('IndexError', `${typeName(object)} index out of range`);
  }
  return items[at]!;
}

function fn(name: string, call: Builtin): PyFunction {
  return new PyFunction(name, call);
}

function argString(args: PyValue[], index: number, name: string): string {
  const value = args[index];
  if (typeof value !== 'string') {
    throw new PyException('TypeError', `${name}: expected str, got ${typeName(value ?? null)}`);
  }
  return value;
}

function bytesOf(value: PyValue): Uint8Array {
  if (value instanceof PyBytes) {
    return value.data;
  }
  if (typeof value === 'string') {
    return toBytes(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((item) => numberOf(item, 'bytes')));
  }
  throw new PyException('TypeError', `object with buffer protocol required`);
}

function stringMethod(text: string, name: string): PyFunction | undefined {
  const methods: Record<string, Builtin> = {
    strip: () => text.trim(),
    rstrip: (args) => (typeof args[0] === 'string' ? text.replace(new RegExp(`[${args[0].replace(/[\\\]^-]/gu, '\\$&')}]+$`, 'u'), '') : text.trimEnd()),
    lstrip: () => text.trimStart(),
    lower: () => text.toLowerCase(),
    upper: () => text.toUpperCase(),
    split: (args) => (typeof args[0] === 'string' ? text.split(args[0]) : text.split(/\s+/u).filter((part) => part !== '')),
    startswith: (args) => text.startsWith(argString(args, 0, 'startswith')),
    endswith: (args) => text.endsWith(argString(args, 0, 'endswith')),
    replace: (args) => text.split(argString(args, 0, 'replace')).join(argString(args, 1, 'replace')),
    encode: () => new PyBytes(toBytes(text)),
    find: (args) => text.indexOf(argString(args, 0, 'find')),
    isdigit: () => /^\d+$/u.test(text),
    join: (args) => iterate(args[0] ?? []).map((item) => pyStr(item)).join(text),
    format: (args) => {
      let at = 0;
      return text.replace(/\{(\d*)(?::([^}]*))?\}/gu, (_match, position: string, spec: string | undefined) => {
        const value = args[position === '' ? at++ : Number(position)] ?? null;
        const parsed = /^(0?)(\d*)(?:\.(\d+))?([dfs]?)$/u.exec(spec ?? '');
        if (!spec || !parsed) {
          return pyStr(value);
        }
        const [, zero, width, precision, kind] = parsed;
        let body = precision !== undefined && isNumeric(value) ? numberOf(value, 'format').toFixed(Number(precision)) : kind === 'd' && isNumeric(value) ? String(Math.trunc(numberOf(value, 'format'))) : pyStr(value);
        const size = Number(width || '0');
        if (body.length < size) {
          body = zero === '0' && isNumeric(value) ? body.padStart(size, '0') : isNumeric(value) ? body.padStart(size, ' ') : body.padEnd(size, ' ');
        }
        return body;
      });
    },
  };
  const method = methods[name];
  return method ? fn(`str.${name}`, method) : undefined;
}

function getAttribute(object: PyValue, name: string, runtime: Interpreter): PyValue {
  if (object instanceof PyFunction) {
    const value = object.attrs.get(name);
    if (value !== undefined) {
      return value;
    }
  }
  if (object instanceof PyModule || object instanceof PyObject) {
    const value = object.attrs.get(name);
    if (value !== undefined) {
      return value;
    }
    if (object instanceof PyModule) {
      throw new PyException('AttributeError', `'module' object has no attribute '${name}'`);
    }
  }
  if (typeof object === 'string') {
    const method = stringMethod(object, name);
    if (method) {
      return method;
    }
  }
  if (object instanceof PyBytes && name === 'decode') {
    return fn('bytes.decode', () => utf8(object.data));
  }
  if (Array.isArray(object)) {
    if (name === 'append') {
      return fn('list.append', (args) => {
        object.push(args[0] ?? null);
        return null;
      });
    }
    if (name === 'pop') {
      return fn('list.pop', (args) => {
        if (object.length === 0) {
          throw new PyException('IndexError', 'pop from empty list');
        }
        const at = args.length > 0 ? Number(numberOf(args[0]!, 'pop')) : object.length - 1;
        return object.splice(at < 0 ? object.length + at : at, 1)[0] ?? null;
      });
    }
  }
  if (object instanceof PyFile) {
    const file = object;
    const ensureOpen = () => {
      if (file.closed) {
        throw new PyException('ValueError', 'I/O operation on closed file');
      }
    };
    switch (name) {
      case 'write':
        return fn('write', (args) => {
          ensureOpen();
          if (!file.writable) {
            throw new PyException('OSError', '[Errno 9] EBADF');
          }
          const value = args[0] ?? null;
          if (file.binary && typeof value === 'string') {
            throw new PyException('TypeError', "object with buffer protocol required");
          }
          return file.write(bytesOf(value));
        });
      case 'read':
        return fn('read', (args) => {
          ensureOpen();
          const data = file.read(args.length > 0 ? numberOf(args[0]!, 'read') : undefined);
          return file.binary ? new PyBytes(data) : utf8(data);
        });
      case 'readline':
        return fn('readline', () => {
          ensureOpen();
          const data = file.readline();
          return file.binary ? new PyBytes(data) : utf8(data);
        });
      case 'close':
        return fn('close', () => {
          file.closed = true;
          return null;
        });
      case 'flush':
        return fn('flush', () => null);
      default:
        break;
    }
  }
  void runtime;
  throw new PyException('AttributeError', `'${typeName(object)}' object has no attribute '${name}'`);
}

function toInt(value: PyValue): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value instanceof PyFloat) {
    return Math.trunc(value.value);
  }
  if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/u.test(value)) {
    return Number.parseInt(value, 10);
  }
  throw new PyException('ValueError', `invalid syntax for integer with base 10`);
}

function createBuiltins(): Map<string, PyValue> {
  const builtins = new Map<string, PyValue>();
  builtins.set(
    'print',
    fn('print', (args, kwargs, runtime) => {
      const sep = kwargs.has('sep') ? pyStr(kwargs.get('sep') ?? null) : ' ';
      const end = kwargs.has('end') ? pyStr(kwargs.get('end') ?? null) : '\n';
      runtime.host.write(args.map((arg) => pyStr(arg)).join(sep) + end);
      return null;
    }),
  );
  builtins.set(
    'input',
    fn('input', async (args, _kwargs, runtime) => runtime.host.input(args.length > 0 ? pyStr(args[0]!) : '')),
  );
  builtins.set(
    'range',
    fn('range', (args) => {
      const numbers = args.map((arg) => toInt(arg));
      if (numbers.length === 1) {
        return new PyRange(0, numbers[0]!, 1);
      }
      return new PyRange(numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 1);
    }),
  );
  builtins.set(
    'len',
    fn('len', (args) => {
      const value = args[0] ?? null;
      if (value instanceof PyBytes) {
        return value.data.length;
      }
      return iterate(value).length;
    }),
  );
  builtins.set('str', fn('str', (args) => (args.length > 0 ? pyStr(args[0]!) : '')));
  builtins.set('repr', fn('repr', (args) => pyRepr(args[0] ?? null)));
  builtins.set('int', fn('int', (args) => (args.length > 0 ? toInt(args[0]!) : 0)));
  builtins.set(
    'float',
    fn('float', (args) => {
      const value = args[0] ?? 0;
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isNaN(parsed)) {
          throw new PyException('ValueError', "can't convert to float");
        }
        return new PyFloat(parsed);
      }
      return new PyFloat(numberOf(value, 'float'));
    }),
  );
  builtins.set('bool', fn('bool', (args) => truthy(args[0] ?? false)));
  builtins.set('abs', fn('abs', (args) => {
    const value = args[0] ?? 0;
    return value instanceof PyFloat ? new PyFloat(Math.abs(value.value)) : Math.abs(numberOf(value, 'abs'));
  }));
  builtins.set('min', fn('min', (args) => (args.length === 1 ? iterate(args[0]!) : args).reduce((a, b) => (compare('<', b, a) ? b : a))));
  builtins.set('max', fn('max', (args) => (args.length === 1 ? iterate(args[0]!) : args).reduce((a, b) => (compare('>', b, a) ? b : a))));
  builtins.set('round', fn('round', (args) => {
    const value = numberOf(args[0] ?? 0, 'round');
    if (args.length < 2) {
      return Math.round(value);
    }
    const digits = toInt(args[1]!);
    return new PyFloat(Number(value.toFixed(Math.max(0, digits))));
  }));
  builtins.set('chr', fn('chr', (args) => String.fromCodePoint(toInt(args[0] ?? 0))));
  builtins.set('ord', fn('ord', (args) => argString(args, 0, 'ord').codePointAt(0) ?? 0));
  builtins.set('hex', fn('hex', (args) => `0x${toInt(args[0] ?? 0).toString(16)}`));
  builtins.set('list', fn('list', (args) => (args.length > 0 ? iterate(args[0]!) : [])));
  builtins.set('bytes', fn('bytes', (args) => new PyBytes(args.length > 0 ? bytesOf(args[0]!) : new Uint8Array())));
  builtins.set('bytearray', fn('bytearray', (args) => new PyBytes(args.length > 0 ? (typeof args[0] === 'number' ? new Uint8Array(args[0]) : bytesOf(args[0]!)) : new Uint8Array())));
  builtins.set('isinstance', fn('isinstance', (args) => {
    const kind = args[1];
    return kind instanceof PyFunction && typeName(args[0] ?? null) === kind.name;
  }));
  builtins.set(
    'open',
    fn('open', (args, kwargs, runtime) => {
      const path = argString(args, 0, 'open');
      const mode = args.length > 1 ? argString(args, 1, 'open') : kwargs.has('mode') ? pyStr(kwargs.get('mode')!) : 'r';
      const files = runtime.host.files;
      if (/[wa]/u.test(mode)) {
        const initial = mode.includes('a') ? files.read(path) : null;
        if (!mode.includes('a')) {
          files.write(path, new Uint8Array());
        }
        return new PyFile(path, mode, files, initial);
      }
      const existing = files.read(path);
      if (!existing) {
        throw new PyException('OSError', '[Errno 2] ENOENT');
      }
      return new PyFile(path, mode, files, existing);
    }),
  );
  return builtins;
}

// ───────────────────────── 모듈 ─────────────────────────

function module(name: string, entries: Record<string, PyValue>): PyModule {
  const created = new PyModule(name);
  for (const [key, value] of Object.entries(entries)) {
    created.attrs.set(key, value);
  }
  return created;
}

function timeModule(runtime: Interpreter, name: string): PyModule {
  const sleepMs = async (ms: number) => {
    if (ms < 0) {
      throw new PyException('ValueError', 'sleep length must be non-negative');
    }
    await runtime.host.sleepMs(ms);
    return null;
  };
  return module(name, {
    sleep: fn('sleep', (args) => sleepMs(numberOf(args[0] ?? 0, 'sleep') * 1000)),
    sleep_ms: fn('sleep_ms', (args) => sleepMs(toInt(args[0] ?? 0))),
    sleep_us: fn('sleep_us', (args) => sleepMs(toInt(args[0] ?? 0) / 1000)),
    ticks_ms: fn('ticks_ms', () => Math.floor(runtime.host.ticksMs()) & 0x3fffffff),
    ticks_us: fn('ticks_us', () => Math.floor(runtime.host.ticksMs() * 1000) & 0x3fffffff),
    ticks_diff: fn('ticks_diff', (args) => ((toInt(args[0] ?? 0) - toInt(args[1] ?? 0) + 0x20000000) & 0x3fffffff) - 0x20000000),
    ticks_add: fn('ticks_add', (args) => (toInt(args[0] ?? 0) + toInt(args[1] ?? 0)) & 0x3fffffff),
    time: fn('time', () => Math.floor(Date.now() / 1000) - 946_684_800),
  });
}

function osModule(runtime: Interpreter, name: string): PyModule {
  const files = runtime.host.files;
  const version = runtime.host.version ?? 'v1.29.0';
  const machine = runtime.host.machine ?? 'Generic ESP32 module with ESP32';
  const uname = new PyObject('uname_result');
  const release = version.replace(/^v/u, '');
  uname.attrs.set('sysname', 'esp32');
  uname.attrs.set('nodename', 'esp32');
  uname.attrs.set('release', release);
  uname.attrs.set('version', `${version} on mock`);
  uname.attrs.set('machine', machine);
  uname.attrs.set('__str__', `(sysname='esp32', nodename='esp32', release='${release}', version='${version} on mock', machine='${machine}')`);
  const requireExisting = (path: string) => {
    if (!files.exists(path)) {
      throw new PyException('OSError', '[Errno 2] ENOENT');
    }
  };
  return module(name, {
    listdir: fn('listdir', (args) => {
      const path = args.length > 0 ? argString(args, 0, 'listdir') : '';
      requireExisting(path);
      return files.list(path);
    }),
    remove: fn('remove', (args) => {
      const path = argString(args, 0, 'remove');
      if (!files.remove(path)) {
        throw new PyException('OSError', '[Errno 2] ENOENT');
      }
      return null;
    }),
    mkdir: fn('mkdir', (args) => {
      if (!files.mkdir(argString(args, 0, 'mkdir'))) {
        throw new PyException('OSError', '[Errno 17] EEXIST');
      }
      return null;
    }),
    rmdir: fn('rmdir', (args) => {
      if (!files.rmdir(argString(args, 0, 'rmdir'))) {
        throw new PyException('OSError', '[Errno 2] ENOENT');
      }
      return null;
    }),
    rename: fn('rename', (args) => {
      if (!files.rename(argString(args, 0, 'rename'), argString(args, 1, 'rename'))) {
        throw new PyException('OSError', '[Errno 2] ENOENT');
      }
      return null;
    }),
    stat: fn('stat', (args) => {
      const path = argString(args, 0, 'stat');
      requireExisting(path);
      const data = files.read(path);
      const isDir = files.isDir(path) && !data;
      return new PyTuple([isDir ? 0x4000 : 0x8000, 0, 0, 0, 0, 0, data?.length ?? 0, 0, 0, 0]);
    }),
    getcwd: fn('getcwd', () => '/'),
    uname: fn('uname', () => uname),
    sync: fn('sync', () => null),
  });
}

const MODULE_FACTORIES: Record<string, (runtime: Interpreter) => PyModule> = {
  time: (runtime) => timeModule(runtime, 'time'),
  utime: (runtime) => timeModule(runtime, 'utime'),
  os: (runtime) => osModule(runtime, 'os'),
  uos: (runtime) => osModule(runtime, 'uos'),
  sys: (runtime) => {
    const implementation = new PyObject('implementation');
    implementation.attrs.set('name', 'micropython');
    implementation.attrs.set('version', new PyTuple((runtime.host.version ?? 'v1.29.0').replace(/^v/u, '').split('.').map((part) => Number(part) || 0)));
    implementation.attrs.set('__str__', `(name='micropython', version=(${(runtime.host.version ?? 'v1.29.0').replace(/^v/u, '').split('.').join(', ')}), _machine='${runtime.host.machine ?? 'Generic ESP32 module with ESP32'}', _mpy=11014)`);
    return module('sys', {
      platform: 'esp32',
      implementation,
      exit: fn('exit', (args) => {
        throw new PyException('SystemExit', args.length > 0 ? pyStr(args[0]!) : '');
      }),
    });
  },
  usys: (runtime) => MODULE_FACTORIES.sys!(runtime),
  gc: () => module('gc', { collect: fn('collect', () => null), mem_free: fn('mem_free', () => 110_000), mem_alloc: fn('mem_alloc', () => 4_000) }),
  micropython: () => module('micropython', { const: fn('const', (args) => args[0] ?? null) }),
  machine: (runtime) => {
    const pinClass = fn('Pin', (args) => {
      const gpio = toInt(args[0] ?? 0);
      const pin = new PyObject('Pin');
      let value = 0;
      pin.attrs.set('on', fn('on', () => {
        value = 1;
        runtime.host.pinWrite?.(gpio, 1);
        return null;
      }));
      pin.attrs.set('off', fn('off', () => {
        value = 0;
        runtime.host.pinWrite?.(gpio, 0);
        return null;
      }));
      pin.attrs.set('value', fn('value', (valueArgs) => {
        if (valueArgs.length === 0) {
          return value;
        }
        value = truthy(valueArgs[0]!) ? 1 : 0;
        runtime.host.pinWrite?.(gpio, value);
        return null;
      }));
      return pin;
    });
    for (const [constant, value] of Object.entries({ IN: 1, OUT: 3, OPEN_DRAIN: 7, PULL_UP: 2, PULL_DOWN: 1, IRQ_RISING: 1, IRQ_FALLING: 2 })) {
      pinClass.attrs.set(constant, value);
    }
    return module('machine', {
      Pin: pinClass,
      reset: fn('reset', () => {
        throw new ResetSignal('hard');
      }),
      soft_reset: fn('soft_reset', () => {
        throw new ResetSignal('soft');
      }),
      unique_id: fn('unique_id', () => new PyBytes(Uint8Array.from([0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]))),
      freq: fn('freq', () => 160_000_000),
    });
  },
  ubinascii: () => binasciiModule('ubinascii'),
  binascii: () => binasciiModule('binascii'),
  esp: () => module('esp', { osdebug: fn('osdebug', () => null) }),
  esp32: () => module('esp32', {}),
};

function binasciiModule(name: string): PyModule {
  return module(name, {
    a2b_base64: fn('a2b_base64', (args) => {
      const text = typeof args[0] === 'string' ? args[0] : args[0] instanceof PyBytes ? utf8(args[0].data) : '';
      try {
        const binary = atob(text.replace(/\s+/gu, ''));
        return new PyBytes(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
      } catch {
        throw new PyException('ValueError', 'invalid padding');
      }
    }),
    b2a_base64: fn('b2a_base64', (args) => {
      const data = bytesOf(args[0] ?? new PyBytes(new Uint8Array()));
      let binary = '';
      for (const byte of data) {
        binary += String.fromCharCode(byte);
      }
      return new PyBytes(toBytes(`${btoa(binary)}\n`));
    }),
    hexlify: fn('hexlify', (args) => new PyBytes(toBytes([...bytesOf(args[0] ?? new PyBytes(new Uint8Array()))].map((byte) => byte.toString(16).padStart(2, '0')).join('')))),
  });
}

/**
 * 코드를 돌린다. 끝나면 undefined, 파이썬 예외면 PyException(line 채움), machine.reset이면 ResetSignal을 던진다.
 * 구문 오류는 한 줄도 실행하기 전에 PyException('SyntaxError')로 던진다(MicroPython도 먼저 컴파일한다).
 */
export async function runMiniPython(source: string, host: MiniPythonHost): Promise<void> {
  const statements = parseMiniPython(source);
  await new Interpreter(host).run(statements);
}

/** MicroPython 모양 트레이스백 글(줄 끝 \n — 보드가 \r\n으로 바꾼다) */
export function formatTraceback(error: PyException, filename = '<stdin>'): string {
  const location = error.type === 'SyntaxError' ? `  File "${filename}", line ${error.line}\n` : `  File "${filename}", line ${error.line}, in <module>\n`;
  return `Traceback (most recent call last):\n${location}${error.type}: ${error.detail}\n`;
}
