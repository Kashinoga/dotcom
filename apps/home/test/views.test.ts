// The URL layer, and the register behind it.
//
// These are the rules a shared link depends on, and none of them are visible to `svelte-check`
// or reachable from a browser test without navigating to every URL in turn. The e2e `deeplink`
// suite proves the round trip works through a real server; this proves the resolution itself,
// including the cases a browser can't easily reach — a title that would collide, a place that
// hangs off nothing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	slugToView,
	viewToSlug,
	viewPath,
	sameView,
	viewTitle,
	viewDescription,
	isViewSlug,
	slugify,
	SITE
} from '../src/lib/views.ts';
import {
	airports,
	children,
	parentOf,
	connections,
	places,
	codes,
	HUB,
	PORT_ICONS,
	FAVICONS,
	NEW_HEADER,
	FULL_APPS,
	BAR_HEADER,
	DOCS_BLEED,
	PANEL_CARDS,
	APP_CARDS,
	accent,
	portDescriptions
} from '../src/lib/places.ts';

describe('slugify', () => {
	test('lowercases and hyphenates', () => {
		assert.equal(slugify('Air Traffic'), 'air-traffic');
		assert.equal(slugify('Presentation Builder'), 'presentation-builder');
	});
	test('drops apostrophes rather than hyphenating them', () => {
		// 'O’Hare' must not become 'o-hare' — the apostrophe is not a word break.
		assert.equal(slugify('Chicago O’Hare'), 'chicago-ohare');
		assert.equal(slugify("Don't"), 'dont');
	});
	test('collapses runs and trims the ends', () => {
		assert.equal(slugify('  Star   Map  '), 'star-map');
		assert.equal(slugify('—Weather—'), 'weather');
	});
});

describe('canonical paths', () => {
	test('a place path is its chain down from the hub', () => {
		assert.equal(viewToSlug({ kind: 'port', code: 'WRK' }), 'about/work');
		assert.equal(viewToSlug({ kind: 'port', code: 'ATFC' }), 'apps/air-traffic');
	});
	test('the hub contributes no prefix and takes its own leaf', () => {
		assert.equal(viewToSlug({ kind: 'port', code: HUB }), 'home');
		assert.equal(viewToSlug({ kind: 'port', code: 'ABT' }), 'about');
	});
	test('viewPath prefixes a slash, and null is the homepage', () => {
		assert.equal(viewPath({ kind: 'port', code: 'STG' }), '/settings');
		assert.equal(viewPath(null), '/');
	});
	test('every place has a distinct canonical path', () => {
		const paths = codes.map((c) => viewToSlug({ kind: 'port', code: c }));
		assert.equal(new Set(paths).size, paths.length);
	});
});

describe('resolution', () => {
	test('resolves a canonical path', () => {
		assert.deepEqual(slugToView('about/work'), { kind: 'port', code: 'WRK' });
	});
	test('resolves the code alias', () => {
		assert.deepEqual(slugToView('atfc'), { kind: 'port', code: 'ATFC' });
	});
	test('resolves the bare leaf alias', () => {
		assert.deepEqual(slugToView('work'), { kind: 'port', code: 'WRK' });
	});
	test('is case-insensitive, which is what the map labels look like', () => {
		assert.deepEqual(slugToView('ATFC'), { kind: 'port', code: 'ATFC' });
		assert.deepEqual(slugToView('Apps/Air-Traffic'), { kind: 'port', code: 'ATFC' });
	});
	test('tolerates leading and trailing slashes', () => {
		assert.deepEqual(slugToView('/about/work/'), { kind: 'port', code: 'WRK' });
	});
	test('names nothing for an unknown path', () => {
		assert.equal(slugToView('nope'), null);
		assert.equal(slugToView('about/nope'), null);
		assert.equal(slugToView(''), null);
	});
	test('isViewSlug agrees with slugToView', () => {
		for (const path of ['about/work', 'atfc', 'work', 'ATFC', 'nope', '']) {
			assert.equal(isViewSlug(path), slugToView(path) !== null, path);
		}
	});
});

describe('sameView', () => {
	test('two views of one place are the same view', () => {
		assert.equal(sameView({ kind: 'port', code: 'ABT' }, { kind: 'port', code: 'ABT' }), true);
	});
	test('different places are not', () => {
		assert.equal(sameView({ kind: 'port', code: 'ABT' }, { kind: 'port', code: 'APP' }), false);
	});
	test('null is the homepage, and equals only itself', () => {
		assert.equal(sameView(null, null), true);
		assert.equal(sameView(null, { kind: 'port', code: 'ABT' }), false);
	});
});

describe('what a shared link says it is', () => {
	test('a place titles itself, then the site', () => {
		assert.equal(viewTitle({ kind: 'port', code: 'ATFC' }), `Air Traffic — ${SITE}`);
	});
	test('the homepage is just the site', () => {
		assert.equal(viewTitle(null), SITE);
	});
	test('every place has a description, and the homepage takes the hub blurb', () => {
		assert.equal(viewDescription(null), portDescriptions[HUB]);
		for (const code of codes) {
			assert.ok(viewDescription({ kind: 'port', code }).length > 0, code);
		}
	});
});

// ── The register ────────────────────────────────────────────────────────────
// One entry per place is the whole point of $lib/places. These assert the invariants the
// derived tables depend on — the ones that used to fail silently, as a missing icon or a card
// that never appeared.

