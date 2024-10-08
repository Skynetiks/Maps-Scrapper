import { Page } from "playwright";

export class BaseClass {
  async openURL(url: string, page: Page) {
    try {
      await page.goto(url);
      console.info("Opening " + url);
    } catch (error) {
      console.error("Error opening url: +" + url + " : " + error);
    }
  }

  async clickElement(xpath: string, object: string, page: Page) {
    await this.waitForElement(xpath, page);
    try {
      await page.locator(xpath).click();
      console.info("Clicked on " + object + " with xpath " + xpath);
    } catch (error) {
      console.error("Error clicking element: " + xpath + " : " + error);
    }
  }

  async enterText(xpath: string, input: string, page: Page) {
    await this.waitForElement(xpath, page);
    try {
      await page.locator(xpath).fill(input);
      console.info(`Entered text: ${input} with xpath: ${xpath}`);
    } catch (error) {
      console.error("Error entering text in element: " + xpath + " : " + error);
    }
  }

  async keyboardPress(key: string, page: Page) {
    try {
      await page.keyboard.press(key);
      console.info("Pressed " + key + " key");
    } catch (error) {
      console.error("Error pressing key: " + key + " : " + error);
    }
  }

  async waitForElement(xpath: string, page: Page, timeout?: number) {
    try {
      if(timeout){
        await page.waitForSelector(xpath, {timeout: timeout*1000});
      } else {
        await page.waitForSelector(xpath);
      }
    } catch (error) {
      console.error("Error waiting for element: " + xpath + " : " + error);
    }
  }
  async isDisplayed(xpath: string, page: Page) {
    await this.waitForElement(xpath, page);
    let visiblity: boolean = false;
    try {
      visiblity = await page.locator(xpath).isVisible();
    } catch (error) {
      console.error(
        "Error checking visibility for element: " + xpath + " : " + error
      );
    }
    console.info("Checking visiblity for " + xpath + " : " + visiblity);
    return visiblity;
  }

  async isDisplayedWithoutWait(xpath: string, page: Page) {
    let visiblity: boolean = false;
    try {
      visiblity = await page.locator(xpath).isVisible();
    } catch (error) {
      console.error(
        "Error checking visibility for element: " + xpath + " : " + error
      );
    }
    console.info("Checking visiblity for " + xpath + " : " + visiblity);
    return visiblity;
  }

  async hoverOverElement(xpath: string, page: Page) {
    try {
      await page.locator(xpath).hover();
      console.info("Hovered over element: " + xpath);
    } catch (error) {
      console.error("Error hovering over element: " + xpath + " : " + error);
    }
  }

  async getHtmlAttributeByXPath(
    xpath: string,
    attributeName: string,
    page: Page
  ): Promise<string | null> {
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.info("Operation timed out");
        resolve(null);
      }, 10000); // 10 seconds
    });

    const attributePromise = (async () => {
      try {
        const element = page.locator(xpath);
        if (element) {
          const attributeValue = await element.getAttribute(attributeName, {timeout:10000});
          console.info(
            attributeName + " for " + xpath + " is " + attributeValue
          );
          return attributeValue;
        } else {
          console.info("Element not found with XPath:", xpath);
          return null;
        }
      } catch (error) {
        console.error("Error retrieving HTML attribute:", error);
        return null;
      }
    })();

    return Promise.race([attributePromise, timeoutPromise]);
  }

  async getText(xpath: string, page: Page) {
    await this.waitForElement(xpath, page, 10);
    try {
      const text: string = await page.locator(xpath).innerText({timeout:1000});
      console.info("Text from " + xpath + " is " + text);
      return text;
    } catch (error) {
      console.error(
        "Error getting text from element: " + xpath + " : " + error
      );
    }
  }

  async wait(seconds: number) {
    console.info("Waiting for " + seconds + " seconds ");
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}

export const baseInstance = new BaseClass();