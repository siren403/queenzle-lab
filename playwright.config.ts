import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.e2e.ts',
	use: {
		baseURL: 'http://127.0.0.1:4173/queenzle-lab/'
	},
	webServer: {
		command: 'bun run build && bun run preview',
		port: 4173
	}
});
