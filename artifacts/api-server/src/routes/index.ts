import { Router, type IRouter } from "express";
import healthRouter from "./health";
import matchesRouter from "./matches";
import storageRouter from "./storage";
import chatRouter from "./chat";
import feedbackRouter from "./feedback";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(matchesRouter);
router.use(storageRouter);
router.use(chatRouter);
router.use(feedbackRouter);
router.use(settingsRouter);

export default router;
