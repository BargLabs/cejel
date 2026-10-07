// One definition of where the Claude plugin declares its version, shared by the bump script,
// validate:distribution (the in-repo check) and verify-release-currency (the check at the tag).
// The plugin pins two things that must equal package.json's version: its manifest version, and
// the @cejel/cejel version its MCP server launches through npx.

export const PLUGIN_MANIFEST_PATH = 'plugins/cejel/.claude-plugin/plugin.json';
export const PLUGIN_MCP_CONFIG_PATH = 'plugins/cejel/.mcp.json';
export const PLUGIN_MCP_SERVER = 'cejel';
const PACKAGE_PIN = /^--package=@cejel\/cejel@(.+)$/;

/** The @cejel/cejel version the plugin's MCP server launches, or null when it is not pinned once. */
export function mcpPinnedVersion(mcpConfig) {
  const server = mcpConfig?.mcpServers?.[PLUGIN_MCP_SERVER];
  if (server?.command !== 'npx' || !Array.isArray(server.args)) return null;
  const pins = server.args.map((arg) => PACKAGE_PIN.exec(String(arg))?.[1]).filter(Boolean);
  return pins.length === 1 ? pins[0] : null;
}

/** Every version field the release must move together, read from the three parsed files. */
export function releaseVersionFields({ packageManifest, pluginManifest, mcpConfig }) {
  return {
    'package.json version': packageManifest?.version ?? null,
    [`${PLUGIN_MANIFEST_PATH} version`]: pluginManifest?.version ?? null,
    [`${PLUGIN_MCP_CONFIG_PATH} @cejel/cejel pin`]: mcpPinnedVersion(mcpConfig),
  };
}

/** Field names whose value is not `version`; empty when all three agree with it. */
export function disagreeingFields(fields, version) {
  return Object.entries(fields)
    .filter(([, value]) => value !== version)
    .map(([field, value]) => `${field}=${value ?? '<missing>'}`);
}
