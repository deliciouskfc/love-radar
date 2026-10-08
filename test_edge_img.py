import urllib.request, json, base64, sys

# 读取用户上传的截图
img_path = r"c:\Users\admin\AppData\Roaming\Trae CN\User\workspaceStorage\42576325d4641d3b5a656fc3335e9baf\paste-files\129937a0-4994-4974-87e1-528137ec34d3_image.png"
with open(img_path, "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

# 构造测试请求 - 简单的识图+JSON输出
prompt = """请看这张图片，输出一个简单JSON：
{"description": "图片描述", "score": 5.0}
只输出JSON，不要其他文字。"""

messages = [{"role": "user", "content": [
    {"type": "text", "text": prompt},
    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}
]}]

req = urllib.request.Request(
    "https://ralskeiwruwvdpyioebt.functions.supabase.co/chat",
    data=json.dumps({"messages": messages, "temperature": 0.3}).encode(),
    headers={"Content-Type": "application/json", "x-invite-code": "350234"}
)

print("Sending request with image...")
try:
    r = urllib.request.urlopen(req, timeout=120)
    print("STATUS:", r.status)
    body = r.read().decode("utf-8", "ignore")

    # 解析SSE
    has_content = False
    has_reasoning = False
    full_content = ""
    full_reasoning = ""

    for line in body.split("\n"):
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload == "[DONE]":
                continue
            try:
                j = json.loads(payload)
                d = j.get("choices", [{}])[0].get("delta", {})
                if d.get("content"):
                    has_content = True
                    full_content += d["content"]
                if d.get("reasoning_content"):
                    has_reasoning = True
                    full_reasoning += d["reasoning_content"]
            except:
                pass

    print(f"has_content={has_content}, content_len={len(full_content)}")
    print(f"has_reasoning={has_reasoning}, reasoning_len={len(full_reasoning)}")
    print(f"CONTENT (first 500): {full_content[:500]}")
    print(f"REASONING (first 300): {full_reasoning[:300]}")

    # 检查是否有错误
    if not has_content and not has_reasoning:
        print("NO CONTENT AND NO REASONING - checking raw body")
        print("BODY (first 1000):", body[:1000])

except Exception as e:
    print(f"ERR: {type(e).__name__}: {e}")
    if hasattr(e, "read"):
        err_body = e.read().decode("utf-8", "ignore")
        print(f"ERROR BODY: {err_body[:500]}")
