import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { importAiDraft } from "../controllers/cv-draft-ai.controller";
import { AppError } from "../middlewares/error.middleware";
import generateCv from "../controllers/cv-generator.controller";

const router = Router();

const aiUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 1,
    fieldSize: 160000,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (allowed.includes(file.mimetype)) callback(null, true);
    else callback(new AppError("Upload a PDF, DOCX or TXT file.", 400));
  },
}).single("file");
router.post(
  "/draft/import",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.authUser!.userId.toString(),
    message: {
      success: false,
      message: "Please wait before generating more AI drafts.",
    },
  }),
  (req, res, next) => {
    aiUpload(req, res, (error) => {
      if (error instanceof multer.MulterError)
        return next(
          new AppError(
            error.code === "LIMIT_FILE_SIZE"
              ? "CV file must be 10 MB or smaller."
              : "Invalid upload. Send one CV file or text.",
            400,
          ),
        );
      if (error) return next(error);
      next();
    });
  },
  importAiDraft,
);

router.get("/draft", generateCv.GetDraft);
router.put("/draft", generateCv.SaveDraft);
router.delete("/draft", generateCv.DeleteDraft);
router.get("/drafts", generateCv.ListSavedDrafts);
router.post("/drafts", generateCv.CreateSavedDraft);
router.get("/drafts/:id", generateCv.GetSavedDraft);
router.patch("/drafts/:id", generateCv.UpdateSavedDraft);
router.delete("/drafts/:id", generateCv.DeleteSavedDraft);
router.get("/templates/content", generateCv.GetNewTemplateContent);
router.get("/templates", generateCv.ListAtsTemplates);
router.post("/", generateCv.GenerateCv);
router.post("/new", generateCv.GenerateCvNew);
router.get("/get-all", generateCv.FindAllCv);
router.get("/:id/source", generateCv.GetGeneratedSource);
router.get("/:id/html", generateCv.GetGeneratedHtml);

export default router;
