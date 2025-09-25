import { body, ValidationChain } from "express-validator";

export const validateRegister: ValidationChain[] = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage(
      "Username can only contain letters, numbers, underscores and hyphens"
    ),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/\d/)
    .withMessage("Password must contain at least one number"),
];

export const validateLogin: ValidationChain[] = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

export const validateArticle: ValidationChain[] = [
  body("title")
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Title must be between 5 and 200 characters"),
  body("content")
    .trim()
    .isLength({ min: 100 })
    .withMessage("Content must be at least 100 characters"),
  body("excerpt")
    .trim()
    .isLength({ min: 20, max: 300 })
    .withMessage("Excerpt must be between 20 and 300 characters"),
  body("category").trim().notEmpty().withMessage("Category is required"),
  body("tags").isArray().withMessage("Tags must be an array").optional(),
];
