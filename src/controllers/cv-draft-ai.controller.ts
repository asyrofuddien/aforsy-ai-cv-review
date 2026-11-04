import { Request, Response } from "express";
import { Types } from "mongoose";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { asyncHandler, AppError } from "../middlewares/error.middleware";
import Document from "../models/document.model";
import Evaluation from "../models/evaluation.model";
import { createAiDraft } from "../services/cv-draft-ai.service";
import { createHash } from "crypto";
import config from "../config/config";
import { requestLocale } from "../utils/locale";

export const importAiDraft = asyncHandler(
  async (req: Request, res: Response) => {
    const file = req.file;
    const story = req.body?.text;
    let source = "";
    let reviewGuidance:
      | { suggestions: Array<{ criterion: string; suggestion: string }>; missingInformation: string[] }
      | undefined;

    if (req.body?.evaluationId !== undefined) {
      const { evaluationId } = req.body;
      if (typeof evaluationId !== "string" || !Types.ObjectId.isValid(evaluationId))
        throw new AppError("Invalid review ID.", 400);
      if (file || story !== undefined)
        throw new AppError("Provide a review ID or a CV file or text, not multiple sources.", 400);

      const evaluation = await Evaluation.findOne({
        _id: evaluationId,
        userId: req.authUser!.userId,
        status: "completed",
      })
        .select("cvDocumentId result.criteria result.missingInformation")
        .lean();
      if (!evaluation?.result)
        throw new AppError("Completed review not found.", 404);

      const document = await Document.findOne({
        _id: evaluation.cvDocumentId,
        userId: req.authUser!.userId,
        type: "cv",
      })
        .select("content")
        .lean();
      if (!document?.content?.trim())
        throw new AppError("The original CV text is no longer available for this review.", 422);

      source = document.content;
      reviewGuidance = {
        suggestions: (evaluation.result.criteria || [])
          .filter((item) => item.suggestion?.trim())
          .map((item) => ({ criterion: item.name, suggestion: item.suggestion })),
        missingInformation: evaluation.result.missingInformation || [],
      };
    } else {
      if (story !== undefined && typeof story !== "string")
        throw new AppError("Text must be a string.", 400);
      if (file && story?.trim())
        throw new AppError("Provide either a CV file or text, not both.", 400);
      source = story?.trim() || "";
    }

    if (file) {
      try {
        if (
          file.mimetype === "application/pdf" &&
          file.buffer.subarray(0, 5).toString() === "%PDF-"
        )
          source = (await pdf(file.buffer)).text;
        else if (
          file.mimetype ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
          file.buffer.subarray(0, 2).toString() === "PK"
        )
          source = (await mammoth.extractRawText({ buffer: file.buffer }))
            .value;
        else if (file.mimetype === "text/plain")
          source = file.buffer.toString("utf8");
        else throw new Error("Unsupported file");
      } catch {
        throw new AppError(
          "Could not read this file. Use a text-based PDF, DOCX or TXT. Scanned PDFs need OCR first.",
          422,
        );
      }
    }
    source = source.trim();
    if (source.length < 30)
      throw new AppError(
        "Add at least 30 characters of readable CV information.",
        400,
      );
    if (source.length > 40000)
      throw new AppError(
        "Please shorten the source to 40,000 characters or fewer.",
        400,
      );
    if (config.billing.paidAiEnforcement) {
      const locale = requestLocale(req);
      const inputFingerprint = createHash("sha256").update(JSON.stringify({ source, reviewGuidance, locale })).digest("hex");
      const { operationService } = require("../features/ai-operations/operation.service");
      const created = await operationService.createAndReserve({
        userId: req.authUser!.userId, action: "ai_draft", locale, inputFingerprint,
        inputSnapshotRef: req.body?.evaluationId ? `evaluation:${req.body.evaluationId}` : `draft-source:${inputFingerprint.slice(0, 24)}`,
        idempotencyKey: String(req.header("Idempotency-Key") || ""), inputSnapshot: { source, reviewGuidance },
      });
      res.status(202).json({ success: true, operationId: String(created.operation._id), status: created.operation.status, billing: created.billing, wallet: created.wallet });
      return;
    }
    const draft = await createAiDraft(source, reviewGuidance);
    res.json({ success: true, data: draft });
  },
);
