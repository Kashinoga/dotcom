// The WebDAV reader, checked without a browser and without a server.
//
// Everything here is a promise about a document somebody else wrote. A multistatus arrives from a
// Nextcloud of unknown version behind a proxy of unknown configuration, and the only thing this app
// can do about that is read it correctly — so the reading is a pure function over a string, and the
// strings below are the shapes that have actually been seen in the wild.
//
// The e2e suite will drive the store against a fake server. This is the layer under that: if the
// parser is wrong, every assertion up there fails for a reason nobody can find.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
	parseMultistatus,
	hrefSegments,
	decodeEntities,
	filesUrl,
	target,
	rootSegments,
	type DavConfig
} from '../src/lib/dav.ts';

const ROOT = ['remote.php', 'dav', 'files', 'andrew', 'Notes'];

/** What Nextcloud sends: `d:` prefixes, a self response, and a 404 propstat beside the 200. */
const NEXTCLOUD = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
	<d:response>
		<d:href>/remote.php/dav/files/andrew/Notes/</d:href>
		<d:propstat>
			<d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
			<d:status>HTTP/1.1 200 OK</d:status>
		</d:propstat>
		<d:propstat>
			<d:prop><d:getcontentlength/><d:getetag/></d:prop>
			<d:status>HTTP/1.1 404 Not Found</d:status>
		</d:propstat>
	</d:response>
	<d:response>
		<d:href>/remote.php/dav/files/andrew/Notes/alpha.md</d:href>
		<d:propstat>
			<d:prop>
				<d:resourcetype/>
				<d:getetag>&quot;e1f2a3&quot;</d:getetag>
				<d:getcontentlength>412</d:getcontentlength>
			</d:prop>
			<d:status>HTTP/1.1 200 OK</d:status>
		</d:propstat>
	</d:response>
	<d:response>
		<d:href>/remote.php/dav/files/andrew/Notes/Sub%20folder/</d:href>
		<d:propstat>
			<d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
			<d:status>HTTP/1.1 200 OK</d:status>
		</d:propstat>
	</d:response>
