import "dotenv-safe/config.js";

import type { NextFunction, Request, Response } from "express";

export function verifyGitLabSignature(request: Request, response: Response, next: NextFunction) {
  const token = request.header("X-Gitlab-Token");

  if (!token || token !== process.env.GITLAB_WEBHOOK_SECRET) {
    response.status(401).json({
      error: "Invalid GitLab webhook token",
    });
    return;
  }

  next();
}
