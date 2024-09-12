import { chromium, Page } from "playwright";
import { baseInstance } from "./baseClass";
import { extractDigits} from "./helper";

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

    // XPath for each anchor tag
    const xpath = `(//a[contains(@href,'https://www.google.com/maps/place/')])[${
      i + 1
    }]`;

    const href = await baseInstance.getHtmlAttributeByXPath(
      xpath,
      "href",
      page
    );

    if (href) {
      const page2 = await browser.newPage();
      await baseInstance.openURL(href, page2);

      const companyName = await baseInstance.getText("//h1", page2)
      const rating = await baseInstance.getText("(//span[contains(@aria-label,'stars')])[2]/preceding-sibling::span", page2)
      const address = (await baseInstance.getText("//button[@data-item-id='address']", page2))?.slice(2)
      const website = await baseInstance.getHtmlAttributeByXPath("//a[contains(@aria-label,'Website: ')]","href", page2)
      const phone = extractDigits(await baseInstance.getHtmlAttributeByXPath("//button[contains(@aria-label,'Phone: ')]", "data-item-id", page2) || "")

      if(website){
        const page3 = await browser.newPage();
        await baseInstance.openURL(website, page3);

        const pageContent = await page3.content();
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = pageContent.match(emailRegex) || [];
    
        // Remove duplicates
        const uniqueEmail = Array.from(new Set(emails))[0];

        // Close page3
        await page3.close();
      }

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
