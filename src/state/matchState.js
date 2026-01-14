// state/matchState.js

/**
 * In-memory match state
 * For personal / single-match execution this is PERFECT.
 * (Later you can move this to Redis if needed)
 */

const matchState = {
  matchId: null,
  balls: [] // rolling window of recent balls
};

/**
 * Add a new ball to state
 * Keeps only last N balls to avoid memory growth
 */
export const addBall = (ball) => {
  if (!matchState.matchId) {
    matchState.matchId = ball.matchId;
  }

  matchState.balls.push(ball);

  // Keep last 6 balls (enough for most cricket rules)
  if (matchState.balls.length > 12) {
    matchState.balls.shift();
  }
};

/**
 * Get last N balls safely
 * @param {number} n
 * @returns {Array}
 */
export const getLastNBalls = (n) => {
  if (matchState.balls.length < n) {
    return [];
  }

  return matchState.balls.slice(-n);
};

/**
 * (Optional but VERY useful for debugging)
 */
export const getMatchState = () => {
  return matchState;
};