</d:multistatus>`;

describe('reading a multistatus', () => {
	test('the collection asked about is not one of its own contents', () => {
		const out = parseMultistatus(NEXTCLOUD, ROOT);
		assert.equal(out.length, 2);
		assert.deepEqual(
			out.map((e) => e.path),
			['alpha.md', 'Sub folder']
		);
	});

	test('a collection is one that SAYS it is, not one that fails to say it is a file', () => {
		const out = parseMultistatus(NEXTCLOUD, ROOT);
		// A file's resourcetype is present and EMPTY (`<d:resourcetype/>`), so the absence of a
		// collection element is the test and the absence of resourcetype is not.
		assert.equal(out.find((e) => e.name === 'alpha.md')?.dir, false);
		assert.equal(out.find((e) => e.name === 'Sub folder')?.dir, true);
	});

	test('properties come only from the propstat that found them', () => {
		const out = parseMultistatus(NEXTCLOUD, ROOT);
		const file = out.find((e) => e.name === 'alpha.md');
		assert.equal(file?.etag, 'e1f2a3');
		assert.equal(file?.size, 412);
		// The root's OWN etag and length are in a 404 block. Were the block ignored, the folder
		// would come back carrying an empty etag — which is worse than none, because `If-Match`
		// would then be sent with it.
		const folder = parseMultistatus(NEXTCLOUD, ROOT).find((e) => e.name === 'Sub folder');
		assert.equal(folder?.etag, undefined);
		assert.equal(folder?.size, undefined);
	});

	test('the namespace prefix may be anything, or nothing at all', () => {
		// Three documents that mean exactly the same thing. Servers differ, and one Nextcloud has
		// differed from another across versions.
		const shapes = [
			'<D:multistatus xmlns:D="DAV:"><D:response><D:href>/x/one.md</D:href><D:propstat><D:prop><D:resourcetype/></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>',
			'<multistatus xmlns="DAV:"><response><href>/x/one.md</href><propstat><prop><resourcetype/></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>',
			'<ns0:multistatus xmlns:ns0="DAV:"><ns0:response><ns0:href>/x/one.md</ns0:href><ns0:propstat><ns0:prop><ns0:resourcetype/></ns0:prop><ns0:status>HTTP/1.1 200 OK</ns0:status></ns0:propstat></ns0:response></ns0:multistatus>'
		];
		for (const xml of shapes) {
			const out = parseMultistatus(xml, ['x']);
			assert.deepEqual(
				out.map((e) => e.path),
				['one.md'],
				`this prefix was not read: ${xml.slice(0, 40)}`
			);
		}
	});

	test('a href that is not under the root is refused', () => {
		// The one field in this document the server controls completely. A listing that could name
		// its way out of the workspace is a listing whose paths every later verb would act on.
		const xml = `<d:multistatus xmlns:d="DAV:">
			<d:response><d:href>/remote.php/dav/files/andrew/Private/secret.md</d:href>
				<d:propstat><d:prop><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
			</d:response>
			<d:response><d:href>/remote.php/dav/files/andrew/Notes/fine.md</d:href>
				<d:propstat><d:prop><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
			</d:response>
		</d:multistatus>`;
		assert.deepEqual(
			parseMultistatus(xml, ROOT).map((e) => e.path),
			['fine.md']
		);
	});

	test('a weak validator and its quotes come off the etag', () => {
		const xml = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/x/a.md</d:href>
			<d:propstat><d:prop><d:resourcetype/><d:getetag>W/&quot;abc123&quot;</d:getetag></d:prop>
			<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
		// It is handed straight back in `If-Match`, so it is stored the way it is sent.
		assert.equal(parseMultistatus(xml, ['x'])[0].etag, 'abc123');
	});

	test('an absolute href is read the same as a rooted one', () => {
		const xml = `<d:multistatus xmlns:d="DAV:"><d:response>
			<d:href>https://cloud.example.com/x/a.md</d:href>
			<d:propstat><d:prop><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
		</d:response></d:multistatus>`;
		assert.deepEqual(
			parseMultistatus(xml, ['x']).map((e) => e.path),
			['a.md']
		);
	});

	test('an empty multistatus is an empty listing, not a failure', () => {
		assert.deepEqual(parseMultistatus('<d:multistatus xmlns:d="DAV:"/>', ROOT), []);
	});
});

describe('hrefs', () => {
	test('each segment is decoded on its own', () => {
		// The reason this matters: a file may be CALLED `a/b`, which travels as `a%2Fb`. Decoding
		// the whole path at once turns that one document into two folders and a name.
		assert.deepEqual(hrefSegments('/files/a%2Fb.md'), ['files', 'a/b.md']);
		assert.deepEqual(hrefSegments('/files/Sub%20folder/one.md'), ['files', 'Sub folder', 'one.md']);
	});

	test('a href that is not properly encoded still yields its rows', () => {
		// A lone `%` is not valid encoding and `decodeURIComponent` throws on it. One bad name must
		// not take the whole listing with it.
		assert.deepEqual(hrefSegments('/files/100%.md'), ['files', '100%.md']);
	});

	test('entities are decoded, including numeric ones', () => {
		assert.equal(decodeEntities('Tom &amp; Jerry &lt;3 &#66; &#x43;'), 'Tom & Jerry <3 B C');
	});
});

describe('where a request goes', () => {
	const cfg: DavConfig = {
		base: 'https://cloud.example.com/',
		user: 'andrew@example.com',
		token: 'app-password',
		auth: 'basic',
		via: 'direct',
		root: 'Notes/Sub folder',
		name: 'Notes'
	};

	test('a trailing slash on the server does not double up', () => {
		assert.equal(
			filesUrl(cfg),
			'https://cloud.example.com/remote.php/dav/files/andrew%40example.com'
		);
	});

	test('every path segment is encoded, and the separators are not', () => {
		assert.equal(
			target(cfg, 'a b/c.md'),
			'https://cloud.example.com/remote.php/dav/files/andrew%40example.com/Notes/Sub%20folder/a%20b/c.md'
		);
	});

	test('the root the hrefs are read against matches the URL they were asked for', () => {
		// These two are derived separately and must agree, or every row in the listing is refused
		// for being outside a root it is plainly inside.
		const segs = rootSegments(cfg);
		assert.deepEqual(segs, [
			'remote.php',
			'dav',
			'files',
			'andrew@example.com',
			'Notes',
			'Sub folder'
		]);
		assert.deepEqual(hrefSegments(new URL(target(cfg)).pathname), segs);
	});

	test('a workspace at the drive root has no extra segments', () => {
		const whole = { ...cfg, root: '' };
		assert.equal(target(whole), filesUrl(whole));
		assert.equal(target(whole, 'one.md'), `${filesUrl(whole)}/one.md`);
	});
});
