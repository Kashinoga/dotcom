// THE SPACING SCALE — puhig's `--space-*` rungs, and the rule that the Kashinoga pages spend them
// rather than inventing numbers.
//
// WHY THIS IS A TEST AND NOT A CONVENTION. Spacing is the one thing on these pages that nothing
// else checks: `svelte-check` has no opinion about a margin, the browser suites assert behaviour,
// and `snap:docs` records what the values ARE rather than whether they should be those values. So
// a stray `0.85rem` costs nothing to write, looks right, and is invisible for ever after. Before
// this landed there were NINETEEN distinct fixed spacings across the shell and the sheet, of which
// only seven were whole pixels — and no reader could tell 0.55rem from 0.6rem.
//
// It cost three real bugs in one sitting, all of the same shape: a value COPIED instead of named.
// The superbar's inset was restated as a literal in the brand separator (which then pulled by an
// amount the bar no longer used), and again in the search key (which was dragged thirteen pixels
// outside the bar, where it was clipped). Naming the rungs is what makes those impossible; this
// test is what keeps them named.
//
// WHAT IT DOES NOT DO. It says nothing about whether a given rung is the RIGHT one in a given
// place — that is taste, and taste is not testable. It only asks that the number came from the
// scale. And it reads the SOURCE, so it cannot see anything computed: the runtime half, which
// checks that real pages land on whole pixels at real widths, lives in `e2e/pixelite.mjs`.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(HERE, '..', p), 'utf8');

const TOKENS = read('../../packages/puhig/src/base.css');

/** Declarations that set space. Not `border`/`inset`/`width` — those are not rhythm. */
const SPACING = /^\s*(margin|padding|gap|row-gap|column-gap)(-[a-z-]+)?\s*:\s*([^;]+);/gm;

/**
 * Literals allowed to stand outside the scale, each with the reason it is not rhythm.
 *
 * Kept as an ALLOW-LIST rather than a loosened rule: every entry here had to be argued for once,
 * and a new one has to be argued for again. That is the whole value of the list.
 */
const EXEMPT: Record<string, string> = {
	'0': 'zero is zero',
	'0px': 'zero is zero',
	auto: 'centring, not spacing',
	'1px': 'a hairline — a border drawn as padding is still a border',
	// (42px bar − 28px key) / 2. Derived from two sizes, exact, and meaningless as a rung.
	'7px': "the search key's own optical centring in the bar"
	// `40px` USED TO BE HERE — "the floating key's diameter, reserved at the foot of the
	// scroller" — and it is gone rather than merely unused. The two rules that reserved room for
	// that key restated its measurements: the docs scroller's foot, and the editor's runway under
	// the last line of a document, which drifted to 40vh and then to a count of rows because
	// nothing tied it to the thing it was clearing. $lib/FloatingKey publishes --fkey-zone now and
	// both read it, so a literal here would be a permission for the copy to come back. The
	// exemption's own rule is that every entry had to be argued for once; this one no longer can be.
};

/**
 * The surfaces held to the scale, each with whatever it is allowed on top of the shared list.
 *
 * TWO GROUPS, because they are two different jobs. The SHELL is the site's own chrome and the
 * paper a page is printed on. The EDITOR is an app, and an app owns its interior — it was
 * deliberately out of the first pass for that reason. It is in now because "owns its interior"
 * turned out to mean thirty-one distinct spacings, twenty-two of them off the grid, with the two
 * workhorses (5.6px and 6.4px) differing by less than a pixel and used interchangeably in the same
 * files. That is not a rhythm of its own; it is the absence of one.
 */
const SURFACES: { file: string; also?: Record<string, string> }[] = [
	{ file: 'src/lib/DocsShell.svelte' },
	{ file: 'src/lib/DocsBody.svelte' },
	{
		file: 'src/lib/TextEditorRack.svelte',
		also: {
			// CLEARANCE, not a gap: the keys' focus ring and press bevel are drawn OUTSIDE the border
			// box and would be clipped by the scroller. Its size is the ring's, and a 4px rung here
			// would take 8px out of the one row the bar is allowed.
			'2px': "room for a key's focus ring inside the scrolling strip"
		}
	},
	{ file: 'src/lib/TextEditor.svelte' },
	{ file: 'src/lib/TextEditorSettings.svelte' },
	{ file: 'src/lib/TextEditorConnect.svelte' },
	{ file: 'src/lib/FloatingKey.svelte' }
];

/** Strip comments so a number quoted in prose is not read as a declaration. */
const decomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const styleOf = (src: string) => decomment(src.split('<style>').slice(1).join('<style>'));

