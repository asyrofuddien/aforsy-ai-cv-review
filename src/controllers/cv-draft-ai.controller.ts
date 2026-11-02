import { Request, Response } from "express";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { asyncHandler, AppError } from "../middlewares/error.middleware";
import { createAiDraft } from "../services/cv-draft-ai.service";

export const importAiDraft = asyncHandler(
  async (req: Request, res: Response) => {
    const file = req.file;
    const story = req.body?.text;
    if (story !== undefined && typeof story !== "string")
      throw new AppError("Text must be a string.", 400);
    if (file && story?.trim())
      throw new AppError("Provide either a CV file or text, not both.", 400);
    let source = story?.trim() || "";
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
    const draft = await createAiDraft(source);
    res.json({ success: true, data: draft });
  },
);
