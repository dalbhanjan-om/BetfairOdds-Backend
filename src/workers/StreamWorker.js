import { parentPort, workerData } from "worker_threads";
import tls from "tls";
import { placeBetOrder } from "../utils/bettingService.js";

const { marketId, appKey, sessionToken, size = 1, upThreshold = 5, downThreshold = 3 } = workerData;

const STREAM_HOST = "stream-api.betfair.com";
const STREAM_PORT = 443;

/**
 * Ball detection state
 */
let ballInProgress = false;
let ballCount = 0;
let socket = null;
let isRunning = true;

/**
 * Price tracking state
 */
const priceHistory = []; // Array of { timestamp, backPrice, layPrice, selectionId }
let lastBetTime = null;
let lastBetPrice = null;
// Track in-flight bets by unique key (selectionId:price) to prevent duplicates
// Each worker thread has its own Set - completely isolated from other threads
const inFlightBets = new Set(); // Set of "selectionId:price" strings

/**
 * Send message to parent
 */
function sendToParent(type, data = {}) {
  if (parentPort) {
    parentPort.postMessage({ type, marketId, ...data });
  }
}

/**
 * Place bet function - uses shared betting service
 * Completely non-blocking - each worker thread places bets independently
 * NOTE: betKey is already added to inFlightBets by the caller to prevent race conditions
 */
async function placeBet(selectionId, side, price, reason, oldPrice, newPrice) {
  const betKey = `${selectionId}:${price.toFixed(2)}`;
  
  // Double-check: betKey should already be in inFlightBets (added by caller)
  // This is a safety check in case of unexpected code paths
  if (!inFlightBets.has(betKey)) {
    // This shouldn't happen, but if it does, add it now
    inFlightBets.add(betKey);
  }
  
  try {
    const instructions = [
      {
        selectionId,
        side,
        size: size, // Use the size from workerData
        limitOrder: {
          price,
          persistenceType: "PERSIST",
        },
      },
    ];

    // Place bet asynchronously - this is non-blocking
    // Each worker thread processes bets independently
    const responseData = await placeBetOrder(marketId, appKey, sessionToken, instructions);
    
    return responseData;
  } catch (err) {
    console.error(`❌ [Bet Failed] Market: ${marketId} | Selection: ${selectionId} | Error:`, err.response?.data || err.message);
    return null;
  } finally {
    // Always remove from in-flight set when done (success or failure)
    // This allows new bets at different prices to proceed immediately
    inFlightBets.delete(betKey);
  }
}

/**
 * Check if price difference is exactly 1
 */
function isPriceDifferenceOne(backPrice, layPrice) {
  if (!backPrice || !layPrice) return false;
  const diff = Math.abs(layPrice - backPrice);
  return Math.abs(diff - 1) < 0.01; // Check if difference is exactly 1
}

/**
 * Check price movement in last 90 seconds
 * Returns object with movement, oldPrice, and newPrice
 */
function checkPriceMovement90s() {
  const now = Date.now();
  const ninetySecondsAgo = now - 90000; // 90 seconds in milliseconds

  const recentPrices = priceHistory.filter((p) => p.timestamp >= ninetySecondsAgo);

  if (recentPrices.length < 2) return null; // Need at least 2 data points

  const oldest = recentPrices[0];
  const newest = recentPrices[recentPrices.length - 1];

  // Calculate movement (using back price as reference, or average of back/lay)
  const oldPrice = oldest.backPrice || oldest.layPrice;
  const newPrice = newest.backPrice || newest.layPrice;

  if (!oldPrice || !newPrice) return null;

  const movement = newPrice - oldPrice;
  return {
    movement,
    oldPrice,
    newPrice,
  };
}

/**
 * Check if price unchanged in last 15 seconds
 */
function isPriceUnchanged15s() {
  const now = Date.now();
  const fifteenSecondsAgo = now - 15000; // 15 seconds

  const recentPrices = priceHistory.filter((p) => p.timestamp >= fifteenSecondsAgo);

  if (recentPrices.length < 2) return false;

  // Check if all prices in last 15 seconds are the same
  const firstPrice = recentPrices[0].backPrice || recentPrices[0].layPrice;
  const allSame = recentPrices.every((p) => {
    const currentPrice = p.backPrice || p.layPrice;
    return currentPrice && Math.abs(currentPrice - firstPrice) < 0.01;
  });

  return allSame;
}

/**
 * Evaluate betting conditions
 */
