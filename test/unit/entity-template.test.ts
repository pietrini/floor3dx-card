import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEntityTemplate, rewriteEntityTemplate } from '../../src/entity-template';

test('quoted $entity compares as a string, as before', () => {
  assert.equal(runEntityTemplate("'$entity' == 'on' ? 'Lit' : 'Dark'", 'on'), 'Lit');
  assert.equal(runEntityTemplate('"$entity" == "on" ? "Lit" : "Dark"', 'off'), 'Dark');
});

test('$entity inside a longer string or a template literal', () => {
  assert.equal(runEntityTemplate("'State: $entity!'", 'open'), 'State: open!');
  assert.equal(runEntityTemplate('`${1 + 1} / $entity W`', '42'), '2 / 42 W');
  assert.equal(runEntityTemplate('`${"$entity".toUpperCase()}`', 'on'), 'ON');
});

test('bare $entity is the number for a numeric state, as pasting it into the code gave', () => {
  assert.equal(runEntityTemplate('$entity > 20 ? "warm" : "cold"', '21.5'), 'warm');
  assert.equal(runEntityTemplate('$entity * 2', '-3'), -6);
  assert.equal(runEntityTemplate('Math.round($entity) + " °C"', '19.6'), '20 °C');
});

test('statements and the value of the last one still work', () => {
  assert.equal(runEntityTemplate("if ('$entity' == 'on') { 'yes' } else { 'no' }", 'on'), 'yes');
  assert.equal(runEntityTemplate("var x = '$entity'; x.length", 'abc'), 3);
});

test('comments and escaped quotes do not confuse the rewrite', () => {
  assert.equal(runEntityTemplate("'it\\'s $entity' // $entity here is a comment", 'on'), "it's on");
  assert.equal(runEntityTemplate("/* '$entity */ '$entity'", 'off'), 'off');
});

test('a hostile state is data, never code', () => {
  const g = globalThis as any;
  g.__pwned = 0;
  const payloads = [
    "x'; globalThis.__pwned = 1; '",
    'x"; globalThis.__pwned = 1; "',
    'x`; globalThis.__pwned = 1; `',
    '${globalThis.__pwned = 1}',
    "'); globalThis.__pwned = 1; ('",
    '0; globalThis.__pwned = 1',
    'globalThis.__pwned = 1',
    '\\',
    "\n'; globalThis.__pwned = 1 //",
  ];
  for (const p of payloads) {
    assert.equal(runEntityTemplate("'$entity'", p), p, `single-quoted: ${JSON.stringify(p)}`);
    assert.equal(runEntityTemplate('"$entity"', p), p, `double-quoted: ${JSON.stringify(p)}`);
    assert.equal(runEntityTemplate('`$entity`', p), p, `template: ${JSON.stringify(p)}`);
    assert.equal(runEntityTemplate('$entity', p), p, `bare: ${JSON.stringify(p)}`);
  }
  assert.equal(g.__pwned, 0);
  delete g.__pwned;
});

test('the rewritten code never contains the state', () => {
  const code = rewriteEntityTemplate("'$entity' == 'on' && $entity > 1 && `$entity`");
  assert.ok(!code.includes('$entity'), code);
});

test('a method on a string holding $entity applies to the whole string', () => {
  assert.equal(runEntityTemplate("'$entity'.length", 'abcd'), 4);
  assert.equal(runEntityTemplate("'x-$entity'.toUpperCase()", 'on'), 'X-ON');
});
