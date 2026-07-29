// WEBDAV — a workspace that lives on a server. Nextcloud is the one this was written against.
//
// It is a `Store` (see $lib/text-editor-store) and nothing else: the editor cannot tell one of
// these from a folder on the disk, because the seam it goes through was extracted for exactly this.
// Every rule the local store keeps, this one keeps too — a name is a name and not a path, a move
// that would overwrite is refused, a new document takes the first free name — and two of them it
// keeps BETTER, because the server can do them atomically where the file system could only be
// asked twice and hoped at.
//
// THE PARSER IS HAND-WRITTEN, and deliberately. `DOMParser` would do it in three lines and exists
// in every browser this app runs in — and in none of the places this file has to be checkable. A
// multistatus is a very regular document; the whole of what is read out of one is below, in about
// eighty lines, and `node --test` can run every one of them without a browser. That is the same
// trade $lib/markdown already makes, for the same reason.
//
// WHAT IS NOT HERE. There is no cache and no offline queue. A document is read when it is opened
// and written when it is saved, exactly as a local one is — and where a local read fails because
// the file was deleted, a remote one fails because a train went into a tunnel. Those are not the
// same event and the editor does not yet tell them apart. See the note on `write` below.

import type { DetachedDoc, FolderEntry, Listing, Store, WriteError } from '$lib/text-editor-store';
import { dirOf, join, notWritten, WROTE } from '$lib/text-editor-store';

// ── Reading a multistatus ─────────────────────────────────────────────────────
// PROPFIND answers 207 with a document like this, and the parts of it worth having are few:
//
//   <d:multistatus xmlns:d="DAV:">
//     <d:response>
//       <d:href>/remote.php/dav/files/andrew/Notes/one.md</d:href>
//       <d:propstat>
//         <d:prop><d:getetag>"abc"</d:getetag><d:resourcetype/></d:prop>
//         <d:status>HTTP/1.1 200 OK</d:status>
//       </d:propstat>
//       <d:propstat>
//         <d:prop><d:getcontentlength/></d:prop>
//         <d:status>HTTP/1.1 404 Not Found</d:status>
//       </d:propstat>
//     </d:response>
//   </d:multistatus>
//
// TWO THINGS ABOUT THAT SHAPE ARE TRAPS, and both are why this is parsed rather than grepped.
//
// The PREFIX is not fixed. `d:`, `D:`, and no prefix at all with `xmlns="DAV:"` on the root are all
// the same document, and different servers send different ones — Nextcloud has changed which it
// sends between versions. Everything below matches on the LOCAL name and lets the prefix be
// anything or nothing.
//
// And a response carries SEVERAL propstat blocks, one per status. The properties that were not
// found come back in a 404 block, present and empty. Reading a property without first checking
// which block it came out of gets you an empty etag from the 404 block for a file that has a
// perfectly good one in the 200 block above it.

/** A tag, at any prefix or none, self-closing or not. Capture 2 is the inner text. */
const tagRe = (local: string) =>
	new RegExp(
		`<(?:[A-Za-z0-9_.-]+:)?${local}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${local}\\s*>)`,
		'gi'
	);

/** Every occurrence of a tag's inner text, in order. Self-closing tags yield ''. */
function blocks(xml: string, local: string): string[] {
	const out: string[] = [];
	const re = tagRe(local);
	for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1] ?? '');
	return out;
}

/** The first occurrence's inner text, or null if the tag is not there at all. */
function first(xml: string, local: string): string | null {
	const m = tagRe(local).exec(xml);
	return m ? (m[1] ?? '') : null;
}

/** The five named entities XML defines, and numeric references. Nothing else is legal in one. */
export function decodeEntities(s: string): string {
	return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (whole, body: string) => {
		const key = body.toLowerCase();
		if (key === 'amp') return '&';
		if (key === 'lt') return '<';
		if (key === 'gt') return '>';
		if (key === 'quot') return '"';
		if (key === 'apos') return "'";
		if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
		if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
		return whole;
	});
}

/**
 * A href, as the list of path segments it names — DECODED ONE SEGMENT AT A TIME, which is the
 * whole point of doing it this way. A file called `a/b` cannot exist, but a file called `a%2Fb`
 * can, and `decodeURIComponent` on the whole path would turn that one name into two folders.
 * An absolute href (some servers send one) loses its scheme and host on the way in.
 */
export function hrefSegments(href: string): string[] {
	const path = decodeEntities(href.trim()).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
	return path
		.split('/')
		.filter(Boolean)
		.map((seg) => {
			try {
				return decodeURIComponent(seg);
			} catch {
				// A href the server did not encode properly. Its own characters are better than
				// throwing away the whole listing over one row.
				return seg;
			}
		});
}

