import express from "express";
import { NextFunction } from "connect";
import { validationResult } from "express-validator";

export const ValidationErrorMiddleware = (req:express.Request,res:express.Response,next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
}