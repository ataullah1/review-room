export class AccessError extends Error {
  constructor(
    message = "You do not have access to this resource.",
    public status = 403,
  ) {
    super(message);
  }
}
export class AuthFlowError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
