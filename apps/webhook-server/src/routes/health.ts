import type { Request, Response } from "express";

const startedAt = Date.now();

export function healthRoute(_request: Request, response: Response) {
  response.status(200).json({
    ok: true,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
}
