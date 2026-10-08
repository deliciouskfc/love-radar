// Love Radar · 邀请码安全中转
// 作用：上游 API Key 只存在服务端，前端任何方式都无法获取
// 校验：请求头 x-invite-code 必须正确；模型在服务端强制指定，忽略客户端传参
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UPSTREAM_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const FORCE_MODEL = "qwen3.8-max";
const INVITE_CODE = "350234";

const ALLOWED_ORIGINS = new Set([
  "https://deliciouskfc.github.io",
  "http://localhost:8899",
  "http://127.0.0.1:8899",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, x-invite-code",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(req ? corsHeaders(req) : {}) },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "仅支持 POST 请求" } }, 405, req);
  }

  // ① 邀请码校验
  const code = req.headers.get("x-invite-code") ?? "";
  if (code !== INVITE_CODE) {
    return json({ error: { message: "邀请码无效" } }, 403, req);
  }

  // ② 服务端密钥检查
  const upstreamKey = Deno.env.get("UPSTREAM_KEY");
  if (!upstreamKey) {
    return json({ error: { message: "服务端未配置 UPSTREAM_KEY 密钥" } }, 500, req);
  }

  // ③ 解析请求体
  let payload: { messages?: unknown[]; max_tokens?: number; temperature?: number };
  try {
    payload = await req.json();
  } catch {
    return json({ error: { message: "请求体不是合法 JSON" } }, 400, req);
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : null;
  if (!messages || messages.length === 0) {
    return json({ error: { message: "缺少有效的 messages 参数" } }, 400, req);
  }

  const hasImages = messages.some((m: any) =>
    Array.isArray(m.content) && m.content.some((c: any) => c.type === "image_url")
  );

  // ④ 转发上游：模型与流式由服务端强制
  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${upstreamKey}`,
      },
      body: JSON.stringify({
        model: FORCE_MODEL,
        messages,
        max_tokens: typeof payload.max_tokens === "number" ? payload.max_tokens : 8000,
        temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
        stream: true,
      }),
    });
  } catch (e) {
    await logUsage(req, messages.length, hasImages, 0, String(e));
    return json({ error: { message: "上游连接失败：" + String(e) } }, 502, req);
  }

  // ⑤ 记录调用（IP / 是否含图 / 上游状态码）
  await logUsage(
    req,
    messages.length,
    hasImages,
    upstream.status,
    upstream.ok ? null : (await upstream.text().catch(() => null))
  );

  if (!upstream.ok) {
    return json({ error: { message: `上游 API 返回错误 (${upstream.status})` } }, upstream.status, req);
  }

  // ⑥ 流式原样透传
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      ...corsHeaders(req),
    },
  });
});

/* 调用日志写入 invite_usage（service role 绕过 RLS，匿名用户不可见） */
async function logUsage(
  req: Request,
  msgCount: number,
  hasImages: boolean,
  status: number,
  error: string | null
): Promise<void> {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    await sb.from("invite_usage").insert({
      ip,
      messages: msgCount,
      has_images: hasImages,
      status,
      error: error ? String(error).slice(0, 800) : null,
    });
  } catch {
    // 日志失败不影响测评主流程
  }
}
