<script lang="ts">
	import {
		configFor,
		connectionId,
		defaultName,
		normaliseBase,
		normaliseRoot,
		seal,
		type Connection
	} from '$lib/dav-connections';
	import { probe, type Probe } from '$lib/dav';

	// CONNECTING A DRIVE — the form, and the one choice in it that is not a preference.
	//
	// THE TRANSPORT IS A CHOICE MADE HERE, ONCE, and it is deliberately not worked out for you.
	// Nextcloud's WebDAV endpoint sends no CORS header for a third-party origin, so a browser can
	// only reach it directly if the server's owner has installed WebAppPassword; otherwise the
	// requests have to go through this site. Those two arrangements put somebody's password in two
	// different places, and a page CANNOT tell which one will work — a blocked preflight rejects
	// `fetch` with a bare TypeError indistinguishable from a dead network, a bad certificate or a
	// typo in the host. So there is NO FALLBACK between them: choosing for you would be guessing
	// about where a password goes. The connection IS tried before it is kept, but it is tried the
	// way you asked for, and a failure is reported rather than answered by trying the other one.
	//
	// The audience here runs its own Nextcloud, so DIRECT leads. Somebody who owns the instance can
	// install one app; somebody using a friend's cannot, and that is who the other mode is for.
	//
	// AN APP PASSWORD, NEVER AN ACCOUNT PASSWORD. Nextcloud makes them under Settings → Security,
	// they are named, and the name is what makes the Devices & sessions list a control rather than
	// a list. That is the real protection on this credential; see the note at the head of
	// $lib/dav-connections for what this app does and — more usefully — does not add to it.

	let {
		onConnected,
		onClose
	}: {
		onConnected: (c: Connection, token: string) => void;
		onClose: () => void;
	} = $props();

	let base = $state('');
	let user = $state('');
	let token = $state('');
	let root = $state('');
	let via = $state<'direct' | 'proxy'>('direct');
	let keep = $state(true);
	let trying = $state(false);
	/** What the server said last time we asked, in the words this form needs. Empty until we ask. */
	let problem = $state('');

	const cleanBase = $derived(normaliseBase(base));
	/** Only once something has been typed — a blank field is not a mistake yet. */
	const badBase = $derived(base.trim().length > 2 && !cleanBase);
	// Derived rather than written in the markup: Svelte reads a `{` followed by `/` as a block
	// CLOSING tag, so an expression that opens with a regular expression literal does not parse.
	const typedHttp = $derived(/^http:\/\//i.test(base.trim()));
	const ready = $derived(!!cleanBase && !!user.trim() && !!token.trim() && !trying);

	/**
	 * IT IS TRIED BEFORE IT IS KEPT. A connection form that accepts whatever is typed and fails
	 * later, in a tree that will not open, gives somebody four fields and no idea which one is
	 * wrong — and one of those fields is a password they cannot see.
	 *
	 * The words are the form's own rather than the store's. A row says `Refused`, which is all a row
	 * has space for and all it needs; somebody here has just typed four things and needs to know
	 * WHICH of them the server disagreed with.
	 */
	const SAYS: Record<Exclude<Probe, 'ok'>, string> = {
		refused: 'The server did not accept that user and password.',
		'no-such-user': 'Connected, but there is no drive for that user. Check the username.',
		failed: 'The server answered, but not in a way this understands.',
		blocked: ''
	};

	async function connect() {
		if (!cleanBase || !ready) return;
		trying = true;
		problem = '';
		const at = normaliseRoot(root);
		const conn: Connection = {
			id: connectionId(cleanBase, user.trim()),
			name: defaultName(cleanBase, at),
			base: cleanBase,
			user: user.trim(),
			via,
			root: at,
			keep
		};
		const secret = token.trim();
		const said = await probe(configFor(conn, secret));
		trying = false;
		if (said !== 'ok') {
			problem =
				said === 'blocked'
					? via === 'direct'
						? 'Could not reach the server. If it is up, this is most likely the browser refusing the request — the WebAppPassword app has to be installed there for the direct mode, or use "Through this site".'
						: 'Could not reach the server.'
					: SAYS[said];
			return;
		}
		// Only now, and only if asked. See the head of $lib/dav-connections for what keeping it does
		// and does not buy.
		if (keep) await seal(conn.id, secret);
		// The field is cleared BEFORE the handover, not after. `onConnected` closes the flyout, which
		// destroys this component — anything written to its state past that point is written to
		// nothing. The token does not stay in a field once it has been handed over: it is going
		// somewhere that was thought about, and an `<input>` is not that.
		token = '';
		onConnected(conn, secret);
		onClose();
	}
</script>

<div class="te-conn">
	<p class="te-conn-head">Connect a drive</p>

	<label class="te-conn-row">
		<span>Server</span>
		<input
			type="url"
			inputmode="url"
			placeholder="cloud.example.com"
			autocomplete="off"
			spellcheck="false"
			bind:value={base}
		/>
	</label>
	{#if badBase}
		<!-- The one thing worth saying about the address, because it is the one thing that is a
		     REFUSAL rather than a typo: http is not upgraded to https quietly. A password travels
		     through this, and silently changing what somebody asked for is how one ends up
		     somewhere it was not meant to go. -->
		<p class="te-conn-note">
			{typedHttp
				? 'https only — a password travels through this.'
				: 'That is not a server address.'}
		</p>
	{/if}

	<label class="te-conn-row">
		<span>User</span>
		<input autocomplete="username" spellcheck="false" bind:value={user} />
	</label>

	<label class="te-conn-row">
		<span>App password</span>
		<input type="password" autocomplete="off" bind:value={token} />
	</label>
	<p class="te-conn-note">Settings → Security → Devices &amp; sessions, on your server.</p>

	<label class="te-conn-row">
		<span>Folder</span>
		<input
			placeholder="Notes — or blank for the whole drive"
			spellcheck="false"
			bind:value={root}
		/>
	</label>

	<!-- THE TRANSPORT. Two keys rather than a checkbox, because neither is a default the other is a
	     departure from — they are two different arrangements with two different costs, and the words
	     under them are the whole of what somebody needs to decide. -->
	<p class="te-conn-head te-conn-sub">How the requests travel</p>
	<div class="te-conn-modes" role="radiogroup" aria-label="How the requests travel">
		<button
			type="button"
			role="radio"
			aria-checked={via === 'direct'}
			class="chip"
			class:on={via === 'direct'}
			onclick={() => (via = 'direct')}>Direct</button
		>
		<button
			type="button"
			role="radio"
			aria-checked={via === 'proxy'}
			class="chip"
			class:on={via === 'proxy'}
			onclick={() => (via = 'proxy')}>Through this site</button
		>
	</div>
	<p class="te-conn-note">
		{via === 'direct'
			? 'Your password and your documents reach only your server. Needs the WebAppPassword app installed there.'
			: 'Needs nothing on your server. Your password and your documents pass through this site on every request.'}
	</p>

	<label class="te-conn-check">
		<input type="checkbox" bind:checked={keep} />
		<span>Remember this drive</span>
	</label>
	{#if !keep}
		<p class="te-conn-note">The password is held for this session and written nowhere.</p>
	{/if}

	<!-- WHAT THE SERVER SAID, in this form's words rather than a row's. A row has space for `Refused`
	     and needs no more; somebody here has just typed four things and needs to know which one the
	     server disagreed with. -->
	{#if problem}
		<p class="te-conn-note te-conn-bad" role="alert">{problem}</p>
	{/if}

	<div class="te-conn-keys">
		<button type="button" class="chip" onclick={onClose}>Cancel</button>
		<button type="button" class="chip te-conn-go" disabled={!ready} onclick={connect}
			>{trying ? 'Trying…' : 'Connect'}</button
		>
	</div>
</div>

<style>
	.te-conn {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.15rem 0.35rem 0.35rem;
	}
	.te-conn-head {
		margin: 0;
		font-family: var(--font-mono, monospace);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.te-conn-sub {
		margin-top: 0.45rem;
	}
	/* The label sits ABOVE its field rather than beside it. A two-column form in a 23rem popover
	   gives the field about eleven characters, and one of these fields is a URL. */
	.te-conn-row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.te-conn-row span {
		font-size: 0.72rem;
		color: var(--sub);
	}
	.te-conn-row input {
		font: inherit;
		font-size: 0.82rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--popover-rule, rgba(0, 0, 0, 0.2));
		border-radius: 4px;
		background: var(--pixel-key-face, transparent);
		color: inherit;
		min-width: 0;
	}
	.te-conn-note {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.35;
		color: var(--sub);
	}
	.te-conn-modes {
		display: flex;
		gap: 0.3rem;
	}
	.te-conn-modes .chip {
		flex: 1;
	}
	.te-conn-check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		margin-top: 0.35rem;
	}
	.te-conn-keys {
		display: flex;
		justify-content: flex-end;
		gap: 0.35rem;
		margin-top: 0.5rem;
	}
	.te-conn-go:disabled {
		opacity: 0.45;
	}
	/* The refusal ink, the same one a key wears when a write did not happen — see `.lost` in
	   pixelite.css. This is the same kind of news. */
	.te-conn-bad {
		color: var(--ruby);
	}
</style>
