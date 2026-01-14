import { processBall } from "./ruleExecutor.js";

export const startMatchFeed = (matchId) => {
  console.log(`🎯 Starting feed for match ${matchId}`);

  let over = 0;
  let ball = 0;

  setInterval(() => {
    ball++;
    if (ball > 6) {
      ball = 1;
      over++;
    }

    const mockBall = {
      matchId,
      innings: 1,
      over,
      ball,
      overBall: `${over}.${ball}`,
      runs: Math.floor(Math.random() * 7),
      wicket: true,
      
     
    };

    processBall(mockBall);
  }, 8000);
};
