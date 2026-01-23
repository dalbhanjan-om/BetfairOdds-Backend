import { betfairApiRequest } from "../../utils/axiosInstance.js";

const LIST_CLEARED_ORDERS_ENDPOINT = "/exchange/betting/rest/v1.0/listClearedOrders/";

/**
 * POST /api/betfair/summary
 *
 * Proxies Betfair listClearedOrders for settled bets.
 * Request body:
 * {
 *   "from": "2026-01-18T00:00:00.000Z",
 *   "to": "2026-01-23T23:59:59.999Z" // optional, falls back to "now" if missing
 * }
 */
export async function listClearedOrdersSummary(req, res) {
  const appKey = process.env.BETFAIR_APP_KEY;
  const sessionToken =
    req.header("X-Authentication") ||
    req.header("x-authentication") ||
    (req.header("Authorization") || "").replace(/Bearer\s+/i, "").trim();

  if (!appKey) {
    return res
      .status(400)
      .json({ error: "BETFAIR_APP_KEY environment variable not set" });
  }

  if (!sessionToken) {
    return res.status(401).json({
      error:
        "Betfair session token missing in X-Authentication or Authorization header",
    });
  }

  const { from, to } = req.body || {};

  if (!from) {
    return res
      .status(400)
      .json({ error: "`from` is required in request body" });
  }

  const nowIso = new Date().toISOString();
  const apiFrom = from;
  const apiTo = to || nowIso;

  const recordCount = 1000;
  let fromRecord = 0;
  let moreAvailable = true;
  let allClearedOrders = [];

  try {
    // paginate until Betfair reports no more results
    while (moreAvailable) {
      const payload = {
        betStatus: "SETTLED",
        settledDateRange: {
          from: apiFrom,
          to: apiTo,
        },
        includeItemDescription: false,
        fromRecord,
        recordCount,
      };

      const response = await betfairApiRequest(
        LIST_CLEARED_ORDERS_ENDPOINT,
        appKey,
        sessionToken,
        payload
      );

      const data = response.data || {};
      const clearedOrders = Array.isArray(data.clearedOrders)
        ? data.clearedOrders
        : [];

      allClearedOrders = allClearedOrders.concat(clearedOrders);
      moreAvailable = Boolean(data.moreAvailable);
      fromRecord += recordCount;

      // safety to avoid infinite loop in case API misbehaves
      if (fromRecord > 50000) {
        moreAvailable = false;
      }
    }

    // Consider only bets with sizeSettled === 1.0
    const relevantBets = allClearedOrders.filter(
      (order) => Number(order.sizeSettled) === 1.0
    );

    // Count bets from this API call in the requested range
    const totalBets = relevantBets.length;
    const betsWon = relevantBets.filter(
      (order) => order.betOutcome === "WON"
    ).length;
    const betsLost = relevantBets.filter(
      (order) => order.betOutcome === "LOST"
    ).length;

    // Return snapshot for the requested range
    res.json({
      totalBets,
      betsWon,
      betsLost,
    });
  } catch (err) {
    const errorData = err.response?.data || { error: err.message };
    res.status(err.response?.status || 500).json(errorData);
  }
}

