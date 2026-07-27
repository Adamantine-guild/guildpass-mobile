export interface ApiResponse<T> {
  data: T;
  status: number;
}

export async function parseJsonResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  let data: T | undefined;

  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as T;
    }
  }

  return {
    data: (data ?? ({} as T)),
    status: response.status,
  };
}