/** What a PROPFIND says about one thing. */
export type DavEntry = {
	/** Its path RELATIVE to the root the listing was asked for. Never leading-slashed. */
	path: string;
	name: string;
	dir: boolean;
	etag?: string;
	size?: number;
};

/**
 * Read a multistatus. `root` is the segment list of the collection that was asked about — its own
 * response is in the document (Depth: 1 always includes self) and is dropped, because a folder is
 * not a thing inside itself.
 *
 * Anything not underneath the root is dropped too. That is not defensiveness for its own sake: a
 * href is the one field in this document that the server controls completely, and a listing that
 * could name `../../someone-else` is a listing that could put a path into the tree which every
 * later verb would then act on.
 */
export function parseMultistatus(xml: string, root: string[]): DavEntry[] {
	const out: DavEntry[] = [];
	for (const response of blocks(xml, 'response')) {
		const href = first(response, 'href');
		if (href === null) continue;
		const segs = hrefSegments(href);
		if (segs.length <= root.length) continue;
		if (!root.every((s, i) => segs[i] === s)) continue;

		// ONLY the properties that were actually found. See the note above on 404 propstat blocks.
		let props = '';
		for (const propstat of blocks(response, 'propstat')) {
			const status = first(propstat, 'status') ?? '';
			if (!/\s2\d\d\s/.test(` ${status} `)) continue;
			props += first(propstat, 'prop') ?? '';
		}

		const rest = segs.slice(root.length);
		// DECODED, like a href is. An etag is quoted, and a quote inside XML character data is very
		// often sent as `&quot;` — so an etag read raw comes back wearing six characters of entity
		// at each end and goes straight into an `If-Match` that can never match anything.
		const text = (local: string) => {
			const raw = first(props, local);
			return raw === null ? null : decodeEntities(raw).trim();
		};
		const etag = text('getetag');
		const size = text('getcontentlength');
		out.push({
			path: rest.join('/'),
			name: rest[rest.length - 1],
			// `<resourcetype><collection/></resourcetype>` is the only thing that makes it a folder.
			// A file's resourcetype is present and empty, so its ABSENCE cannot be the test.
			dir: /<(?:[A-Za-z0-9_.-]+:)?collection(?:\s[^>]*)?\/?>/i.test(props),
			// Weak validators and quotes both come off: what this is used for is `If-Match`, and it
			// is handed straight back to the server in the form it arrived.
			...(etag ? { etag: etag.replace(/^W\//i, '').replace(/^"|"$/g, '') } : {}),
			...(size && /^\d+$/.test(size) ? { size: Number(size) } : {})
		});
	}
	return out;
}

// ── Reaching the server ───────────────────────────────────────────────────────

export type DavConfig = {
	/** The server's origin — `https://cloud.example.com`, no trailing slash and no `/remote.php`. */
	base: string;
	/** Whose files. It is a path segment in the DAV URL, not only a login. */
	user: string;
	/** An app password (`basic`) or an access token (`bearer`). */
	token: string;
	auth: 'basic' | 'bearer';
	/**
	 * WHICH WAY THE REQUEST GOES, and it is a CHOICE the visitor makes rather than something this
	 * code works out.
	 *
	 * `direct` needs the server to send CORS headers for this origin, which on Nextcloud means the
	 * WebAppPassword app is installed. `proxy` goes through this site's own `/api/nextcloud`, which
	 * needs nothing of the server and everything of the visitor: the credential and the document
	 * both pass through a machine that is neither of theirs.
	 *
	 * THERE IS NO FALLBACK BETWEEN THEM, and there must never be one. A blocked preflight rejects
	 * `fetch` with a bare TypeError that is indistinguishable from a dead network, a bad
	 * certificate or a mistyped host — so "try direct, fall back to the proxy" is not a detection,
	 * it is a guess, and the thing it would be guessing about is where somebody's password goes.
	 */
	via: 'direct' | 'proxy';
	/** A folder inside the user's files to use as the workspace. '' is the whole drive. */
	root: string;
	/** What the head of the tree says. The folder's name, usually. */
	name: string;
};

/** This site's own proxy. See the note on `via`, and the one on `target` below. */
export const DAV_PROXY = '/api/nextcloud';

const enc = (s: string) => encodeURIComponent(s);
const encPath = (p: string) => p.split('/').filter(Boolean).map(enc).join('/');

/** Where the user's files begin, as a URL. */
export const filesUrl = (cfg: DavConfig) =>
	`${cfg.base.replace(/\/+$/, '')}/remote.php/dav/files/${enc(cfg.user)}`;

/** The absolute URL of a path in the workspace. Also what a MOVE's `Destination` has to be. */
export const target = (cfg: DavConfig, path = '') => {
	const under = join(cfg.root, path);
	return under ? `${filesUrl(cfg)}/${encPath(under)}` : filesUrl(cfg);
};

/** The segments the workspace root sits at, for reading hrefs against. */
export const rootSegments = (cfg: DavConfig) =>
	hrefSegments(`/remote.php/dav/files/${enc(cfg.user)}/${encPath(cfg.root)}`);

function authHeader(cfg: DavConfig): string {
	if (cfg.auth === 'bearer') return `Bearer ${cfg.token}`;
	// btoa is Latin-1 only, and both a username and an app password can hold anything. Encode the
	// pair as UTF-8 bytes first, which is what every server expects and what btoa cannot do alone.
	const bytes = new TextEncoder().encode(`${cfg.user}:${cfg.token}`);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return `Basic ${btoa(binary)}`;
}

/**
 * One request, either way round.
 *
 * In PROXY mode the destination travels in a header rather than in the path, because a DAV path
 * holds slashes and percent-encoded characters that a route parameter would have to be escaped
 * into and out of twice. THE PROXY MUST NOT TRUST IT: an endpoint that forwards to whatever URL a
 * header names is an open relay with this site's name on it, so `/api/nextcloud` has to require
 * https, refuse private and loopback addresses, and refuse anything that is not a `/remote.php/dav`
 * path. None of those checks can live here — a check the client makes is a check an attacker skips.
 */
async function dav(
	cfg: DavConfig,
	method: string,
	url: string,
	init: { headers?: Record<string, string>; body?: string } = {}
): Promise<Response | null> {
	const headers: Record<string, string> = { ...init.headers };
	try {
		if (cfg.via === 'direct') {
			headers.authorization = authHeader(cfg);
			return await fetch(url, { method, headers, body: init.body });
		}
		headers['x-dav-target'] = url;
		headers['x-dav-authorization'] = authHeader(cfg);
		return await fetch(DAV_PROXY, { method, headers, body: init.body });
	} catch {
		// Offline, blocked by CORS, DNS gone, certificate refused — one TypeError for all of them,
		// with nothing in it worth reading. Null is "the request did not happen".
		return null;
	}
}

/** The properties worth asking for. Asking for all of them fetches every Nextcloud extension. */
const PROPS =
	'<?xml version="1.0"?>' +
	'<d:propfind xmlns:d="DAV:"><d:prop>' +
	'<d:resourcetype/><d:getetag/><d:getcontentlength/>' +
	'</d:prop></d:propfind>';

// How much of one folder is worth drawing, and how deep a path is worth following. The depth is
// looser than the local store's six: a walk that cost a recursive descent had to stop early, and
// one folder at a time costs one request whenever somebody asks for it.
const MAX_IN_DIR = 500;
const MAX_DEPTH = 8;

/**
 * WHAT HAPPENED WHEN WE TRIED THE SERVER ONCE. Used by the connect form and by nothing else — the
 * store's own verbs answer in the words a ROW can use, and this answers in the words somebody
 * filling in a form needs, which are not the same words.
 *
 * `blocked` is the one worth having and the one that cannot be known for certain. A request the
 * browser refused to make rejects with a bare TypeError carrying nothing: offline, bad certificate,
 * mistyped host and a CORS preflight that was never answered all arrive identically. In DIRECT mode
 * the overwhelmingly likely cause is the last of those, because the other three would have been
 * noticed before somebody got as far as typing an app password — so the form says so as the first
 * thing to check, and says it as a suggestion.
 */
export type Probe = 'ok' | 'refused' | 'no-such-user' | 'blocked' | 'failed';

/** One PROPFIND at the workspace root, to find out whether any of this works. */
export async function probe(cfg: DavConfig): Promise<Probe> {
	const res = await dav(cfg, 'PROPFIND', target(cfg), {
		headers: { depth: '0', 'content-type': 'application/xml; charset=utf-8' },
		body: PROPS
	});
	// Null is the request not happening at all. See `blocked` above for why the mode decides how
	// this is described rather than the failure describing itself.
	if (!res) return 'blocked';
	if (res.status === 207) return 'ok';
	// THROUGH THE PROXY a dead upstream is not a dead fetch — the route answers 502 and the request
	// itself succeeded, so the TypeError that means `blocked` in direct mode never happens. Without
	// this, an unreachable server in proxied mode reported "the server answered, but not in a way
	// this understands", which is true of the proxy and useless about the server.
	if (res.status === 502 || res.status === 504) return 'blocked';
	if (res.status === 401 || res.status === 403) return 'refused';
	// A good password and a wrong username: the credential is accepted and the path under
	// `/files/<user>/` is somebody else's or nobody's.
	if (res.status === 404) return 'no-such-user';
	return 'failed';
}

/**
 * An HTTP status, said in the words a row can use. 412 is the interesting one and it means two
 * different things on two different requests — "somebody else changed it" after `If-Match`, and
 * "that name is taken" after `If-None-Match: *` or `Overwrite: F` — so only the caller that sent
 * the precondition can name it, and only `write` calls this with a 412 in play.
 */
function whyStatus(status: number): WriteError {
	if (status === 412 || status === 409) return 'conflict';
	// The proxy's own word for an upstream it could not reach. See `probe`.
	if (status === 502 || status === 504) return 'offline';
	if (status === 401 || status === 403) return 'denied';
	if (status === 404 || status === 410) return 'gone';
	return 'failed';
}

/**
 * A WORKSPACE ON A SERVER.
 *
 * `list` walks BREADTH FIRST, one PROPFIND per folder at `Depth: 1`. Not `Depth: infinity`, which
 * would be one request for the whole tree and which Sabre — the DAV server Nextcloud is built on —
 * refuses by default. Breadth first rather than the local store's depth first because the two are
 * paying different costs: a recursive descent on a disk is free, and over a network it is a round
 * trip per folder, so the shallow rows (which are the ones somebody is most likely to want) should
 * not wait behind a deep branch.
 */
export function davStore(cfg: DavConfig, openable: RegExp): Store {
	const root = rootSegments(cfg);
	/** The last etag seen for a path — what makes a save able to notice it would clobber someone. */
	const etags = new Map<string, string>();

	async function propfind(path: string): Promise<DavEntry[] | null> {
		const res = await dav(cfg, 'PROPFIND', target(cfg, path), {
			headers: { depth: '1', 'content-type': 'application/xml; charset=utf-8' },
			body: PROPS
		});
		if (!res || res.status !== 207) return null;
		const at = path ? [...root, ...path.split('/')] : root;
		const entries = parseMultistatus(await res.text(), at);
		for (const e of entries) {
			if (e.etag) etags.set(join(path, e.path), e.etag);
		}
		return entries;
	}

	/** One folder's own children, as a Listing. Null if that folder could not be read. */
	async function level(at: string): Promise<Listing | null> {
		const entries = await propfind(at);
		if (!entries) return null;
		const files: FolderEntry[] = [];
		const dirs: string[] = [];
		for (const e of entries) {
			const path = join(at, e.path);
			// Dot-directories are skipped and NOTHING ELSE IS. The local store's list (node_modules,
			// dist, build) is right for a source tree and wrong here: a cloud drive is somebody's
			// documents, and hiding a folder they called `build` from their own Documents is not a
			// service. Hidden files are hidden everywhere by the same convention, so those still go.
			if (e.dir) {
				if (!e.name.startsWith('.') && path.split('/').length < MAX_DEPTH) dirs.push(path);
			} else if (openable.test(e.name)) {
				files.push({ name: e.name, path });
			}
		}
		files.sort((a, b) => a.path.localeCompare(b.path));
		dirs.sort((a, b) => a.localeCompare(b));
		// A CAP PER FOLDER, not per tree. The old one guarded an unbounded walk of the whole drive;
		// there is no such walk now, and what is left to guard is a single folder with more rows in
		// it than anybody is going to read.
		return { files: files.slice(0, MAX_IN_DIR), dirs: dirs.slice(0, MAX_IN_DIR) };
	}

	const store: Store = {
		kind: 'dav',
		name: cfg.name || cfg.root.split('/').pop() || cfg.user,
		writable: true,

		/**
		 * THE ROOT LEVEL ONLY. It walked the whole tree once — breadth first, one PROPFIND per
		 * folder — and that is a round trip per folder before anything at all is on screen. A drive
		 * with forty folders in it took forty requests to show the first document.
		 *
		 * So the tree arrives one level at a time and the rest comes through `listDir` as folders
		 * are opened. Two consequences the workspace has to carry, both of them real: a folder that
		 * has not been fetched cannot be told from an empty one unless it is drawn SHUT, and a
		 * folder tally would be a confident lie. See the drive's rows in $lib/TextEditor.
		 */
		async list() {
			return level('');
		},

		listDir: (path: string) => level(path),

		async read(path) {
			const res = await dav(cfg, 'GET', target(cfg, path));
			if (!res?.ok) return null;
			// Kept from the RESPONSE rather than from the listing: this is the version of the
			// document now on the sheet, and it is the one a later save must not silently replace.
			const tag = res.headers.get('etag');
			if (tag) etags.set(path, tag.replace(/^W\//i, '').replace(/^"|"$/g, ''));
			try {
				return await res.text();
			} catch {
				return null;
			}
		},

		/**
		 * `If-Match` on the etag we last saw, so a document changed on another machine since it was
		 * opened comes back 412 instead of being overwritten. Two devices editing one note is not an
		 * edge case on a cloud drive — it is what a cloud drive is FOR — where two windows onto one
		 * local file is a thing somebody had to go out of their way to arrange.
		 *
		 * A 412 IS THE GOOD OUTCOME OF A BAD SITUATION: nothing was lost, and the only reason the
		 * visitor has to be told is that they are the one holding the other version. Saying nothing
		 * — which is what a bare false would leave the editor doing — would let them close a tab
		 * over work they still had.
		 */
		async write(path, body) {
			const known = etags.get(path);
			const res = await dav(cfg, 'PUT', target(cfg, path), {
				headers: {
					'content-type': 'text/markdown; charset=utf-8',
					...(known ? { 'if-match': `"${known}"` } : {})
				},
				body
			});
			if (!res) return notWritten('offline');
			if (!res.ok) return notWritten(whyStatus(res.status));
			const tag = res.headers.get('etag');
			if (tag) etags.set(path, tag.replace(/^W\//i, '').replace(/^"|"$/g, ''));
			else etags.delete(path); // whatever we had is stale; a re-read will fetch the new one
			return WROTE;
		},

		/**
		 * `If-None-Match: *` is "create, and fail if it is already there" — one request that cannot
		 * race. The local store has to ask whether the name is taken and then write, and something
		 * can always land in between; here the server decides, and a 412 simply means try the next
		 * name. Same rule as `freeName`, kept properly.
		 */
		async create(dir, base, ext, body) {
			for (let n = 1; n < 100; n += 1) {
				const name = n === 1 ? `${base}${ext}` : `${base} ${n}${ext}`;
				const path = join(dir, name);
				const res = await dav(cfg, 'PUT', target(cfg, path), {
					headers: { 'content-type': 'text/markdown; charset=utf-8', 'if-none-match': '*' },
					body
				});
				if (!res) return null;
				if (res.status === 412) continue;
				if (!res.ok) return null;
				const tag = res.headers.get('etag');
				if (tag) etags.set(path, tag.replace(/^W\//i, '').replace(/^"|"$/g, ''));
				return { name, path };
			}
			return null;
		},

		async rename(path, to) {
			// A name is a NAME, not a path. The server would happily take `../elsewhere/x.md` as a
			// Destination, which is precisely why the check is here and not only in the text field.
			if (!to || /[/\\]/.test(to)) return null;
			return relocate(path, join(dirOf(path), to));
		},

		async move(path, dir) {
			if (dirOf(path) === dir) return null;
			return relocate(path, join(dir, path.slice(path.lastIndexOf('/') + 1)));
		},

		async remove(path) {
			const res = await dav(cfg, 'DELETE', target(cfg, path));
			// 404 counts. The row was asking for the document to be gone, and it is.
			if (!res || (!res.ok && res.status !== 404)) return false;
			etags.delete(path);
			return true;
		},

		/**
		 * NOTHING, for now — and it is the one place the seam does not yet reach. `detach` is what
		 * the shelf takes when a workspace is changed underneath the open document, and it can hold
		 * a File or a handle. A document on a server is neither. So a cloud document that is open
		 * when the workspace changes loses its row rather than landing on the shelf, which is a
		 * smaller version of the hole `shelveTheOpenOne` was written to close. The shelf needs a
		 * third kind of row before this can answer.
		 */
		detach: (): DetachedDoc | null => null
	};

	/** MOVE, which is rename and move both — the only difference is how far the destination is. */
	async function relocate(path: string, to: string): Promise<FolderEntry | null> {
		if (!to || to === path) return null;
		const res = await dav(cfg, 'MOVE', target(cfg, path), {
			headers: {
				destination: target(cfg, to),
				// `Overwrite: F` is the whole of the "a name already taken cancels it" rule, made by
				// the server in the same breath as the move. The local store has to look first and
				// then act, with a gap in between that another program can write into.
				overwrite: 'F'
			}
		});
		if (!res?.ok) return null;
		const tag = etags.get(path);
		etags.delete(path);
		if (tag) etags.set(to, tag);
		return { name: to.slice(to.lastIndexOf('/') + 1), path: to };
	}

	return store;
}
