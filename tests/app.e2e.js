import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const htmlSource = fs.readFileSync(path.resolve('public/index.html'), 'utf8');
const cssSource = fs.readFileSync(path.resolve('public/app.css'), 'utf8');
let jsSource = fs.readFileSync(path.resolve('public/app.js'), 'utf8');
jsSource = jsSource
  .replace(/const PAGE_SLUG=.*?;\n/, "const PAGE_SLUG='family-one';\n")
  .replace(/const CLOUD_ENABLED=.*?;\n/, 'const CLOUD_ENABLED=false;\n')
  .replace(/const DEMO_MODE=.*?;\n/, 'const DEMO_MODE=true;\n')
  .replaceAll('</script>', '<\\/script>');
const storageShim = `<script>(()=>{const values=new Map();const storage={getItem:k=>values.has(String(k))?values.get(String(k)):null,setItem:(k,v)=>values.set(String(k),String(v)),removeItem:k=>values.delete(String(k)),clear:()=>values.clear(),key:i=>[...values.keys()][i]??null,get length(){return values.size}};Object.defineProperty(window,'localStorage',{value:storage,configurable:true});})();<\/script>`;
const testDocument = htmlSource
  .replace(/<link[^>]+href="\/app\.css"[^>]*>/i, `<style>${cssSource}</style>`)
  .replace(/<script[^>]+src="\/app\.js"[^>]*><\/script>/i, `${storageShim}<script>${jsSource}</script>`)
  .replace(/<link[^>]+rel="manifest"[^>]*>/i, '')
  .replace(/<link[^>]+rel="icon"[^>]*>/i, '');

async function load(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(testDocument, { waitUntil: 'load' });
  await page.waitForTimeout(80);
  return errors;
}

test('approved frontend loads without runtime errors on desktop', async ({ page }) => {
  const errors = await load(page);
  await expect(page.locator('.header .logo')).toContainText('CarePlan');
  await expect(page.locator('.header .logo')).toContainText('Specialcare');
  await expect(page.locator('#todayScroll .v94-page-head h1')).toBeVisible();
  await expect(page.locator('#todayScroll .v94-page-head .eyebrow')).toHaveCount(0);
  await expect(page.locator('.preview-ribbon')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('meal dates are separated into readable weekday and date lines', async ({ page }) => {
  await load(page);
  await page.locator('[data-v94-nav="meals"]').first().click();
  const first = page.locator('#mealsScroll .v98-meal-date').first();
  await expect(first).toBeVisible();
  await expect(first.locator('strong')).not.toHaveText('');
  await expect(first.locator('span')).toHaveText(/\d{1,2}\s+[A-Za-z]{3}/);
});

test('SOS emergency contacts use aligned card rows', async ({ page }) => {
  await load(page);
  await page.locator('[data-v94-nav="sos"]').first().click();
  const contact = page.locator('#sosScroll .contact-row').first();
  await expect(contact).toBeVisible();
  const style = await contact.evaluate(el => ({ display: getComputedStyle(el).display, radius: getComputedStyle(el).borderRadius }));
  expect(style.display).toBe('grid');
  expect(parseFloat(style.radius)).toBeGreaterThanOrEqual(14);
  await expect(contact.locator('strong')).toContainText('Nur Amina');
  await expect(contact.locator('a[href^="tel:"]')).toBeVisible();
});

test('external link popup places Delete before Edit and deletion works', async ({ page }) => {
  await load(page);
  await page.locator('[data-v97-external-links]').first().click();
  const card = page.locator('.v97-link-card').first();
  await expect(card).toBeVisible();
  const actions = card.locator('.v98-link-actions button');
  await expect(actions).toHaveCount(2);
  await expect(actions.nth(0)).toHaveAttribute('data-v98-delete-link');
  await expect(actions.nth(1)).toHaveAttribute('data-v97-edit-link');
  page.once('dialog', dialog => dialog.accept());
  const before = await page.locator('.v97-link-card').count();
  await actions.nth(0).click();
  await expect(page.locator('.v97-link-card')).toHaveCount(before - 1);
});

test('Care and Calendar printing include image attachments', async ({ page }) => {
  await load(page);
  const result = await page.evaluate(async () => {
    window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; };
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const blob = new Blob([png], { type: 'image/png' });
    const mediaId = 'media_test_image';
    await v94PutMedia({ id: mediaId, name: 'positioning-reference.png', type: 'image/png', kind: 'image', blob });
    const target = state.therapies[0];
    target.attachments = [{ id: mediaId, name: 'positioning-reference.png', type: 'image/png', kind: 'image' }];
    await v96PrintCareSchedule();
    await new Promise(r => setTimeout(r, 180));
    const careImages = document.querySelectorAll('#printSheet .print-media-item img').length;
    await v97PrintCalendar();
    await new Promise(r => setTimeout(r, 180));
    const calendarImages = document.querySelectorAll('#printSheet .print-media-item img').length;
    return { careImages, calendarImages, calls: window.__printCalls || 0 };
  });
  expect(result.careImages).toBeGreaterThan(0);
  expect(result.calendarImages).toBeGreaterThan(0);
  expect(result.calls).toBeGreaterThanOrEqual(2);
});

test('mobile PWA navigation exposes the full organized drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  await page.locator('[data-v94-mobile="menu"]').click();
  await expect(page.locator('#v94More')).toHaveClass(/show/);
  await expect(page.locator('#v94MoreGrid')).toContainText('Care workspace');
  await expect(page.locator('#v94MoreGrid')).toContainText('Plans & records');
  await expect(page.locator('#v94MoreGrid')).toContainText('Safety & profile');
  await expect(page.locator('#v94MoreGrid')).toContainText('External links');
});
