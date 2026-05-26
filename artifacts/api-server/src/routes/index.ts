import { Router, type IRouter } from "express";
import healthRouter from "./health";
import matchesRouter from "./matches";
import storageRouter from "./storage";
import chatRouter from "./chat";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(matchesRouter);
router.use(storageRouter);
router.use(chatRouter);
router.use(feedbackRouter);

export default router;
