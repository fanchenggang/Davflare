# Image host client export examples

Samples for Settings → **Image host clients (PicGo / ShareX / Typora)**. Replace `https://drive.example.com` with your Davflare **drive** origin and `YOUR_API_KEY` with a real `fd_…` key. **Never** commit a live key.

| File | Client | Notes |
| --- | --- | --- |
| [`davflare.sxcu`](./davflare.sxcu) | ShareX | Double-click to import after editing the key |
| [`typora-upload.sh`](./typora-upload.sh) | Typora | Custom Command script; or use the one-line curl from Settings |
| [`../../picgo-plugin-davflare/`](../../picgo-plugin-davflare/) | PicGo / PicList | Local install or npm (owner publishes) |

## 10-minute checklist

1. Deploy Davflare with `SITES_HOST`, leave **API Key** and **Image host** on, create a key.
2. Pick a client:
   - **PicGo / PicList:** install `picgo-plugin-davflare`, set Site URL + API Key.
   - **ShareX:** download/edit `.sxcu`, import.
   - **Typora:** Custom Command → one-line curl from Settings (or this `.sh`).
3. Upload a test image; expect `https://<SITES_HOST>/i/{id}`.

More: [docs/sites.md](../../../docs/sites.md#markdown-image-host-in-10-minutes).
