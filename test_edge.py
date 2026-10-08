import urllib.request, json

req = urllib.request.Request(
    "https://ralskeiwruwvdpyioebt.functions.supabase.co/chat",
    data=json.dumps({"messages":[{"role":"user","content":"say hi"}],"temperature":0.7}).encode(),
    headers={"Content-Type":"application/json","x-invite-code":"350234"}
)
r = urllib.request.urlopen(req, timeout=120)
b = r.read().decode("utf-8", "ignore")
print("TAIL:", repr(b[-800:]))
# check if content is ever non-empty
lines = b.split("\n")
has_content = False
for line in lines:
    if line.startswith("data:"):
        try:
            j = json.loads(line[5:].strip())
            d = j.get("choices",[{}])[0].get("delta",{})
            if d.get("content",""):
                has_content = True
                print("FOUND CONTENT:", repr(d["content"][:100]))
        except:
            pass
if not has_content:
    print("CONTENT NEVER POPULATED - pure reasoning model")
