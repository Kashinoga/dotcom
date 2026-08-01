import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATTERS, canFormat, readIndent } from '../src/lib/format.ts';
import { kindOf, isOpenable } from '../src/lib/markdown.ts';

// $lib/format's own rules, checked without a browser and without fetching a single parser.
//
// NOTHING HERE IMPORTS PRETTIER, and that is the point of the shape being tested: every parser is
// behind a dynamic import inside a `load` closure, so the table can be read, walked and asserted
// against while the 213 KB TypeScript plugin stays exactly where it belongs. A test that awaited a
// `load()` would be testing Prettier, which Prettier already does.

test('every extension names a parser, and the table holds no empties', () => {
	for (const [ext, f] of Object.entries(FORMATTERS)) {
		assert.equal(ext, ext.toLowerCase(), `${ext} must be lower case — extOf lowercases first`);
		assert.ok(f.parser.length > 0, `${ext} has no parser`);
		assert.equal(typeof f.load, 'function', `${ext} has no loader`);
	}
});

test('canFormat is keyed on the extension and is case-insensitive', () => {
	assert.equal(canFormat('a.ts'), true);
	assert.equal(canFormat('A.TS'), true);
	assert.equal(canFormat('deep.name.with.dots.css'), true);
	assert.equal(canFormat('.prettierrc'), false);
});

test('a name with no extension cannot be formatted', () => {
	// The deliberate opposite of `kindOf`, which reads a bare name as PROSE so that a scratch note
	// opens in the better editor. Being generous there costs nothing; being generous here would put
	// a key on the bar that fails the moment it is pressed.
	assert.equal(kindOf('Ephemeral 0'), 'prose');
	assert.equal(canFormat('Ephemeral 0'), false);
	assert.equal(canFormat(''), false);
	assert.equal(canFormat('README'), false);
});

test('the languages Prettier has no opinion about get no key', () => {
	// Every one of these OPENS and highlights — see LANGUAGES in $lib/code-sheet. The absence is
	// the feature: a Format key on a .py would be a key that cannot do what it says.
	for (const name of ['a.py', 'a.rs', 'a.go', 'a.java', 'a.c', 'a.cpp', 'a.php', 'a.sql']) {
		assert.equal(isOpenable(name), true, `${name} should still open`);
		assert.equal(canFormat(name), false, `${name} should not offer Format`);
	}
});

test('.svelte is not offered — its plugin has no browser build', () => {
	assert.equal(canFormat('App.svelte'), false);
});

test('the app’s own kind formats, in all four spellings', () => {
	for (const name of ['a.md', 'a.markdown', 'a.mdown', 'a.mkd']) {
		assert.equal(canFormat(name), true, name);
		assert.equal(FORMATTERS[name.split('.')[1]].parser, 'markdown');
	}
	// .txt is prose and openable and has no formatter — there is nothing to format about plain text.
	assert.equal(kindOf('a.txt'), 'prose');
	assert.equal(canFormat('a.txt'), false);
});

test('json rides the babel plugin, which is why it costs what a .js costs', () => {
	assert.equal(FORMATTERS.json.parser, 'json');
	assert.equal(FORMATTERS.json.load, FORMATTERS.js.load);
});

// ── readIndent ────────────────────────────────────────────────────────────────
// The one option this app infers rather than defaults. See the note on the function: it is
// EVIDENCE about the document, in the same class as looksBinary reading the bytes.

test('tabs are detected and reported as tabs', () => {
	const src = 'function a() {\n\tif (b) {\n\t\treturn 1;\n\t}\n}\n';
	assert.deepEqual(readIndent(src), { useTabs: true, tabWidth: 2 });
});

test('a two-space file is read as two', () => {
	const src = 'function a() {\n  if (b) {\n    return 1;\n  }\n}\n';
	assert.deepEqual(readIndent(src), { useTabs: false, tabWidth: 2 });
});

test('a four-space file is read as four', () => {
	const src = 'def a():\n    if b:\n        return 1\n    return 2\n';
	assert.deepEqual(readIndent(src), { useTabs: false, tabWidth: 4 });
});

test('the width is the COMMONEST step, not the smallest indent seen', () => {
	// The reason the function does not simply take the minimum non-zero indent. A wrapped argument
	// list is indented to line up with a bracket, which is a width no line of the file actually
	// steps by — here a lone 2 among fours, which `min` would report as the file's indentation.
	const src = [
		'function a() {',
		'    if (b) {',
		'        call(one,',
		'          two);', // a continuation: +2 off the line above, and not the file's step
		'        return 1;',
		'    }',
		'}'
	].join('\n');
	assert.equal(readIndent(src).tabWidth, 4);
});

test('an unindented file falls back to two, which is Prettier’s own default', () => {
	assert.deepEqual(readIndent('a\nb\nc\n'), { useTabs: false, tabWidth: 2 });
	assert.deepEqual(readIndent(''), { useTabs: false, tabWidth: 2 });
});

test('blank lines do not break the run of indents', () => {
	// A blank line between two indented lines is not a return to column zero, and counting it as
	// one would record a step from 0 that the file never takes.
	const src = 'a\n    b\n\n        c\n';
	assert.equal(readIndent(src).tabWidth, 4);
});

test('a mostly-tabbed file with a few space-aligned lines still reads as tabs', () => {
	const src = '\ta\n\tb\n\tc\n\td\n  e\n';
	assert.equal(readIndent(src).useTabs, true);
});

test('an absurd step is ignored rather than reported', () => {
	// A single line indented by 40 for alignment is not a 40-space indentation scheme. Steps above
	// 8 are not counted at all, so this falls back rather than reporting nonsense to Prettier.
	const src = 'a\n' + ' '.repeat(40) + 'b\n';
	assert.deepEqual(readIndent(src), { useTabs: false, tabWidth: 2 });
});
