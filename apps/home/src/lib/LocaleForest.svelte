<script>
	// LocaleForest — the Basecamp backdrop: the forest the Park Ranger is actually
	// standing in, glimpsed behind the glass. One of two Location backdrops (the
	// other is wherever the Courier's route puts you); this one is wallpaper, not
	// illustration — the panels on top read text at full contrast and blur
	// everything behind them, so the scene only has to be RIGHT at a glance, not
	// examined. Two conifer treelines drifting past each other at mismatched,
	// near-standstill speeds is enough parallax to read as "outdoors" without
	// asking for a second look.
</script>

<div class="forest" aria-hidden="true">
	<div class="sky"></div>
	<div class="treeline-far"></div>
	<div class="mist"></div>
	<div class="treeline-near"></div>
</div>

<style>
	.forest {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.forest > div {
		position: absolute;
		inset: 0;
	}

	/* Sky wash — the glow sits low, at the horizon, the way haze pools there on a
	   still day (or lingers as the last light on a still night); the tone deepens
	   climbing away from it. Never a saturated blue: this is a forest sky seen
	   through tree-cover and distance, not a clear-day postcard. */
	.sky {
		background: linear-gradient(
			to top,
			light-dark(#eef1e2, #172230) 0%,
			light-dark(#dee7de, #101a26) 45%,
			light-dark(#c8d8d4, #0a121c) 100%
		);
	}

	/* Far treeline — small, low-opacity, sitting higher in the frame (further
	   away reads as smaller and higher against the horizon). The color lives on
	   a custom property because a data URI can't take currentColor — light-dark()
	   swaps the whole baked-in-color background instead. */
	.treeline-far {
		--treeline-far: light-dark(
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 64'%3E%3Cpath d='M0,64 L9,26 L17,58 L27,20 L36,60 L44,32 L53,64 L63,16 L71,56 L82,24 L90,62 L100,30 L108,64 L119,18 L128,58 L138,36 L146,64 L157,22 L166,60 L176,28 L184,64 L195,14 L204,56 L214,34 L224,64 L233,24 L240,64 Z' fill='%239fb3a6'/%3E%3C/svg%3E"),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 64'%3E%3Cpath d='M0,64 L9,26 L17,58 L27,20 L36,60 L44,32 L53,64 L63,16 L71,56 L82,24 L90,62 L100,30 L108,64 L119,18 L128,58 L138,36 L146,64 L157,22 L166,60 L176,28 L184,64 L195,14 L204,56 L214,34 L224,64 L233,24 L240,64 Z' fill='%23141c1a'/%3E%3C/svg%3E")
		);
		background-image: var(--treeline-far);
		background-repeat: repeat-x;
		background-position-x: 0;
		background-position-y: bottom;
		background-size: 240px auto;
		opacity: 0.35;
	}

	/* Mist band — a soft seam where the two treelines meet, so the join reads as
	   depth-haze rather than a hard edge between two flat layers. */
	.mist {
		background: linear-gradient(
			to bottom,
			transparent 0%,
			light-dark(rgba(255, 255, 255, 0.5), rgba(6, 10, 18, 0.55)) 50%,
			transparent 100%
		);
		top: 48%;
		bottom: auto;
		height: 26%;
	}

	/* Near treeline — taller, darker, more opaque: the trees close enough to
	   Basecamp to actually see. Larger tile, so the peaks read bigger than the
	   far line's without needing a different silhouette style. */
	.treeline-near {
		--treeline-near: light-dark(
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 160'%3E%3Cpath d='M0,160 L18,50 L34,148 L60,20 L84,155 L104,68 L130,160 L150,12 L168,138 L196,58 L214,158 L238,32 L258,150 L284,72 L304,160 L320,160 Z' fill='%235f7568'/%3E%3C/svg%3E"),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 160'%3E%3Cpath d='M0,160 L18,50 L34,148 L60,20 L84,155 L104,68 L130,160 L150,12 L168,138 L196,58 L214,158 L238,32 L258,150 L284,72 L304,160 L320,160 Z' fill='%2305080a'/%3E%3C/svg%3E")
		);
		background-image: var(--treeline-near);
		background-repeat: repeat-x;
		background-position-x: 0;
		background-position-y: bottom;
		background-size: 480px auto;
		opacity: 0.8;
	}

	/* The drift is parallax, not weather — it has to stay slow enough that nobody
	   would ever describe the forest as "moving". A full tile's worth of travel
	   over minutes reads as stillness with a pulse. Opposite directions at
	   mismatched speeds keep the two lines from ever repeating in sync. */
	@media (prefers-reduced-motion: no-preference) {
		.treeline-far {
			animation: drift-far 240s linear infinite;
		}

		.treeline-near {
			animation: drift-near 150s linear infinite;
		}
	}

	@keyframes drift-far {
		from {
			background-position-x: 0;
		}
		to {
			background-position-x: -240px;
		}
	}

	@keyframes drift-near {
		from {
			background-position-x: 0;
		}
		to {
			background-position-x: 480px;
		}
	}
</style>