describe('the register', () => {
	test('exactly one place hangs off nothing, and it is the hub', () => {
		const roots = codes.filter((c) => !places[c].parent);
		assert.deepEqual(roots, [HUB]);
	});

	test('every parent names a real place', () => {
		for (const code of codes) {
			const parent = places[code].parent;
			if (parent) assert.ok(places[parent], `${code} names unknown parent ${parent}`);
		}
	});

	test('every place is reachable from the hub', () => {
		// An unreachable place has a URL but no way in — it would sit in the sitemap and appear
		// nowhere on the site.
		const seen = new Set([HUB]);
		const queue = [HUB];
		while (queue.length) {
			for (const kid of children[queue.shift() as string] ?? []) {
				if (!seen.has(kid)) (seen.add(kid), queue.push(kid));
			}
		}
		assert.deepEqual([...seen].sort(), [...codes].sort());
	});

	test('the hierarchy is acyclic', () => {
		for (const code of codes) {
			const walked = new Set<string>();
			for (let at: string | undefined = code; at; at = parentOf[at]) {
				assert.ok(!walked.has(at), `cycle through ${code}`);
				walked.add(at);
			}
		}
	});

	test('every place carries the fields the site renders', () => {
		for (const code of codes) {
			assert.ok(places[code].title, `${code} has no title`);
			assert.ok(places[code].blurb, `${code} has no blurb`);
			assert.match(accent[code], /^#[0-9a-f]{6}$/i, `${code} has no accent`);
			assert.ok(PORT_ICONS[code]?.startsWith('<svg'), `${code} has no icon`);
		}
	});

	test("a favicon, where declared, is that place's own file", () => {
		// The stub loader resolves an asset to its path, so this catches the copy/paste fault the
		// old nine-deep ternary invited: PUD flying the Weather mark.
		for (const code of codes) {
			const icon = FAVICONS[code];
			// Hyphens allowed: a place whose name is two words names its mark the same way its URL
			// slugs it (favicon-text-editor.svg), and a single-word pattern rejected the first one
			// to arrive rather than the fault it was written to catch.
			if (icon) assert.match(icon, /favicon-[a-z]+(?:-[a-z]+)*\.svg$/, code);
		}
		assert.match(String(FAVICONS.PUD), /favicon-pud\.svg$/);
		assert.match(String(FAVICONS.WTHR), /favicon-weather\.svg$/);
		// Densette declares none and falls back to the site heart.
		assert.equal(FAVICONS.DENS, undefined);
	});

	test('connections are the parent above and the children below', () => {
		assert.deepEqual(connections('WRK'), ['ABT']);
		assert.deepEqual(connections('ABT'), ['KSH', 'PRJ', 'WRK']);
		assert.deepEqual(connections(HUB), children[HUB]);
	});

	test('airports mirrors the register titles', () => {
		for (const code of codes) assert.equal(airports[code].title, places[code].title);
	});
});

describe('the derived chrome lists', () => {
	test('each place lands in exactly the lists its chrome implies', () => {
		for (const code of codes) {
			const chrome = places[code].chrome;
			assert.equal(NEW_HEADER.includes(code), chrome !== 'own' && chrome !== 'hub', code);
			assert.equal(FULL_APPS.includes(code), chrome === 'own' || chrome === 'dense', code);
			assert.equal(BAR_HEADER.includes(code), chrome === 'dense', code);
			assert.equal(DOCS_BLEED.includes(code), chrome === 'bleed', code);
		}
	});

	test('the hub is in none of them — it is the map, not a panel', () => {
		for (const list of [NEW_HEADER, FULL_APPS, BAR_HEADER, DOCS_BLEED]) {
			assert.ok(!list.includes(HUB));
		}
	});

	test('a dense bar is also full-viewport', () => {
		// The dense bar exists to give a full-viewport app its vertical space back. On a panel
		// with prose under it, it would just be a cramped header.
		for (const code of BAR_HEADER) assert.ok(FULL_APPS.includes(code), code);
	});

	test('a self-chrome panel takes no shared bar', () => {
		for (const code of codes) {
			if (places[code].chrome === 'own') assert.ok(!NEW_HEADER.includes(code), code);
		}
	});
});

describe('the card panels', () => {
	test('cards are alphabetical by title, not by hierarchy order', () => {
		for (const [code, cards] of Object.entries(PANEL_CARDS)) {
			const titles = cards.map((c) => places[c].title);
			assert.deepEqual(
				titles,
				[...titles].sort((a, b) => a.localeCompare(b)),
				code
			);
		}
	});
	test('a card panel deals exactly its own children', () => {
		for (const [code, cards] of Object.entries(PANEL_CARDS)) {
			assert.deepEqual([...cards].sort(), [...(children[code] ?? [])].sort(), code);
		}
	});
	test('the Apps panel deals every app', () => {
		assert.deepEqual([...APP_CARDS].sort(), [...children.APP].sort());
	});
});

describe('share cards', () => {
	// The cards are BAKED (scripts/gen-og.mjs), so a place added without rerunning the generator
	// points og:image at a 404 — and an unfurler shows a broken card with no error anywhere for
	// us to see. The page derives the filename by the same rule the generator writes by, so
	// asserting the file exists is the whole of what can go wrong.
	const OG = resolve(dirname(fileURLToPath(import.meta.url)), '../static/og');

	test('every place has one, at the name the page asks for', () => {
		const missing = codes
			.map((code) =>
				code === HUB ? 'home' : viewToSlug({ kind: 'port', code }).replace(/\//g, '-')
			)
			.filter((slug) => !existsSync(resolve(OG, `${slug}.png`)));
		assert.deepEqual(
			missing,
			[],
			`run \`pnpm --filter home gen:og\` to bake: ${missing.join(', ')}`
		);
	});
});
