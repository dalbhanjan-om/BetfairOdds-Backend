import { placeBetOrder } from "../../utils/bettingService.js";

/**
 * Place Order Controller
 * Places a bet order on Betfair Exchange
 */
export async function placeOrder(req, res) {
	const appKey = process.env.BETFAIR_APP_KEY;
	const sessionToken =
		req.header("X-Authentication") ||
		req.header("x-authentication") ||
		(req.header("Authorization") || "").replace(/Bearer\s+/i, "").trim();

	if (!appKey) {
		return res.status(400).json({ error: "BETFAIR_APP_KEY environment variable not set" });
	}

	if (!sessionToken) {
		return res.status(401).json({ error: "Betfair session token missing in X-Authentication or Authorization header" });
	}

	const { marketId, instructions } = req.body;

	if (!marketId) {
		return res.status(400).json({ error: "marketId is required in request body" });
	}

	if (!instructions || !Array.isArray(instructions) || instructions.length === 0) {
		return res.status(400).json({ error: "instructions array is required with at least one instruction" });
	}

	// Validate each instruction
	for (const instruction of instructions) {
		if (!instruction.selectionId) {
			return res.status(400).json({ error: "selectionId is required in each instruction" });
		}
		if (!instruction.side || !["BACK", "LAY"].includes(instruction.side)) {
			return res.status(400).json({ error: "side must be either 'BACK' or 'LAY'" });
		}
		if (!instruction.limitOrder) {
			return res.status(400).json({ error: "limitOrder is required" });
		}
		if (typeof instruction.limitOrder.price !== "number") {
			return res.status(400).json({ error: "limitOrder.price must be a number" });
		}
	}

	try {
		const responseData = await placeBetOrder(marketId, appKey, sessionToken, instructions);
		console.log(`Bet placed for market ${marketId}, price ${instructions[0].limitOrder.price} and selectionId ${instructions[0].selectionId} side ${instructions[0].side}`);
		console.log(responseData);

		res.json(responseData);
	} catch (err) {
		const errorData = err.response?.data || { error: err.message };
		res.status(err.response?.status || 500).json(errorData);
	}
}
