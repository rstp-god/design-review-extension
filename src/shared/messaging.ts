import { z } from 'zod'
import { sendRuntimeMessage } from '@/services/chrome/runtime'
import { sendTabMessage } from '@/services/chrome/tabs'
import { sessionScopeSchema, sessionSummarySchema, storageUsageSchema } from './schemas'

/**
 * The only wire contract between popup, background and content script. Every message is a
 * member of `messages`; payloads and replies are validated with Zod on both ends.
 *
 * Direction:
 * - popup / command → background: `review/start`, `review/stop`, `session/*`, `storage/usage`
 * - background → content (via `tabs.sendMessage`): `review/open`, `review/status`, `review/close`
 */
export const MESSAGE_TIMEOUT_MS = 5_000

const tabIdSchema = z.number().int().nonnegative()
const okSchema = z.object({ ok: z.literal(true) })
const emptySchema = z.object({})

function define<Request extends z.ZodType, Response extends z.ZodType>(
  request: Request,
  response: Response,
) {
  return { request, response }
}

export const messages = {
  'review/start': define(z.object({ tabId: tabIdSchema }), okSchema),
  'review/stop': define(z.object({ tabId: tabIdSchema }), okSchema),
  'review/open': define(z.object({ session: sessionSummarySchema.nullable() }), okSchema),
  'review/status': define(emptySchema, z.object({ active: z.boolean() })),
  'review/close': define(emptySchema, okSchema),
  'session/get': define(
    z.object({ scope: sessionScopeSchema, key: z.string().min(1) }),
    sessionSummarySchema.nullable(),
  ),
  'session/list': define(emptySchema, z.array(sessionSummarySchema)),
  'session/delete': define(z.object({ id: z.string().min(1) }), okSchema),
  'session/deleteAll': define(emptySchema, okSchema),
  'storage/usage': define(emptySchema, storageUsageSchema),
} as const

export type MessageType = keyof typeof messages
export type RequestOf<T extends MessageType> = z.output<(typeof messages)[T]['request']>
export type ResponseOf<T extends MessageType> = z.output<(typeof messages)[T]['response']>
export type Message = { [T in MessageType]: { type: T; payload: RequestOf<T> } }[MessageType]

export type MessageErrorCode =
  | 'timeout'
  | 'no-receiver'
  | 'invalid-request'
  | 'invalid-response'
  | 'handler-failed'

export class MessageError extends Error {
  readonly code: MessageErrorCode

  constructor(code: MessageErrorCode, message: string) {
    super(message)
    this.name = 'MessageError'
    this.code = code
  }
}

export function isMessageType(type: string): type is MessageType {
  return Object.hasOwn(messages, type)
}

const wireSchema = z.object({ type: z.string(), payload: z.unknown() })

const replySchema = z.union([
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
])

export type Reply = z.infer<typeof replySchema>

type Transport = (wire: { type: string; payload: unknown }) => Promise<unknown>

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function request<T extends MessageType>(
  transport: Transport,
  type: T,
  payload: RequestOf<T>,
  timeoutMs: number,
): Promise<ResponseOf<T>> {
  const definition = messages[type]
  const parsedRequest = definition.request.safeParse(payload)
  if (!parsedRequest.success) {
    throw new MessageError('invalid-request', `${type}: ${parsedRequest.error.message}`)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new MessageError('timeout', `${type}: no reply within ${timeoutMs} ms`))
    }, timeoutMs)
  })

  let raw: unknown
  try {
    raw = await Promise.race([
      transport({ type, payload: parsedRequest.data }).catch((error: unknown) => {
        throw new MessageError('no-receiver', `${type}: ${errorText(error)}`)
      }),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }

  if (raw === undefined) throw new MessageError('no-receiver', `${type}: nobody answered`)

  const reply = replySchema.safeParse(raw)
  if (!reply.success) throw new MessageError('invalid-response', `${type}: malformed reply`)
  if (!reply.data.ok) {
    throw new MessageError(
      'handler-failed',
      `${type}: ${reply.data.error.code}: ${reply.data.error.message}`,
    )
  }

  const data = definition.response.safeParse(reply.data.data)
  if (!data.success) throw new MessageError('invalid-response', `${type}: ${data.error.message}`)
  return data.data as ResponseOf<T>
}

export interface SendOptions {
  timeoutMs?: number
}

/** Popup / content → background. */
export function sendToBackground<T extends MessageType>(
  type: T,
  payload: RequestOf<T>,
  options: SendOptions = {},
): Promise<ResponseOf<T>> {
  return request(sendRuntimeMessage, type, payload, options.timeoutMs ?? MESSAGE_TIMEOUT_MS)
}

/** Background → content script of a tab. */
export function sendToTab<T extends MessageType>(
  tabId: number,
  type: T,
  payload: RequestOf<T>,
  options: SendOptions = {},
): Promise<ResponseOf<T>> {
  return request(
    (wire) => sendTabMessage(tabId, wire),
    type,
    payload,
    options.timeoutMs ?? MESSAGE_TIMEOUT_MS,
  )
}

export type MessageHandlers = {
  [T in MessageType]?: (
    payload: RequestOf<T>,
    sender: chrome.runtime.MessageSender,
  ) => ResponseOf<T> | Promise<ResponseOf<T>>
}

type AnyHandler = (payload: unknown, sender: chrome.runtime.MessageSender) => unknown

/**
 * Builds a `chrome.runtime.onMessage` listener. Returns `false` for messages that are not ours or
 * that this context does not handle, so the channel closes and the sender sees "no receiver".
 * Handlers run after validation; their result is validated too before it goes on the wire.
 */
export function createMessageListener(handlers: MessageHandlers) {
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (reply: Reply) => void,
  ): boolean => {
    const wire = wireSchema.safeParse(message)
    if (!wire.success || !isMessageType(wire.data.type)) return false

    const type = wire.data.type
    const handler = handlers[type] as AnyHandler | undefined
    if (!handler) return false

    const definition = messages[type]
    const parsed = definition.request.safeParse(wire.data.payload)
    if (!parsed.success) {
      sendResponse({
        ok: false,
        error: { code: 'invalid-request', message: parsed.error.message },
      })
      return true
    }

    void (async () => {
      try {
        const result = await handler(parsed.data, sender)
        const validated = definition.response.safeParse(result)
        if (!validated.success) {
          sendResponse({
            ok: false,
            error: { code: 'invalid-response', message: validated.error.message },
          })
          return
        }
        sendResponse({ ok: true, data: validated.data })
      } catch (error) {
        sendResponse({ ok: false, error: { code: 'handler-failed', message: errorText(error) } })
      }
    })()

    return true
  }
}
