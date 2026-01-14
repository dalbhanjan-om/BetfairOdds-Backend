import { betfairApiRequest } from "../../utils/axiosInstance.js";

const LIST_MARKET_CATALOGUE_ENDPOINT = "/exchange/betting/rest/v1.0/listMarketCatalogue/";

export async function listMarketCatalogue(req, res) {
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

	const { eventId } = req.body;

	if (!eventId) {
		return res.status(400).json({ error: "eventId is required in request body" });
	}

	const payload = {
		filter: {
			eventIds: [eventId],
			marketBettingTypes: ["LINE"]
		},
		marketProjection: [
			"MARKET_START_TIME",
			"RUNNER_DESCRIPTION"
		],
		sort: "FIRST_TO_START",
		maxResults: 500
	};

	try {
		const response = await betfairApiRequest(
			LIST_MARKET_CATALOGUE_ENDPOINT,
			appKey,
			sessionToken,
			payload
		);

		res.json(response.data);
	} catch (err) {
		const errorData = err.response?.data || { error: err.message };
		res.status(err.response?.status || 500).json(errorData);
	}
}
