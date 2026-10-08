// One definition of where the Claude plugin declares its version, shared by the bump script,
// validate:distribution (the in-repo check) and verify-release-currency (the check at the tag).
// The plugin pins two things that must equal package.json's version: its manifest version, and
// the @cejel/cejel version its MCP server launches as `npx -y @cejel/cejel@<version> mcp`, the
// pinned-launcher form the Claude directory reads.

export const PLUGIN_MANIFEST_PATH = 'plugins/cejel/.claude-plugin/plugin.json';
export const PLUGIN_MCP_CONFIG_PATH = 'plugins/cejel/.mcp.json';
export const PLUGIN_MCP_SERVER = 'cejel';
const PACKAGE_PIN = /^@cejel\/cejel@(.+)$/;

/**
 * The @cejel/cejel version the plugin's MCP server launches, or null unless the launch is exactly
 * `npx -y @cejel/cejel@<version> mcp`.
 */
export function mcpPinnedVersion(mcpConfig) {
  const server = mcpConfig?.mcpServers?.[PLUGIN_MCP_SERVER];
  if (server?.command !== 'npx' || !Array.isArray(server.args) || server.args.length !== 3) return null;
  const [yes, spec, subcommand] = server.args;
  if (yes !== '-y' || subcommand !== 'mcp') return null;
  return PACKAGE_PIN.exec(String(spec))?.[1] ?? null;
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
