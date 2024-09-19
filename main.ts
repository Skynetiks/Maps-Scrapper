import { Worker } from "worker_threads";
import { chunkArray } from "./helper";
import { companyTypes, cityNames, countryName, countryCode } from "./data";

// Function to run a worker
async function runWorker(workerData: { companyType: string; cities: string[]; countryName: string; countryCode: string; }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./scrapeWorker.ts', import.meta.url), {
      execArgv: ['-r', 'tsx'],
      workerData: workerData,
    });

    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

// Limit concurrency to 2
const MAX_CONCURRENT_WORKERS = 2;

async function scrapeGoogleMaps() {
  // Split city names into chunks of 20
  const cityChunks = chunkArray(cityNames, 20);

  for (const companyType of companyTypes) {
    for (const cityChunk of cityChunks) {
      console.log(`Processing a batch of 20 cities: ${cityChunk.join(", ")}`);

      // Further split the batch into smaller batches for 2 workers
      const workerCityChunks = chunkArray(cityChunk, cityChunk.length / MAX_CONCURRENT_WORKERS);

      // Create worker tasks for the current batch
      const workerTasks = workerCityChunks.map(cities => () =>
        runWorker({ companyType, cities, countryName, countryCode })
      );

      // Run up to 2 worker tasks concurrently
      await processInBatches(workerTasks, MAX_CONCURRENT_WORKERS);

      console.log("Batch of 20 cities completed.");
    }
  }
}

async function processInBatches(tasks: (() => Promise<any>)[], maxConcurrency: number) {
  let activeTasks: Promise<any>[] = [];
  let results: any[] = [];

  for (const task of tasks) {
    // Start a new task and add it to the list of active tasks
    const promise = task();
    activeTasks.push(promise);

    // If we reached the limit, wait for one of the tasks to complete
    if (activeTasks.length >= maxConcurrency) {
      const result = await Promise.race(activeTasks);
      results.push(result);

      // Remove the completed task from the active list
      activeTasks = activeTasks.filter(p => p !== promise);
    }
  }

  // Wait for any remaining tasks to complete
  results = results.concat(await Promise.all(activeTasks));

  return results;
}

scrapeGoogleMaps().catch(console.error);
