import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * In-memory state for active workers
 * Map<marketId, Worker>
 */
const activeWorkers = new Map();

/**
 * Factory function to create and manage a stream worker
 */
function createStreamWorker(marketId, appKey, sessionToken) {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, "../../workers/StreamWorker.js");
    const worker = new Worker(workerPath, {
      workerData: { marketId, appKey, sessionToken },
    });

    const handlers = {
      connected: () => resolve(worker),
      error: (data) => {
        worker.terminate();
        reject(new Error(data.error || "Worker failed to start"));
      },
    };

    // Set up initial message handlers
    worker.on("message", (msg) => {
      const handler = handlers[msg.type];
      if (handler) {
        handler(msg.data);
        // Remove handler after first use
        delete handlers[msg.type];
      }
    });

    worker.on("error", (err) => {
      reject(err);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (handlers.connected) {
        worker.terminate();
        reject(new Error("Worker connection timeout"));
      }
    }, 30000);
  });
}

/**
 * Start Bot Controller
 * Creates a worker thread for streaming
 */
export async function startBot(req, res) {
  const appKey = process.env.BETFAIR_APP_KEY;
  const sessionToken =
    req.header("X-Authentication") ||
    req.header("x-authentication") ||
    (req.header("Authorization") || "").replace(/Bearer\s+/i, "").trim();

  const { marketId } = req.body || {};

  if (!appKey) {
    return res.status(400).json({ error: "BETFAIR_APP_KEY not set" });
  }

  if (!sessionToken) {
    return res.status(401).json({ error: "Missing Betfair session token" });
  }

  if (!marketId) {
    return res.status(400).json({ error: "marketId is required" });
  }

  /**
   * Stop existing worker if already running
   */
  if (activeWorkers.has(marketId)) {
    try {
      const existingWorker = activeWorkers.get(marketId);
      existingWorker.postMessage({ type: "stop" });
      existingWorker.terminate();
      activeWorkers.delete(marketId);
    } catch (err) {
      console.error(`[Stream] Error stopping existing worker for ${marketId}:`, err.message);
    }
  }

  try {
    /**
     * Create worker thread in background
     */
    const worker = await createStreamWorker(marketId, appKey, sessionToken);

    /**
     * Set up worker message handlers
     * Worker handles its own logging - controller only manages worker lifecycle
     */
    worker.on("message", (msg) => {
      // Only handle critical events that affect worker management
      switch (msg.type) {
        case "error":
          console.error(`[Stream Controller] Market ${msg.marketId} worker reported error:`, msg.error || msg);
          break;

        case "closed":
          // Worker connection closed - remove from active workers
          if (activeWorkers.get(msg.marketId) === worker) {
            activeWorkers.delete(msg.marketId);
          }
          break;

        case "stopped":
          // Worker stopped - remove from active workers
          if (activeWorkers.get(msg.marketId) === worker) {
            activeWorkers.delete(msg.marketId);
          }
          break;

        // Other messages (connected, connection, status, ballCompleted, priceUpdate)
        // are logged directly by the worker - no action needed here
      }
    });

    worker.on("error", (err) => {
      console.error(`[Stream Worker] Market ${marketId} worker error:`, err);
      if (activeWorkers.get(marketId) === worker) {
        activeWorkers.delete(marketId);
      }
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`[Stream Worker] Market ${marketId} worker exited with code ${code}`);
      }
      if (activeWorkers.get(marketId) === worker) {
        activeWorkers.delete(marketId);
      }
    });

    /**
     * Store worker reference
     */
    activeWorkers.set(marketId, worker);

    console.log(`[Stream] Bot started for market ${marketId} (worker thread)`);

    return res.status(200).json({
      message: "Bot started successfully",
      marketId,
      running: true,
    });
  } catch (err) {
    console.error(`[Stream] Failed to start bot for market ${marketId}:`, err.message);
    return res.status(500).json({
      error: "Failed to start Betfair stream bot",
      details: err.message,
    });
  }
}

/**
 * Stop Bot Controller
 * Terminates the worker thread for the specified market
 */
export function stopBot(req, res) {
  const { marketId } = req.body || {};

  if (!marketId) {
    return res.status(400).json({ error: "marketId is required" });
  }

  if (!activeWorkers.has(marketId)) {
    return res.status(404).json({
      error: "Bot is not running for this market",
      marketId,
    });
  }

  try {
    const worker = activeWorkers.get(marketId);

    // Send stop message to worker
    worker.postMessage({ type: "stop" });

    // Terminate worker thread
    worker.terminate();

    // Remove from active workers
    activeWorkers.delete(marketId);

    console.log(`[Stream] Bot stopped for market ${marketId}`);

    return res.status(200).json({
      message: "Bot stopped successfully",
      marketId,
      running: false,
    });
  } catch (err) {
    console.error(`[Stream] Error stopping bot for market ${marketId}:`, err.message);
    return res.status(500).json({
      error: "Failed to stop bot",
      details: err.message,
    });
  }
}

/**
 * Get Bot Status Controller
 * Returns status of all active bots
 */
export function getBotStatus(req, res) {
  const { marketId } = req.query || {};

  if (marketId) {
    // Check specific market
    const isRunning = activeWorkers.has(marketId);
    return res.status(200).json({
      marketId,
      running: isRunning,
    });
  }

  // Return all active markets
  const activeMarkets = Array.from(activeWorkers.keys());
  return res.status(200).json({
    activeMarkets,
    count: activeMarkets.length,
  });
}
