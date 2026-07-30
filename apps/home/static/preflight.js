// PRE-PAINT — the saved theme, display mode and sky, stamped on <html> before the first frame.
//
// IT IS A FILE RATHER THAN AN INLINE SCRIPT, and that is the Content Security Policy's doing. A
// tight `script-src 'self'` cannot allow an inline script without also allowing every OTHER inline
// script — including one a hostile document talked its way into the page — and this app's whole job
// is displaying files it did not write. So the one inline script this site had moved out here.
//
// The cost is honest and small: an inline script is guaranteed to run, and this one has to be
// fetched first. It is same-origin, about a kilobyte, blocking (no `defer`, no `async` — the point
// is that it runs BEFORE paint), cached after the first visit, and held by the editor's service
// worker as part of the shell. A slow first byte flashes the wrong scheme for a frame; nothing
// worse, and nothing at all on any visit after the first.
//
// IT MUST STAY IN STEP WITH THE PAGE'S OWN DERIVED STATE. That was true when it was inline and it
// is easier to honour now that it has a name: if you change what a saved value means here, change
// it in src/routes/[...view=view]/+page.svelte too, or the two disagree the moment hydration lands.

// Apply a saved named theme + display-mode override + time-of-day sky before paint.
try {
	// Named theme. Pixelite is now the DEFAULT: <html> ships data-look="pixelite" (and no
	// data-ui), so no-JS and fresh visitors get the docs look. Only a saved 'aeropalite'
	// opts out — strip data-look and stamp the bubble button style. Anything else (absent,
	// legacy 'metro', legacy values) keeps the hard-coded Pixelite default.
	if (localStorage.getItem('ksh-look') === 'aeropalite') {
		document.documentElement.removeAttribute('data-look');
		document.documentElement.dataset.ui = 'bubble';
	}
	var t = localStorage.getItem('ksh-theme');
	if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
	// Seed the browser chrome to match the bar it will abut, before the first frame.
	// The RESOLVED scheme, the same three-way the tokens answer to: a forced choice
	// wins, otherwise the OS. The measured value takes over a frame later
	// ($lib/theme-color) — this only has to be right enough not to flash.
	if (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
		document.querySelector('meta[name="theme-color"]').content = '#202023';
	}
	// Pixelite renders no sky, and data-sky FORCES color-scheme in base.css — stamping
	// it would let a night phase overrule Display Mode → Light with nothing on screen
	// to show for it. So the sky only stamps for Aeropalite (data-look was stripped).
	var aero = !document.documentElement.hasAttribute('data-look');
	// Auto is the DEFAULT sky: a visitor who has never chosen (null) gets the time-of-day
	// phase, same as an explicit 'auto'. Only 'off' opts out to a solid background. This
	// runs pre-paint so the phase is on <html> before the first frame — the page's own
	// skyMode default must match it, or the two disagree for a beat after hydration.
	var sky = localStorage.getItem('ksh-sky');
	// Photo mode paints a picture, and NOTHING is meant to sit under it. The server can't
	// know the visitor chose it, so its HTML may carry decor (dark mode would build the
	// star field on top) — which flashed up behind the photo while it loaded.
	// Marking <html> here, pre-paint, lets the CSS hide that decor before its first frame;
	// the page's own skyMode is seeded from the same key, so hydration builds none of it.
	if (sky === 'photo') document.documentElement.dataset.skyPhoto = '';
	if (!aero) {
		// no sky stamp — the display mode owns the scheme under Pixelite
	} else if (['dawn', 'morning', 'noon', 'dusk', 'night'].indexOf(sky) >= 0) {
		document.documentElement.dataset.sky = sky;
	} else if (sky === 'auto' || sky === null) {
		// Season-aware clock — MUST match currentPhase() in the page, which owns the
		// same math after hydration: a solstice-anchored cosine approximating
		// mid-northern sunrise/sunset (Jun 21 ≈ 4:40/20:50, Dec 21 ≈ 7:40/16:40).
		var d = new Date();
		var doy =
			(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) /
			86400000;
		var w = Math.cos(((doy - 172) / 365) * 2 * Math.PI);
		var rise = 6.1 - 1.55 * w;
		var set = 18.75 + 2.1 * w;
		var h = d.getHours() + d.getMinutes() / 60;
		document.documentElement.dataset.sky =
			h < rise - 1 || h >= set + 1.25
				? 'night'
				: h < rise + 1.5
					? 'dawn'
					: h < 11
						? 'morning'
						: h < set - 1.5
							? 'noon'
							: 'dusk';
	}
	// The active SCHEME, stamped for CSS that styles light and dark differently
	// beyond what light-dark() tokens can express (the bubble buttons wear the
	// night face in light mode — see the bubble section's scheme-dark rules).
	// MUST match the page's darkScheme derived: an opted-into sky wins (dusk and
	// night are the dark phases); otherwise the display mode, with 'system'
	// asking the OS.
	var ph = document.documentElement.dataset.sky;
	var schemeDark = ph
		? ph === 'dusk' || ph === 'night'
		: t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
	if (schemeDark) document.documentElement.classList.add('scheme-dark');
} catch (e) {}
