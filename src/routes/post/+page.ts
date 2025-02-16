export async function load({ fetch }) {
	const res = await fetch('/posts/posts.json'); // Fetch list of posts from static folder
	const posts = await res.json();

	return { posts };
}
