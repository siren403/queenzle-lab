import { expect, test } from '@playwright/test';

test('lab page loads and supports core interactions', async ({ page }) => {
	await page.goto('lab/');

	await expect(page.getByRole('heading', { name: '모던 퀸즐 연구실' })).toBeVisible();
	await expect(page.locator('.pixi-host canvas')).toBeVisible();
	await expect(page.getByTestId('stat-xs')).toContainText('엑스 0');
	await expect(page.getByTestId('stat-hypotheses')).toContainText('가설 0');

	const canvas = page.locator('.pixi-host canvas');
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	if (!box) return;

	const targetX = box.x + box.width * 0.2;
	const targetY = box.y + box.height * 0.2;

	await page.mouse.click(targetX, targetY);
	await expect(page.getByTestId('stat-xs')).toContainText('엑스 1');

	await page.mouse.click(targetX, targetY);
	await expect(page.getByTestId('stat-hypotheses')).toContainText('가설 1');

	await page.mouse.click(targetX, targetY);
	await expect(page.getByTestId('stat-xs')).toContainText('엑스 0');
	await expect(page.getByTestId('stat-hypotheses')).toContainText('가설 0');

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
	await page.setViewportSize({ width: 1100, height: 900 });
	await page.setViewportSize({ width: 430, height: 932 });
	await page.goto('lab/');

	await expect(page.getByRole('heading', { name: '모던 퀸즐 연구실' })).toBeVisible();
	const boardHost = page.locator('.pixi-host');
	await expect(boardHost).toBeVisible();

	const mobileWidth = (await boardHost.boundingBox())?.width ?? 0;
	expect(mobileWidth).toBeGreaterThan(200);

	await page.getByRole('button', { name: '설정' }).click();
	await expect(page.getByText('세부 기능')).toBeVisible();
	await expect(page.getByRole('link', { name: '홈으로' })).toBeVisible();
	await page.getByRole('link', { name: '홈으로' }).click();
	await expect(page.getByRole('heading', { name: '모던 퀸즐' })).toBeVisible();
	await page.screenshot({ path: 'test-results/lab-smoke.png' });
});

test('board resizes immediately when viewport shrinks', async ({ page }) => {
	await page.setViewportSize({ width: 1180, height: 900 });
	await page.goto('lab/');

	const boardHost = page.locator('.pixi-host');
	const initialWidth = (await boardHost.boundingBox())?.width ?? 0;
	expect(initialWidth).toBeGreaterThan(500);

	await page.setViewportSize({ width: 520, height: 900 });
	await expect
		.poll(async () => (await boardHost.boundingBox())?.width ?? 0)
		.toBeLessThan(initialWidth - 100);
});
