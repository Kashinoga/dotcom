// What the DAV proxy will and will not forward to.
//
// This is the one route on this site that carries somebody's credential, and every rule it keeps is
// a pure function over a string — so the rules are checked here, exhaustively and without a server,
// rather than trusted to a route that is hard to exercise. A hole in `checkTarget` is not a bug in
// the Text Editor; it is an open relay with this site's name on it.
//
// Each refusal below is a thing somebody would actually try.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
	checkTarget,
	checkDestination,
	METHODS,
	MAX_BODY,
	FORWARD_REQ,
	FORWARD_RES
} from '../src/lib/nextcloud-proxy.ts';

const OK = 'https://cloud.example.com/remote.php/dav/files/andrew/Notes/one.md';

/** The reason, or 'ok' — so a failing assertion says which rule let it through. */
const why = (raw: string | null) => {
	const out = checkTarget(raw);
	return out.ok ? 'ok' : out.why;
};

describe('what the proxy will forward to', () => {
	test('a Nextcloud DAV path on a public https host', () => {
		assert.equal(why(OK), 'ok');
		assert.equal(why('https://cloud.example.com/remote.php/dav/files/andrew/'), 'ok');
		// The login flow, which is how the proxied mode gets a token at all.
		assert.equal(why('https://cloud.example.com/index.php/login/v2'), 'ok');
		assert.equal(why('https://cloud.example.com/index.php/login/v2/poll'), 'ok');
	});

	test('and nothing that is not a URL', () => {
		assert.equal(why(null), 'no target');
		assert.equal(why(''), 'no target');
		assert.equal(why('not a url'), 'not a URL');
		assert.equal(why('/remote.php/dav/files/andrew/'), 'not a URL');
	});
});

describe('what it refuses, and why each one is here', () => {
	test('plain http, because a password travels through this', () => {
		assert.equal(why('http://cloud.example.com/remote.php/dav/files/a/'), 'not https');
	});

	test('other schemes, which are not requests at all', () => {
		for (const raw of [
			'file:///etc/passwd',
			'data:text/plain,hello',
			'ftp://cloud.example.com/remote.php/dav/',
			'ws://cloud.example.com/remote.php/dav/'
		]) {
			assert.notEqual(why(raw), 'ok', `${raw} was allowed`);
		}
	});

	test("the machine it is running on, which in dev is somebody's laptop", () => {
		// On Workers a fetch cannot reach the host anyway. Under `pnpm dev` it is a laptop inside a
		// home network, which is exactly where this would matter and exactly where it gets skipped.
		for (const host of [
			'localhost',
			'127.0.0.1',
			'0.0.0.0',
			'[::1]',
			'nas.local',
			'git.internal',
			'box.home',
			'printer.lan'
		]) {
			assert.equal(
				why(`https://${host}/remote.php/dav/files/a/`),
				'not a public host',
				`${host} was allowed`
			);
		}
	});

	test('private address ranges, all four of them', () => {
		for (const host of [
			'10.0.0.5',
			'192.168.1.10',
			'172.16.0.1',
			'172.31.255.254',
			'169.254.169.254'
		]) {
			assert.equal(
				why(`https://${host}/remote.php/dav/files/a/`),
				'not a public host',
				`${host} was allowed`
			);
		}
		// 172.32 is NOT private — the range stops at 172.31, and a regex that got this wrong would
		// refuse real servers rather than let bad ones through, which is the failure nobody reports.
		assert.equal(why('https://172.32.0.1/remote.php/dav/files/a/'), 'ok');
	});

	test('a port, because that is how a relay becomes a port scanner', () => {
		assert.equal(why('https://cloud.example.com:8443/remote.php/dav/'), 'not the https port');
		assert.equal(why('https://cloud.example.com:22/remote.php/dav/'), 'not the https port');
		// The default, written out, is still the default.
		assert.equal(why('https://cloud.example.com:443/remote.php/dav/files/a/'), 'ok');
	});

	test('credentials in the URL, which would be a second way to pass one', () => {
		assert.equal(why('https://u:p@cloud.example.com/remote.php/dav/'), 'credentials in the URL');
	});

	test('any path that is not the FILES tree or the login flow', () => {
		// `/remote.php/dav/files/`, not `/remote.php/dav/`. Nextcloud puts calendars, contacts,
		// system tags, versions and trash under that prefix too; this app touches one tree, so the
		// relay reaches one tree. An allow-list that permits five because the app uses one is an
		// allow-list doing four fifths of nothing.
		for (const path of [
			'/',
			'/index.php/apps/files',
			'/ocs/v2.php/cloud/users',
			'/remote.php/webdav/',
			'/index.php/login/v2/other',
			'/remote.php/dav',
			'/remote.php/dav/',
			'/remote.php/dav/calendars/andrew/personal',
			'/remote.php/dav/systemtags/',
			'/remote.php/dav/trashbin/andrew/trash'
		]) {
			assert.equal(
				why(`https://cloud.example.com${path}`),
				'not a DAV path',
				`${path} was allowed`
			);
		}
	});

	test('a path that only looks like the DAV tree', () => {
		// `new URL` normalises `..`, so this resolves to `/elsewhere` and fails the path test — the
		// check is on the PARSED pathname for exactly this reason, never on the raw string.
		assert.equal(why('https://cloud.example.com/remote.php/dav/../elsewhere'), 'not a DAV path');
		assert.equal(why('https://cloud.example.com/x/../remote.php/dav/files/a/'), 'ok');
	});
});

