<script lang="ts">
	import { editor, install } from '$lib/text-editor-state.svelte';
	import { places } from '$lib/places';
	import VersionCard from '$lib/VersionCard.svelte';
	import TextEditorConnect from '$lib/TextEditorConnect.svelte';
	import type { Connection } from '$lib/dav-connections';

	// THE SETTINGS FLYOUT — everything in this app that is not the document.
	//
	// Four things stood in the bar's right-hand corner: Home, About, Install and the Beta tag.
	// None of them acts on what you are writing, all four cost width in a bar that is one row
	// high, and on a phone they had already been pushed into the floating key's stack, where
	// they sat among the marks looking like more marks. They are behind one key now.
	//
	// The KEY is not here. It is drawn twice — in the panel's chrome corner on a desk, in the
	// floating key's stack on a phone — and a component cannot be in two places, so both keys
	// call `openSettings` (see $lib/text-editor-state) and this draws the one surface. Exactly
	// the arrangement the heading picker already keeps.
	//
	// APPS, not Home. The door out of this app leads to the place this app is IN — the Apps
	// index, one level up — rather than to the front of the site. Two presses to the map from
	// there, and the one press does the thing somebody leaving an app usually wants: see the
	// others. The destination is the PAGE's to navigate to, so it arrives as a prop.

	let {
		onApps,
		onConnected,
		onForget
	}: {
		onApps?: () => void;
		/** A drive was connected and answered. The EDITOR opens it — this card only asks. */
		onConnected?: (c: Connection, token: string) => void;
		onForget?: (c: Connection) => void;
	} = $props();

	let cardEl: HTMLDivElement | null = $state(null);
	/**
	 * The connect FORM replaces the item list rather than opening beside it. A second popover over
	 * the first would need its own scrim, its own escape and its own placement, and what it would be
	 * layered over is a menu nobody needs to see while they are typing into a form.
	 */
	let connecting = $state(false);

	const at = $derived(editor.settingsAt);
	const title = $derived(places.TEXT.title);

	function close() {
		editor.settingsAt = null;
		connecting = false;
	}

	/**
	 * Out to <body> for as long as it is open. `position: fixed` is fixed to the nearest ancestor
	 * that has made a stacking context, not to the window, and every key that opens this stands
	 * deep inside one — the panel's header on a desk, the floating key's flyout on a phone. The
	 * card was laid over the app and the app's own textarea still took the clicks.
	 */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	$effect(() => {
		if (!at || !cardEl) return;
		// Right-ALIGNED to the key, which is in the bar's corner: laid out from its own right edge
		// and then pulled back inside the window if it overhangs. The x carried in `settingsAt` is
		// the key's RIGHT edge for this reason.
		const box = cardEl.getBoundingClientRect();
		const left = Math.max(8, Math.min(at.x - box.width, window.innerWidth - box.width - 8));
		const top = Math.min(at.y, Math.max(8, window.innerHeight - box.height - 8));
		if (Math.abs(left - box.left) > 0.5) cardEl.style.left = `${left}px`;
		cardEl.style.top = `${top}px`;
		// The card takes focus, which is what makes Escape reach the handler on it rather than the
		// panel's — and what puts a screen reader inside the thing that just opened.
		if (!cardEl.contains(document.activeElement)) cardEl.focus();
	});
</script>

