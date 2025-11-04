import { chromium, Browser, Page } from "playwright";
import { baseInstance } from "./baseClass";
import { extractDigits, getRandomNumber } from "./helper";
import {
  cityNames,
  companyTypes,
  countryCode,
  countryName,
  userAgentStrings,
} from "./data";
import { Cookie } from "@playwright/test";
// import { query } from "./db";
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import * as cheerio from "cheerio";
import { z } from "zod";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

const emailSchema = z.string().email();

// Create an array to store scraped data
const scrapedData: any[] = [];

async function getNewContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent: userAgentStrings[Math.floor(Math.random() * userAgentStrings.length)],
    ignoreHTTPSErrors: true,
  });
  context.setDefaultTimeout(30000);
  await context.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
  const expiresTimestamp = Math.floor(new Date("2026-03-10T06:42:23.888Z").getTime() / 1000);

  // const linkedinCookies: Cookie[] = [
  //   {
  //     name: "li_at",
  //     value: "AQEDAQTO5_kEQHs5AAABkr1p2MkAAAGVotbXwE0AMfJsMxpG3AH48RiwdjQrVLHCTDEA65YWI8dI4iR_fIQ0N9nCX1buOpYt1cnY-hI6G-Rp78Kqz0WRhyccTomDoz_B67fqITcaQkPKfPfDLrRBRTWW",
  //     domain: ".linkedin.com",
  //     path: "/",
  //     httpOnly: true,
  //     secure: true,
  //     sameSite: "Lax",
  //     expires: expiresTimestamp
  //   },
  //   {
  //     name: "JSESSIONID",
  //     value: "ajax:5734542181657131797",
  //     domain: ".linkedin.com",
  //     path: "/",
  //     httpOnly: true,
  //     secure: true,
  //     sameSite: "Lax",
  //     expires: expiresTimestamp
  //   },
  // ];

  // await context.addCookies(linkedinCookies);
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

// async function isHrefInDatabase(href: string): Promise<boolean> {
//   const result = await query('SELECT EXISTS (SELECT 1 FROM "PublicLeads" WHERE "url" = $1)', [href]);
//   return result.rows[0].exists;
// }

// async function isWebsiteInDB(website: string | null): Promise<boolean> {
//   if (!website) return false;
//   const result = await query('SELECT EXISTS (SELECT 1 FROM "PublicLeads" WHERE "website" = $1)', [website]);
//   return result.rows[0].exists;
// }

async function scrollAndScrapeResults(page: Page) {
  const startTime = Date.now();
  const maxDuration = 200 * 1000;

  while (true) {
    await baseInstance.hoverOverElement("//div[contains(@aria-label,'Results')]", page);
    await page.mouse.wheel(0, 1500);
    await baseInstance.wait(getRandomNumber(1, 3));
    await page.mouse.wheel(0, getRandomNumber(-10, 100));

    const reachedBottom = await baseInstance.isDisplayedWithoutWait("//span[contains(text(),'end of the list.')]", page);

    if (reachedBottom || Date.now() - startTime > maxDuration) {
      console.log("Scrolling stopped.");
      break;
    }
  }
}

