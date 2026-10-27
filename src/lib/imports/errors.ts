export class ImportError extends Error {
  constructor(
    public readonly status: 400 | 409 | 413 | 415 | 422,
    message: string,
  ) {
    super(message);
  }
}
