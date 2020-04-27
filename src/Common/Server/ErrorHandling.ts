import { Dictionary } from "./Types";
import { IncomingMessage } from "http";
import moment = require("moment");

const errorCodeDetail:Dictionary<string> = {
    "TOKEN_ERROR": "Token could not be verified.",
    "SCOPE_MISMATCH": "Request made with invalid scope."
}

function isHttpCodeError(err: Error): err is HttpCodeError {
    return (err as HttpCodeError).httpCode !== undefined;
}

class HttpCodeError extends Error {
    constructor(logMessage:string, public httpCode: number, public payload?: ErrorPayload) {
        super(logMessage)
    }
}

interface FullErrorPayload {
    code: string
    detail: string
    title: string
    meta?: object
}

type ErrorPayload = Omit<FullErrorPayload, "title">;

function formatErrorPayload(errorPayload:ErrorPayload):FullErrorPayload|undefined {
    if (typeof errorPayload == 'undefined') return undefined;
    let payload = errorPayload;
    try {
        (payload as FullErrorPayload).title = errorCodeDetail[payload.code];
    } catch {
        (payload as FullErrorPayload).title = "Unknown error code"
    }
    return (payload as FullErrorPayload);
}


export {HttpCodeError,isHttpCodeError,ErrorPayload,formatErrorPayload}