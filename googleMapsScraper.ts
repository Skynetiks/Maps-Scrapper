import { chromium } from "playwright";
import { baseInstance } from "./baseClass";
import { extractDigits, getRandomNumber } from "./helper";
import { cityNames, companyTypes, countryCode, countryName, userAgentStrings } from "./data";
import { Browser, Cookie, Page } from "@playwright/test";
import { query } from "./db";

// Helper to chunk cities array into batches of 10
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function getNewContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent:
      userAgentStrings[Math.floor(Math.random() * userAgentStrings.length)],
    ignoreHTTPSErrors: true,
  });
  context.setDefaultTimeout(60000);
  await context.addInitScript(
    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
  );
  
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

  await context.addCookies(randomCookies);
  return context;
}

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

async function isHrefInDatabase(href: string): Promise<boolean> {
  const result = await query(
    'SELECT EXISTS (SELECT 1 FROM "PublicLeads" WHERE "url" = $1)',
    [href]
  );
  return result.rows[0].exists;
}

async function isWebsiteInDB(website: string | null): Promise<boolean> {
  if (!website) return false;
  const result = await query(
    'SELECT EXISTS (SELECT 1 FROM "PublicLeads" WHERE "website" = $1)',
    [website]
  );
  return result.rows[0].exists;
}


async function scrollAndScrapeResults(page: Page) {
  const startTime = Date.now();  // Record the start time
  const maxDuration = 200 * 1000;  // Maximum duration in milliseconds (200 seconds)

  while (true) {
    await baseInstance.hoverOverElement("//div[contains(@aria-label,'Results')]", page);
    await page.mouse.wheel(0, 1500);
    await baseInstance.wait(getRandomNumber(1, 3));
    await page.mouse.wheel(0, getRandomNumber(-10, 100));

    const reachedBottom = await baseInstance.isDisplayedWithoutWait("//span[contains(text(),'end of the list.')]", page);
    
    // Break if the bottom is reached
    if (reachedBottom) {
      console.log("Reached the end of the list.");
      break;
    }

    // Check if 100 seconds have passed, break if so
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > maxDuration) {
      console.log("Reached the maximum scrolling time (200 seconds).");
      break;
    }
  }
}


async function scrapeCity(companyType: string, cityName: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await getNewContext(browser);
  const page = await context.newPage();

  try {
    let page2: Page | undefined;
    let page3: Page | undefined;

    let href: string | null;
    let companyName: string | undefined = "";
    let emails: string[] = [];
    let address: string | undefined = "";
    let phoneNumber: string | null = "";
    let website: string | null = "";
    let rating: string | undefined = "";

    const searchQuery = `${companyType} in ${cityName} ${countryName}`;
    console.log(`Searching: ${searchQuery}`);

    await baseInstance.openURL("https://www.google.com/maps", page);
    await baseInstance.enterText("input#searchboxinput", searchQuery, page);
    await baseInstance.keyboardPress("Enter", page);

    await baseInstance.waitForElement(
      "//div[contains(@aria-label,'Results')]",
      page
    );
    console.log(`Scraping started for: ${searchQuery}...`);

    await scrollAndScrapeResults(page);

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

        if (href && !(await isHrefInDatabase(href))) {
          page2 = await context.newPage();
          await baseInstance.openURL(href, page2);
          website = await baseInstance.getHtmlAttributeByXPath(
            "//a[contains(@aria-label,'Website: ')]",
            "href",
            page2
          );
          if (await isWebsiteInDB(website)) {
            console.log(`Website ${website} is already in the database.`);
            continue;
          }

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
         
          phoneNumber = extractDigits(
            (await baseInstance.getHtmlAttributeByXPath(
              "//button[contains(@aria-label,'Phone: ')]",
              "data-item-id",
              page2
            )) || ""
          );

          if (website) {
            page3 = await context.newPage();
            try {
              await baseInstance.openURL(website, page3);

              const pageContent = await page3.content();
              console.log("Content is fetched");
              const emailRegex =
                /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
              const pageEmails = pageContent.match(emailRegex) || [];
              emails = Array.from(new Set(pageEmails));
            } catch (error) {
              console.error("Error fetching website content:", error);
            } finally {
              if (page3) await page3.close();
            }
          }

          await page2.close();

          const { infoCode, infoMatrix } = createInfoCodeAndMatrix(
            companyName,
            emails,
            address,
            phoneNumber,
            website,
            rating
          );

          console.log("InfoCode generated: " + infoCode);

          await query(
            'INSERT INTO "PublicLeads" ("id", "url", "industry", "name", "email", "address", "countryCode", "phone", "website", "rating", "infoCode", "infoMatrix") VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
            [
              href || "",
              companyType,
              companyName || "",
              `{${emails.join(",")}}`,
              address || "",
              countryCode,
              phoneNumber,
              website || "",
              rating || "",
              infoCode,
              `{${infoMatrix.join(",")}}`,
            ]
          );
        } else {
          console.log(`URL ${href} is already in the database.`);
        }
      } catch (err: any) {
        console.error(`Error scraping individual result: ${err}`);
      } finally {
        if (page2) await page2.close();
      }
    }
  } catch (err: any) {
    console.error(
      `Error in scraping ${companyType} in ${cityName}: ${err}`
    );
  } finally {
    await browser.close();
  }
}

async function scrapeGoogleMaps() {
  // Split cityNames into chunks of 10 cities each
  const cityChunks = chunkArray(cityNames, 20);

  for (const companyType of companyTypes) {
    for (const cityChunk of cityChunks) {
      console.log(`Processing a batch of 20 cities: ${cityChunk.join(", ")}`);

      // Run 10 cities in parallel using Promise.all
      await Promise.all(
        cityChunk.map(cityName => scrapeCity(companyType, cityName))
      );
      console.log("Batch of 10 cities completed.");
    }
  }
}

scrapeGoogleMaps().catch(console.error);