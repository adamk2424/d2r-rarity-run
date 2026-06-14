import sys, json, os, urllib.request, urllib.error

token = sys.argv[1]
repo = "adamk2424/d2r-rarity-run"
dist = os.path.join(os.path.dirname(__file__), "..", "dist")
assets = ["RarityChallenge-portable-1.0.0.exe", "RarityChallenge-Setup-1.0.0.exe"]

body = (
    "Double-click companion app for the **D2R Rarity Challenge** (offline single-player).\n\n"
    "## Download\n"
    "- **RarityChallenge-portable-1.0.0.exe** - single file, no install, just double-click.\n"
    "- **RarityChallenge-Setup-1.0.0.exe** - installer with a Start-menu shortcut.\n\n"
    "Windows SmartScreen may warn (the app is unsigned): choose *More info -> Run anyway*.\n\n"
    "In the app, click **Select folder** and choose your D2R save folder "
    "(usually your `Saved Games/Diablo II Resurrected` folder). "
    "OBS overlay: add a Browser source pointing at http://localhost:3666\n\n"
    "Offline single-player characters only."
)

def api(url, data=None, headers=None, method=None):
    h = {"Authorization": "token " + token, "Accept": "application/vnd.github+json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    return json.load(urllib.request.urlopen(req))

# delete a pre-existing v1.0.0 release if present (idempotent re-run)
try:
    existing = api("https://api.github.com/repos/%s/releases/tags/v1.0.0" % repo)
    api("https://api.github.com/repos/%s/releases/%s" % (repo, existing["id"]), method="DELETE")
    print("deleted existing release", existing["id"])
except urllib.error.HTTPError:
    pass

payload = json.dumps({
    "tag_name": "v1.0.0", "target_commitish": "master",
    "name": "Rarity Challenge v1.0.0", "body": body,
    "draft": False, "prerelease": False,
}).encode()
rel = api("https://api.github.com/repos/%s/releases" % repo, data=payload,
          headers={"Content-Type": "application/json"})
print("RELEASE", rel["html_url"])
upload = rel["upload_url"].split("{")[0]

for name in assets:
    path = os.path.join(dist, name)
    with open(path, "rb") as f:
        blob = f.read()
    res = api(upload + "?name=" + name, data=blob,
              headers={"Content-Type": "application/octet-stream"})
    print("UPLOADED", res["name"], res["size"], "bytes")

print("DONE", rel["html_url"])
