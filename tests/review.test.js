import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatus, parseDiff, addedDiff, anchor, fingerprint, draftKey, decodeDraft, feedback } from '../mods/agent-review/review.js';

test('NUL status preserves spaces, tabs, Unicode and newlines in paths', () => {
  assert.deepEqual(parseStatus(' M src/a b.js\0?? 雪\t\n.txt\0').map(f => f.path), ['src/a b.js', '雪\t\n.txt']);
});
test('diff headers are not code and old/new line anchors remain distinct', () => {
  const rows = parseDiff('--- a/x\n+++ b/x\n@@ -7,2 +7,2 @@\n-old\n+new\n same\n\\ No newline at end of file\n');
  assert.equal(rows.length, 5);
  assert.deepEqual(anchor(rows[1]), { side: 'old', line: 7, code: 'old' });
  assert.deepEqual(anchor(rows[2]), { side: 'new', line: 7, code: 'new' });
  assert.equal(anchor(rows[3]).line, 8);
  assert.equal(anchor(rows[4]), null);
});
test('empty files do not invent a first line; new files preserve blank lines', () => {
  assert.equal(addedDiff(''), '');
  assert.equal(parseDiff(addedDiff('a\n\nb\n')).filter(anchor).length, 3);
});
test('multiple hunks reset their line numbers', () => {
  const rows = parseDiff('@@ -1 +1 @@\n-a\n+b\n@@ -80 +81 @@\n+c\n');
  assert.equal(anchor(rows.at(-1)).line, 81);
});
test('drafts are scoped by machine and worktree and reject damaged storage', () => {
  assert.notEqual(draftKey(null, '/repo'), draftKey('remote', '/repo'));
  assert.notEqual(draftKey(null, '/repo'), draftKey(null, '/repo-worktree'));
  assert.throws(() => decodeDraft('{broken'));
  assert.throws(() => decodeDraft('{"version":2,"comments":[]}'));
  assert.deepEqual(decodeDraft(null), []);
});
test('feedback retains deleted code and flags stale anchors', () => {
  const comment = { id: '1', path: 'a.js', line: 4, side: 'old', code: 'old()', body: 'Keep this behavior', fingerprint: fingerprint('old diff'), stale: true };
  const comments = decodeDraft(JSON.stringify({ version: 1, comments: [comment] }));
  const text = feedback('/repo', null, comments);
  assert.match(text, /old version/);
  assert.match(text, /RECHECK/);
  assert.match(text, /old\(\)/);
  assert.notEqual(fingerprint('old diff'), fingerprint('new diff'));
});
