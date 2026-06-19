export const HUB_UI_DELAY_MS = 250

export function waitForHubUiDelay() {
  return new Promise((resolve) => {
    setTimeout(resolve, HUB_UI_DELAY_MS)
  })
}
