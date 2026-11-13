# Showcase blog

A small blog to try Gazette on a real Leaflet publication. Each post exercises a part of the conversion.

| Post | What it shows |
| --- | --- |
| Welcome to the Garden | Title from the first heading, cover from a wikilink, rich text, callout, footnotes, links between posts, comments `%%` |
| A Week of Sourdough | Title from properties, task lists, nested and numbered lists, images with size, large image compression |
| Notes on Note-Taking | SVG cover and image, embeds of a heading, of a list block and of a paragraph (in a list and in a quote), comments disabled |
| Field Guide to Math and Code | Inline and display math, code blocks, Mermaid diagram, aligned table |
| Reading List | Dataview: inline queries, `TABLE`, `LIST` and `dataviewjs` (requires Dataview) |
| Sketchbook | Excalidraw drawing exported as an image (requires Excalidraw) |
| Around the Web | Bluesky post, YouTube video, link cards, iframe, remote image |

The notes in `Books`, `Snippets`, `Drafts` and the drawing have `leaflet_publish: false`: they are used by the posts but never published themselves.

## Try it

1. Copy this folder anywhere in your vault.
2. Connect your account in **Settings → Gazette → Account** and choose a publication in **Publication**.
3. Run **Publish all marked notes** from the command palette.

The seven posts are published with working links between them: a post linking to a note that is not published yet reserves its future address. Run the command again after editing a note to update the posts.

To clean up, run **Delete current note from Leaflet** on each post.
