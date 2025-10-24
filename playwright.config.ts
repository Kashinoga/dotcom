import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

// const config: PlaywrightTestConfig = {
// 	webServer: {
// 		command: 'npm run build; npm run preview',
// 		port: 4173
// 	},
// 	testDir: 'tests',
// 	testMatch: /(.+\.)?(test|spec)\.[jt]s/
// };

export default defineConfig({
	use: {
		baseURL: 'http://localhost:5173/', // Replace with your local server URL
		browserName: 'webkit' // Default browser for tests
	},
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/
	// webServer: {
	// 	command: 'npm run dev', // Start your server if it's not already running
	// 	port: 5173, // Update to match your local server port
	// 	timeout: 120 * 1000 // Increase timeout if needed
	// }
});
