import app from "./app";
import { logger } from "./lib/logger";
import { finalizeExpiredChallenges } from "./lib/challengeService";
import { startVoiceBot } from "./lib/voiceBot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

startVoiceBot();
void finalizeExpiredChallenges().catch((error: unknown) => {
  logger.error(
    { message: error instanceof Error ? error.message : "unknown error" },
    "Could not finalize expired DreamTeam challenges on startup",
  );
});
const challengeTimer = setInterval(() => {
  void finalizeExpiredChallenges().catch((error: unknown) => {
    logger.error(
      { message: error instanceof Error ? error.message : "unknown error" },
      "Could not finalize expired DreamTeam challenges",
    );
  });
}, 1_000);
challengeTimer.unref();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
