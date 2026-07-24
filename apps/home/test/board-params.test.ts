// The Air Traffic board's four URL parameters.
//
// Each one is a round trip: the board holds a value, `+page.ts` writes it as a token, and a
// visitor opening that link resolves the token back to the value. The rule throughout is that
// the DEFAULT carries no token — so `?field=grm` and `?range=60` normalise away instead of
// sticking to the URL, and the same board is always the same string.
//
// Getting this wrong is quiet. A token that resolves to nothing drops to the default, so a
// shared link opens the wrong board and says nothing about it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
	AIRPORTS,
	DEFAULT_FIELD,
	fieldToken,
	resolveField,
	fieldByIata
} from '../src/lib/fields.ts';
import {
	RANGES,
	DEFAULT_RANGE,
	INTERVALS,
	DEFAULT_POLL_MS,
	rangeToken,
	resolveRange,
	refreshToken,
	resolveRefresh,
	expandedToken,
	resolveExpanded
} from '../src/lib/scope.ts';

describe('?field=', () => {
	test('the default field carries no token', () => {
		assert.equal(fieldToken(DEFAULT_FIELD), null);
	});
	test('any other field is its lowercase IATA', () => {
		const sfo = resolveField('sfo');
		assert.ok(sfo);
		assert.equal(fieldToken(sfo), 'sfo');
	});
	test('resolves IATA or ICAO, in any casing', () => {
		for (const token of ['sfo', 'SFO', 'ksfo', 'KSFO', ' sfo ']) {
			assert.equal(resolveField(token)?.icao, 'KSFO', token);
		}
	});
	test('names nothing for a field the board does not have', () => {
		assert.equal(resolveField('paris'), null);
		assert.equal(resolveField(''), null);
		assert.equal(resolveField(null), null);
		assert.equal(resolveField(undefined), null);
	});
	test('every field round-trips through its token', () => {
		for (const a of AIRPORTS) {
			const token = fieldToken(a);
			// A null here is the failure this test is for: a field whose own token does not
			// resolve back to it. Assert it before reading through, so the message names the field.
			const back = token ? resolveField(token) : DEFAULT_FIELD;
			assert.ok(back, `${a.iata} does not resolve from its own token ${token}`);
			assert.equal(back.icao, a.icao, a.iata);
		}
	});
	test('fieldByIata takes the code page data carries', () => {
		assert.equal(fieldByIata('ORD')?.name, 'Chicago O’Hare');
		assert.equal(fieldByIata('ord')?.name, 'Chicago O’Hare');
		// It is IATA only — an ICAO code here means the caller passed the wrong field.
		assert.equal(fieldByIata('KORD'), null);
		assert.equal(fieldByIata(null), null);
	});
	test('IATA and ICAO codes are unique, or a link would be ambiguous', () => {
		assert.equal(new Set(AIRPORTS.map((a) => a.iata)).size, AIRPORTS.length);
		assert.equal(new Set(AIRPORTS.map((a) => a.icao)).size, AIRPORTS.length);
	});
});

describe('?range=', () => {
	test('the default radius carries no token', () => {
		assert.equal(rangeToken(DEFAULT_RANGE), null);
	});
	test('any other radius is its plain number', () => {
		assert.equal(rangeToken(250), '250');
	});
	test('resolves only the radii the board offers', () => {
		assert.equal(resolveRange('100'), 100);
		assert.equal(resolveRange(' 100 '), 100);
		// An arbitrary radius would ask the upstream for a distance no control could then show
		// as selected.
		assert.equal(resolveRange('137'), null);
		assert.equal(resolveRange('abc'), null);
		assert.equal(resolveRange(''), null);
		assert.equal(resolveRange(null), null);
	});
	test('every radius round-trips', () => {
		for (const nm of RANGES) {
			const token = rangeToken(nm);
			assert.equal(token ? resolveRange(token) : DEFAULT_RANGE, nm, String(nm));
		}
	});
	test('the default is one of the offered radii', () => {
		assert.ok((RANGES as readonly number[]).includes(DEFAULT_RANGE));
	});
});

describe('?refresh=', () => {
	test('the default cadence carries no token', () => {
		assert.equal(refreshToken(DEFAULT_POLL_MS), null);
	});
	test('any other cadence is its label, which reads as what it does', () => {
		assert.equal(refreshToken(30000), '30s');
		assert.equal(refreshToken(300000), '5m');
	});
	test('a cadence the board does not offer has no token', () => {
		assert.equal(refreshToken(45000), null);
	});
	test('resolves by label, in any casing', () => {
		assert.equal(resolveRefresh('30s'), 30000);
		assert.equal(resolveRefresh('30S'), 30000);
		assert.equal(resolveRefresh(' 1m '), 60000);
		assert.equal(resolveRefresh('90s'), null);
		assert.equal(resolveRefresh(null), null);
	});
	test('every cadence round-trips', () => {
		for (const { ms } of INTERVALS) {
			const token = refreshToken(ms);
			assert.equal(token ? resolveRefresh(token) : DEFAULT_POLL_MS, ms, String(ms));
		}
	});
	test('the default is one of the offered cadences', () => {
		assert.ok(INTERVALS.some((i) => i.ms === DEFAULT_POLL_MS));
	});
	test('labels are unique, or one would shadow another', () => {
		assert.equal(new Set(INTERVALS.map((i) => i.label)).size, INTERVALS.length);
	});
});

describe('?expanded=', () => {
	test('compact is the default and carries no param', () => {
		assert.equal(expandedToken(false), null);
		assert.equal(expandedToken(true), '1');
	});
	test('only `1` counts', () => {
		assert.equal(resolveExpanded('1'), true);
		assert.equal(resolveExpanded(' 1 '), true);
		assert.equal(resolveExpanded('true'), false);
		assert.equal(resolveExpanded('0'), false);
		assert.equal(resolveExpanded(''), false);
		assert.equal(resolveExpanded(null), false);
		assert.equal(resolveExpanded(undefined), false);
	});
});
