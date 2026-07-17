import { expect, test } from "@playwright/test";

test("renders the application shell without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(page).toHaveTitle("Ambient Lapis");
  await expect(
    page.getByRole("heading", { name: "ダッシュボードの基盤を準備しています" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
