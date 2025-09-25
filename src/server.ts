import app from "./app";
import { connectDB } from "./config/database";
import { config } from "./config/config";
import { logger } from "./utils/logger";

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(
        `Server is running on port ${config.port} in ${config.nodeEnv} mode`
      );
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (err: Error) => {
      logger.error("UNHANDLED REJECTION! 💥 Shutting down...");
      logger.error(err.name, err.message);
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle SIGTERM
    process.on("SIGTERM", () => {
      logger.info("SIGTERM RECEIVED. Shutting down gracefully");
      server.close(() => {
        logger.info("Process terminated!");
      });
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
