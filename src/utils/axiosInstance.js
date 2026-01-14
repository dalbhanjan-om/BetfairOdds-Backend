import axios from "axios";

// Base URLs for different services
const BETFAIR_API_BASE_URL = "https://api.betfair.com";
const BETFAIR_IDENTITY_BASE_URL = "https://identitysso.betfair.com";


/**
 * Default axios instance with common configuration
 */
const defaultAxiosInstance = axios.create({
  timeout: 30000, // 30 seconds timeout
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

/**
 * Betfair API axios instance
 * Used for Betfair exchange API calls
 */
export const betfairApiInstance = axios.create({
  baseURL: BETFAIR_API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

/**
 * Betfair Identity axios instance
 * Used for Betfair authentication/login
 */
export const betfairIdentityInstance = axios.create({
  baseURL: BETFAIR_IDENTITY_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  },
});



/**
 * Request interceptor for Betfair API - adds app key and session token
 */
betfairApiInstance.interceptors.request.use(
  (config) => {
    // App key and session token should be added per request
    // as they may vary between requests
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor for error handling
 */
const setupResponseInterceptor = (instance) => {
  instance.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      // Log error details for debugging
      if (error.response) {
        console.error(`API Error [${error.config?.url}]:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });
      } else if (error.request) {
        console.error("Request Error:", error.message);
      } else {
        console.error("Error:", error.message);
      }
      return Promise.reject(error);
    }
  );
};

// Setup response interceptors for all instances
setupResponseInterceptor(betfairApiInstance);
setupResponseInterceptor(betfairIdentityInstance);
setupResponseInterceptor(defaultAxiosInstance);

/**
 * Helper function to create Betfair API request with authentication
 * @param {string} endpoint - API endpoint (e.g., '/exchange/betting/rest/v1.0/listEvents/')
 * @param {string} appKey - Betfair application key
 * @param {string} sessionToken - Betfair session token
 * @param {Object} data - Request payload
 * @param {Object} additionalHeaders - Additional headers to include
 */
export const betfairApiRequest = async (
  endpoint,
  appKey,
  sessionToken,
  data = null,
  additionalHeaders = {}
) => {
  const config = {
    url: endpoint,
    method: data ? "POST" : "GET",
    headers: {
      "X-Application": appKey,
      "X-Authentication": sessionToken,
      ...additionalHeaders,
    },
  };

  if (data) {
    config.data = data;
  }

  return betfairApiInstance.request(config);
};

/**
 * Helper function to create Betfair Identity request
 * @param {string} endpoint - API endpoint (e.g., '/api/login')
 * @param {string} appKey - Betfair application key
 * @param {Object} data - Request payload
 */
export const betfairIdentityRequest = async (endpoint, appKey, data = null) => {
  const config = {
    url: endpoint,
    method: data ? "POST" : "GET",
    headers: {
      "X-Application": appKey,
    },
  };

  if (data) {
    config.data = data;
  }

  return betfairIdentityInstance.request(config);
};

// (Roanuz API helpers removed – Roanuz no longer used)

// Export default instance as well
export default defaultAxiosInstance;

