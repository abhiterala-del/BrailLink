import "../shared/env";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { describeAiConfig } from "./ai";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  const server = registerRoutes(app);

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API endpoint not found" });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (status >= 500) console.error(err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    // Kept out of the production bundle: vite is a dev dependency.
    const viteModule = "./vite";
    const { setupVite } = await import(viteModule);
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // this serves both the API and the client
  const PORT = Number(process.env.PORT) || 5001;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
    log(describeAiConfig());
  });
})();
