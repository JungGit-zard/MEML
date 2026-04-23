const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = `file:///${path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/')}`;
const now = new Date();
const expectedYear = now.getFullYear();
const expectedMonth = now.getMonth() + 1;
const expectedPeriod = `${expectedYear}-${String(expectedMonth).padStart(2, '0')}`;
const previousDate = new Date(expectedYear, expectedMonth - 2, 1);
const previousPeriod = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;

async function holdDrag(page, sourceHandle, targetItem) {
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetItem.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height - 8, { steps: 8 });
  await page.mouse.up();
}

test('adds, persists, and escapes month-specific item data', async ({ page }) => {
  await page.goto(fileUrl);
  await expect(page.locator('#items .item')).toHaveCount(9);
  await expect(page.locator('#monthTitle')).toContainText(`${expectedYear}년 ${expectedMonth}월`);

  await page.locator('#openManageBtn').click();
  await page.locator('#monthlyName').fill('PW monthly item');
  await page.locator('#monthlyAmount').fill('12000');
  await page.locator('#monthlyDueDay').fill('15');
  await page.locator('#monthlyForm button[type="submit"]').click();

  await expect(page.locator('#monthlyList')).toContainText('PW monthly item');
  await expect(page.locator('#countTotal')).toHaveText('10');

  const invalidCount = await page.locator('#monthlyList .row').count();
  await page.locator('#monthlyName').fill('Invalid due day');
  await page.locator('#monthlyDueDay').fill('99');
  await page.locator('#monthlyForm button[type="submit"]').click();
  await expect(page.locator('#monthlyList .row')).toHaveCount(invalidCount);

  await page.locator('[data-close="manage"]').click();
  const item = page.locator('#items .item').filter({ hasText: 'PW monthly item' });
  await item.locator('.check').click();
  await item.locator('.icon-btn.memo').click();
  await page.locator('#memoText').fill('PW memo <script>alert(1)</script>');
  await page.locator('#saveMemoBtn').click();

  const storedMonthly = await page.evaluate(() => localStorage.getItem('meml_month_specific_items'));
  const storedState = await page.evaluate(() => localStorage.getItem('meml_monthly_state'));
  const storedMemos = await page.evaluate(() => localStorage.getItem('meml_month_item_memos'));
  expect(storedMonthly).toContain(`"${expectedPeriod}"`);
  expect(storedState).toContain(`"${expectedPeriod}"`);
  expect(storedMemos).toContain(`${expectedPeriod}:`);
  await expect(item.locator('.memo-preview')).toBeVisible();
  expect(await item.evaluate(el => el.innerHTML.includes('<script>alert(1)</script>'))).toBe(false);

  await page.reload();
  await expect(page.locator('#items')).toContainText('PW monthly item');
  await expect(page.locator('#items .item').filter({ hasText: 'PW monthly item' }).locator('.memo-preview')).toBeVisible();
});

test('keeps checked states stable across repeated reloads and month switches', async ({ page }) => {
  await page.goto(fileUrl);
  await page.locator('#openManageBtn').click();
  await page.locator('#monthlyName').fill('Stability item');
  await page.locator('#monthlyForm button[type="submit"]').click();
  await page.locator('[data-close="manage"]').click();

  await page.locator('#items .item').first().locator('.check').click();
  await page.locator('#items .item').filter({ hasText: 'Stability item' }).locator('.check').click();
  await expect(page.locator('#countTotal')).toHaveText('10');
  await expect(page.locator('#countPaid')).toHaveText('2');

  const otherMonth = expectedMonth === 12 ? 11 : expectedMonth + 1;
  for (let index = 0; index < 6; index += 1) {
    await page.reload();
    await expect(page.locator('#items .item')).toHaveCount(10);
    await expect(page.locator('#items')).toContainText('Stability item');
    await expect(page.locator('#countPaid')).toHaveText('2');
    await page.locator(`.month-tab[data-month="${otherMonth}"]`).click();
    await page.locator(`.month-tab[data-month="${expectedMonth}"]`).click();
    await expect(page.locator('#items .item')).toHaveCount(10);
    await expect(page.locator('#countPaid')).toHaveText('2');
  }

  const storedState = JSON.parse(await page.evaluate(() => localStorage.getItem('meml_monthly_state')));
  const storedMonthly = JSON.parse(await page.evaluate(() => localStorage.getItem('meml_month_specific_items')));
  expect(Object.keys(storedState).filter(key => key === expectedPeriod)).toHaveLength(1);
  expect(storedMonthly[expectedPeriod]).toHaveLength(1);
});

test('reorders current checklist items by dragging and persists order', async ({ page }) => {
  await page.goto(fileUrl);
  await expect(page.locator('#items .item')).toHaveCount(9);

  const first = page.locator('#items .item').nth(0);
  const third = page.locator('#items .item').nth(2);
  const firstName = await first.locator('.item-name').textContent();
  const thirdName = await third.locator('.item-name').textContent();

  await holdDrag(page, first.locator('.drag-handle'), third);
  await expect(page.locator('#items .item').nth(2).locator('.item-name')).toHaveText(firstName);
  await expect(page.locator('#items .item').nth(1).locator('.item-name')).toHaveText(thirdName);

  const order = JSON.parse(await page.evaluate(() => localStorage.getItem('meml_month_item_order')));
  expect(order[expectedPeriod]).toHaveLength(9);

  await page.reload();
  await expect(page.locator('#items .item').nth(2).locator('.item-name')).toHaveText(firstName);
  await expect(page.locator('#items .item').nth(1).locator('.item-name')).toHaveText(thirdName);
});

