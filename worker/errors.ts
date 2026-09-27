import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** 全局共享的 HTTP 业务错误：onError 统一转成 JSON 响应 */
export class HTTPError extends Error {
  // 用 Hono 的 ContentfulStatusCode 而不是 number：c.json(data, status) 只接受该联合类型，
  // 这里收紧后调用方无需再 `as 400` 之类的断言——那种断言会谎称状态码恒为 400
  status: ContentfulStatusCode
  constructor(status: ContentfulStatusCode, message: string) {
    super(message)
    this.status = status
  }
}

export function badRequest(message: string): never {
  throw new HTTPError(400, message)
}
