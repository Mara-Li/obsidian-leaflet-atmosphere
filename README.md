# <%= data.name %>

<%= data.description %>

## ⚙️ Usage

This plugin demonstrates some of the basic functionality the plugin API can do.

- Adds a ribbon icon, which shows a Notice when clicked.
<% if (data.modal === true) { -%>
- Adds the commands "Open modal (simple)" and "Open modal (complex)" which open a Modal.
<% } -%>
- Adds the command "Replace selected content" which edits the current selection.
<% if (data.settings === true) { -%>
- Adds a plugin setting tab to the settings page.
<% } -%>

## 📥 Installation

- [ ] From Obsidian's community plugins
- [x] Using BRAT with `https://github.com/<%= data.author.name %>/<%= data.id %>`
- [x] From the release page:
    - Download the latest release
    - Unzip `<%= data.id %>.zip` in `.obsidian/plugins/` path
    - In Obsidian settings, reload the plugin
    - Enable the plugin
- [x] Manually: copy `main.js`, `manifest.json` and `styles.css` (if any) to `<Vault>/.obsidian/plugins/<%= data.id %>/`

## 🛠️ Development

- Make sure your NodeJS is at least v18 (`node --version`).
- Run `<%= data.packageManager %> install` to install dependencies.
- Run `<%= data.packageManager %> run dev` to compile `src/main.ts` to `main.js` in watch mode.
- Reload Obsidian to load the new version of the plugin, then enable it in **Settings → Community plugins**.
- For updates to the Obsidian API, update the `obsidian` dependency.

### Improve code quality with ESLint

- [ESLint](https://eslint.org/) analyzes your code to find common bugs and ways to improve it.
- The project already has ESLint preconfigured, together with the Obsidian-specific [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin). Run it with `<%= data.packageManager %> run lint`.
- Format the sources with Biome using `<%= data.packageManager %> run format`.
- A GitHub Action lints every commit on all branches.

<% if (data.fundingUrl) { -%>
## 💖 Funding

Support the development of this plugin: <<%= data.fundingUrl %>>

<% } -%>
<% if (data.i18n === true) { -%>
### 🎼 Languages

- [x] English
- [ ] French

To add a translation:
1. Fork the repository
2. Add the translation in the `src/i18n/locales` folder with the name of the language (ex: `fr.json`).
    - You can get your locale language from Obsidian using [obsidian translation](https://github.com/obsidianmd/obsidian-translations) or using the commands (in templater for example) : `{{TEMPLATE_PLACEHOLDER LOCALE}}`
    - Copy the content of the [`en.json`](./src/i18n/locales/en.json) file in the new file
    - Translate the content
3. Edit `i18n/index.ts` :
    - Add `import <lang> from "./locales/<lang>.json";`
    - Edit the `resources` part with adding : `<lang>: { translation: <lang> }`

<% } -%>
## 📚 References

- [Obsidian API documentation](https://docs.obsidian.md)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
