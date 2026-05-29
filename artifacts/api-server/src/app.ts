import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { dateCardPublicRouter } from "./routes/dateCards";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use(dateCardPublicRouter);
app.use("/api", router);

const payloadTooLargeHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (
    err?.name === "PayloadTooLargeError" ||
    err?.type === "entity.too.large"
  ) {
    res.status(413).json({
      error:
        "Those profile screenshots are too large to analyze at once. Try fewer screenshots or crop them tighter before analyzing.",
    });
    return;
  }
  next(err);
};

app.use(payloadTooLargeHandler);

export default app;
