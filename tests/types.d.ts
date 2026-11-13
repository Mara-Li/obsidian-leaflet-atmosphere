import type Gazette from "../src/main";

declare module "wdio-obsidian-service" {
	interface InstalledPlugins {
		gazette: Gazette;
	}
}
