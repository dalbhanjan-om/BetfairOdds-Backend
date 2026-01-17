import { betfairApiRequest } from "./axiosInstance.js";

const PLACE_ORDERS_ENDPOINT = "/exchange/betting/json-rpc/v1";

/**
 * Core function to place a bet order on Betfair Exchange
 * This is the shared logic used by both the controller and worker
 * 
 * @param {string} marketId - The market ID
 * @param {string} appKey - Betfair application key
 * @param {string} sessionToken - Betfair session token
 * @param {Array} instructions - Array of betting instructions
 * @returns {Promise<Object>} The API response data
 * @throws {Error} If the API call fails
 */
export async function placeBetOrder(marketId, appKey, sessionToken, instructions) {
  const timestamp = new Date().toISOString();
  
  // Build JSON-RPC payload
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
          size: inst.size || 5, // Default to 5 if not specified
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
