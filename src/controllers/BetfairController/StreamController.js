import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * In-memory state for active workers
 * Map<marketId, { worker: Worker, config: { size, upThreshold, downThreshold } }>
 */
const activeWorkers = new Map();

/**
 * Factory function to create and manage a stream worker
 */
function createStreamWorker(marketId, appKey, sessionToken, size = 1, upThreshold = 5, downThreshold = 3) {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, "../../workers/StreamWorker.js");
    const worker = new Worker(workerPath, {
      workerData: { marketId, appKey, sessionToken, size, upThreshold, downThreshold },
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

  const {
    marketId,
    size,
    upThreshold,
    downThreshold,
    eventName,
    marketName,
  } = req.body || {};

  if (!appKey) {
    return res.status(400).json({ error: "BETFAIR_APP_KEY not set" });
  }

  if (!sessionToken) {
    return res.status(401).json({ error: "Missing Betfair session token" });
  }

  if (!marketId) {
    return res.status(400).json({ error: "marketId is required" });
  }

  // Validate and set defaults
  const betSize = size && size > 0 ? parseFloat(size) : 1;
  const upThresh = upThreshold && upThreshold > 0 ? parseFloat(upThreshold) : 5;
  const downThresh = downThreshold && downThreshold > 0 ? parseFloat(downThreshold) : 3;

  /**
   * Stop existing worker if already running
   */
  if (activeWorkers.has(marketId)) {
    try {
      const existing = activeWorkers.get(marketId);
      existing.worker.postMessage({ type: "stop" });
      existing.worker.terminate();
      activeWorkers.delete(marketId);
    } catch (err) {
      console.error(`[Stream] Error stopping existing worker for ${marketId}:`, err.message);
    }
  }

  try {
    /**
     * Create worker thread in background
     */
    const worker = await createStreamWorker(marketId, appKey, sessionToken, betSize, upThresh, downThresh);

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

        case "marketClosed":
          // Market is closed - auto-stop the bot
          console.log(`[Stream Controller] Market ${msg.marketId} - Auto-stopping bot (Market closed)`);
          try {
            worker.postMessage({ type: "stop" });
            worker.terminate();
            activeWorkers.delete(msg.marketId);
          } catch (err) {
            console.error(`[Stream Controller] Error stopping worker for market ${msg.marketId}:`, err.message);
            activeWorkers.delete(msg.marketId);
          }
          break;

        case "closed":
          // Worker connection closed - remove from active workers
          const closedEntry = activeWorkers.get(msg.marketId);
          if (closedEntry && closedEntry.worker === worker) {
            activeWorkers.delete(msg.marketId);
          }
          break;

        case "stopped":
          // Worker stopped - remove from active workers
          const stoppedEntry = activeWorkers.get(msg.marketId);
          if (stoppedEntry && stoppedEntry.worker === worker) {
            activeWorkers.delete(msg.marketId);
          }
          break;

        // Other messages (connected, connection, status, ballCompleted, priceUpdate)
        // are logged directly by the worker - no action needed here
      }
    });

    worker.on("error", (err) => {
      console.error(`[Stream Worker] Market ${marketId} worker error:`, err);
      const errorEntry = activeWorkers.get(marketId);
      if (errorEntry && errorEntry.worker === worker) {
        activeWorkers.delete(marketId);
      }
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`[Stream Worker] Market ${marketId} worker exited with code ${code}`);
      }
      const exitEntry = activeWorkers.get(marketId);
      if (exitEntry && exitEntry.worker === worker) {
        activeWorkers.delete(marketId);
      }
    });

    /**
     * Store worker reference with configuration
     */
    activeWorkers.set(marketId, {
      worker,
      config: {
        size: betSize,
        upThreshold: upThresh,
        downThreshold: downThresh,
      },
      // Optional metadata for UI display
      eventName: eventName || null,
      marketName: marketName || null,
    });

   

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
    const entry = activeWorkers.get(marketId);
    const worker = entry.worker;

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
 * Returns status of all active bots with their configurations
 */
export function getBotStatus(req, res) {
  const { marketId } = req.query || {};

  if (marketId) {
    // Check specific market
    const entry = activeWorkers.get(marketId);
    const isRunning = !!entry;
    return res.status(200).json({
      marketId,
      running: isRunning,
      ...(isRunning && entry.config ? { config: entry.config } : {}),
    });
  }

  // Return all active markets with their configurations
  const activeBots = {};
  for (const [id, entry] of activeWorkers.entries()) {
    activeBots[id] = {
      running: true,
      config: entry.config,
      // Pass-through metadata for frontend views (e.g. BotPage)
      ...(entry.eventName ? { eventName: entry.eventName } : {}),
      ...(entry.marketName ? { marketName: entry.marketName } : {}),
    };
  }

  return res.status(200).json({
    activeBots,
    activeMarkets: Object.keys(activeBots),
    count: Object.keys(activeBots).length,
  });
}
