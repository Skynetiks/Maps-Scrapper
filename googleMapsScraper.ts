import { chromium, Page } from "playwright";
import { baseInstance } from "./baseClass";

interface Business {
  name: string;
  address: string;
}

async function scrapeGoogleMaps() {
  // Launch the browser
  const browser = await chromium.launch({ headless: false }); // Set to true for headless mode
  const page = await browser.newPage();

  // Navigate to Google Maps
  await baseInstance.openURL("https://www.google.com/maps", page);

  // Search for a location or business
  const searchQuery = "IT companies in Noida";
  await baseInstance.enterText("input#searchboxinput", searchQuery, page);
  await baseInstance.keyboardPress("Enter", page);

  // Wait for the results to load
  await baseInstance.waitForElement(
    "//div[contains(@aria-label,'Results')]",
    page
  );

  console.log("Scraping started...");

  // Infinite loop for scraping

  while (true) {
    await baseInstance.hoverOverElement(
      "//div[contains(@aria-label,'Results')]",
      page
    );
    await page.mouse.wheel(0, 1000);

    const reachedBotton = await baseInstance.isDisplayedWithoutWait(
      "//span[contains(text(),'end of the list.')]",
      page
    );
    if (reachedBotton) {
      break;
    }
  }
  // Get all `a` elements (using XPath to locate them)
  const allAnchorElements = await page.$$(
    "xpath=//a[contains(@href,'https://www.google.com/maps/place/')]"
  );

  // Iterate through all `a` elements and get their `href` attribute
  for (let i = 0; i < allAnchorElements.length; i++) {
    const xpath = `(//a[contains(@href,'https://www.google.com/maps/place/')])[${
      i + 1
    }]`; // XPath for each anchor tag
    const href = await baseInstance.getHtmlAttributeByXPath(
      xpath,
      "href",
      page
    );
    if (href) {
      const page2 = await browser.newPage();
      await baseInstance.openURL(href, page2);

      // Close page2
      await page2.close();
    }
  }
  await delay(3000);

  // Close the browser (won't be reached due to infinite loop)
  await browser.close();
}

function delay(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Start scraping
scrapeGoogleMaps().catch(console.error);
