import { Router, type IRouter } from "express";
import healthRouter from "./health";
import matchesRouter from "./matches";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(matchesRouter);
router.use(storageRouter);

export default router;
