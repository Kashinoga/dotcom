/**
 * Get the page's state name from the URL.
 * @param pathname - The URL pathname that includes the state name (e.g., /wtm/minnesota)
 * @returns Capitalized state name (e.g., Minnesota)
 */
export function getStateName(pathname: string): string {
	const parts = pathname.split('/'); // Split by slashes
	const lastSegment = parts[parts.length - 1]; // Get the last part
	return initialCase(lastSegment); // Capitalize it
}

/**
 * Capitalizes the first letter of the given string.
 * @param str - The input string
 * @returns The capitalized string
 */
export function initialCase(str: string): string {
	if (!str) return '';
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
