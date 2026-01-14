import { betfairApiRequest } from "../../utils/axiosInstance.js";

const LIST_EVENTS_ENDPOINT = "/exchange/betting/rest/v1.0/listEvents/";

function buildDateRangeUtc() {
	const todayStart = new Date();
	todayStart.setUTCHours(0, 0, 0, 0);

	const tomorrowEnd = new Date(todayStart);
	tomorrowEnd.setUTCDate(todayStart.getUTCDate() + 1);
	tomorrowEnd.setUTCHours(23, 59, 59, 999);

	return {
		from: todayStart.toISOString(),
		to: tomorrowEnd.toISOString()
	};
}

// Proxies Betfair listEvents for cricket (eventTypeIds ["4"]) using caller's session token
export async function listEvents(req, res) {
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

	const { from, to } = buildDateRangeUtc();

	const payload = {
		filter: {
			eventTypeIds: ["4"],
			marketStartTime: {
				from,
				to
			}
		}
	};

	try {
		const response = await betfairApiRequest(
			LIST_EVENTS_ENDPOINT,
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
