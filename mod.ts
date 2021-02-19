// Classes
export { SocketModeClient } from "./src/SocketModeClient.ts"

// Tyoes
export type {
    SMCallError,
    SMNoReplyReceivedError,
    SMPlatformError,
    SMSendWhileDisconnectedError,
    SMSendWhileNotReadyError,
    SMWebsocketError,
} from "./src/errors.ts"
export type { Events } from "./src/events.ts"
export type { Logger } from "./src/logger.ts"

// Enums
export { ErrorCode } from "./src/errors.ts"
export { LogLevel } from "./src/logger.ts"
