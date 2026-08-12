// Plain REST call, no @google/genai dependency — matches this repo's minimal-dependency pattern
// (see PROGRESS.md's api/health.ts / @vercel/node note). Free-tier AI Studio key, backend-only.
// "-latest" alias deliberately used instead of a dated model name (e.g. gemini-2.5-flash) — Google
// retires dated snapshots for new API keys without notice; the alias is the one Google keeps
// pointed at a working fast/free-tier model.
const GEMINI_MODEL = 'gemini-flash-latest';

export async function generateSummaryText(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini request failed: ${res.status} ${body}`.slice(0, 500));
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini response had no summary text');
  }
  return text.trim();
}
