// tilt — Svelte action for hover tilt (ported from dotcom-2's initFlip tilt).
//
// Pointer offset from the element centre → rotateX/rotateY, bounded to ±max
// degrees, under perspective. An rAF lerp eases the pose toward the target so
// the card *follows* the cursor rather than snapping. will-change is promoted
// only while moving and dropped the moment it settles — a standing hint holds a
// GPU layer per card at rest (the dotcom-2 memory-ceiling lesson).
//
// Bounded and scoped, per "movement is a key feature": disabled under
// prefers-reduced-motion and on non-hover/coarse pointers (touch taps).

type TiltOptions = { max?: number; perspective?: number; enabled?: boolean };

export function tilt(node: HTMLElement, options: TiltOptions = {}) {
	let { max = 6, perspective = 600, enabled = true } = options;

	let curX = 0;
	let curY = 0;
	let targetX = 0;
	let targetY = 0;
	let raf = 0;

	function apply() {
		node.style.transform =
			`perspective(${perspective}px) rotateX(${curX.toFixed(2)}deg) rotateY(${curY.toFixed(2)}deg)`;
		// Publish the tilt direction (−1..1) so a sheen/glare can track it.
		node.style.setProperty('--tilt-x', (-curY / max).toFixed(3));
		node.style.setProperty('--tilt-y', (curX / max).toFixed(3));
	}

	function frame() {
		curX += (targetX - curX) * 0.15;
		curY += (targetY - curY) * 0.15;
		if (Math.abs(targetX - curX) < 0.05 && Math.abs(targetY - curY) < 0.05) {
			curX = targetX;
			curY = targetY;
			raf = 0;
			// Settled: at rest clear the transform entirely; otherwise hold the
			// final pose. Either way drop the GPU-layer hint until next motion.
			if (targetX === 0 && targetY === 0) {
				node.style.transform = '';
				node.style.setProperty('--tilt-x', '0');
				node.style.setProperty('--tilt-y', '0');
			} else apply();
			node.style.willChange = '';
			node.classList.remove('puhig-tilting');
			return;
		}
		apply();
		raf = requestAnimationFrame(frame);
	}

	function start() {
		if (!raf) {
			node.style.willChange = 'transform';
			// Transient promotion flag for descendants (e.g. the sleeve sheen):
			// they opt into their own layer via CSS only while this is present.
			node.classList.add('puhig-tilting');
			raf = requestAnimationFrame(frame);
		}
	}

	function move(e: PointerEvent) {
		if (e.pointerType === 'touch') return; // hover tilt is a fine-pointer gesture
		const r = node.getBoundingClientRect();
		const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
		const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
		targetX = dy * max; // point under the cursor rises toward the viewer
		targetY = -dx * max;
		start();
	}

	function leave() {
		targetX = 0;
		targetY = 0;
		start();
	}

	const mq = typeof matchMedia !== 'undefined';
	const allowed =
		enabled &&
		mq &&
		!matchMedia('(prefers-reduced-motion: reduce)').matches &&
		matchMedia('(hover: hover) and (pointer: fine)').matches;

	if (allowed) {
		node.addEventListener('pointermove', move);
		node.addEventListener('pointerleave', leave);
	}

	return {
		destroy() {
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerleave', leave);
			node.classList.remove('puhig-tilting');
			if (raf) cancelAnimationFrame(raf);
		}
	};
}
