import { addBall, getLastNBalls } from "../state/matchState.js";
import rules from "../rules/rules.json" assert { type: "json" };
import { resolveMarketAndBet } from "./tradeExecutor.js";

export const processBall = (ball) => {
  addBall(ball);

  const last3 = getLastNBalls(3);
  const totalRuns = last3.reduce((a, b) => a + b.runs, 0);

  rules.betRules.forEach((block) => {
    if (!isOverInRange(ball.over, block.oversRange)) return;

    block.rules.forEach((rule) => {
      if (evaluate(rule.condition, last3)) {
        console.log(`🔥 Rule ${rule.ruleId} triggered`);
        resolveMarketAndBet(rule.triggerBet);
      }
    });
  });
};

const isOverInRange = (over, range) => {
  const [from, to] = range.split("-").map(Number);
  return over >= from && over <= to;
};

const evaluate = (condition, balls) => {
  if (condition.last3BallsRuns) {
    const sum = balls.reduce((a, b) => a + b.runs, 0);
    return sum > 8;
  }
  return false;
};
