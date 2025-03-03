// Sort posts by date in descending order
interface Post {
	date: string;
	[key: string]: any;
}

export async function load({
	fetch
}: {
	fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}): Promise<{ posts: Post[] }> {
	const res = await fetch('/posts/posts.json'); // Fetch list of posts from static folder
	const posts: Post[] = await res.json();

	// Sort posts by date in descending order
	posts.sort((a: Post, b: Post) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return { posts };
}
