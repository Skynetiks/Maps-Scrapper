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
import { mkdirSync, existsSync } from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import * as cheerio from "cheerio";
import { z } from "zod";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { promises as dns } from "dns";

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

const emailSchema = z.string().email();

// Create separate arrays for different email providers
const googleWorkspaceData: any[] = [];
const microsoftOutlookData: any[] = [];
const otherProvidersData: any[] = [];

async function getNewContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent:
      userAgentStrings[Math.floor(Math.random() * userAgentStrings.length)],
    ignoreHTTPSErrors: true,
  });
  context.setDefaultTimeout(30000);
  await context.addInitScript(
    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
  );
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
  const fields = [
    name,
    email.length > 0 ? email : null,
    address,
    phone,
    website,
    rating,
  ];
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

async function scrollAndScrapeResults(page: Page) {
  const startTime = Date.now();
  const maxDuration = 200 * 1000;

  while (true) {
    await baseInstance.hoverOverElement(
      "//div[contains(@aria-label,'Results')]",
      page
    );
    await page.mouse.wheel(0, 1500);
    await baseInstance.wait(getRandomNumber(1, 3));
    await page.mouse.wheel(0, getRandomNumber(-10, 100));

    const reachedBottom = await baseInstance.isDisplayedWithoutWait(
      "//span[contains(text(),'end of the list.')]",
      page
    );

    if (reachedBottom || Date.now() - startTime > maxDuration) {
      console.log("Scrolling stopped.");
      break;
    }
  }
}

// Check MX records and categorize email provider
async function checkMXRecords(domain: string): Promise<{
  provider: "google" | "microsoft" | "other";
  mxRecords: string[];
}> {
  try {
    const mxRecords = await dns.resolveMx(domain);
    const mxHosts = mxRecords.map((mx) => mx.exchange.toLowerCase());

    console.log(`MX records for ${domain}:`, mxHosts);

    // Check for Google Workspace
    const isGoogle = mxHosts.some(
      (mx) =>
        mx.includes("aspmx.l.google.com") ||
        mx.includes("google.com") ||
        mx.includes("googlemail.com")
    );

    if (isGoogle) {
      return { provider: "google", mxRecords: mxHosts };
    }

    // Check for Microsoft/Outlook
    const isMicrosoft = mxHosts.some(
      (mx) =>
        mx.includes("mail.protection.outlook.com") ||
        mx.includes("outlook.com") ||
        mx.includes("microsoft.com")
    );

    if (isMicrosoft) {
      return { provider: "microsoft", mxRecords: mxHosts };
    }

    return { provider: "other", mxRecords: mxHosts };
  } catch (error) {
    console.error(`Error checking MX records for ${domain}:`, error);
    return { provider: "other", mxRecords: [] };
  }
}

