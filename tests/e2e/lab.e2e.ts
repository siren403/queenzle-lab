import { expect, test } from '@playwright/test';

test('lab page loads and supports core interactions', async ({ page }) => {
	await page.goto('lab/');

	await expect(page.getByRole('heading', { name: 'Modern Queenzle Lab' })).toBeVisible();
	await expect(page.locator('.pixi-host canvas')).toBeVisible();

	const canvas = page.locator('.pixi-host canvas');
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;

	await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
	await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.2);
	await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
	await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
	await page.mouse.up();

	await page.getByRole('button', { name: 'Save Snapshot' }).click();
	await page.getByRole('button', { name: 'Reset' }).click();
	await page.getByRole('button', { name: 'Restore Snapshot' }).click();

	await expect(page.getByText(/Catalog|Generator/)).toBeVisible();
	await page.screenshot({ path: 'test-results/lab-smoke.png' });
});
