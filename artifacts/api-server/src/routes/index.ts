import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import matchesRouter from "./matches";
import storageRouter from "./storage";
import chatRouter from "./chat";
import feedbackRouter from "./feedback";
import improvementRouter from "./improvement";
import settingsRouter from "./settings";
import dateCardsRouter from "./dateCards";
import aiUsageRouter from "./aiUsage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dateCardsRouter);
router.use(matchesRouter);
router.use(storageRouter);
router.use(chatRouter);
router.use(feedbackRouter);
router.use(improvementRouter);
router.use(aiUsageRouter);
router.use(settingsRouter);

export default router;
