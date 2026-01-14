import tls from "tls";

/**
 * CONFIG
 */
const STREAM_HOST = "stream-api.betfair.com";
const STREAM_PORT = 443;

/**
 * In-memory state
 */
const activeStreams = new Map();

/**
 * Start Bot Controller
 */
export function startBot(req, res) {
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
   * Close existing stream if already running
   */
  if (activeStreams.has(marketId)) {
    const oldSocket = activeStreams.get(marketId);
    oldSocket.destroy();
    activeStreams.delete(marketId);
  }

  /**
   * Ball detection state
   */
  let ballInProgress = false;
  let ballCount = 0;

  /**
   * Open TLS socket
   */
  const socket = tls.connect(
    {
      host: STREAM_HOST,
      port: STREAM_PORT,
      servername: STREAM_HOST,
    },
    () => {
      console.log(`[Stream] Connected to ${STREAM_HOST}:${STREAM_PORT}`);

      /**
       * 1️⃣ AUTHENTICATION
       */
      socket.write(
        JSON.stringify({
          op: "authentication",
          id: 1,
          appKey,
          session: sessionToken,
        }) + "\r\n"
      );

      /**
       * 2️⃣ MARKET SUBSCRIPTION
       */
      socket.write(
        JSON.stringify({
          op: "marketSubscription",
          id: 2,
          segmentationEnabled: true,
          heartbeatMs: 1000,
          marketFilter: {
            marketIds: [marketId],
          },
          marketDataFilter: {
            ladderLevels: 1,
            fields: [
              "EX_BEST_OFFERS",
              "EX_LTP",
              "EX_TRADED_VOL",
              "EX_MARKET_DEF",
            ],
          },
        }) + "\r\n"
      );
    }
  );

  socket.setEncoding("utf8");

  /**
   * STREAM DATA HANDLER
   */
  socket.on("data", (chunk) => {
    const messages = chunk.split("\r\n").filter(Boolean);
    // for (const msg of messages) {
    //     try {
    //       const parsed = JSON.parse(msg);
    
    //       // 🔥 LOG EVERYTHING EXACTLY AS RECEIVED
    //       console.log(
    //         "\n================ STREAM MESSAGE ================\n",
    //         JSON.stringify(parsed, null, 2),
    //         "\n================================================\n"
    //       );
    //     } catch (e) {
    //       console.error(
    //         "[Stream] Failed to parse raw message:",
    //         msg
    //       );
    //     }
    //   }
 /**
   * LOG EVERYTHING EXACTLY AS RECEIVED
   */

 for (const msg of messages) {
    let parsed;
    try {
      parsed = JSON.parse(msg);
    } catch {
      continue;
    }
  
    if (parsed.op === "connection") {
      console.log("[Stream] Connection established");
      continue;
    }
  
    if (parsed.op === "status") {
      console.log(`[Stream] Status response for id=${parsed.id}`);
      continue;
    }
  
    if (parsed.op === "mcm" && parsed.mc) {
      for (const market of parsed.mc) {
        const marketStatus = market.marketDefinition?.status;
  
        // 🏏 BALL DETECTION
        if (marketStatus === "SUSPENDED") {
          ballInProgress = true;
        }
  
        if (marketStatus === "OPEN" && ballInProgress) {
          ballCount++;
          ballInProgress = false;
          console.log(`🏏 BALL COMPLETED → Ball #${ballCount}`);
        }
  
        // 🧮 RUNNER / PRICE DATA
        if (market.rc) {
          for (const runner of market.rc) {
            const selectionId = runner.id;
  
            const bestBack = runner.batb?.[0]; // [level, price, size]
            const bestLay = runner.batl?.[0];
            const lastTradedPrice = runner.ltp; // ⭐ LTP
  
            if (bestBack) {
              console.log(
                `BACK | sel=${selectionId} price=${bestBack[1]} size=${bestBack[2]}`
              );
            }
  
            if (bestLay) {
              console.log(
                `LAY  | sel=${selectionId} price=${bestLay[1]} size=${bestLay[2]}`
              );
            }
  
            if (lastTradedPrice !== undefined) {
              console.log(
                `LTP  | sel=${selectionId} price=${lastTradedPrice}`
              );
            }
  
            /**
             * 🔥 RULE ENGINE GOES HERE
             * Example:
             * if (ballCount === 3 && priceGapIsOneTick(bestBack, bestLay, lastTradedPrice)) {
             *   placeOrder(...)
             * }
             */
          }
        }
      }
    }
  }
  
  });

  /**
   * ERROR HANDLING
   */
  socket.on("error", (err) => {
    console.error("[Stream] Socket error:", err.message);
  });

  socket.on("close", () => {
    console.log("[Stream] Connection closed");
    activeStreams.delete(marketId);
  });

  activeStreams.set(marketId, socket);

  return res.status(200).json({
    message: "Bot started successfully",
    marketId,
  });
}
