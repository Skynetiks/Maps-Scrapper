import { chromium } from "playwright";
import { baseInstance } from "./baseClass";
import { extractDigits, getRandomNumber } from "./helper";
import { cityNames, companyTypes, userAgentStrings } from "./data";
import { Browser, Cookie } from "@playwright/test";
import { query } from "./db";

async function getNewContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent:
      userAgentStrings[Math.floor(Math.random() * userAgentStrings.length)],
  });
  context.setDefaultTimeout(60000);
  await context.addInitScript(
    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
  );
  // Define some random cookies to add
  const randomCookies: Cookie[] = [
    {
      name: "session_id",
      value: "8923798329",
      domain: "cognizant.com",
      path: "/",
      httpOnly: true,
      expires: 893798283,
      secure: true,
      sameSite: "Lax",
    },
    {
      name: "user_id",
      value: "98340924",
      domain: "fadv.com",
      path: "/",
      httpOnly: false,
      secure: false,
      expires: 893798283,
      sameSite: "Lax",
    },
  ];

  // Add the random cookies to the context
  await context.addCookies(randomCookies);
  return context;
}

// Function to create infoCode and infoMatrix
function createInfoCodeAndMatrix(
  name: string | undefined,
  email: string[],
  address: string | undefined,
  phone: string | null,
  website: string | null,
  rating: string | undefined
) {
  const fields = [name, email.length > 0 ? email : null, address, phone, website, rating];
  const labels = ["name", "email", "address", "phone", "website", "rating"];

  let infoCode = "";
  let infoMatrix: string[] = [];

  fields.forEach((field, index) => {
    if (field) {
      infoCode += "1";
      infoMatrix.push(labels[index]);
    } else {
      infoCode += "0";
    }
  });

  return { infoCode, infoMatrix };
}

async function scrapeGoogleMaps() {
  const browser = await chromium.launch({ headless: false });
  const context = await getNewContext(browser);
  const page = await context.newPage();

  // Iterate over each combination of companyTypes and cityNames
  for (const companyType of companyTypes) {
    for (const cityName of cityNames) {
      try {
        let href: string | null;
        let companyName: string | undefined = "";
        let emails: string[] = [];
        let address: string | undefined = "";
        let phoneNumber: string | null = "";
        let website: string | null = "";
        let rating: string | undefined = "";

        const searchQuery = `${companyType} in ${cityName}`;
        console.log(`Searching: ${searchQuery}`);

        // Navigate to Google Maps
        await baseInstance.openURL("https://www.google.com/maps", page);

        // Enter the search query
        await baseInstance.enterText("input#searchboxinput", searchQuery, page);
        await baseInstance.keyboardPress("Enter", page);

        // Wait for the results to load
        await baseInstance.waitForElement(
          "//div[contains(@aria-label,'Results')]",
          page
        );
        console.log(`Scraping started for: ${searchQuery}...`);

        // Infinite loop for scraping
        while (true) {
          await baseInstance.hoverOverElement("//div[contains(@aria-label,'Results')]", page);
          await page.mouse.wheel(0, 1000);
          await baseInstance.wait(getRandomNumber(1, 5));
          await page.mouse.wheel(0, getRandomNumber(-10, 100));

          const reachedBottom = await baseInstance.isDisplayedWithoutWait("//span[contains(text(),'end of the list.')]", page);
          if (reachedBottom) break;
        }

        // Get all anchor elements
        const allAnchorElements = await page.$$(
          "xpath=//a[contains(@href,'https://www.google.com/maps/place/')]"
        );
        for (let i = 0; i < allAnchorElements.length; i++) {
          try {
            const xpath = `(//a[contains(@href,'https://www.google.com/maps/place/')])[${
              i + 1
            }]`;
            href = await baseInstance.getHtmlAttributeByXPath(
              xpath,
              "href",
              page
            );

            if (href) {
              const page2 = await context.newPage();
              await baseInstance.openURL(href, page2);
              await baseInstance.wait(getRandomNumber(1, 2));

              companyName = await baseInstance.getText("//h1", page2);
              rating = await baseInstance.getText(
                "(//span[contains(@aria-label,'stars')])[2]/preceding-sibling::span",
                page2
              );
              address = (
                await baseInstance.getText(
                  "//button[@data-item-id='address']",
                  page2
                )
              )?.slice(2);
              website = await baseInstance.getHtmlAttributeByXPath(
                "//a[contains(@aria-label,'Website: ')]",
                "href",
                page2
              );
              phoneNumber = extractDigits(
                (await baseInstance.getHtmlAttributeByXPath(
                  "//button[contains(@aria-label,'Phone: ')]",
                  "data-item-id",
                  page2
                )) || ""
              );

              // Check for website and scrape emails
              if (website) {
                const page3 = await context.newPage();
                await baseInstance.openURL(website, page3);
                await baseInstance.wait(getRandomNumber(5, 10));

                const pageContent = await page3.content();
                console.log("Content is fetched")
                const emailRegex =
                  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const pageEmails = pageContent.match(emailRegex) || [];
                emails = Array.from(new Set(pageEmails));

                await page3.close();
              }

              await page2.close();

              // Generate infoCode and infoMatrix
              const { infoCode, infoMatrix } = createInfoCodeAndMatrix(
                companyName,
                emails,
                address,
                phoneNumber,
                website,
                rating
              );

              console.log("InfoCode generated: "+infoCode);

              // Insert into the database
              await query(
                'INSERT INTO "PublicLeads" ("id", "url", "name", "email", "address", "countryCode", "phone", "website", "rating", "infoCode", "infoMatrix") VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                [
                  href || "",
                  companyName || "",
                  `{${emails.join(",")}}`,
                  address || "",
                  "IN",
                  phoneNumber,
                  website || "",
                  rating || "",
                  infoCode,
                  `{${infoMatrix.join(",")}}`,
                ]
              );
            }
          } catch (err: any) {
            console.error(`Error scraping individual result: ${err}`);
            continue; // Proceed to the next item in the loop even if one fails
          }
        }
      } catch (err: any) {
        console.error(
          `Error in scraping ${companyType} in ${cityName}: ${err}`
        );
      }
    }
  }

  // Close the browser after all searches
  await browser.close();
}

// Start scraping
scrapeGoogleMaps().catch(console.error);
