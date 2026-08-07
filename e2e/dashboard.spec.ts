import { expect, test } from '@playwright/test';

test('00001 loads and the dashboard remains usable', async ({ page }, testInfo) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '钱从四面八方来' })).toBeVisible();
  await expect(page.getByRole('link', { name: '红绿观察台' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增红绿' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('股票');
  const row = page.getByRole('row').filter({ hasText: '00001' }).last();
  await expect(row).toContainText('长和');
  await expect(row.locator('.price-cell strong')).not.toHaveText('--');
  await expect(row.locator('.position-value').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '成本红利率' })).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: '日位置' })).toHaveCount(1);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('money-from-everywhere');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('watchlist', 'readwrite');
      const store = transaction.objectStore('watchlist');
      const request = store.get('HKEX:00001');
      request.onsuccess = () => {
        const seed = request.result;
        store.put({
          ...seed,
          averageBuyPrice: '66.8',
          manualAnnualDividendPerShare: '0.4',
        });
        store.put({
          ...seed,
          securityKey: 'HKEX:00002',
          symbol: '00002',
          name: '中电控股',
          alias: '排序样本',
          providerSecurityId: '116.00002',
          sortOrder: 1,
        });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  const tableRows = page.locator('.market-table tbody tr');
  await expect(tableRows).toHaveCount(2);
  await expect(tableRows.nth(0)).toContainText('验收样本');
  await page.getByRole('button', { name: '下移 00001' }).click();
  await expect(tableRows.nth(0)).toContainText('排序样本');
  await page.reload();
  await expect(tableRows.nth(0)).toContainText('排序样本');
  const buyPrice = page.getByRole('row').filter({ hasText: '00001' }).last().locator('.buy-price-value');
  await expect(buyPrice).toHaveText('66.800');
  expect(Number(await buyPrice.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);
  expect(await row.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(38);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const tableFrame = page.locator('.table-frame');
  await tableFrame.evaluate((element) => { element.scrollLeft = 800; });
  const [frameBox, aliasBox] = await Promise.all([
    tableFrame.boundingBox(),
    page.locator('tbody .sticky-alias').first().boundingBox(),
  ]);
  expect(Math.abs((aliasBox?.x ?? 0) - (frameBox?.x ?? 0))).toBeLessThanOrEqual(2);
  await page.getByRole('row').filter({ hasText: '00001' }).last().click();
  for (const label of ['当前价红利率', '成本红利率']) {
    const value = page.locator('.metric').filter({ hasText: label }).locator('strong');
    await expect(value).not.toHaveText('--');
    expect(Number(await value.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(800);
  }
  await page.screenshot({ path: testInfo.outputPath('detail-emphasis.png'), fullPage: true });
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '买入记录 00001' }).click();
  const purchaseDialog = page.getByRole('dialog', { name: '00001 买入记录' });
  await expect(purchaseDialog).toContainText('验收样本 · 长和 · 00001.HK');
  await expect(purchaseDialog.getByLabel(/买入价/)).toHaveValue('66.8');
  await expect(purchaseDialog.getByLabel('每股年红利')).toHaveValue('0.4');
  await expect(purchaseDialog.getByText('+0.60%')).toBeVisible();
  await purchaseDialog.getByRole('button', { name: '保存记录' }).click();
  const purchaseRow = purchaseDialog.getByRole('row').filter({ hasText: '66.800' });
  await expect(purchaseRow).toContainText('+0.60%');
  await expect(purchaseRow).toContainText('观察列表');
  await page.screenshot({ path: testInfo.outputPath('purchase-history.png'), fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await purchaseRow.getByRole('button', { name: /删除 .* 的买入记录/ }).click();
  await expect(purchaseDialog.getByText('暂无买入记录')).toBeVisible();
  await purchaseDialog.getByRole('button', { name: '关闭' }).last().click();
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
});

test('settings can verify the Eastmoney connection', async ({ page }, testInfo) => {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: '用 00001 测试连接' }).click();
  await expect(page.getByText(/连接正常：长和（00001.HK）=/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('settings.png'), fullPage: true });
});

test('diary entries can be created and edited in the list', async ({ page }, testInfo) => {
  await page.goto('/#/diary');
  await expect(page.getByRole('heading', { name: '日记', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增日记' }).first().click();

  const createDialog = page.getByRole('dialog', { name: '新增日记' });
  await createDialog.getByLabel('日记日期').fill('2026-08-07');
  await createDialog.getByLabel('标题').fill('第一次复盘');
  await createDialog.getByLabel('正文').fill('今天记录市场观察和后续计划。');
  await createDialog.getByRole('button', { name: '保存日记' }).click();

  const diaryList = page.getByRole('region', { name: '日记列表' });
  const entry = diaryList.getByRole('listitem');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('第一次复盘');
  await expect(entry).toContainText('今天记录市场观察和后续计划。');

  await entry.getByRole('button', { name: '编辑日记 第一次复盘' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑日记' });
  await editDialog.getByLabel('标题').fill('第一次复盘（已编辑）');
  await editDialog.getByLabel('正文').fill('这是编辑后保存的日记内容。');
  await editDialog.getByRole('button', { name: '保存日记' }).click();

  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('第一次复盘（已编辑）');
  await expect(entry).toContainText('这是编辑后保存的日记内容。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('diary-list.png'), fullPage: true });
});