function evaluateBettingConditions(selectionId, backPrice, layPrice) {
  // 1. Check if difference between lay and back is exactly 1
  if (!isPriceDifferenceOne(backPrice, layPrice)) {
    return null; // Don't bet if difference is not 1
  }

  // 2. Check if less than 15 seconds since last bet - BLOCK ALL BETS
  if (lastBetTime) {
    const timeSinceLastBet = Date.now() - lastBetTime;
    if (timeSinceLastBet < 15000) {
      // Don't bet at all within 15 seconds of last bet
      return null;
    }
  }

  // 2b. Check if we're still within cooldown period (handled by inFlightBets in placeBet)
  // This check is now handled by inFlightBets Set in placeBet function

  // 2c. Check price movement to determine potential bet prices
  const priceMovement = checkPriceMovement90s();
  if (priceMovement === null) return null; // Not enough data

  const { movement, oldPrice, newPrice } = priceMovement;

  // Determine what the bet price would be based on movement
  // Use configurable thresholds from workerData
  let proposedBetPrice = null;
  if (movement >= upThreshold) {
    proposedBetPrice = backPrice; // UNDER bet (BACK)
  } else if (movement <= -downThreshold) {
    proposedBetPrice = layPrice; // OVER bet (LAY)
  }

  // Check if proposed bet price is the same as last bet price
  if (lastBetPrice !== null && proposedBetPrice !== null) {
    if (Math.abs(proposedBetPrice - lastBetPrice) < 0.01) {
      return null; // Don't bet at the same price as last bet
    }
  }

  // Also check if price unchanged in general in last 15 seconds
  if (isPriceUnchanged15s()) {
    return null; // Don't bet if price unchanged
  }

  // 3. Apply betting rules (price movement already checked above)
  // Use configurable thresholds from workerData
  if (movement >= upThreshold) {
    // Line markets moved up >= upThreshold: Place UNDER bet (BACK)
    return {
      side: "BACK",
      price: backPrice,
      reason: `Line moved up ${movement.toFixed(2)} (>= ${upThreshold})`,
      oldPrice,
      newPrice,
    };
  } else if (movement <= -downThreshold) {
    // Line markets reduced >= downThreshold: Place OVER bet (LAY)
    return {
      side: "LAY",
      price: layPrice,
      reason: `Line reduced ${Math.abs(movement).toFixed(2)} (>= ${downThreshold})`,
      oldPrice,
      newPrice,
    };
  }

  return null; // No bet condition met
}

/**
 * Cleanup and close connection
 */
function cleanup() {
  isRunning = false;
  if (socket) {
    try {
      socket.destroy();
    } catch (err) {
      // Ignore cleanup errors
    }
    socket = null;
  }
  sendToParent("closed");
}

/**
 * Open TLS socket
 */
