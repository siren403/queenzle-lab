import { expect, test } from '@playwright/test';

test('lab page loads and supports core interactions', async ({ page }) => {
	await page.goto('lab/');

	await expect(page.getByRole('heading', { name: '모던 퀸즐 연구실' })).toBeVisible();
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

	await page.getByRole('button', { name: '현재 상태 저장' }).click();
	await page.getByRole('button', { name: '초기화' }).click();
	await page.locator('.snapshot-card').first().click();

	await expect(page.getByText(/검증된 시드|생성 시도/)).toBeVisible();
	await page.screenshot({ path: 'test-results/lab-smoke.png' });
});

test('mobile lab keeps board first and opens settings', async ({ page }) => {
	await page.setViewportSize({ width: 430, height: 932 });
	await page.goto('lab/');

	await expect(page.getByRole('heading', { name: '모던 퀸즐 연구실' })).toBeVisible();
	await expect(page.locator('.pixi-host')).toBeVisible();
	await page.getByRole('button', { name: '설정' }).click();
	await expect(page.getByText('세부 기능')).toBeVisible();
	await page.screenshot({ path: 'test-results/lab-smoke.png' });
});
