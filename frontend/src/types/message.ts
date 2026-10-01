import type { ApiResponse, PaginatedResponse } from './api'

// Shapes follow backend/docs/openapi.yaml (MessageSummary / MessageDetail)

/** Sender or recipient of a message. */
export interface MessageAddress {
  name: string
  address: string
}

/** Inbox list item (`GET /api/accounts/:id/messages`). */
export interface Message {
  id: string
  subject: string
  intro: string
  seen: boolean
  createdAt: string
  from: MessageAddress
}

/** A file attached to a message; downloaded through the backend. */
export interface MessageAttachment {
  id: string
  filename: string
  contentType: string
  /** Bytes */
  size: number
  /** Content-ID that the HTML body references as `cid:...` (inline images) */
  contentId?: string
}

/** Full message (`GET /api/accounts/:id/messages/:messageId`); `html` holds one or more HTML parts. */
export interface MessageDetail {
  id: string
  subject: string
  seen: boolean
  from: MessageAddress
  to: MessageAddress[]
  text: string
  html: string[]
  attachments: MessageAttachment[]
  createdAt: string
}

export type MessageListResponse = PaginatedResponse<Message>

export type MessageDetailResponse = ApiResponse<MessageDetail>

/** A verification code detected in a message. */
export interface OTPResult {
  code: string
  length: number
}

/** Body of `POST /api/accounts/:id/messages/send`. */
export interface SendMessageRequest {
  to: string[]
  subject: string
  text: string
  /** Id of the message being answered (threads the reply) */
  replyTo?: string
}

export interface SendMessageResult {
  messageId: string
  from: string
  to: string[]
}
