<script>
	import { inTheWood } from './inTheWoodStore';

	let icon = $inTheWood[0];
	let title = $inTheWood[1];
</script>

<div class="container">
	<div class="sections">
		<div class="section section-100">
			<h1>{icon.content} {title.content}</h1>
		</div>
		<div class="section">
			<h1>✋ Hands</h1>
			<div class="section">
				<h2>Gather</h2>
			</div>
		</div>
		<div class="section">
			<h1>{icon.content} {title.content}</h1>
		</div>
	</div>
</div>

<style>
	.sections {
		flex-grow: 1;

		padding: var(--padding);
	}

	.section-100 {
		flex-basis: 100%;
	}
</style>
