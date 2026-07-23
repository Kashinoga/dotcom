import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

// Edit Mode's other half: write the edited copy back to src/lib/content.json.
//
// DEV ONLY, and not by convention — by the first line of each handler. `dev` is a build-time
// constant, so in a production build the guard collapses: both handlers compile down to an
// unconditional `error(404)` as their first statement, and everything after it — the body read,
// the `node:fs` import, the write — is unreachable. Check for yourself in
// .svelte-kit/output/server/entries/endpoints/api/content/.
//
// The deployed site also runs on Cloudflare Workers, where there is no filesystem to write to. But
// a route whose safety depends on the host lacking a capability is not a safe route, so that is a
// second line of defence and not the first.
//
// Why it exists: Save used to copy the whole content object to the clipboard and ask you to paste
// it back into the source. That works, and it is also the step where an edit gets lost — the copy
// only becomes real if someone remembers to do something with it. Writing the file means the edit
// IS the change, and `git diff` is where you review it.
//
// The write is deliberately narrow. It rebuilds the file from the three known top-level keys and
// serialises them itself, so a malformed or hostile payload cannot write arbitrary content or an
// arbitrary path — there is one path, and it is resolved here, not taken from the request.

const RELATIVE = 'src/lib/content.json';

/** Only these block fields hold text. Anything else in a block is dropped. */
const FIELDS = ['h', 'sub', 'p', 'img', 'quote', 'code', 'email'];

type Payload = {
	pages?: Record<string, Array<Record<string, unknown>>>;
	settings?: Record<string, unknown>;
	notes?: Record<string, unknown>;
};

/** Keep only string-valued known fields, in the order the block declared them. */
const cleanBlock = (block: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(block).filter(([f, v]) => FIELDS.includes(f) && typeof v === 'string')
	);

const cleanStrings = (obj: Record<string, unknown> | undefined) =>
	Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => typeof v === 'string'));

/**
 * Serialise the file so that ONE BLOCK IS ONE LINE.
 *
 * `JSON.stringify(_, null, '\t')` puts every block across three lines, which makes changing a
 * single paragraph a nine-line diff and reformats the whole file the first time it runs. Writing
 * to a file instead of the clipboard is only worth doing if the diff is readable afterwards, so
 * the format is worth the twenty lines it takes to control.
 *
 * Values still go through JSON.stringify individually, so quoting and escaping are the real
 * thing rather than something hand-rolled.
 */
function serialise(next: { notes: object; pages: object; settings: object }): string {
	const q = JSON.stringify;
	const comma = (i: number, n: number) => (i < n - 1 ? ',' : '');
	const flat = (obj: object, indent: string) => {
		const entries = Object.entries(obj);
		return entries.map(([k, v], i) => `${indent}${q(k)}: ${q(v)}${comma(i, entries.length)}`);
	};

	const out = ['{', '\t"notes": {', ...flat(next.notes, '\t\t'), '\t},', '\t"pages": {'];

	const pages = Object.entries(next.pages as Record<string, Array<Record<string, string>>>);
	pages.forEach(([code, blocks], i) => {
		out.push(`\t\t${q(code)}: [`);
		blocks.forEach((block, j) => {
			const body = Object.entries(block)
				.map(([f, v]) => `${q(f)}: ${q(v)}`)
				.join(', ');
			out.push(`\t\t\t{ ${body} }${comma(j, blocks.length)}`);
		});
		out.push(`\t\t]${comma(i, pages.length)}`);
	});

	out.push('\t},', '\t"settings": {', ...flat(next.settings, '\t\t'), '\t}', '}');
	return out.join('\n') + '\n';
}

export const GET: RequestHandler = async () => {
	if (!dev) error(404, 'Not found');
	const { readFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	return json(JSON.parse(await readFile(resolve(process.cwd(), RELATIVE), 'utf8')));
};

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');

	const body = (await request.json()) as Payload;
	if (!body || typeof body !== 'object' || !body.pages) error(400, 'Expected { pages, settings }');

	const pages = Object.fromEntries(
		Object.entries(body.pages).map(([code, blocks]) => [
			code,
			(Array.isArray(blocks) ? blocks : [])
				.filter((b) => b && typeof b === 'object')
				.map(cleanBlock)
		])
	);

	// `notes` is provenance, not copy — Edit Mode never touches it, so a payload that omits it
	// must not erase it. Read the file back and keep whatever is already there.
	const { readFile, writeFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');
	const path = resolve(process.cwd(), RELATIVE);
	const existing = JSON.parse(await readFile(path, 'utf8')) as Payload;

	const next = {
		notes: cleanStrings(body.notes ?? existing.notes),
		pages,
		settings: cleanStrings(body.settings)
	};

	// Tabs and a trailing newline, to match every other file in the repo — so saving copy does
	// not show up in a diff as a whitespace change to the whole file.
	await writeFile(path, serialise(next), 'utf8');

	return json({ ok: true, path: RELATIVE });
};