describe("a MOVE's destination", () => {
	const target = new URL(OK);

	test('gets every check the target got', () => {
		const bad = checkDestination('http://cloud.example.com/remote.php/dav/files/a/b.md', target);
		assert.equal(bad.ok, false);
		assert.equal(bad.ok === false && bad.why, 'not https');
	});

	test('and must be on the same server', () => {
		// Without this, a move is a way to make one Nextcloud write into another using the first
		// one's credentials.
		const other = checkDestination('https://other.example.com/remote.php/dav/files/a/b.md', target);
		assert.equal(other.ok, false);
		assert.equal(other.ok === false && other.why, 'a different server');
		assert.equal(
			checkDestination('https://cloud.example.com/remote.php/dav/files/a/b.md', target).ok,
			true
		);
	});

	test('and there must be one', () => {
		assert.equal(checkDestination(null, target).ok, false);
	});
});

describe('the other limits', () => {
	test('only the methods a workspace uses', () => {
		for (const m of ['PROPFIND', 'GET', 'HEAD', 'PUT', 'MOVE', 'MKCOL', 'DELETE', 'POST'])
			assert.ok(METHODS.has(m), `${m} should be allowed`);
		// Not refused because they are dangerous — refused because this editor does not do them,
		// and a relay should not be able to do on somebody's behalf what its own app cannot.
		// MKCOL came off this list when folders were added — one method, one gesture. The rest stay
		// out: not because they are dangerous, but because this editor does not do them.
		for (const m of ['PROPPATCH', 'LOCK', 'UNLOCK', 'REPORT', 'COPY', 'TRACE', 'PATCH'])
			assert.ok(!METHODS.has(m), `${m} should not be allowed`);
	});

	test('and a body cap that is generous for a note and useless for a relay', () => {
		assert.equal(MAX_BODY, 4 * 1024 * 1024);
	});

	test('the forwarded headers are exactly what this app sends', () => {
		// An allow-list with entries nobody sends is an allow-list somebody else is welcome to use.
		// `accept` and `ocs-apirequest` were both in here and neither was ever set by this app.
		assert.deepEqual(FORWARD_REQ, [
			'depth',
			'destination',
			'overwrite',
			'if-match',
			'if-none-match',
			'content-type'
		]);
		// And the ones that come back are the ones something reads. `www-authenticate` was here and
		// nothing read it: a 401 is already the whole answer.
		assert.deepEqual(FORWARD_RES, ['etag', 'content-type', 'dav', 'last-modified']);
	});

	test('and neither list carries a credential or a cookie', () => {
		for (const name of ['authorization', 'cookie', 'set-cookie', 'x-dav-authorization']) {
			assert.ok(!FORWARD_REQ.includes(name), `${name} is forwarded up`);
			assert.ok(!FORWARD_RES.includes(name), `${name} is forwarded back`);
		}
	});
});
