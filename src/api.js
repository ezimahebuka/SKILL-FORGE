export const api = async (url, options = {}) => {
  const response = await fetch(`/api${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const rawBody = response.status === 204 ? "" : await response.text();
  let body = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { message: "The server returned an invalid response." };
    }
  }
  if (response.status >= 500 && !body?.message) {
    body = {
      message: "The quiz server is unavailable. Start the API and try again.",
    };
  }
  if (!response.ok) throw new Error(body?.message || "Something went wrong.");
  return body;
};
