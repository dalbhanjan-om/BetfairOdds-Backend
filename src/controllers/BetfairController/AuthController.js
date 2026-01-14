import { betfairIdentityInstance } from "../../utils/axiosInstance.js";

const LOGIN_URL = "/api/login";

export async function login(req, res) {
  const { username, password } = req.body;
  const appKey = process.env.BETFAIR_APP_KEY;

  if (!appKey) {
    return res.status(400).json({ error: "BETFAIR_APP_KEY environment variable not set" });
  }

  try {
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);

    const response = await betfairIdentityInstance.post(LOGIN_URL, body, {
      headers: {
        "X-Application": appKey
      }
    });
    
    // Return only the Betfair login response
    res.json(response.data);

  } catch (err) {
    const errorData = err.response?.data || { error: err.message };
    res.status(err.response?.status || 500).json(errorData);
  }
}