// Extract domain from website URL
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch (error) {
    console.error(`Invalid URL: ${url}`);
    return null;
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
      let detailPage: Page | undefined;

      try {
        const href = await baseInstance.getHtmlAttributeByXPath(
          `(//a[contains(@href,'https://www.google.com/maps/place/')])[${
            i + 1
          }]`,
          "href",
          page
        );

        if (href) {
          detailPage = await context.newPage();
          await baseInstance.openURL(href, detailPage);

          const website = await baseInstance.getHtmlAttributeByXPath(
            "//a[contains(@aria-label,'Website: ')]",
            "href",
            detailPage
          );

          const companyName = await baseInstance.getText("//h1", detailPage);
          const rating = await baseInstance.getText(
            "(//span[contains(@aria-label,'stars')])[2]/preceding-sibling::span",
            detailPage
          );
          const address = (
            await baseInstance.getText(
              "//button[@data-item-id='address']",
              detailPage
            )
          )?.slice(2);

          const phoneNumber = extractDigits(
            (await baseInstance.getHtmlAttributeByXPath(
              "//button[contains(@aria-label,'Phone: ')]",
              "data-item-id",
              detailPage
            )) || ""
          );

          let emails: string[] = [];

          if (website) {
            emails = await extractEmails(website, context);
          }

          const { infoCode, infoMatrix } = createInfoCodeAndMatrix(
            companyName,
            emails,
            address,
            phoneNumber,
            website,
            rating
          );

          console.log("InfoCode generated: " + infoCode);

          // Determine email provider by checking MX records
          let emailProvider = "other";
          let mxRecords: string[] = [];

          if (website) {
            const domain = extractDomain(website);
            if (domain) {
              const { provider, mxRecords: foundMX } = await checkMXRecords(
                domain
              );
              emailProvider = provider;
              mxRecords = foundMX;

              if (provider === "google") {
                console.log(`✓ ${domain} uses Google Workspace`);
              } else if (provider === "microsoft") {
                console.log(`✓ ${domain} uses Microsoft/Outlook`);
              } else {
                console.log(`○ ${domain} uses other provider`);
              }
            }
          }

          const recordData = {
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
            EmailProvider: emailProvider,
            MXRecords: mxRecords.join(", "),
          };

          // Store in appropriate array based on email provider
          if (emailProvider === "google") {
            googleWorkspaceData.push(recordData);
          } else if (emailProvider === "microsoft") {
            microsoftOutlookData.push(recordData);
          } else {
            otherProvidersData.push(recordData);
          }
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

async function fetchEmailsFromPage(
  url: string,
  context: any
): Promise<string[]> {
  let emails: string[] = [];
  try {
    const websitePage = await context.newPage();
    await websitePage.goto(url, { waitUntil: "domcontentloaded" });
    await websitePage.waitForTimeout(2000);

    const pageContent = await websitePage.content();
    const $ = cheerio.load(pageContent);

    // Extract from mailto: links
    $("a[href^='mailto:']").each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        const email = href
          .replace(/^mailto:/, "")
          .split("?")[0]
          .trim();
        if (emailSchema.safeParse(email).success) {
          emails.push(email);
        }
      }
    });

    // Extract from visible text
    if (emails.length === 0) {
      const bodyText = $("body").text();
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      emails = Array.from(new Set(bodyText.match(emailRegex) || [])).filter(
        (email) => emailSchema.safeParse(email).success
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

    const urls: string[] =
      sitemapData.urlset?.url?.map((entry: any) => entry.loc) || [];

    const contactPage = urls.find((url) => /contact|about/i.test(url));
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
  const cityChunks = chunkArray(cityNames, 10);

  for (const companyType of companyTypes) {
    googleWorkspaceData.length = 0;
    microsoftOutlookData.length = 0;
    otherProvidersData.length = 0;
    for (const cityChunk of cityChunks) {
      console.log(`Processing a batch of 10 cities: ${cityChunk.join(", ")}`);

      await Promise.all(
        cityChunk.map((cityName) => scrapeCity(companyType, cityName))
      );
      console.log("Batch of 10 cities completed.");
    }
    // Save data to separate Excel files
    saveToSeparateExcelFiles(companyType);
  }
  console.log("\n🎉 All company types completed!");
}

function saveToSeparateExcelFiles(companyType: string) {
  // Create folder name (sanitize company type for folder name)
  const folderName = companyType.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const folderPath = path.join(process.cwd(), folderName);

  // Create folder if it doesn't exist
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
    console.log(`📁 Created folder: ${folderPath}`);
  }

  // Save Google Workspace users
  if (googleWorkspaceData.length > 0) {
    const wsGoogle = XLSX.utils.json_to_sheet(googleWorkspaceData);
    const wbGoogle = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbGoogle, wsGoogle, "Google Workspace");
    const filePath = path.join(folderPath, "google_workspace_leads.xlsx");
    writeFileSync(
      filePath,
      XLSX.write(wbGoogle, { bookType: "xlsx", type: "buffer" })
    );
    console.log(
      `✓ Google Workspace leads saved: ${googleWorkspaceData.length} records`
    );
  }

  // Save Microsoft/Outlook users
  if (microsoftOutlookData.length > 0) {
    const wsMicrosoft = XLSX.utils.json_to_sheet(microsoftOutlookData);
    const wbMicrosoft = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbMicrosoft, wsMicrosoft, "Microsoft Outlook");
    const filePath = path.join(folderPath, "microsoft_outlook_leads.xlsx");
    writeFileSync(
      filePath,
      XLSX.write(wbMicrosoft, { bookType: "xlsx", type: "buffer" })
    );
    console.log(
      `✓ Microsoft/Outlook leads saved: ${microsoftOutlookData.length} records`
    );
  }

  // Save other providers
  if (otherProvidersData.length > 0) {
    const wsOther = XLSX.utils.json_to_sheet(otherProvidersData);
    const wbOther = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOther, wsOther, "Other Providers");
    const filePath = path.join(folderPath, "other_providers_leads.xlsx");
    writeFileSync(
      filePath,
      XLSX.write(wbOther, { bookType: "xlsx", type: "buffer" })
    );
    console.log(
      `○ Other providers leads saved: ${otherProvidersData.length} records`
    );
  }

  console.log(`\n=== Summary for ${companyType} ===`);
  console.log(`Google Workspace: ${googleWorkspaceData.length} leads`);
  console.log(`Microsoft/Outlook: ${microsoftOutlookData.length} leads`);
  console.log(`Other Providers: ${otherProvidersData.length} leads`);
  console.log(
    `Total: ${
      googleWorkspaceData.length +
      microsoftOutlookData.length +
      otherProvidersData.length
    } leads`
  );
}

scrapeGoogleMaps().catch(console.error);
