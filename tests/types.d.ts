import type LeafletAtmosphere from "../src/main";

declare module "wdio-obsidian-service" {
	interface InstalledPlugins {
		leafletAtmosphere: LeafletAtmosphere;
	}
}
