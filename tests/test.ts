import { test, expect } from '@playwright/test';

test('Homepage has correct title', async ({ page }) => {
	await page.goto('/'); // Base URL is automatically prefixed
	const title = await page.title();
	expect(title).toBe('Kashinoga'); // Replace with your website's title
});

test('Navigate to another page', async ({ page }) => {
	await page.goto('/');
	await page.click('text=Menu'); // Replace 'About' with a link text or selector
	await expect(page).toHaveURL('/menu'); // Update with your URL
});
