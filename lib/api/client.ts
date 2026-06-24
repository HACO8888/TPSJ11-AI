export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function handle(res: Response): Promise<Response> {
  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "UNAUTHENTICATED", "請先登入");
  }
  if (!res.ok) {
    let code = "ERROR";
    let message = "發生錯誤";
    try {
      const j = await res.json();
      code = j?.error?.code ?? code;
      message = j?.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, message);
  }
  return res;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await handle(await fetch(url, { headers: { Accept: "application/json" } }));
  return res.json() as Promise<T>;
}

export async function apiSend<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await handle(
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
