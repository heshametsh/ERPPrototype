using Microsoft.Playwright;

namespace ERPPrototype.E2ETests;

internal sealed class LoginPage(IPage page, Uri baseUri)
{
    private ILocator PageRoot => page.GetByTestId("login-page");
    private ILocator UserName => page.GetByTestId("login-username");
    private ILocator Password => page.GetByTestId("login-password");
    private ILocator Submit => page.GetByTestId("login-submit");

    public async Task OpenAsync(string returnUrl = "/work-orders")
    {
        var encodedReturnUrl = Uri.EscapeDataString(returnUrl);
        var loginUri = new Uri(
            baseUri,
            $"/Account/Login?ReturnUrl={encodedReturnUrl}");

        var response = await page.GotoAsync(
            loginUri.ToString(),
            new PageGotoOptions
            {
                WaitUntil = WaitUntilState.DOMContentLoaded
            });

        E2ETestAssert.True(
            response is not null && response.Ok,
            "The login page did not return a successful response.");

        await PageRoot.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await UserName.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await Password.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });

        await Submit.WaitForAsync(
            new LocatorWaitForOptions
            {
                State = WaitForSelectorState.Visible
            });
    }

    public async Task LoginAsync(E2ESeedData seed)
    {
        await UserName.FillAsync(seed.UserName);
        await Password.FillAsync(seed.Password);
        await Submit.ClickAsync();

        await page.WaitForURLAsync(
            "**/work-orders*",
            new PageWaitForURLOptions
            {
                Timeout = 45_000
            });
    }
}