describe('the spacing scale', () => {
	test('every rung is a whole number of pixels at a 16px root', () => {
		const rungs = [...TOKENS.matchAll(/--space-(\d+)\s*:\s*([\d.]+)rem;/g)];
		assert.ok(rungs.length >= 8, `expected the scale to be declared, found ${rungs.length} rungs`);
		for (const [, name, rem] of rungs) {
			const px = parseFloat(rem) * 16;
			assert.equal(px % 1, 0, `--space-${name} is ${px}px, which is not a whole pixel`);
			// THE NAME IS THE PIXELS. That is the entire argument for the scale, so it has to be
			// true — a `--space-12` that is not 12px is worse than no name at all.
			assert.equal(px, Number(name), `--space-${name} is ${px}px; the name must be the pixels`);
		}
	});

	test('the named step is a rung, not a number of its own', () => {
		const m = /--stack-tight\s*:\s*([^;]+);/.exec(TOKENS);
		assert.ok(m, '--stack-tight should be declared in puhig');
		assert.match(
			m![1].trim(),
			/^var\(--space-\d+\)$/,
			`--stack-tight is "${m![1].trim()}" — a meaning should point at a rung, not restate a value`
		);
	});
});

describe('the Kashinoga surfaces spend the scale', () => {
	for (const { file, also } of SURFACES) {
		test(`${file} uses no spacing literal off the scale`, () => {
			const allowed = { ...EXEMPT, ...(also ?? {}) };
			const css = styleOf(read(file));
			const stray: string[] = [];
			for (const m of css.matchAll(SPACING)) {
				const decl = `${m[1]}${m[2] ?? ''}: ${m[3].trim()}`;
				// Every length in the value, whatever wraps it (calc, clamp, round, a shorthand).
				for (const tok of m[3].match(/-?\d*\.?\d+(px|rem|em)\b/g) ?? []) {
					// `em` IS NOT RHYTHM. It is type-relative by definition, and the one place it appears
					// here is the inline-code chip's padding — which has to hug the glyphs at whatever
					// size the surrounding text happens to be, not at a fixed number of pixels. Putting
					// it on a pixel scale would be the wrong answer confidently applied.
					if (tok.endsWith('em') && !tok.endsWith('rem')) continue;
					const bare = tok.replace(/^-/, '');
					if (bare in allowed || tok in allowed) continue;
					stray.push(`${decl}   ← ${tok}`);
				}
			}
			assert.deepEqual(
				stray,
				[],
				`spacing off the scale — use a --space-* rung, or add the value to EXEMPT with its reason:\n  ${stray.join('\n  ')}`
			);
		});
	}

	// THE EDITOR'S DESK TOKENS ARE SPACING WEARING A NAME, and the source sweep above cannot see
	// them: `padding: var(--te-gutter)` carries no literal, so a fractional gutter hid from the
	// check while every declaration spending it passed. Both were off the grid before this
	// (--te-pad 24px by luck, --te-gutter 6.4px), and --te-gutter is the most visible spacing in
	// the app — it is the grey field that makes four panes read as four objects on a desk.
	test('the editor spends the scale through its own tokens too', () => {
		const css = styleOf(read('src/lib/TextEditor.svelte'));
		for (const name of ['--te-pad', '--te-gutter']) {
			const decls = [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))];
			assert.ok(decls.length, `${name} should be declared`);
			for (const d of decls)
				assert.match(
					d[1].trim(),
					/^var\(--space-\d+\)$/,
					`${name} is "${d[1].trim()}" — a desk token is spacing, so it must name a rung`
				);
		}
	});

	test('a value the bar publishes is read, never copied', () => {
		// The superbar's insets are cancelled by two things inside it — the brand separator, which
		// bleeds back across the flex gap, and the search key, which pulls against the right
		// padding. BOTH restated the value as a literal, and both broke when the bar changed: the
		// separator cancelled a gap that no longer existed, and the key was dragged thirteen pixels
		// outside the bar, where it was clipped. The bar publishes --bar-gap and its padding is a
		// rung; this asserts nobody has gone back to copying either.
		//
		// EVERY MARGIN PROPERTY, not just the one that broke first. Written as `margin-inline` only,
		// this guard would have watched the separator and missed the search key entirely — which is
		// the very bug it was written after. A guard shaped around one instance of a mistake is how
		// the second instance ships.
		const css = styleOf(read('src/lib/DocsShell.svelte'));
		assert.match(css, /--bar-gap:/, 'the superbar should publish its gap');
		const copies = [
			...css.matchAll(
				/margin(-inline|-right|-left|-inline-start|-inline-end)?:\s*calc\([^;]*clamp\(/g
			)
		];
		assert.deepEqual(
			copies.map((c) => c[0].trim()),
			[],
			'a margin cancelling a bar inset should read var(--bar-gap) or the padding rung, not restate the clamp'
		);
	});
});