{#if at}
	<button class="popover-scrim" use:portal aria-label="Close settings" onclick={close}></button>
	<div
		class="popover te-set-card"
		role="dialog"
		aria-label="{title} settings"
		tabindex="-1"
		use:portal
		bind:this={cardEl}
		style:left="{at.x}px"
		style:top="{at.y}px"
		onkeydown={(e) => {
			// Stopped as well as handled: Escape is how the panel around this closes, and one press
			// should shut the flyout rather than the flyout and the app together.
			if (e.key === 'Escape') {
				e.stopPropagation();
				close();
			}
		}}
	>
		{#if connecting}
			<!-- A SUCCESSFUL CONNECT CLOSES THE WHOLE FLYOUT, not just the form. Returning to the menu
			     would leave the card — and its scrim — over the pane that has just grown a new list,
			     which is the one thing somebody wants to look at. Connecting is a finished action. -->
			<TextEditorConnect
				onConnected={(c, token) => {
					onConnected?.(c, token);
					close();
				}}
				onClose={() => (connecting = false)}
			/>
		{:else}
			<p class="popover-title">{title}</p>
			<!-- ABOUT first and APPS last, which is the stack's rule everywhere in this app: the thing
			     that LEAVES goes furthest from where the hand starts. About only replaces the sheet and
			     is undoable; Apps ends the session with nothing to confirm. -->
			<button
				type="button"
				class="popover-item"
				onclick={() => {
					editor.cmd?.readme();
					close();
				}}>About</button
			>
			<!-- HIDE SCRATCH — the one thing in this flyout that is a SETTING rather than a door. The
			     shelf is drawn always now, rows or none, and there is always at least one row in it;
			     for a desk where scratch notes are not part of how somebody works, that is a list that
			     never goes away. One item that says which way it will go, like the workspace menu's
			     own hide. Kept across visits. -->
			<button
				type="button"
				class="popover-item"
				onclick={() => {
					editor.scratchShown = !editor.scratchShown;
					close();
				}}>{editor.scratchShown ? 'Hide Scratch' : 'Show Scratch'}</button
			>
			{#if editor.installable && !editor.installed}
				<!-- Only while there is an offer to make. Chromium fires `beforeinstallprompt` once and
				     the offer is spent by showing it, so this is a key that comes and goes rather than a
				     setting — which is the other reason it belongs here and not in the bar, where a key
				     that appears and vanishes shifts everything beside it. -->
				<button
					type="button"
					class="popover-item"
					onclick={() => {
						install();
						close();
					}}>Install as an app</button
				>
			{/if}
			<!-- CONNECT A DRIVE. It is in Settings rather than in the Workspace menu because a drive is
			     not a folder you pick — it is an account you set up once and then have. The Workspace
			     menu is the three things you do to the pane in front of you; this is the thing you do
			     once.
			     ABOVE Apps, because Apps is the door OUT and this stack's rule is that the thing which
			     leaves goes furthest from where the hand starts. -->
			<button type="button" class="popover-item" onclick={() => (connecting = true)}
				>Connect a drive…</button
			>
			{#each editor.connections as c (c.id)}
				<!-- A drive, and the one thing this app can do about it. FORGET is not revocation: the app
				     password itself lives on the server, in Devices & sessions, and that list is where it is
				     actually cancelled. Saying `Forget` rather than `Remove` is the difference. -->
				<button
					type="button"
					class="popover-item te-set-drive"
					title="Forget {c.name} — the app password stays valid until you revoke it on the server"
					onclick={() => {
						onForget?.(c);
						close();
					}}><span>{c.name}</span><span class="te-set-forget">Forget</span></button
				>
			{/each}
			{#if onApps}
				<button
					type="button"
					class="popover-item"
					onclick={() => {
						close();
						onApps?.();
					}}>Apps</button
				>
			{/if}
			<!-- The version, and what has just landed. It is the Beta tag's card, drawn from the same
			     component ($lib/VersionCard) — the tag itself is gone from the bar, so this is now the
			     only place the app says which version it is or that it is in beta at all. -->
		{/if}
		<div class="te-set-ver">
			<VersionCard code="TEXT" {title} />
		</div>
	</div>
{/if}

<style>
	/* Wider than a menu, because the version block below holds prose. Everything else about the
	   material — the sheet, its edge, the drop, the scrim — is puhig's `.popover`. */
	.te-set-card {
		width: min(23rem, calc(100vw - 1rem));
		padding: 0.25rem 0.25rem 0.5rem;
	}
	/* The version stands BELOW a rule, in the card's own margins rather than the items'. The items
	   above it are choices and this is a statement; without the rule the head of the version block
	   read as one more thing to press. */
	/* A drive's row: its name, and the word that removes it, pushed to the far edge. `Forget` is
	   set in the muted ink rather than the refusal one — it is not destructive to anything on the
	   server, which is the whole point of the word. */
	.te-set-drive {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.te-set-forget {
		font-family: var(--font-mono, monospace);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.te-set-ver {
		margin: 0.45rem 0.25rem 0;
		padding: 0.55rem 0.25rem 0;
		border-top: 1px solid var(--popover-rule, var(--pixel-hairline, rgba(0, 0, 0, 0.15)));
	}
</style>
