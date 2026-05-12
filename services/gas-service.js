export const GAS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbw9VgHwKY_iJVPZAcjzSvw6Zb9gmejp1e4sypENVfYX_mKcXlFaRwCtSpUlOhh3LWbT/exec";

export async function postToGas(payload) {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.json();
}