<script>
	import { marked } from 'marked';

	export let content = '';

	$: htmlContent = marked(content);
</script>

{@html htmlContent}
