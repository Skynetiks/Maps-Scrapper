import { Worker } from "worker_threads";
import { chunkArray } from "./helper";
import { companyTypes, cityNames, countryName, countryCode } from "./data";

async function runWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./scrapeWorker.js", { workerData });

    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

async function scrapeGoogleMaps() {
  const cityChunks = chunkArray(cityNames, 25);

  for (const companyType of companyTypes) {
    for (const cityChunk of cityChunks) {
      console.log(`Processing a batch of 25 cities: ${cityChunk.join(", ")}`);

      await Promise.all(
        cityChunk.map((cityName) =>
          runWorker({ companyType, cityName, countryName, countryCode })
        )
      );

      console.log("Batch of 25 cities completed.");
    }
  }
}

scrapeGoogleMaps().catch(console.error);
