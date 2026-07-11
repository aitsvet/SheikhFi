// Wallet-less smoke: the webapp falls back to a read-only JsonRpcProvider
// (VITE_RPC_URL), so real contract state seeded by deploy.js is visible.
import { test, expect } from '@playwright/test';

test('shell renders and screens show live contract data', async ({ page }) => {
  await page.goto('/');

  // brand + guest identity
  await expect(page.locator('.brand .latin')).toHaveText('SheikhFi');
  await expect(page.locator('.identity-card')).toContainText('Disconnected');

  // overview KPIs render (zeros — nothing deposited yet)
  await expect(page.getByText('Total funds').first()).toBeVisible();

  // members seeded by deploy.js are read through the fallback provider
  await page.getByRole('button', { name: /Members/ }).click();
  await expect(page.getByText('Bob').first()).toBeVisible();
  await expect(page.getByText('Charlie').first()).toBeVisible();

  // treasury shows contract metadata
  await page.getByRole('button', { name: /Treasury/ }).click();
  await expect(page.getByText('Approval threshold')).toBeVisible();
  await expect(page.getByText('60.0%')).toBeVisible();

  // proposals screen renders its empty state
  await page.getByRole('button', { name: /Proposals/ }).click();
  await expect(page.getByText('No proposals match this filter.')).toBeVisible();
});
