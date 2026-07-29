// What a connection IS, before any of it reaches a network.
//
// The vault is not tested here and cannot be: it is IndexedDB and WebCrypto, neither of which
// exists in `node --test`, and a fake for either would be testing the fake. What IS testable is
// everything that decides WHICH server a password is about to be sent to — and that is the part
// where a mistake is expensive rather than annoying.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
	connectionId,
	configFor,
	defaultName,
	normaliseBase,
	normaliseRoot,
	type Connection
} from '../src/lib/dav-connections.ts';

describe('the server address somebody typed', () => {
	test('is reduced to an origin, however it arrived', () => {
		for (const typed of [
			'cloud.example.com',
			'cloud.example.com/',
			'https://cloud.example.com',
			'https://cloud.example.com/',
			'https://cloud.example.com/index.php/apps/files',
			'  https://cloud.example.com  '
		]) {
			assert.equal(normaliseBase(typed), 'https://cloud.example.com', `${typed} did not reduce`);
		}
	});

	test('and a path is DROPPED rather than kept', () => {
		// Somebody pastes the address bar from their Files app. A base that kept the path would
		// build every DAV URL with `/index.php/apps/files` in front of `/remote.php/dav`, and the
		// server would 404 every single request for a reason nothing on screen could explain.
		assert.equal(
			normaliseBase('https://cloud.example.com/apps/files/Notes'),
			'https://cloud.example.com'
		);
	});

	test('http is REFUSED, never upgraded', () => {
		// Quietly changing what somebody asked for is how a password ends up somewhere it was not
		// meant to go. If they typed http they get told, and they decide.
		assert.equal(normaliseBase('http://cloud.example.com'), null);
		assert.equal(normaliseBase('http://cloud.example.com/remote.php/dav/'), null);
	});

	test('and nonsense is nothing', () => {
		for (const typed of ['', '   ', '::::', 'ht tp://x']) {
			assert.equal(normaliseBase(typed), null, `${JSON.stringify(typed)} was accepted`);
		}
	});

	test('a scheme that is neither survives normalisation and is caught by the proxy rules', () => {
		// This is not a hole: `normaliseBase` answers "what origin is this", and whether an origin
		// may be talked to is `checkTarget`'s question — see test/dav-proxy. Two checks, one each.
		assert.equal(normaliseBase('ftp://cloud.example.com'), 'ftp://cloud.example.com');
	});
});

describe('the folder inside the drive', () => {
	test('has no leading, trailing or doubled separators', () => {
		assert.equal(normaliseRoot('/Notes/'), 'Notes');
		assert.equal(normaliseRoot('Notes//Sub/'), 'Notes/Sub');
		assert.equal(normaliseRoot('  /a/b/c/  '), 'a/b/c');
	});

	test('and the whole drive is the empty string', () => {
		assert.equal(normaliseRoot(''), '');
		assert.equal(normaliseRoot('/'), '');
		assert.equal(normaliseRoot('   '), '');
	});
});

describe('the identity of a connection', () => {
	test('is the server and the user, and not the folder', () => {
		// The same drive opened at two folders is ONE set of credentials. Two rows for it would be
		// two places to forget from and one place the password actually is.
		const a = connectionId('https://cloud.example.com', 'andrew');
		const b = connectionId('https://cloud.example.com', 'andrew');
		assert.equal(a, b);
		assert.notEqual(a, connectionId('https://cloud.example.com', 'someone'));
		assert.notEqual(a, connectionId('https://other.example.com', 'andrew'));
	});
});

describe('what a drive is called', () => {
	test('the folder, where there is one', () => {
		assert.equal(defaultName('https://cloud.example.com', 'Notes'), 'Notes');
		assert.equal(defaultName('https://cloud.example.com', 'Work/Notes'), 'Notes');
	});

	test('and the host where there is not', () => {
		assert.equal(defaultName('https://cloud.example.com', ''), 'cloud.example.com');
	});
});

describe('the config a store is built from', () => {
	const c: Connection = {
		id: 'x',
		name: 'Notes',
		base: 'https://cloud.example.com',
		user: 'andrew',
		via: 'proxy',
		root: 'Notes',
		keep: false
	};

	test('names the connection it came from, so a document can be shelved without it', () => {
		// A shelf row keeps `{ connection, path }` — plain data that outlives the store. Carrying the
		// store instead would carry a token into a list that is written to disk, and IndexedDB will
		// not clone closures anyway. See `DetachedDoc.drive`.
		assert.equal(configFor(c, 't').connection, c.id);
	});

	test('carries the token, and the connection does not', () => {
		// The one place the two are together is the argument list of this function. A `Connection`
		// is written to IndexedDB and held in reactive state; a token is neither.
		assert.equal('token' in c, false);
		assert.equal(configFor(c, 'app-password').token, 'app-password');
	});

	test('and carries the transport across unchanged', () => {
		// There is no fallback between direct and proxied and no place that quietly rewrites this —
		// a request goes the way somebody chose or it fails saying so.
		assert.equal(configFor(c, 't').via, 'proxy');
		assert.equal(configFor({ ...c, via: 'direct' }, 't').via, 'direct');
	});
});
