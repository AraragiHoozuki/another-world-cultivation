import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("character creation reaches the playable game", async ({ page }, testInfo) => {
  await expect(page.getByRole("heading", { name: "择一命格，踏入此界" })).toBeVisible();
  await page.getByLabel("道友名讳").fill("沈照夜");
  await page.getByRole("button", { name: /坠入异界/ }).click();
  await expect(page.locator(".chronicle-section")).toBeVisible();
  await page.getByRole("button", { name: testInfo.project.name === "mobile" ? "舆图" : "异界舆图", exact: true }).click();
  const currentNode = page.locator(".map-node.current");
  if (testInfo.project.name === "mobile") await currentNode.dispatchEvent("contextmenu");
  else await currentNode.click({ button: "right" });
  await expect(page.getByRole("dialog", { name: /今日行止/ })).toBeVisible();
  await page.getByRole("button", { name: /闭关吐纳/ }).click();
  if (await page.locator(".action-duration-dialog").isVisible()) {
    await page.getByRole("button", { name: /开始行动/ }).click();
  }
  if (await page.locator(".event-dialog").isVisible()) {
    await page.locator(".event-dialog .choice-list button:not(:disabled)").first().click();
    await expect(page.locator(".event-dialog")).toBeHidden();
  }
  if (await page.locator(".event-result-dialog").isVisible()) {
    await page.getByRole("button", { name: /继续/ }).click();
  }
  await page.getByRole("button", { name: "历程", exact: true }).click();
  await expect(page.locator(".chronicle-section")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-game.png`), fullPage: true });
});

test("mobile layout has no horizontal overflow and keeps navigation visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only responsive assertion");
  await page.getByRole("button", { name: /坠入异界/ }).click();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await expect(page.getByRole("navigation", { name: "主要视图" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-game.png"), fullPage: true });
});

test("procedural world map allows travel along a road", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: /坠入异界/ }).click();
  await page.getByRole("button", { name: testInfo.project.name === "mobile" ? "舆图" : "异界舆图", exact: true }).click();
  await expect(page.getByRole("heading", { name: "异界舆图" })).toBeVisible();
  const mapLayout = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(".map-node")).map((node) => node.getBoundingClientRect());
    const overlaps: Array<[number, number]> = [];
    for (let first = 0; first < nodes.length; first += 1) {
      for (let second = first + 1; second < nodes.length; second += 1) {
        const a = nodes[first]; const b = nodes[second];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push([first, second]);
      }
    }
    return { overlaps, viewportWidth: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth };
  });
  expect(mapLayout.overlaps).toEqual([]);
  expect(mapLayout.pageWidth).toBeLessThanOrEqual(mapLayout.viewportWidth);
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-map.png`), fullPage: true });
  await page.locator(".map-node.reachable:not(.current):not(.locked)").first().click();
  await page.getByRole("button", { name: /前往此地/ }).click();
  if (await page.locator(".event-dialog").isVisible()) {
    await expect(page.locator(".event-dialog")).toHaveAttribute("role", "dialog");
  } else {
    await expect(page.getByText(/踏上行途/).first()).toBeVisible();
  }
  // Travel originates on the map and should never send the player back to the chronicle.
  await expect(page.locator(".center-panel.active .world-map-section")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-travel.png`), fullPage: true });
});
