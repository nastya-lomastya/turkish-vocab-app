import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 500 });
  }

  const body = await req.json();
  const { prompt, image, maxTokens } = body as {
    prompt: string;
    image?: { mediaType: string; data: string };
    maxTokens?: number;
  };

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const content: any[] = [];
  if (image) {
    content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens || 500,
        messages: [{ role: "user", content }],
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: json }, { status: response.status });
    }

    const text = (json.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: "Claude API request failed" }, { status: 502 });
  }
}
