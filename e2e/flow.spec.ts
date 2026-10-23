import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 80; index++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('importação, origem por teclado, edição persistente e indicadores reais', async ({
  page,
  request,
}) => {
  const fixture = JSON.parse(await readFile('fixtures/import-example.json', 'utf8'));
  const suffix = randomUUID();
  const title = `Oficina E2E ${suffix}`;
  fixture.meetings[0].externalId = `e2e-${suffix}`;
  fixture.meetings[0].title = title;
  const initial = await (await request.get('/api/summary')).json();
  await page.goto('/#/import');
  await tabTo(page, page.getByLabel('Conteúdo JSON'));
  await page.keyboard.insertText(JSON.stringify(fixture));
  await tabTo(page, page.getByRole('button', { name: 'Importar reuniões', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('1 reuniões e 1 ações');
  await tabTo(page, page.getByRole('link', { name: 'Consultar reuniões importadas' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByLabel('Buscar por título'));
  await page.keyboard.insertText(title);
  await tabTo(page, page.getByRole('button', { name: 'Aplicar filtros' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('link', { name: new RegExp(title) }));
  await page.keyboard.press('Enter');
  const action = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Preparar roteiro da oficina' }) });
  const source = action.getByRole('link', { name: 'Ver trecho de origem' });
  // Enter must activate the link and transfer focus into the transcript.
  await tabTo(page, source);
  await page.keyboard.press('Enter');
  const origin = page.getByRole('listitem', { name: 'Trecho de origem da ação' });
  await expect(origin).toBeFocused();
  await expect(origin).toContainText('Vou preparar o roteiro');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await tabTo(page, action.getByLabel('Responsável'));
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Pessoa E2E sintética');
  await tabTo(page, action.getByRole('combobox', { name: 'Status', exact: true }));
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await tabTo(page, action.getByRole('button', { name: 'Salvar ação' }));
  await page.keyboard.press('Enter');
  await expect(action.getByRole('status')).toHaveText('Alterações salvas.');
  await page.reload();
  await expect(action.getByLabel('Responsável')).toHaveValue('Pessoa E2E sintética');
  await expect(action.getByLabel('Prazo')).toHaveValue('2026-10-23');
  await expect(action.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('done');
  const summary = await (await request.get('/api/summary')).json();
  expect(summary.meetingCount).toBe(initial.meetingCount + 1);
  expect(summary.openCount).toBe(initial.openCount);
  expect(summary.byStatus.done).toBe(initial.byStatus.done + 1);
  await tabTo(page, page.getByRole('link', { name: 'Visão geral', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('table', { name: 'Contagem de ações por status' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('layout, axe e link de salto em 360, 768 e desktop', async ({ page }) => {
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/meetings', '/actions', '/import']) {
      await page.goto(`/#${route}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Carregando dados…').first()).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  }
  await page.goto('/#/meetings');
  await page.reload();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page).toHaveURL(/#\/meetings$/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('falha da API permite nova tentativa', async ({ page }) => {
  await page.route('**/api/summary', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'Serviço temporariamente indisponível.' },
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível');
  await page.unroute('**/api/summary');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Ritmo das ações' })).toBeVisible();
});
