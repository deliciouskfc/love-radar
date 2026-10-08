import urllib.request, json, base64

img_path = r"c:\Users\admin\AppData\Roaming\Trae CN\User\workspaceStorage\42576325d4641d3b5a656fc3335e9baf\paste-files\129937a0-4994-4974-87e1-528137ec34d3_image.png"
with open(img_path, "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

prompt = """你是一位顶级的恋爱心理学与两性沟通分析专家。请仔细阅读这些微信/QQ聊天截图（男生为A，女生为B），分析两人之间的暧昧程度。
【输出要求】严格只输出一个 JSON 对象（不要输出任何其他文字、不要用 markdown 代码块包裹），结构如下：
{
  "overall_score": 7.5,
  "overall_verdict": "一句话总结两人目前的暧昧状态（30字以内，有网感）",
  "dimensions": [
    {"name":"维度名","score":8.0,"desc":"一句话说明该维度反映什么","evidence":"结合聊天内容的具体证据与分析，80~150字"}
  ],
  "summary":"200字左右的整体关系小结"
}
【硬性要求】
1. dimensions 必须恰好包含以下 15 个维度，顺序一致：聊天频率、话题主动性、好奇值、言语相似度、表情包互动、回复一致性、情绪投入、话题深度、付出对等、未来规划、被重视感、深夜聊天、称呼昵称、生活分享、暧昧玩笑。
2. 所有 score 为 0~10 的一位小数；overall_score 为 0~10 一位小数。
3. evidence 必须引用截图中真实出现的对话细节。
4. 如果图片完全无法辨认，overall_score 返回 0 并在 summary 说明。
【评分校准标准】宁低勿高，整体比直觉低 1.5~2 分。"""

messages = [{"role": "user", "content": [
    {"type": "text", "text": prompt},
    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}
]}]

req = urllib.request.Request(
    "https://ralskeiwruwvdpyioebt.functions.supabase.co/chat",
    data=json.dumps({"messages": messages, "temperature": 0.3}).encode(),
    headers={"Content-Type": "application/json", "x-invite-code": "350234"}
)

print("Sending full 15-dimension prompt with image...")
try:
    r = urllib.request.urlopen(req, timeout=150)
    print("STATUS:", r.status)
    body = r.read().decode("utf-8", "ignore")

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
                    full_content += d["content"]
                if d.get("reasoning_content"):
                    full_reasoning += d["reasoning_content"]
            except:
                pass

    print(f"\ncontent_len={len(full_content)}")
    print(f"reasoning_len={len(full_reasoning)}")

    # 检查 JSON 是否完整
    if full_content:
        print(f"\nCONTENT first 300: {full_content[:300]}")
        print(f"CONTENT last 300: {full_content[-300:]}")
        # 尝试解析
        try:
            data = json.loads(full_content)
            print(f"\nJSON PARSE OK! dimensions={len(data.get('dimensions',[]))}")
        except:
            # 尝试提取
            s = full_content.find('{')
            e = full_content.rfind('}')
            if s > -1 and e > s:
                try:
                    data = json.loads(full_content[s:e+1])
                    print(f"EXTRACTED JSON OK! dimensions={len(data.get('dimensions',[]))}")
                except Exception as e2:
                    print(f"JSON PARSE FAILED: {e2}")
                    print(f"EXTRACTED: {full_content[s:e+1][:500]}")
    else:
        print("NO CONTENT - only reasoning")
        print(f"REASONING first 500: {full_reasoning[:500]}")

except Exception as e:
    print(f"ERR: {type(e).__name__}: {e}")
    if hasattr(e, "read"):
        print(f"BODY: {e.read().decode('utf-8','ignore')[:500]}")
