// Reading what a server says during Login Flow v2.
//
// Step 1 is UNAUTHENTICATED — the whole point of the flow is that no credential exists yet — so its
// answer is JSON from a host that has proved nothing. Everything read out of it is checked, and the
// check that matters is that the server does not get to point this app somewhere else while
// somebody is watching a login page they trust.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readFlow, readGranted, POLL_EVERY_MS, POLL_FOR_MS } from '../src/lib/dav-login.ts';

const BASE = 'https://cloud.example.com';
const GOOD = {
	poll: {
		token: 'poll-token',
		endpoint: 'https://cloud.example.com/index.php/login/v2/poll'
	},
	login: 'https://cloud.example.com/index.php/login/v2/flow/abc'
};

describe("step one's answer", () => {
	test('is read when it names the server the flow was started on', () => {
		const flow = readFlow(GOOD, BASE);
		assert.deepEqual(flow, {
			login: GOOD.login,
			pollToken: 'poll-token',
			pollEndpoint: GOOD.poll.endpoint
		});
	});

	test('and REFUSED when any of it points somewhere else', () => {
		// A poll endpoint on another host would send the app — and the app password, when it
		// arrives — to a third party, while the visitor watches a login page on a server they
		// recognise. The login URL is checked for the same reason from the other end: it is what
		// somebody is about to be sent to.
		assert.equal(
			readFlow(
				{ ...GOOD, poll: { ...GOOD.poll, endpoint: 'https://elsewhere.example/poll' } },
				BASE
			),
			null
		);
		assert.equal(readFlow({ ...GOOD, login: 'https://elsewhere.example/flow' }, BASE), null);
	});

	test('a different scheme or port is a different server', () => {
		// Origin, not hostname: `https://cloud.example.com` and `http://cloud.example.com` are not
		// the same place to send a credential, and neither are two ports.
		assert.equal(readFlow({ ...GOOD, login: 'http://cloud.example.com/flow' }, BASE), null);
		assert.equal(readFlow({ ...GOOD, login: 'https://cloud.example.com:8443/flow' }, BASE), null);
	});

	test('and anything missing or of the wrong type is nothing', () => {
		for (const body of [
			null,
			undefined,
			'a string',
			42,
			{},
			{ login: GOOD.login },
			{ ...GOOD, poll: { endpoint: GOOD.poll.endpoint } },
			{ ...GOOD, poll: { token: 'x', endpoint: 42 } },
			{ ...GOOD, login: '' }
		]) {
			assert.equal(readFlow(body, BASE), null, `${JSON.stringify(body)} was accepted`);
		}
	});
});

describe("step three's answer", () => {
	test('is the user and the app password', () => {
		assert.deepEqual(readGranted({ server: BASE, loginName: 'andrew', appPassword: 'xyz' }), {
			user: 'andrew',
			token: 'xyz'
		});
	});

	test('and both must be there', () => {
		// `loginName` is not a nicety: the DAV path is built from it, so a flow that handed back a
		// password and no name would connect to a URL with `undefined` in the middle of it.
		for (const body of [
			{ appPassword: 'xyz' },
			{ loginName: 'andrew' },
			{ loginName: '', appPassword: 'xyz' },
			{ loginName: 'andrew', appPassword: '' },
			{ loginName: 42, appPassword: 'xyz' }
		]) {
			assert.equal(readGranted(body), null, `${JSON.stringify(body)} was accepted`);
		}
	});
});

describe('the wait', () => {
	test('is long enough to log in and short enough to give up', () => {
		// Somebody may have to find a password manager and a second factor. Five minutes at two
		// seconds is 150 requests through the proxy, which is nothing, and it is well inside the
		// twenty minutes Nextcloud keeps a flow open for.
		assert.equal(POLL_EVERY_MS, 2000);
		assert.equal(POLL_FOR_MS, 5 * 60 * 1000);
		assert.ok(POLL_FOR_MS / POLL_EVERY_MS <= 200);
	});
});
