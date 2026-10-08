// Love Radar · 邀请码安全中转（零外部依赖，流式透传）
// 上游 API Key 只存在服务端；前端拿到的是模型原始 SSE 流
const UPSTREAM_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const FORCE_MODEL = "qwen3.8-max";
const INVITE_CODE = "350234";

// 放行所有来源：函数已由邀请码保护，CORS 不作为安全边界
function corsHeaders(req) {
  const origin = req.headers.get("Origin");
  return {
    "Vary": "Origin",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, x-invite-code",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jerr(message, status, req) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

Deno.serve(async (req) => {
  // 204 不能携带响应体
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jerr("仅支持 POST 请求", 405, req);

  // ① 邀请码
  const code = req.headers.get("x-invite-code") || "";
  if (code !== INVITE_CODE) return jerr("邀请码无效", 403, req);

  // ② 上游密钥
  const upstreamKey = Deno.env.get("UPSTREAM_KEY");
  if (!upstreamKey) return jerr("服务端未配置 UPSTREAM_KEY", 500, req);

  // ③ 请求体
  let payload;
  try {
    payload = await req.json();
  } catch {
    return jerr("请求体不是合法 JSON", 400, req);
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : null;
  if (!messages || messages.length === 0) return jerr("缺少有效的 messages", 400, req);

  let hasImages = false;
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c && c.type === "image_url") hasImages = true;
      }
    }
  }

  // ④ 转发上游（流式，模型与上游 URL 由服务端强制，不设 max_tokens）
  let upstream;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + upstreamKey,
      },
      body: JSON.stringify({
        model: FORCE_MODEL,
        messages,
        temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
        stream: true,
      }),
    });
  } catch (e) {
    await logUsage(req, messages.length, hasImages, 0, String(e));
    return jerr("上游连接失败", 502, req);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    await logUsage(req, messages.length, hasImages, upstream.status, errText);
    return new Response(
      JSON.stringify({ error: { message: "上游返回 " + upstream.status + "：" + errText.slice(0, 500) } }),
      { status: upstream.status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }

  await logUsage(req, messages.length, hasImages, upstream.status, null);

  // ⑤ 流式原样透传，CORS 头加在流式响应上
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

// 调用日志
async function logUsage(req, msgCount, hasImages, status, error) {
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!sbUrl || !sbKey) return;
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    await fetch(sbUrl + "/rest/v1/invite_usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
      },
      body: JSON.stringify({
        ip,
        messages: msgCount,
        has_images: hasImages,
        status,
        error: error ? String(error).slice(0, 800) : null,
      }),
    });
  } catch {
    // 日志失败不影响主流程
  }
}