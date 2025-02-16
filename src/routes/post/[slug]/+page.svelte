<script lang="ts">
	import { marked } from 'marked';
	export let data;
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				{@html marked(data.markdown)}
			</div>
		</div>
	</div>
</div>
