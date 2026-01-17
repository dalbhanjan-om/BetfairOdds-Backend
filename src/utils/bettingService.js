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
          persistenceType: inst.limitOrder.persistenceType || "PERSIST",
        },
      })),
    },
    id: 1,
  };


  const response = await betfairApiRequest(
    PLACE_ORDERS_ENDPOINT,
    appKey,
    sessionToken,
    payload,
    {
      "Content-Type": "application/json",
    }
  );


  return response.data;
}
