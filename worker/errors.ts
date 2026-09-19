/** 全局共享的 HTTP 业务错误：onError 统一转成 JSON 响应 */
export class HTTPError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function badRequest(message: string): never {
  throw new HTTPError(400, message)
}
