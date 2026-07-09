import { _electron as electron } from 'playwright';
import { test, expect } from '@playwright/test';
import path from 'path';

test('Launch electron app and verify main window loads', async () => {
  // Launch Electron app
  const electronApp = await electron.launch({
    args: ['main.js'],
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'development' }
  });

  // Get the first window that the app opens
  const window = await electronApp.firstWindow();

  // The app might take a moment to load React, so wait for the root element
  await window.waitForSelector('#root', { timeout: 20000 });

  // Optional: Take a screenshot to verify UI in logs if needed
  // await window.screenshot({ path: 'test/screenshot.png' });

  // Check that some essential UI component is visible (e.g. sidebar or main content area)
  // Assuming there's a div or main with the root id
  const root = window.locator('#root');
  await expect(root).toBeVisible();

  // Close the app
  await electronApp.close();
});
