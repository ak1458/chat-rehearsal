# Chat Rehearsal

A browser-based WhatsApp-style chat maker for fictional conversations and sketches.

## Run locally

Use Node.js 22.18 or later.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000).

## Use a screenshot

1. Choose **Upload screenshot** or drop a portrait image on the phone preview.
2. Choose **Use appearance** to keep your draft, or **Replace with detected chat** to edit the text the app found.
3. Edit the screen settings or select a bubble to edit its message. **Original** lets you compare the source with the editable preview.
4. Export the visible area as PNG or the complete scrolling chat as standalone HTML.

The screenshot sets the dimensions. The app reuses the original status bar and clearly detected header and composer sections. It recovers visible wallpaper pixels and fills areas covered by messages with the sampled background color. The doodle preset provides a fallback. Add the original wallpaper image for the full pattern. Screen settings include a device font preset, Roboto, Inter, Noto Sans, Arial, and a text size control. The iPhone preset uses the local Apple system font when available and Inter elsewhere. Text recognition uses the bundled English model and may need corrections. Screenshots and chat data are processed in the browser. Export before refreshing to keep a copy.

**Paste chat** accepts one message per line, `Name: message`, common WhatsApp text exports, and structured HTML. HTML can supply `data-sender`, `data-time`, `data-date`, and `data-side="incoming"` or `"outgoing"`. Preview names and times, exclude individual rows, and choose whether to append or replace messages.

**Message timing** applies separate sent and received delays to messages without a time. Existing dates and times carry through from the import. Use **Message details** to edit an individual date or time, or delete the message. The arrow in the phone preview returns to the latest message after scrolling up.

## GitHub Pages

Push the source to the `main` branch of a GitHub repository. Under **Settings → Pages**, select **GitHub Actions** as the source. Run **Deploy to GitHub Pages** from the Actions tab. The workflow builds the static site and shows the URL when it deploys. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

`npm test` runs the import tests. `npm run build` writes the static site to `out`. [Next.js static export documentation](https://nextjs.org/docs/app/guides/static-exports)
