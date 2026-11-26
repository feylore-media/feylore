import { ZodError } from "zod";
import { AppError } from "../../shared/errors.js";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function errorHandler(
  error: FastifyError | AppError | ZodError,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: error.flatten(),
      },
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  const statusCode = error.statusCode ?? 500;
  return reply.status(statusCode).send({
    error: {
      code: "INTERNAL_ERROR",
      message: statusCode >= 500 ? "Internal server error" : error.message,
    },
  });
}