test('migrates legacy month-number keys to period keys and preserves carryover warnings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('meml_month_specific_items', JSON.stringify({ 4: [{ id: 'legacy_monthly', name: 'Legacy monthly', desc: 'old key', amount: '', dueDay: '' }] }));
    localStorage.setItem('meml_monthly_state', JSON.stringify({ 3: {} }));
    localStorage.setItem('meml_month_item_memos', JSON.stringify({ '4:legacy_monthly': 'legacy memo' }));
  });

  await page.goto(fileUrl);
  await expect(page.locator('#items')).toContainText('Legacy monthly');
  await expect(page.locator('#items .warning-note')).toHaveCount(9);
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('meml_month_specific_items'))))).toEqual([expectedPeriod]);
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('meml_monthly_state'))))).toEqual([previousPeriod]);
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('meml_month_item_memos'))))).toEqual([`${expectedPeriod}:legacy_monthly`]);

  for (let index = 0; index < 4; index += 1)
    await page.reload();

  await expect(page.locator('#items')).toContainText('Legacy monthly');
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('meml_month_specific_items'))))).toEqual([expectedPeriod]);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem('meml_month_specific_items'))[key].length, expectedPeriod)).toBe(1);
});

test('merges legacy and period keys without dropping items on repeated loads', async ({ page }) => {
  await page.addInitScript(period => {
    localStorage.clear();
    localStorage.setItem('meml_month_specific_items', JSON.stringify({
      4: [{ id: 'legacy_only', name: 'Legacy only', desc: '', amount: '', dueDay: '' }],
      [period]: [{ id: 'period_only', name: 'Period only', desc: '', amount: '', dueDay: '' }]
    }));
    localStorage.setItem('meml_monthly_state', JSON.stringify({
      4: { fixed_1: true },
      [period]: { fixed_2: true }
    }));
  }, expectedPeriod);

  await page.goto(fileUrl);
  await expect(page.locator('#items')).toContainText('Legacy only');
  await expect(page.locator('#items')).toContainText('Period only');
  await expect(page.locator('#items .item')).toHaveCount(11);
  await expect(page.locator('#countPaid')).toHaveText('2');

  for (let index = 0; index < 3; index += 1)
    await page.reload();

  await expect(page.locator('#items .item')).toHaveCount(11);
  await expect(page.locator('#items')).toContainText('Legacy only');
  await expect(page.locator('#items')).toContainText('Period only');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem('meml_month_specific_items'))[key].length, expectedPeriod)).toBe(2);
});

test('does not overwrite unreadable stored data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('meml_monthly_state', '{broken-json');
  });

  await page.goto(fileUrl);
  await expect(page.locator('#storageAlert')).toBeVisible();
  await expect(page.locator('#storageAlert')).toContainText('읽을 수 없어');
  await page.locator('#items .item').first().locator('.check').click();
  await expect(page.locator('#countPaid')).toHaveText('0');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('meml_monthly_state'))).toBe('{broken-json');
});

test('keeps rendering when localStorage writes fail', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
  });

  await page.goto(fileUrl);
  await expect(page.locator('#items .item')).toHaveCount(9);
  await expect(page.locator('#storageAlert')).toBeVisible();
  await expect(page.locator('#storageAlert')).toContainText('저장 공간을 사용할 수 없어');

  await page.locator('#items .item').first().locator('.check').click();
  await expect(page.locator('#countPaid')).toHaveText('0');
  await expect(page.locator('#items .item').first()).not.toHaveClass(/paid/);

  await page.locator('#openManageBtn').click();
  await page.locator('#monthlyName').fill('Unsaved item');
  await page.locator('#monthlyForm button[type="submit"]').click();
  await expect(page.locator('#monthlyList')).not.toContainText('Unsaved item');

  await page.locator('[data-close="manage"]').click();
  const firstName = await page.locator('#items .item').nth(0).locator('.item-name').textContent();
  await holdDrag(page, page.locator('#items .item').nth(0).locator('.drag-handle'), page.locator('#items .item').nth(2));
  await expect(page.locator('#items .item').nth(0).locator('.item-name')).toHaveText(firstName);
});

test('confirms destructive delete actions', async ({ page }) => {
  await page.goto(fileUrl);
  await page.locator('#openManageBtn').click();
  await page.locator('#monthlyName').fill('Delete guard item');
  await page.locator('#monthlyForm button[type="submit"]').click();
  await expect(page.locator('#monthlyList')).toContainText('Delete guard item');

  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#monthlyList .row').filter({ hasText: 'Delete guard item' }).locator('.icon-btn.delete').click();
  await expect(page.locator('#monthlyList')).toContainText('Delete guard item');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#monthlyList .row').filter({ hasText: 'Delete guard item' }).locator('.icon-btn.delete').click();
  await expect(page.locator('#monthlyList')).not.toContainText('Delete guard item');
});
