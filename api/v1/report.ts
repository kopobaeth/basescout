import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { cacheControlForScanStatus, scanTokenData } from "../scan";
import {
  buildVersionedReportError,
  buildVersionedRiskReport
} from "../_lib/report";

function requestUrl(request: IncomingMessage) {
  return new URL(request.url ?? "/", `https://${request.headers.host ?? "basescout.local"}`);
}

function sendJson(
  response: ServerResponse,
  status: number,
  requestId: string,
  payload: unknown
) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControlForScanStatus(status));
  response.setHeader("X-Request-Id", requestId);
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const requestId = randomUUID();
  const generatedAtMs = Date.now();

  try {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(
        response,
        405,
        requestId,
        buildVersionedReportError(405, "method_not_allowed", "Method not allowed. Use GET.", requestId, generatedAtMs)
      );
      return;
    }

    const address = requestUrl(request).searchParams.get("address") ?? "";
    const result = await scanTokenData(address, generatedAtMs);

    if (result.status !== 200 || !result.payload.pair) {
      sendJson(
        response,
        result.status,
        requestId,
        buildVersionedReportError(
          result.status,
          result.payload.errorCode ?? "unexpected_server_error",
          result.payload.error ?? "The risk report could not be generated.",
          requestId,
          generatedAtMs
        )
      );
      return;
    }

    sendJson(
      response,
      200,
      requestId,
      buildVersionedRiskReport(result.payload, requestId, generatedAtMs)
    );
  } catch (error) {
    console.error(`[BaseScout] Report API failed (${requestId})`, error);
    sendJson(
      response,
      500,
      requestId,
      buildVersionedReportError(
        500,
        "unexpected_server_error",
        "Unexpected server error. Report API could not complete the request.",
        requestId,
        generatedAtMs
      )
    );
  }
}
