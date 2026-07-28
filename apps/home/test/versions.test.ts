// The version scheme, which is a promise about a NUMBER and therefore checkable without a
// browser. The e2e suite proves the card draws it; this proves the store means it.
//
// The store is worth a test of its own because every one of its rules is a convention rather
// than a type: `at` is a string, `fixes` is a number, and nothing in TypeScript stops an entry
// being written `0.8` or the fix position being left off a line added in a hurry. A version
// nobody can trust is a serial number.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { RELEASES, versionOf, countedCommits } from '../src/lib/versions.ts';

/** collections.features.fixes.commits — all four, always. */
const WHOLE = /^\d+\.\d+\.\d+\.\d+$/;

describe('the version scheme', () => {
	test('every app is versioned in all four positions', () => {
		for (const [code, r] of Object.entries(RELEASES)) {
			assert.match(versionOf(code), /^v\d+\.\d+\.\d+\.\d+$/, `${code} is not a whole version`);
			for (const n of [r.major, r.minor, r.fixes, r.commits])
				assert.ok(Number.isInteger(n) && n >= 0, `${code} has a position that is not a count`);
		}
	});

	test('the fixes position is read out of the store, not invented', () => {
		for (const [code, r] of Object.entries(RELEASES)) {
			// Third of four. Written this way round — split the string rather than rebuild it —
			// so the test fails if `versionOf` ever puts the positions in another order.
			const [, , fixes] = versionOf(code).slice(1).split('.');
			assert.equal(Number(fixes), r.fixes, `${code} draws a fix count it does not hold`);
		}
	});

	test('the commit count falls back to the recorded figure off a git clone', () => {
		// `node --test` is not a Vite transform, so `__GIT_COMMITS__` is not defined here and the
		// store must be reading its own number. This is the shallow-CI-clone path, tested in the
		// one context that reproduces it for free.
		assert.equal(countedCommits, 0);
		for (const [code, r] of Object.entries(RELEASES))
			assert.ok(versionOf(code).endsWith(`.${r.commits}`), `${code} lost its fallback count`);
	});

	test('every recent line carries the whole version it landed in', () => {
		for (const [code, r] of Object.entries(RELEASES)) {
			assert.ok(r.recent.length > 0, `${code} says it is in beta and will not say what changed`);
			for (const f of r.recent) {
				assert.match(f.at, WHOLE, `${code}: "${f.what}" is dated to a partial version`);
				assert.ok(f.what.trim().length > 0, `${code} has a line with nothing on it`);
			}
		}
	});

	test('the list is newest first, and never ahead of the app itself', () => {
		// Position by position, left to right — the first one that differs decides it. A plain
		// string compare would put `0.8.0.99` above `0.8.0.310`.
		const rank = (v: string) => v.split('.').map(Number);
		const cmp = (a: number[], b: number[]) =>
			a.reduce<number>((so, n, i) => (so !== 0 ? so : Math.sign(n - b[i])), 0);
		for (const [code, r] of Object.entries(RELEASES)) {
			const head = [r.major, r.minor, r.fixes, r.commits];
			for (const f of r.recent)
				assert.ok(
					cmp(rank(f.at), head) <= 0,
					`${code}: "${f.what}" landed in a version that has not happened yet`
				);
			for (let i = 1; i < r.recent.length; i += 1)
				assert.ok(
					cmp(rank(r.recent[i - 1].at), rank(r.recent[i].at)) >= 0,
					`${code}: the recent list is out of order at line ${i + 1}`
				);
		}
	});

	test('a beta cannot reach 1.0', () => {
		// The guard itself throws at import, so by getting this far the file has already proved
		// it. What is asserted here is that the rule still has something to guard.
		for (const [code, r] of Object.entries(RELEASES))
			assert.ok(r.major < 1, `${code} is out of beta and should not wear the tag`);
	});
});
