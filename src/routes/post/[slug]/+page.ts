export async function load({ params, fetch }) {
	const res = await fetch(`/posts/${params.slug}.svx`); // Fetch from static/posts/

	if (!res.ok) {
		throw new Error(`Markdown file not found: ${params.slug}`);
	}

	const markdown = await res.text();
	return { markdown };
}