async function scrapeCity(companyType: string, cityName: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await getNewContext(browser);
  const page = await context.newPage();

  try {
    const searchQuery = `${companyType} in ${cityName} ${countryName}`;
    console.log(`Searching: ${searchQuery}`);

    await baseInstance.openURL("https://www.google.com/maps", page);
    // await baseInstance.openURL("https://www.linkedin.com/", page);
    // await baseInstance.wait(60);
    await baseInstance.enterText("input#searchboxinput", searchQuery, page);
    await baseInstance.keyboardPress("Enter", page);
    await baseInstance.waitForElement("//div[contains(@aria-label,'Results')]", page);
    console.log(`Scraping started for: ${searchQuery}...`);

    await scrollAndScrapeResults(page);

    const allAnchorElements = await page.$$(
      "xpath=//a[contains(@href,'https://www.google.com/maps/place/')]"
    );

    for (let i = 0; i < allAnchorElements.length; i++) {
      let detailPage: Page | undefined;

      try {
        const href = await baseInstance.getHtmlAttributeByXPath(
          `(//a[contains(@href,'https://www.google.com/maps/place/')])[${i + 1}]`,
          "href", page
        );

        if (href) {
          detailPage = await context.newPage();
          await baseInstance.openURL(href, detailPage);

          const website = await baseInstance.getHtmlAttributeByXPath("//a[contains(@aria-label,'Website: ')]", "href", detailPage);
          // if (await isWebsiteInDB(website)) {
          //   console.log(`Website ${website} is already in the database.`);
          //   continue;
          // }

          const companyName = await baseInstance.getText("//h1", detailPage);
          const rating = await baseInstance.getText(
            "(//span[contains(@aria-label,'stars')])[2]/preceding-sibling::span", detailPage
          );
          const address = (
            await baseInstance.getText("//button[@data-item-id='address']", detailPage)
          )?.slice(2);

          const phoneNumber = extractDigits(
            (await baseInstance.getHtmlAttributeByXPath("//button[contains(@aria-label,'Phone: ')]", "data-item-id", detailPage)) || ""
          );

          let emails: string[] = [];

          if (website) {
            emails = await extractEmails(website, context);
          }

          const { infoCode, infoMatrix } = createInfoCodeAndMatrix(
            companyName, emails, address, phoneNumber, website, rating
          );

          console.log("InfoCode generated: " + infoCode);

          // await query(
          //   'INSERT INTO "PublicLeads" ("id", "url", "industry", "name", "email", "address", "countryCode", "phone", "website", "rating", "infoCode", "infoMatrix") ' +
          //   'VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          //   [
          //     href || "",
          //     companyType,
          //     companyName || "",
          //     `{${emails.join(",")}}`,
          //     address || "",
          //     countryCode,
          //     phoneNumber,
          //     website || "",
          //     rating || "",
          //     infoCode,
          //     `{${infoMatrix.join(",")}}`,
          //   ]
          // );
          scrapedData.push({
            URL: href || "",
            Industry: companyType,
            Name: companyName || "",
            Email: emails.join(", ") || "",
            Address: address || "",
            CountryCode: countryCode,
            Phone: phoneNumber || "",
            Website: website || "",
            Rating: rating || "",
            InfoCode: infoCode,
            InfoMatrix: infoMatrix.join(", "),
          });
        } else {
          console.log(`Href ${href} is already in the database.`);
        }
      } catch (err) {
        console.error(`Error scraping individual result: ${err}`);
      } finally {
        if (detailPage) await detailPage.close();
      }
    }
  } catch (err) {
    console.error(`Error in scraping ${companyType} in ${cityName}: ${err}`);
  } finally {
    await page.close();
    await browser.close();
  }
}
async function fetchEmailsFromPage(url: string, context: any): Promise<string[]> {
  let emails: string[] = [];
  try {
    const websitePage = await context.newPage();
    await websitePage.goto(url, { waitUntil: "domcontentloaded" });
    await websitePage.waitForTimeout(2000); // Allow JS to render

    const pageContent = await websitePage.content();
    const $ = cheerio.load(pageContent);

    // Extract from mailto: links
    $("a[href^='mailto:']").each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        const email = href.replace(/^mailto:/, "").split("?")[0].trim();
        if (emailSchema.safeParse(email).success) {
          emails.push(email);
        }
      }
    });

    // Extract from visible text
    if (emails.length === 0) {
      const bodyText = $("body").text();
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      emails = Array.from(new Set(bodyText.match(emailRegex) || [])).filter(email =>
        emailSchema.safeParse(email).success
      );
    }

    await websitePage.close();
  } catch (error) {
    console.error(`Error fetching emails from ${url}:`, error);
  }
  return emails;
}

async function findContactPage(website: string): Promise<string | null> {
  try {
    const sitemapUrl = new URL("/sitemap.xml", website).toString();
    const response = await axios.get(sitemapUrl);
    
    if (response.status !== 200) return null;

    const parser = new XMLParser();
    const sitemapData = parser.parse(response.data);

    // Extract URLs from sitemap
    const urls: string[] = sitemapData.urlset?.url?.map((entry: any) => entry.loc) || [];

    // Find the contact page
    const contactPage = urls.find(url => /contact|about/i.test(url));
    return contactPage || null;
  } catch (error) {
    console.error("Error fetching sitemap:", error);
    return null;
  }
}


async function extractEmails(website: string, context: any) {
  let emails = await fetchEmailsFromPage(website, context);

  if (emails.length === 0) {
    console.log("No emails found on homepage. Checking sitemap...");
    const contactPage = await findContactPage(website);

    if (contactPage) {
      console.log(`Found contact page: ${contactPage}`);
      emails = await fetchEmailsFromPage(contactPage, context);
    } else {
      console.log("No contact page found in sitemap.");
    }
  }

  return emails;
}

async function scrapeGoogleMaps() {
  // Split cityNames into chunks of 10 cities each
  const cityChunks = chunkArray(cityNames, 10);

  for (const companyType of companyTypes) {
    for (const cityChunk of cityChunks) {
      console.log(`Processing a batch of 10 cities: ${cityChunk.join(", ")}`);

      await Promise.all(
        cityChunk.map((cityName) => scrapeCity(companyType, cityName))
      );
      console.log("Batch of 10 cities completed.");
    }
  }
  // After scraping, save data to an Excel file
  saveToExcel(scrapedData);
}

function saveToExcel(data: any[]) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scraped Data");

  // Write to file
  writeFileSync("scraped_data.xlsx", XLSX.write(wb, { bookType: "xlsx", type: "buffer" }));
  console.log("Data saved to scraped_data.xlsx");
}

scrapeGoogleMaps().catch(console.error);