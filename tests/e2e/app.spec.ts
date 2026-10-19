import { test, expect } from "@playwright/test";
test("register, stream, reload, edit with context, cite, stop, delete and log out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "登录", exact: true }),
  ).toBeVisible();
  await page.goto("/register");
  await page.getByLabel("用户名").fill("browseruser");
  await page.getByLabel("密码", { exact: true }).fill("browser-password");
  await page.getByLabel("邀请码").fill("test-only-invitation");
  await page.getByRole("button", { name: "注册并进入对话" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(
    page.getByText("当前为联调测试模式，回答为测试数据。"),
  ).toBeVisible();
  const input = page.locator("textarea").last();
  await input.fill("你好，我喜欢苹果");
  await input.press("Enter");
  await expect(
    page.locator(".message-row.assistant .message-bubble").last(),
  ).toContainText("联调测试回复");
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page
    .getByRole("button", { name: "你好，我喜欢苹果", exact: true })
    .click();
  await expect(page.locator(".message-row")).toHaveCount(2);
  await input.fill("你还记得吗");
  await input.press("Enter");
  await expect(page.locator(".message-row")).toHaveCount(4);
  await expect(
    page.locator(".message-row.assistant .message-bubble").last(),
  ).toContainText("你还记得吗");
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }).last(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "编辑", exact: true }).last().click();
  const editor = page.locator(".message-editor textarea");
  await editor.fill("请记得苹果");
  await page.getByRole("button", { name: "保存并重新生成" }).click();
  await expect(
    page.locator(".message-row.assistant .message-bubble").last(),
  ).toContainText("你好，我喜欢苹果；请记得苹果");
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }).last(),
  ).toBeEnabled();
  await page.getByRole("button", { name: "开启新对话" }).click();
  await input.fill("中心的五子棋课程什么时候开放");
  await input.press("Enter");
  await expect(page.locator(".message-sources")).toContainText("测试中心课程");
  await expect(page.locator(".message-sources")).toContainText("v1");
  await page.getByRole("button", { name: "开启新对话" }).click();
  await input.fill("你好" + "苹果".repeat(100));
  await input.press("Enter");
  await page.getByRole("button", { name: /停止/ }).click();
  await expect(page.getByText("回答已由你停止")).toBeVisible();
  await page.reload();
  await expect(page.locator(".history-entry")).not.toHaveCount(0);
  const first = page.locator(".history-entry").first();
  await first.locator("button").first().click();
  await first.getByRole("button", { name: /删除对话/ }).click();
  await expect(page.getByText("今天想聊点什么？")).toBeVisible();
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
test("admin can unpublish evidence while ordinary sessions cannot access admin APIs", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("testadmin");
  await page.getByLabel("密码", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "资料与服务管理" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下架", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "发布", exact: true }),
  ).toBeVisible();
});
