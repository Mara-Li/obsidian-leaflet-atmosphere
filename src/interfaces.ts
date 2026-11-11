<% if (data.settings === true) { %>
export interface <%= data.interfaceName %>Settings {
	greeting: string;
}

export const DEFAULT_SETTINGS: <%= data.interfaceName %>Settings = {
	greeting: "Hello",
};
<% } %>
