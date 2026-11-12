# Leaflet Atmosphere

Publish your Obsidian notes to [Leaflet](https://leaflet.pub), straight to your AT Protocol repository (PDS). Works on desktop and mobile.

Documents are written as [`site.standard.document`](https://standard.site) records with Leaflet content (`pub.leaflet.content`), exactly like the posts written in the Leaflet editor, so they show up in your publication, in the Leaflet reader and in any standard.site compatible app.

## ⚙️ Setup

1. Create an app password in Bluesky: **Settings → Privacy and security → App passwords**.
2. In **Settings → Leaflet Atmosphere → Account**, fill in your handle (`alice.bsky.social`, `@alice.bsky.social` or a `bsky.app` profile link also work), your DID or your email, and select the app password (it is kept in Obsidian's secret storage, not in `data.json`).
3. Select **Connect**: your publications are loaded and the first one becomes the default publication. Change it in **Publication**.

If your account is not hosted on Bluesky, the PDS is resolved from your handle. You can also set it manually (`https://` and a trailing `/xrpc` are optional). An email login goes through `bsky.social` unless a PDS is set.

The other settings are grouped in sub-pages: **Publication** (default publication and post preferences), **Conversion** (how Markdown is converted) and **Properties** (note properties read and written by the plugin).

## 🚀 Usage

| Command | Description |
| --- | --- |
| **Publish all marked notes** | Publish or update every note with `leaflet_publish: true`, after confirmation. |
| **Publish folder to Leaflet** / **Publish N notes to Leaflet** | Right-click a folder, or several selected files, to publish all their notes after confirmation (optional, see **When publishing** in the settings). Notes with `leaflet_publish: false` and Excalidraw drawings are skipped; with **Only publish marked notes**, only marked notes are kept. |
| **Publish current note** | Create or update the Leaflet post of the note. Also available in the ribbon and in the right-click menus of the file and of the editor (hidden for notes with `leaflet_publish: false`). |
| **Publish current note to…** | Choose the publication (or your personal page) before publishing. |
| **Retrieve the Leaflet link of current note** | Restore `leaflet_uri` and `leaflet_url` of a note that lost them, without publishing it. |
| **Delete current note from Leaflet** | Delete the record from your PDS. The note is kept. |
| **Copy Leaflet link** / **Open published note in browser** | Use the URL saved in the note. |
| **Refresh publications** | Reload the publications of your account. |

On desktop, the progress is shown in the status bar; on mobile, in a notice.

After the first publication, the record URI (`leaflet_uri`) and the URL (`leaflet_url`) are saved in the note properties. Publishing again updates the same post (its publication date and Bluesky post are kept).

If a note lost its properties (sync issue, failed write…), publishing it again does not create a duplicate nor fail: the plugin looks for its post at the key it should use (reserved address or slug), then by title when a single post matches, and updates it. A post already linked to another note of the vault is never taken.

Links to another note point to its published post. When the linked note is marked with `leaflet_publish: true` but not published yet, its future address is reserved: only `leaflet_url` is saved in its properties (`leaflet_uri` is written by the publication itself), so the link works as soon as that note is published. The commands that need a published post (copy, open, delete) are not offered on a reserved note. Links to unmarked notes become plain text.

### Properties

| Property | Default key | Usage |
| --- | --- | --- |
| Publish | `leaflet_publish` | `true` marks the note for **Publish all marked notes**, `false` blocks any publishing. With **Only publish marked notes**, `true` is required. |
| Title | `title` | Falls back to the first `# heading` (removed from the body), then to the file name. |
| Description | `description` | Post subtitle. |
| Tags | `tags` | Leading `#` are removed. |
| Cover image | `cover` | Vault path, `[[wikilink]]` or URL. |
| Publication date | `date` | Defaults to the first publication date. |
| Slug | `slug` | Record key used in the URL on first publish (`https://you.leaflet.pub/<slug>`). |
| Publication | `leaflet_publication` | Name, URL or AT-URI of a publication, or `none` for your personal page. |
| Preferences | `leaflet_discover`, `leaflet_comments`, `leaflet_mentions`, `leaflet_recommends` | `true` / `false`, override the defaults of the settings. |

The keys of the first seven properties can be changed in the settings. Deleting a note from Leaflet sets `leaflet_publish` back to `false`.

### Markdown support

| Obsidian | Leaflet |
| --- | --- |
| Headings, paragraphs, line breaks (follows the **Strict line breaks** option) | Header and text blocks |
| `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, `` `code` ``, `<u>underline</u>`, links | Rich text facets |
| `[[wikilinks]]`, links to notes | Link to the published note when it has a `leaflet_url`, plain text otherwise |
| `![[image.png\|alt\|300]]`, `![alt](url)` | Image blocks, uploaded to your PDS (resized and compressed under 1 MB) |
| `![[note]]`, `![[note#heading]]`, `![[note#^block]]` | Configurable in **Conversion → Embedded notes**: content inserted in place (also inside lists and quotes), a card opening a sub-page holding only the embedded part (whole note, section or block; the alias of `![[note\|alias]]` becomes its heading), or a link |
| Dataview queries (DQL, DataviewJS, inline) | Replaced by their result in Markdown (requires Dataview) |
| Excalidraw drawings `![[drawing.excalidraw]]` | PNG image exported by Excalidraw (requires Excalidraw) |
| Mermaid diagrams | Image rendered by Obsidian, or code block |
| Bullet, numbered and task lists (nested) | List blocks with checkboxes |
| Blockquotes | Blockquote blocks |
| Callouts `> [!note] Title` | Configurable in **Conversion → Callouts**: a blockquote with an emoji and a title on the color of the type, a colored HTML box like Obsidian (with the fonts, size and text color of the publication), or a card opening a sub-page of the post |
| Code blocks | Code blocks with language and theme |
| `$$ math $$` / `$inline$` | Math blocks / inline code |
| Footnotes `[^1]` and inline footnotes `^[note]` | Leaflet footnotes |
| `---` | Horizontal rule |
| Tables | HTML block (with the fonts of the publication) or code block |
| A Bluesky post, YouTube or web link alone on its line | Bluesky post embed, video embed or link card |
| `<iframe src="…">` | Embed block |
| `%%comments%%`, `<!-- comments -->`, block IDs, frontmatter | Removed |

## 🙏 Credits

- Dataview, Excalidraw and embed conversion come from [Enveloppe](https://github.com/Enveloppe/obsidian-enveloppe), based on [obsidian-digital-garden](https://github.com/oleeskild/obsidian-digital-garden) and [obsidian-easy-bake](https://github.com/mgmeyers/obsidian-easy-bake).

## 🔒 Network and privacy

The plugin only contacts the services needed to publish, and only when you run a command:

- your PDS (login, records and image uploads);
- `public.api.bsky.app`, `plc.directory` or your domain, to resolve your handle and your PDS;
- `public.api.bsky.app` to fetch Bluesky posts embedded in a note;
- the remote images of the note, when **Upload remote images** is enabled.

Nothing else is collected or sent.

## 📥 Installation

- [ ] From Obsidian's community plugins
- [x] Using BRAT with `https://github.com/Mara-Li/leaflet-atmosphere`
- [x] From the release page:
    - Download the latest release
    - Unzip `leaflet-atmosphere.zip` in `.obsidian/plugins/` path
    - In Obsidian settings, reload the plugin
    - Enable the plugin
- [x] Manually: copy `main.js`, `manifest.json` and `styles.css` (if any) to `<Vault>/.obsidian/plugins/leaflet-atmosphere/`

## 🛠️ Development

- Make sure your NodeJS is at least v18 (`node --version`).
- Run `pnpm run e2e` to build the plugin and run the end-to-end tests in Obsidian with [wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service). The tests use the fixtures of `tests/vault` and the `showcase-blog`, replace the PDS by an in-memory fake and validate every record against the Leaflet lexicons (`tests/lexicons`, MIT).
- Run `pnpm install` to install dependencies.
- Run `pnpm run dev` to compile `src/main.ts` to `main.js` in watch mode.
- Reload Obsidian to load the new version of the plugin, then enable it in **Settings → Community plugins**.
- For updates to the Obsidian API, update the `obsidian` dependency.

### Improve code quality with ESLint

- [ESLint](https://eslint.org/) analyzes your code to find common bugs and ways to improve it.
- The project already has ESLint preconfigured, together with the Obsidian-specific [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin). Run it with `pnpm run lint`.
- Format the sources with Biome using `pnpm run format`.
- A GitHub Action lints every commit on all branches.

### 🎼 Languages

- [x] English
- [x] French

To add a translation:
1. Fork the repository
2. Add the translation in the `src/i18n/locales` folder with the name of the language (ex: `fr.json`).
    - You can get your locale language from Obsidian using [obsidian translation](https://github.com/obsidianmd/obsidian-translations) or using the commands (in templater for example) : `<% tp.obsidian.moment.locale() %>`
    - Copy the content of the [`en.json`](./src/i18n/locales/en.json) file in the new file
    - Translate the content
3. Edit `i18n/index.ts` :
    - Add `import <lang> from "./locales/<lang>.json";`
    - Edit the `resources` part with adding : `<lang>: { translation: <lang> }`

## 📚 References

- [Obsidian API documentation](https://docs.obsidian.md)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
