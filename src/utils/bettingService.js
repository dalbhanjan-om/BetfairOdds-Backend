import { betfairApiRequest } from "./axiosInstance.js";

const PLACE_ORDERS_ENDPOINT = "/exchange/betting/json-rpc/v1";

/**
 * Core function to place a bet order on Betfair Exchange
 * This is the shared logic used by both the controller and worker
 * 
 * THREAD-SAFE: This function is safe for concurrent use across multiple worker threads.
 * Each call is independent - all parameters are passed per-call and new objects are created.
 * No shared mutable state is used, making it safe for multiple bots running simultaneously
 * on different markets with different bet sizes.
 * 
 * @param {string} marketId - The market ID
 * @param {string} appKey - Betfair application key
 * @param {string} sessionToken - Betfair session token
 * @param {Array} instructions - Array of betting instructions (each should include size)
 * @returns {Promise<Object>} The API response data
 * @throws {Error} If the API call fails
 */
/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 100) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function placeBetOrder(marketId, appKey, sessionToken, instructions) {
  const timestamp = new Date().toISOString();
  
  // Build JSON-RPC payload
  // Each call creates a new payload object - safe for concurrent use
  const payload = {
    jsonrpc: "2.0",
    method: "SportsAPING/v1.0/placeOrders",
    params: {
      marketId,
      instructions: instructions.map((inst) => ({
        selectionId: inst.selectionId,
        side: inst.side,
        orderType: "LIMIT", // Always LIMIT
        limitOrder: {
          size: inst.size || 1, // Default to 1 if not specified (size is passed per-worker)
          price: inst.limitOrder.price,
          persistenceType: inst.limitOrder.persistenceType || "LAPSE",
        },
      })),
    },
    id: 1,
  };

  // Retry with exponential backoff for transient failures
  // This helps handle rate limiting and temporary network issues
  const response = await retryWithBackoff(
    () => betfairApiRequest(
      PLACE_ORDERS_ENDPOINT,
      appKey,
      sessionToken,
      payload,
      {
        "Content-Type": "application/json",
      }
    ),
    3, // Max 3 retries
    100 // Base delay 100ms
  );

  return response.data;
}
