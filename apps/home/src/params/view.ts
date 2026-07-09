import type { ParamMatcher } from '@sveltejs/kit';
import { isViewSlug } from '$lib/views';

// Only real stations and lines match, so `/apps/air-traffic` renders the board while
// `/nonsense` (and `/api`, which would otherwise be swallowed by the rest param) 404s.
//
// The rest param is `''` at the site root, which is the overview map — a real page, so
// it has to match here or `/` itself 404s.
export const match: ParamMatcher = (param) => param === '' || isViewSlug(param);
