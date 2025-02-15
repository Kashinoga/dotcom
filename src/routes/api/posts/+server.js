import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

export async function GET() {
	const postsDirectory = path.join(process.cwd(), 'static', 'posts');
	const files = fs.readdirSync(postsDirectory);
	const markdownFiles = files.filter((file) => file.endsWith('.md'));

	return json(markdownFiles);
}
