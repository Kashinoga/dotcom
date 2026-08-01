// THE INSTALL MANIFEST — static/text-editor.webmanifest, which is what makes the Text Editor
// installable as an app of its own.
//
// Worth a test for the reason the version store is: every rule in it is a convention rather than
// a type. It is a JSON file nothing imports, so a typo in an icon path, a scope that no longer
// contains the app, or an extension the editor will not open are all things that fail SILENTLY —
// in the one place nobody looks, which is a fresh machine installing the app for the first time.
//
// The checks here are only the ones that can be wrong INTERNALLY. Whether Chromium likes the
// result is not knowable from Node, and is not this file's business.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// From the engine rather than from the editor's state module: that one is runes all the way
// down and cannot be imported outside a Svelte build. See the note on OPENABLE itself.
import { isOpenable } from '../src/lib/markdown.ts';
import { viewToSlug } from '../src/lib/views.ts';

const STATIC = resolve(dirname(fileURLToPath(import.meta.url)), '../static');
const manifest = JSON.parse(readFileSync(resolve(STATIC, 'text-editor.webmanifest'), 'utf8'));

/** A path the manifest names, as a file on disk. Every one of them is served out of `static/`. */
const asset = (url: string) => resolve(STATIC, url.replace(/^\//, ''));

describe('the install manifest', () => {
	test('it opens the editor, and the editor is where the site says it is', () => {
		// Not a hard-coded '/apps/text-editor' twice over: the path is the register's, and a place
		// that gets renamed should fail HERE rather than install an app that opens on a 404.
		const path = `/${viewToSlug({ kind: 'port', code: 'TEXT' })}`;
		assert.equal(manifest.start_url, path, 'the app would open somewhere other than the editor');
		assert.equal(manifest.scope, path, 'the scope is not the editor');
		assert.equal(manifest.id, path);
	});

	test('the start URL is inside the scope', () => {
		// Outside it, the installed window opens and immediately hands the visitor back to a
		// browser tab — the one failure that looks exactly like the app not being installed.
		assert.ok(
			manifest.start_url.startsWith(manifest.scope),
			'the app would launch out of its own scope'
		);
	});

	test('every icon it names is on disk, at a size a launcher will take', () => {
		const sizes = new Set<string>();
		for (const icon of manifest.icons) {
			assert.ok(existsSync(asset(icon.src)), `${icon.src} is named but not baked`);
			assert.equal(icon.type, 'image/png', `${icon.src} is not a PNG`);
			if (icon.purpose === 'any') sizes.add(icon.sizes);
		}
		// 192 is the floor Chromium will offer an install for, and 512 is what a splash screen and
		// a Start menu tile are cut from. Below either, the install is refused or the icon is a
		// letter in a circle.
		assert.ok(sizes.has('192x192'), 'no 192px icon — Chromium will not offer an install');
		assert.ok(sizes.has('512x512'), 'no 512px icon — the launcher has nothing to scale from');
	});

	test('a maskable icon is offered as well as a plain one', () => {
		// A launcher that crops (Android's, and Windows in places) crops the PLAIN icon to whatever
		// shape it likes, which takes the nib's corners off. The maskable one is drawn smaller for
		// exactly this — see scripts/gen-icons.mjs.
		const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
		assert.ok(purposes.includes('any'), 'no plain icon');
		assert.ok(purposes.includes('maskable'), 'no maskable icon — cropped launchers will cut it');
	});

	test('it claims only the extensions the editor will actually open', () => {
		// A file handler is a promise to the operating system: double-click this and that app opens
		// it. Claiming an extension the editor refuses at the door (see OPENABLE) is how a file
		// manager gets taught to hand documents to an app that will show a blank sheet.
		for (const handler of manifest.file_handlers) {
			assert.ok(handler.action.startsWith(manifest.scope), 'a file handler opens outside the app');
			for (const list of Object.values(handler.accept) as string[][]) {
				for (const ext of list) {
					assert.match(ext, /^\./, `${ext} is not written as an extension`);
					assert.ok(isOpenable(`x${ext}`), `${ext} is claimed but the editor will not open it`);
				}
			}
		}
	});

	test('it is a standalone app rather than a bookmark', () => {
		// `browser` display is a manifest that installs a shortcut to a tab. The whole point of
		// this one is the window without an address bar.
		assert.equal(manifest.display, 'standalone');
		assert.ok(manifest.name.length > 0 && manifest.short_name.length > 0);
	});
});