socket = tls.connect(
  {
    host: STREAM_HOST,
    port: STREAM_PORT,
    servername: STREAM_HOST,
  },
  () => {
    sendToParent("connected");
    //console.log(`[Stream Worker] Market ${marketId} connected to ${STREAM_HOST}:${STREAM_PORT}`);

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
  if (!isRunning) return;

  const messages = chunk.split("\r\n").filter(Boolean);

  for (const msg of messages) {
    if (!isRunning) break;

    let parsed;
    try {
      parsed = JSON.parse(msg);
    } catch {
      continue;
    }



    if (parsed.op === "connection") {
      //console.log(`[Stream Worker] Market ${marketId} - Connection ID: ${parsed.connectionId || "N/A"}`);
      sendToParent("connection", { connectionId: parsed.connectionId });
      continue;
    }

    if (parsed.op === "status") {
      if (parsed.statusCode === "SUCCESS") {
       // console.log(`[Stream Worker] Market ${marketId} - Subscription successful`);
      } else if (parsed.errorCode) {
        console.error(`[Stream Worker] Market ${marketId} - Status error: ${parsed.errorCode} - ${parsed.errorMessage || ""}`);
      }
      sendToParent("status", {
        statusCode: parsed.statusCode,
        errorCode: parsed.errorCode,
        errorMessage: parsed.errorMessage,
      });
      continue;
    }

    if (parsed.op === "mcm" && parsed.mc) {
      for (const market of parsed.mc) {
        const marketStatus = market.marketDefinition?.status;

        // ⚠️ MARKET CLOSURE DETECTION
        if (marketStatus === "CLOSED") {
          console.log(`[Stream Worker] Market ${marketId} - Market is CLOSED`);
          sendToParent("marketClosed", { reason: "Market status changed to CLOSED" });
          cleanup();
          return; // Stop processing further data
        }

        // 🏏 BALL DETECTION
        if (marketStatus === "SUSPENDED") {
          ballInProgress = true;
        }

        if (marketStatus === "OPEN" && ballInProgress) {
          ballCount++;
          ballInProgress = false;
          sendToParent("ballCompleted", { ballCount });
          console.log(`🏏 [Stream Worker] Market ${marketId} - Ball #${ballCount} completed`);
        }

        // 🧮 RUNNER / PRICE DATA
        if (market.rc) {
          for (const runner of market.rc) {
            const selectionId = runner.id;

            const bestBack = runner.batb?.[0]; // [level, price, size]
            const bestLay = runner.batl?.[0];
            const lastTradedPrice = runner.ltp; // ⭐ LTP

            const backPrice = bestBack ? bestBack[1] : null;
            const layPrice = bestLay ? bestLay[1] : null;

            // Log back and lay prices directly in worker
            if (backPrice || layPrice) {
              const backInfo = backPrice 
                ? `BACK: ${backPrice} (size: ${bestBack[2]})`
                : "BACK: N/A";
              const layInfo = layPrice
                ? `LAY: ${layPrice} (size: ${bestLay[2]})`
                : "LAY: N/A";
              // console.log(
              //   `💰 Market: ${marketId} | Selection: ${selectionId} | ${backInfo} | ${layInfo}`
              // );
            }

            // Track price history
            if (backPrice || layPrice) {
              priceHistory.push({
                timestamp: Date.now(),
                backPrice,
                layPrice,
                selectionId,
              });

              // Keep only last 2 minutes of history (120 seconds)
              const twoMinutesAgo = Date.now() - 120000;
              const filtered = priceHistory.filter((p) => p.timestamp >= twoMinutesAgo);
              priceHistory.length = 0;
              priceHistory.push(...filtered);
            }

            // Evaluate betting conditions
            if (backPrice && layPrice) {
              const betDecision = evaluateBettingConditions(selectionId, backPrice, layPrice);

              if (betDecision) {
                // CRITICAL: Check for duplicates BEFORE setting flags or placing bet
                // This prevents race conditions with rapid stream updates
                const betKey = `${selectionId}:${betDecision.price.toFixed(2)}`;
                
                // Check if this exact bet is already in-flight (prevent duplicates)
                if (inFlightBets.has(betKey)) {
                  // Bet already in progress - skip this one
                  continue;
                }
                
                // Check if this is the same price as the last bet (additional safety)
                if (lastBetPrice !== null && Math.abs(betDecision.price - lastBetPrice) < 0.01) {
                  // Same price as last bet - skip to prevent duplicates
                  continue;
                }
                
                // Mark bet as in-flight IMMEDIATELY to prevent race conditions
                // This must happen BEFORE setting lastBetTime to ensure atomicity
                inFlightBets.add(betKey);
                
                // Set timing flags AFTER marking as in-flight
                lastBetTime = Date.now();
                lastBetPrice = betDecision.price;
                
                // Place bet asynchronously - completely non-blocking
                // Each worker thread processes independently - no waiting for other threads
                placeBet(
                  selectionId,
                  betDecision.side,
                  betDecision.price,
                  betDecision.reason,
                  betDecision.oldPrice,
                  betDecision.newPrice
                ).catch((err) => {
                  // Silently handle errors - already logged in placeBet
                  // Don't let bet failures block stream processing
                });
              }
            }

            // Send price update to controller (optional - for future use)
            if (bestBack || bestLay || lastTradedPrice !== undefined) {
              sendToParent("priceUpdate", {
                selectionId,
                bestBack: bestBack ? { level: bestBack[0], price: bestBack[1], size: bestBack[2] } : null,
                bestLay: bestLay ? { level: bestLay[0], price: bestLay[1], size: bestLay[2] } : null,
                lastTradedPrice,
              });
            }
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
  console.error(`[Stream Worker] Market ${marketId} socket error:`, err.message);
  sendToParent("error", { error: err.message });
  cleanup();
});

socket.on("close", () => {
  console.log(`[Stream Worker] Market ${marketId} connection closed`);
  cleanup();
});

/**
 * Listen for stop message from parent
 */
if (parentPort) {
  parentPort.on("message", (msg) => {
    if (msg.type === "stop") {
      console.log(`[Stream Worker] Market ${marketId} received stop signal`);
      cleanup();
    }
  });
}
